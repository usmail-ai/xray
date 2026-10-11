"""Cards, packets, and beats for the live waveboard.

The feed pass already has issue and pull-request bodies in hand. This module
reads those, plus the seat inbox files, and builds the board. It does not call
GitHub. The live page reads the `waveboard` object on the feed it already
polls. WAVEBOARD.md is rewritten at most once a minute.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

# fetch_feed loads this file by path. The sibling inbox module is not a package.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import inbox

STAGES = ("open", "review", "fix", "merge", "retest", "done")
STATES = ("live", "parked", "closed")
PACKET_KEYS = ("goal", "constraints", "path", "acceptance", "evidence", "next_owner", "escalate")
FIELD_CAP = 200
TITLE_CAP = 120
STALL_S = 60 * 60
DROP_S = 24 * 60 * 60
DEBOUNCE_S = 60
BEAT_KEEP = 5
ALLOW_HOSTS = frozenset({"github.com", "www.github.com"})
RAILS = frozenset({"", "GitHub", "X"})
_SECRET = re.compile(r"ghs_|github_pat_|BEGIN PRIVATE|AKIA[0-9A-Z]{16}")
_HEADING = re.compile(r"(?im)^##\s+packet\s*$")
_NEXT_HEAD = re.compile(r"(?m)^##\s+")
_KEY = re.compile(
    r"^\s*(?:[-*]\s*)?(?:\*\*)?\s*"
    r"(goal|constraints|path|acceptance|evidence|next[\s_]owner|escalate)"
    r"\s*(?:\*\*)?\s*:\s*(.*?)\s*$",
    re.I,
)
_MD_LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)\)")
_BARE_URL = re.compile(r"https?://[^\s)]+")
_CARD_ID = re.compile(r"^([^/\s]+/[^#\s]+)#(\d+)$")
_MD_LAST: dict[str, float] = {}

_BEAT_KIND = {
    "pr_open": "opened",
    "issue_open": "opened",
    "pr_update": "pushed",
    "push": "pushed",
    "review": "review",
    "critic_pass": "review",
    "critic_fail": "review",
    "ci_pass": "ci",
    "ci_fail": "ci",
    "merged": "merge",
    "merge_queue": "merge_queue",
    "comment": "owner",
    "blocker": "blocker",
    "retest": "retest",
}
_CARD_KIND = set(_BEAT_KIND) | {"pr_close", "issue_close", "supersede", "watcher"}
_CLOSE_KIND = frozenset({"pr_close", "issue_close", "merged"})
_STAGE_RANK = {name: i for i, name in enumerate(STAGES)}


def parse_packet(text: str) -> dict[str, str]:
    """Pull the seven packet fields from a `## Packet` block or one line."""
    if not isinstance(text, str) or not text.strip():
        return {}
    region = text
    heading = _HEADING.search(text)
    if heading:
        rest = text[heading.end():]
        nxt = _NEXT_HEAD.search(rest)
        region = rest[: nxt.start()] if nxt else rest
    elif not _single_line(text):
        return {}
    else:
        rows = [row for row in text.splitlines() if row.strip()]
        if len(rows) != 1:
            return {}
    rows = [row for row in region.splitlines() if row.strip()]
    found: dict[str, str] = {}
    if len(rows) <= 1:
        blob = " ".join(region.split())
        parts = re.split(r"\s+[·|]\s+|\s+;\s+", blob)
        for part in parts:
            matched = _KEY.match(part.strip())
            if matched:
                found[_canon(matched.group(1))] = _cap(matched.group(2))
        return {key: value for key, value in found.items() if value}
    current: str | None = None
    buf: list[str] = []

    def flush() -> None:
        if current is None:
            return
        found[current] = _cap(" ".join(buf))

    for row in region.splitlines():
        matched = _KEY.match(row)
        if matched:
            flush()
            current = _canon(matched.group(1))
            buf = [matched.group(2).strip()]
        elif current is not None and row.strip():
            buf.append(row.strip())
    flush()
    return {key: value for key, value in found.items() if value}


def beats_from(events: list[dict]) -> list[dict]:
    """Real beats, oldest first. A same-second watcher run is not a beat."""
    idle = _idle_watcher_ids(events)
    beats = []
    for event in events:
        if not isinstance(event, dict):
            continue
        if event.get("id") in idle:
            continue
        beat = _beat(event)
        if beat:
            beats.append(beat)
    beats.sort(key=lambda item: (_stamp(item["t_ct"]) or datetime.min.replace(tzinfo=timezone.utc), item["id"]))
    return beats


def build_cards(events: list[dict], inbox_lines: list[dict] | None = None,
                static_text: str = "", now: datetime | None = None) -> list[dict]:
    """One card per repo#number, plus pinned cards from waveboard-static.md."""
    now = _aware(now or datetime.now(timezone.utc))
    combined = list(events or [])
    seen = {event.get("id") for event in combined if isinstance(event, dict)}
    for line in inbox_lines or []:
        event = _inbox_event(line)
        if event and event["id"] not in seen:
            combined.append(event)
            seen.add(event["id"])
    grouped: dict[str, list[dict]] = {}
    for event in combined:
        if not isinstance(event, dict):
            continue
        key = _card_key(event)
        kind = str(event.get("kind") or "")
        packet = _event_packet(event)
        if not key:
            continue
        if kind not in _CARD_KIND and not packet:
            continue
        grouped.setdefault(key, []).append(event)
    pins = _parse_static(static_text)
    cards = []
    for key, group in grouped.items():
        card = _card(key, group, now)
        if card is None:
            continue
        if key in pins:
            _wear_pin(card, pins[key])
        cards.append(card)
    for key, pin in pins.items():
        if key not in grouped:
            held = _hold_pin(pin, now)
            if held:
                cards.append(held)
    cards.sort(key=lambda card: (STAGES.index(card["stage"]) if card["stage"] in STAGES else 9, card["id"]))
    return cards


def route_stalls(cards: list[dict], directory: Path, now: datetime, coordinator: str = "coordinator") -> int:
    """Append one stall line per live card that has been quiet for 60 minutes."""
    if not inbox._SEAT_FILE.match(coordinator):
        return 0
    now = _aware(now)
    path = directory / f"{coordinator}.jsonl"
    known = inbox._known_ids(path)
    fresh = []
    for card in cards:
        if not card.get("stall"):
            continue
        beat_id = card["beats"][0]["id"] if card.get("beats") else "none"
        line = inbox._line(
            {
                "id": f"stall:{card['id']}:{beat_id}",
                "t_ct": now.isoformat(timespec="seconds"),
                "repo": card.get("repo") or "",
                "number": card.get("number") or 0,
                "source": card.get("url") or "",
                "label": card.get("title") or card["id"],
            },
            coordinator,
            "no beat for 60 minutes",
            line_id=f"stall:{card['id']}:{beat_id}",
            line_type="stall",
        )
        if line and line["id"] not in known:
            fresh.append(line)
            known.add(line["id"])
    return inbox._append(path, fresh)


def render_markdown(cards: list[dict]) -> str:
    """WAVEBOARD.md grouped by stage. Pinned cards keep their mark."""
    by_stage: dict[str, list[dict]] = {stage: [] for stage in STAGES}
    for card in cards:
        by_stage.setdefault(card["stage"], []).append(card)
    lines = ["# WAVEBOARD", ""]
    for stage in STAGES:
        lines.append(f"## {stage}")
        lines.append("")
        group = by_stage.get(stage) or []
        if not group:
            lines.append("_none_")
            lines.append("")
            continue
        for card in group:
            pin = " · pinned" if card.get("pinned") else ""
            lines.append(f"### {card['id']} · {card['title']}{pin}")
            lines.append(f"- owner: {card['owner']}")
            lines.append(f"- stage: {card['stage']}")
            lines.append(f"- state: {card['state']}")
            lines.append(f"- packet: {card['badge']}")
            if card.get("stall"):
                lines.append("- stall: red")
            lines.append(f"- age: {_age_phrase(card.get('age_s'))}")
            lines.append(f"- url: {card['url']}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def publish(feed: dict, directory: Path | None = None, now: datetime | None = None,
            mono: float | None = None, log=None) -> str:
    """Attach `feed['waveboard']` and rewrite WAVEBOARD.md at most once a minute.

    Returns wrote, skipped, or failed. Does not raise.
    """
    try:
        now = _aware(now or datetime.now(timezone.utc))
        mono = time.monotonic() if mono is None else mono
        directory = directory or Path(".")
        events = [event for event in (feed.get("events") or []) if isinstance(event, dict)]
        inbox_dir = inbox.inbox_dir()
        lines = _read_inbox(inbox_dir)
        static_path = _static_path(directory)
        static_text = static_path.read_text(encoding="utf-8") if static_path and static_path.is_file() else ""
        cards = build_cards(events, lines, static_text, now)
        coordinator = os.environ.get("BURST_COORDINATOR", "coordinator").strip() or "coordinator"
        if inbox_dir:
            route_stalls(cards, inbox_dir, now, coordinator)
        feed["waveboard"] = {"cards": [_public(card) for card in cards]}
        markdown = Path(os.environ.get("BURST_WAVEBOARD_MD", str(directory / "WAVEBOARD.md")))
        status = _write_markdown(markdown, render_markdown(cards), mono)
        return status
    except Exception as exc:
        if log:
            log(f"waveboard skipped ({type(exc).__name__})")
        return "failed"


def _write_markdown(path: Path, text: str, mono: float) -> str:
    last = _MD_LAST.get(str(path))
    if last is not None and mono - last < DEBOUNCE_S:
        return "skipped"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        _MD_LAST[str(path)] = mono
        return "failed"
    _MD_LAST[str(path)] = mono
    return "wrote"


def _public(card: dict) -> dict:
    packet = {key: card["packet"].get(key, "") for key in PACKET_KEYS}
    beats = []
    for beat in card.get("beats") or []:
        beats.append({
            "id": beat["id"],
            "t_ct": beat["t_ct"],
            "type": beat["type"],
            "label": beat["label"],
        })
    return {
        "id": card["id"],
        "title": card["title"],
        "url": card["url"],
        "owner": card["owner"],
        "stage": card["stage"],
        "state": card["state"],
        "amber": card["amber"],
        "badge": card["badge"],
        "stall": card["stall"],
        "pinned": card["pinned"],
        "age_s": card["age_s"],
        "packet": packet,
        "beats": beats[:BEAT_KEEP],
    }


def _card(key: str, group: list[dict], now: datetime) -> dict | None:
    ordered = sorted(group, key=lambda event: (_stamp(event.get("t_ct")) or datetime.min.replace(tzinfo=timezone.utc), str(event.get("id"))))
    beats = beats_from(ordered)
    newest = list(reversed(beats))
    packet: dict[str, str] = {}
    for event in ordered:
        for field, value in _event_packet(event).items():
            if value:
                packet[field] = value
    if newest:
        packet["evidence"] = _cap(newest[0]["label"])
    amber = not packet.get("acceptance") or not packet.get("next_owner")
    state = _state(ordered)
    stage = _stage(beats, state)
    closed_at = _closed_at(ordered)
    if state == "closed" and closed_at is not None and (now - closed_at).total_seconds() >= DROP_S:
        return None
    last = _stamp(newest[0]["t_ct"]) if newest else _stamp(ordered[0].get("t_ct"))
    age = int((now - last).total_seconds()) if last else 0
    stall = state == "live" and last is not None and (now - last).total_seconds() >= STALL_S
    repo, number = _split_key(key)
    return {
        "id": key,
        "repo": repo,
        "number": number,
        "title": _title(ordered, key),
        "url": _url(ordered, repo, number),
        "owner": _owner(ordered),
        "stage": stage,
        "state": state,
        "amber": amber,
        "badge": "no packet" if amber else "packet",
        "stall": stall,
        "pinned": False,
        "age_s": max(0, age),
        "packet": packet,
        "beats": newest[:BEAT_KEEP],
    }


def _stage(beats: list[dict], state: str) -> str:
    stage = "open"
    reviewed = False
    merged = False
    for beat in beats:
        kind = beat["type"]
        if kind == "review":
            reviewed = True
            if _STAGE_RANK[stage] < _STAGE_RANK["review"]:
                stage = "review"
        elif kind == "pushed" and reviewed and _STAGE_RANK[stage] < _STAGE_RANK["fix"]:
            stage = "fix"
        elif kind in ("merge_queue", "merge"):
            if kind == "merge":
                merged = True
            if _STAGE_RANK[stage] < _STAGE_RANK["merge"]:
                stage = "merge"
        elif kind == "retest" and merged and _STAGE_RANK[stage] < _STAGE_RANK["retest"]:
            stage = "retest"
    if merged and any(beat["type"] == "retest" for beat in beats):
        return "retest"
    if state == "closed" and merged:
        return "done"
    return stage


def _state(events: list[dict]) -> str:
    closed = any(str(event.get("kind") or "") in _CLOSE_KIND for event in events)
    if closed:
        return "closed"
    for event in events:
        if _parked(event):
            return "parked"
    return "live"


def _parked(event: dict) -> bool:
    labels = event.get("labels")
    extra = event.get("_inbox") if isinstance(event.get("_inbox"), dict) else {}
    if not isinstance(labels, list):
        labels = extra.get("labels") if isinstance(extra.get("labels"), list) else []
    return any(str(label).strip().casefold() == "parked" for label in labels)


def _closed_at(events: list[dict]) -> datetime | None:
    stamps = [_stamp(event.get("t_ct")) for event in events if str(event.get("kind") or "") in _CLOSE_KIND]
    stamps = [stamp for stamp in stamps if stamp is not None]
    return max(stamps) if stamps else None


def _beat(event: dict) -> dict | None:
    kind = str(event.get("kind") or "")
    if kind == "watcher":
        return None
    beat_type = _BEAT_KIND.get(kind)
    if _blocker(event):
        beat_type = "blocker"
    if beat_type is None and _merge_queue(event):
        beat_type = "merge_queue"
    if beat_type is None:
        return None
    stamp = event.get("t_ct")
    if not isinstance(stamp, str) or _stamp(stamp) is None:
        return None
    label = event.get("label") if isinstance(event.get("label"), str) else ""
    if not label:
        label = beat_type.replace("_", " ")
    label = _cap(label)[:80]
    if not label or _SECRET.search(label):
        return None
    return {"id": str(event.get("id") or ""), "t_ct": stamp, "type": beat_type, "label": label}


def _blocker(event: dict) -> bool:
    if str(event.get("kind") or "") == "blocker":
        return True
    extra = event.get("_inbox") if isinstance(event.get("_inbox"), dict) else {}
    labels = event.get("labels") if isinstance(event.get("labels"), list) else extra.get("labels") or []
    if isinstance(labels, list) and any(str(label).strip().casefold() == "blocker" for label in labels):
        return True
    return False


def _merge_queue(event: dict) -> bool:
    label = str(event.get("label") or "")
    return "merge queue" in label.casefold()


def _idle_watcher_ids(events: list[dict]) -> set[str]:
    """Watcher start and end in the same second. That run is not a beat."""
    groups: dict[str, list[dict]] = {}
    for event in events:
        if not isinstance(event, dict):
            continue
        if str(event.get("kind") or "") != "watcher":
            continue
        action = str(event.get("action") or "")
        if action not in ("start", "end"):
            continue
        seat = str(event.get("seat") or event.get("from") or "")
        tag = str(event.get("tag") or "")
        groups.setdefault(f"{seat}:{tag}", []).append(event)
    idle: set[str] = set()
    for grouped in groups.values():
        ends: dict[str, list[dict]] = {}
        for event in grouped:
            if event.get("action") == "end":
                ends.setdefault(_second(event.get("t_ct")), []).append(event)
        for event in grouped:
            if event.get("action") != "start":
                continue
            match = ends.get(_second(event.get("t_ct"))) or []
            if not match:
                continue
            if isinstance(event.get("id"), str):
                idle.add(event["id"])
            if isinstance(match[0].get("id"), str):
                idle.add(match[0]["id"])
    return idle


def _event_packet(event: dict) -> dict[str, str]:
    extra = event.get("_inbox") if isinstance(event.get("_inbox"), dict) else {}
    found: dict[str, str] = {}
    raw = extra.get("packet")
    if isinstance(raw, dict):
        for key in PACKET_KEYS:
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                found[key] = _cap(value)
    text = extra.get("text") if isinstance(extra.get("text"), str) else ""
    for key, value in parse_packet(text).items():
        found[key] = value
    return {key: value for key, value in found.items() if value}


def _inbox_event(line: dict) -> dict | None:
    if not isinstance(line, dict):
        return None
    kind = str(line.get("type") or "")
    if kind not in _BEAT_KIND and kind not in _CLOSE_KIND:
        return None
    repo = line.get("repo")
    number = line.get("number")
    if not isinstance(repo, str) or not isinstance(number, int):
        return None
    return {
        "id": str(line.get("id") or ""),
        "t_ct": line.get("t_ct"),
        "kind": kind,
        "repo": repo,
        "number": number,
        "from": str(line.get("seat") or ""),
        "label": str(line.get("title") or line.get("reason") or kind),
        "source": str(line.get("url") or ""),
    }


def _card_key(event: dict) -> str:
    repo = event.get("repo")
    number = event.get("number")
    if not isinstance(repo, str) or not repo or isinstance(number, bool):
        return ""
    try:
        num = int(number)
    except (TypeError, ValueError):
        return ""
    if num < 0:
        return ""
    return f"{repo}#{num}"


def _split_key(key: str) -> tuple[str, int]:
    matched = _CARD_ID.match(key)
    if not matched:
        return "", 0
    return matched.group(1), int(matched.group(2))


def _title(events: list[dict], key: str) -> str:
    for event in events:
        extra = event.get("_inbox") if isinstance(event.get("_inbox"), dict) else {}
        raw = extra.get("title") if isinstance(extra.get("title"), str) else ""
        if not raw and isinstance(event.get("label"), str):
            raw = event["label"]
        text = " ".join(raw.split())
        if text and not _SECRET.search(text):
            return text[:TITLE_CAP]
    return key


def _url(events: list[dict], repo: str, number: int) -> str:
    for event in events:
        source = event.get("source")
        if isinstance(source, str) and source.startswith(("https://", "http://")) and _allowed(source):
            return source[:300]
    if repo and number:
        kind = {str(event.get("kind") or "") for event in events}
        leaf = "issues" if kind & {"issue_open", "issue_close"} and not (kind & {"pr_open", "pr_update", "merged", "pr_close"}) else "pull"
        return f"https://github.com/{repo}/{leaf}/{number}"
    return ""


def _owner(events: list[dict]) -> str:
    for event in events:
        who = event.get("from") if isinstance(event.get("from"), str) else ""
        if who not in RAILS:
            return who[:40]
    for event in events:
        who = event.get("to") if isinstance(event.get("to"), str) else ""
        if who not in RAILS:
            return who[:40]
    return ""


def _parse_static(text: str) -> dict[str, dict]:
    pins: dict[str, dict] = {}
    if not text:
        return pins
    for block in re.split(r"(?m)^###\s+", text)[1:]:
        head, _, body = block.partition("\n")
        title = head.strip()
        ident = ""
        if "·" in title:
            ident, title = [part.strip() for part in title.split("·", 1)]
        matched = _CARD_ID.match(ident or title)
        if matched and not ident:
            ident = title
            title = ident
        if not ident:
            ident = "pin:" + re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")[:40]
        card = {
            "id": ident,
            "title": (title or ident)[:TITLE_CAP],
            "owner": "",
            "stage": "open",
            "state": "live",
            "url": "",
            "packet": {},
            "pinned": True,
            "t_ct": "",
        }
        packet: dict[str, str] = {}
        for row in body.splitlines():
            if ":" not in row:
                continue
            label, value = row.split(":", 1)
            label = label.strip().lstrip("-").strip().casefold()
            value = value.strip()
            if label in ("owner", "stage", "state", "url", "title", "t_ct"):
                card[label if label != "t_ct" else "t_ct"] = value
            elif label in ("goal", "constraints", "path", "acceptance", "evidence", "next owner", "next_owner", "escalate"):
                packet[_canon(label)] = _cap(value)
        if card["stage"] not in STAGES:
            card["stage"] = "open"
        if card["state"] not in STATES:
            card["state"] = "live"
        card["packet"] = {key: value for key, value in packet.items() if value}
        card["url"] = card["url"] if _allowed(card["url"]) or not card["url"] else ""
        pins[card["id"]] = card
    return pins


def _wear_pin(card: dict, pin: dict) -> None:
    """A static item stays pinned. Its packet fills only fields the feed left empty."""
    card["pinned"] = True
    if not card["owner"] and pin.get("owner"):
        card["owner"] = str(pin["owner"])[:40]
    for field, value in (pin.get("packet") or {}).items():
        card["packet"].setdefault(field, value)
    card["amber"] = not card["packet"].get("acceptance") or not card["packet"].get("next_owner")
    card["badge"] = "no packet" if card["amber"] else "packet"


def _hold_pin(pin: dict, now: datetime) -> dict | None:
    packet = dict(pin.get("packet") or {})
    amber = not packet.get("acceptance") or not packet.get("next_owner")
    stamp = _stamp(pin.get("t_ct"))
    if pin.get("state") == "closed" and stamp is not None and (now - stamp).total_seconds() >= DROP_S:
        return None
    age = int((now - stamp).total_seconds()) if stamp else 0
    stall = pin.get("state") == "live" and stamp is not None and (now - stamp).total_seconds() >= STALL_S
    repo, number = _split_key(pin["id"])
    return {
        "id": pin["id"],
        "repo": repo,
        "number": number,
        "title": pin["title"],
        "url": pin.get("url") or "",
        "owner": str(pin.get("owner") or "")[:40],
        "stage": pin["stage"],
        "state": pin["state"],
        "amber": amber,
        "badge": "no packet" if amber else "packet",
        "stall": stall,
        "pinned": True,
        "age_s": max(0, age),
        "packet": packet,
        "beats": [],
    }


def _read_inbox(directory: Path) -> list[dict]:
    if not directory.is_dir():
        return []
    lines = []
    for path in sorted(directory.glob("*.jsonl")):
        for raw in path.read_text(encoding="utf-8").splitlines():
            raw = raw.strip()
            if not raw:
                continue
            try:
                item = json.loads(raw)
            except ValueError:
                continue
            if isinstance(item, dict):
                lines.append(item)
    return lines


def _static_path(directory: Path) -> Path | None:
    raw = os.environ.get("BURST_WAVEBOARD_STATIC", "").strip()
    if raw:
        return Path(raw)
    candidate = directory / "waveboard-static.md"
    return candidate if candidate.is_file() else None


def _single_line(text: str) -> bool:
    folded = text.casefold()
    if "goal:" not in folded:
        return False
    return any(label in folded for label in ("constraints:", "path:", "acceptance:", "next owner:", "next_owner:", "escalate:"))


def _canon(label: str) -> str:
    key = " ".join(label.casefold().split())
    if key in ("next owner", "next_owner"):
        return "next_owner"
    return key


def _cap(value: str) -> str:
    text = _clean_links(" ".join(str(value).split()))
    if not text or _SECRET.search(text):
        return ""
    return text[:FIELD_CAP]


def _clean_links(text: str) -> str:
    def markdown(match: re.Match) -> str:
        return match.group(0) if _allowed(match.group(2)) else match.group(1)

    def bare(match: re.Match) -> str:
        return match.group(0) if _allowed(match.group(0)) else ""

    return " ".join(_BARE_URL.sub(bare, _MD_LINK.sub(markdown, text)).split())


def _allowed(url: str) -> bool:
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.username or parsed.password:
        return False
    return (parsed.hostname or "").lower() in ALLOW_HOSTS


def _stamp(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _second(value) -> str:
    stamp = _stamp(value)
    if stamp is None:
        return ""
    return stamp.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _aware(now: datetime) -> datetime:
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now


def _age_phrase(age_s) -> str:
    if not isinstance(age_s, int):
        return ""
    if age_s < 60:
        return f"{age_s}s"
    minutes = age_s // 60
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60}h {minutes % 60}m"
