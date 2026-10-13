"""Board model: cards, packets and beats from the feed's own events (no extra GitHub calls, no poller).

Sources: the box feed's events plus the seat-inbox pass's event cache ($MESH_RUN/feed/inbox-events.json, i.e. the
server's merged feed events pulled by the pusher). Card and packet fields come from the pr_open / issue_open events
the collector pass already writes (live_collect.card_fields: title, state, labels, sanitized packet).

CARD   = one GitHub issue or PR (repo#number): title, url, owner seat, stage (open > review > fix > merge > retest >
         done), state (live | held | parked | closed). A merge, an issue close, or a PR close sets state closed
         and stage done. A failed retest after merge needs a new issue. Closed cards drop off 24 h after closing.
HOLD   = the owner posts a comment whose first line is 'Held: <reason>' (optional until:), or the issue / PR
         carries a label in GITHUB_HOLD_LABEL (default on-hold). A Parked: comment still parks and wins over a hold.
         Repos in NO_NUDGE_REPOS (unset means none) stay visible and are never stalled or nudged.
PACKET = goal, constraints, path, acceptance, evidence, next owner, escalate. Missing acceptance or next owner ->
         amber 'no packet'. Evidence fills from the latest beat (CI url, Reviewer verdict url, merge sha, retest tick).
BEAT   = one real event: PR opened/pushed, Reviewer verdict, CI result, merge, merge-queue.md tick, Lead message, blocker.
         A watcher run whose start and end fall in the same second is never a beat.
STALL  = a live card with no beat for 60 min (red on the page; one line to fleet/inbox/coord.jsonl per stalled beat).
Also writes house/BOARD.md from the same model at most once a minute; board-static.md items are pinned cards."""
import json, os, re, time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import live_packet

CT = ZoneInfo("America/Chicago")
RUN = Path(os.environ.get("MESH_RUN", "/srv/live/run"))
CACHE = Path(os.environ.get("INBOX_CACHE", RUN / "feed" / "inbox-events.json"))
INBOX = Path(os.environ.get("LIVE_INBOX", RUN / "fleet" / "inbox"))
HOUSE = Path(os.environ.get("LIVE_HOUSE", "/srv/fleet-house/house"))
MD = Path(os.environ.get("LIVE_BOARD", HOUSE / "BOARD.md"))
STATIC = Path(os.environ.get("LIVE_BOARD_STATIC", HOUSE / "watchers" / "board-static.md"))
STAGES = ("open", "review", "fix", "merge", "retest", "done")
STALL_S = 60 * 60
CLOSED_KEEP_S = 24 * 3600
MD_EVERY_S = 60
MAX_CARDS = 40
# parked: a parked/blocked/waiting label, a draft PR quiet for 7 days, or an issue quiet for 24 h (backlog, no stall).
# The hold label (default on-hold) is a hold, not a park.
PARKED = re.compile(r"\b(parked|blocked|waiting|icebox)\b", re.I)
_last_md = [0.0]


def _t(e):
    try:
        return datetime.fromisoformat(str(e.get("t_ct")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _ct(ts):
    return datetime.fromtimestamp(ts, CT).strftime("%-I:%M %p CT") if ts else ""


def beat_of(e):
    """-> short beat word, or None. Only real events that move a card."""
    k = str(e.get("kind") or "")
    if re.search(r"watcher|turn|subagent", k):
        if e.get("idle") or e.get("dur_s") == 0 or (e.get("start_ct") and e.get("start_ct") == e.get("end_ct")):
            return None                                   # idle watcher run: never a beat
        return None                                       # watcher runs are not card work
    if k in ("pr_open", "issue_open"):
        return "opened"
    if k in ("pr_commit", "pr_force_push", "pr_update"):
        return "pushed"
    if k.startswith("critic_"):
        v = e.get("recheck_result") or k.split("_", 1)[1].upper()
        return f"Reviewer {str(v).upper()}"
    if k in ("check_run", "workflow_run", "ci_pass", "ci_fail") and (e.get("conclusion") or k.startswith("ci_")):
        return "CI " + (e.get("conclusion") or k[3:])
    if k == "merged":
        return "merged"
    if k.startswith("lab_retest_"):
        return "retest " + k.rsplit("_", 1)[1].upper()
    if k.startswith("prompt") and str(e.get("from")) == "Lead":
        return "Lead message"
    if (k in ("issue_labeled", "pr_labeled") and re.search(r"block", str(e.get("detail") or ""), re.I)) or "blocker" in k:
        return "blocker"
    return None


def _evidence(e, what):
    if what == "merged":
        sha = e.get("merge_sha") or e.get("sha")
        return f"merge {str(sha)[:7]}" if sha else "merged"
    if what.startswith("retest"):
        return "merge-queue.md tick: " + what
    if what.startswith(("CI", "Reviewer")) and str(e.get("source", "")).startswith("https://"):
        return live_packet.clean(e["source"])
    return ""


def _events(extra):
    ev = {}
    try:
        for k, e in (json.loads(CACHE.read_text()).get("events") or {}).items():
            if isinstance(e, dict):
                ev[k] = e
    except (OSError, ValueError):
        pass
    for e in extra or []:
        if isinstance(e, dict) and isinstance(e.get("id"), str):
            ev[e["id"]] = e
    import live_collect   # same fleet-only rule as the feed: the cache never expires, so old unmapped entries stay out
    return sorted(live_collect.fleet_only(list(ev.values())), key=_t)


def _key(e, sha_num):
    repo = e.get("repo")
    if not repo:
        return None
    n = e.get("number")
    if n is None:
        sha = e.get("sha") or e.get("head_sha")
        n = sha_num.get(f"{repo}@{str(sha)[:7]}") if sha else None
    try:
        return f"{str(repo).lower()}#{int(n)}" if n is not None else None
    except (TypeError, ValueError):
        return None


def pinned():
    """board-static.md bullets ('- **Title.** ...') -> pinned cards (title only)."""
    out, sec = [], ""
    try:
        text = STATIC.read_text(encoding="utf-8")
    except OSError:
        return out
    for line in text.splitlines():
        if line.startswith("## "):
            sec = line[3:].strip()
        m = re.match(r"^\s*-\s+\*\*(.+?)\*\*", line)
        if m and sec:
            title = live_packet.clean(m.group(1).rstrip(".:"))[:120]
            out.append({"key": f"pin:{len(out) + 1}", "kind": "pin", "repo": "", "number": 0, "title": title, "url": "",
                        "owner": "Lead" if "lead" in sec.lower() else "Coord", "stage": "open", "state": "parked",
                        "section": live_packet.clean(sec)[:40], "pinned": True, "packet": {}, "packet_ok": True,
                        "missing": [], "beats": [], "last_beat_t": 0, "stall": False})
    return out[:12]


def model(extra_events=None, now=None):
    now = now or time.time()
    evs = _events(extra_events)
    sha_num = {}
    for e in evs:
        if e.get("number") is not None and (e.get("sha") or e.get("head_sha")):
            sha_num[f"{e['repo']}@{str(e.get('sha') or e.get('head_sha'))[:7]}"] = e["number"]
    cards = {}
    for e in evs:                                          # cards from the open events (latest copy wins)
        if e.get("kind") not in ("pr_open", "issue_open"):
            continue
        k = _key(e, sha_num)
        if not k:
            continue
        pk = e.get("packet") if isinstance(e.get("packet"), dict) else {}
        pk = {f: live_packet.clean(v) for f, v in pk.items() if f in live_packet.FIELDS and v}
        title = e.get("title") or re.sub(r"^.*?opened · ", "", str(e.get("label") or ""))
        cards[k] = {"key": k, "kind": "pr" if e["kind"] == "pr_open" else "issue", "repo": e["repo"],
                    "number": int(e["number"]), "title": live_packet.clean(title)[:120],
                    "url": live_packet.clean(e.get("source") or ""), "owner": str(e.get("from") or "-")[:24],
                    "labels": [live_packet.clean(x)[:30] for x in (e.get("labels") or [])][:6],
                    "packet": pk, "_closed": e.get("pr_state") == "closed", "_closed_t": _t({"t_ct": e.get("closed_at")}) if e.get("closed_at") else 0,
                    "_draft": bool(e.get("draft")), "_beats": [], "_stop": False, "_known": "pr_state" in e}
    merged_keys = {_key(e, sha_num) for e in evs if e.get("kind") == "merged"}
    fixed_by = {}                                          # card key -> "#P" when a merged PR says it fixes / supersedes it
    for e in evs:
        if e.get("kind") == "pr_open" and e.get("fixes") and _key(e, sha_num) in merged_keys:
            for n in e["fixes"]:
                fixed_by.setdefault(f"{str(e['repo']).lower()}#{int(n)}", f"#{int(e['number'])}")
    for e in evs:                                          # beats, in time order; a closed card stops collecting
        k = _key(e, sha_num)
        c = cards.get(k) if k else None
        if not c or c["_stop"]:
            continue
        if e.get("kind") in ("issue_close", "pr_close"):
            c["_closed"], c["_closed_t"] = True, _t(e)
        w = beat_of(e)
        is_comment = e.get("kind") in ("pr_comment", "issue_comment", "pr_review")
        if is_comment and e.get("parked"):                 # Coord rule: a 'Parked:' comment parks the card (no nudges)
            c["_parked_c"] = True
            c["_hold"] = None
            c["_beats"].append({"t": int(_t(e) * 1000), "what": "parked", "url": "", "id": e["id"], "_ev": ""})
            continue
        hold = e.get("hold") if isinstance(e.get("hold"), dict) else None
        if is_comment and hold and str(e.get("from") or "") == str(c.get("owner") or ""):
            c["_parked_c"] = False
            c["_hold"] = {"reason": live_packet.clean(hold.get("reason"))[:live_packet.HOLD_MAX],
                          "until": live_packet.clean(hold.get("until"))[:live_packet.HOLD_MAX],
                          "by": str(e.get("from") or "")[:24], "t": _t(e)}
            c["_beats"].append({"t": int(_t(e) * 1000), "what": "held", "url": "", "id": e["id"], "_ev": ""})
            continue
        if w or is_comment:
            c["_parked_c"] = False                         # a newer beat or a non-'Parked:' comment unparks it
            if c.get("_hold") and str(e.get("from") or "") == str(c.get("owner") or ""):
                c["_hold"] = None
        if not w and e.get("kind") in ("pr_comment", "issue_comment", "pr_review") and str(e.get("from")) == c["owner"]:
            w = "owner: resolved" if e.get("resolved") else "owner comment"   # the owning seat's own note is a beat
            if e.get("resolved"):
                c["_resolved"] = "owner says resolved"
        if w and c.get("_merged_t") and not w.startswith(("retest", "owner")):
            continue                                       # after the merge only merge-queue.md ticks move the card
        if not w:
            if c["_closed"] and not c.get("_merged_t") and c["_closed_t"] and _t(e) >= c["_closed_t"]:
                c["_stop"] = True
            continue
        b = {"t": int(_t(e) * 1000), "what": w, "url": live_packet.clean(e.get("source") or "")[:160] if w.startswith(("CI", "Reviewer")) else "",
             "id": e["id"], "_ev": _evidence(e, w)}
        sha = re.sub(r"[^0-9a-f]", "", str(e.get("sha") or e.get("head_sha") or "").lower())[:7]
        if w.startswith("Reviewer"):
            b["kind"] = "reviewer verdict"                   # tied to the head SHA it was given at
        if sha and (w.startswith("Reviewer") or w == "pushed"):
            b["sha"] = sha
        c["_beats"].append(b)
        if w == "merged":
            c["_merged_t"] = _t(e)
    out = []
    for c in cards.values():
        beats = c.pop("_beats")
        merged = any(b["what"] == "merged" for b in beats)
        closed_t = c.pop("_closed_t") or (c.get("_merged_t") or 0)
        last = beats[-1] if beats else None
        # stage from the trail
        stage = "open" if c["kind"] == "issue" else "review"
        for b in beats:
            w = b["what"]
            if w in ("opened", "pushed"):
                stage = "review" if c["kind"] == "pr" else stage
            elif w in ("Reviewer FAIL", "Reviewer HOLD") or w in ("CI failure", "CI timed_out"):
                stage = "fix"
            elif w.startswith("Reviewer PASS") or (w == "CI success" and stage == "merge"):
                stage = "merge" if stage != "fix" or w.startswith("Reviewer PASS") else stage
            elif w == "merged":
                stage = "retest"
            elif w in ("retest PASS", "retest FAIL"):
                stage = "done"                             # a merge-queue.md PASS / FAIL tick ends the card's retest
        if not c.pop("_known") and not merged and (not last or now - last["t"] / 1000 > 86400):
            continue          # open event from before the collector captured state, quiet a day: state unknown, not shown
        resolved = c.pop("_resolved", None) or (f"fixed by {fixed_by[c['key']]}" if c["key"] in fixed_by else None)
        if resolved:
            stage = "done"                                 # owner says resolved / a later merged PR fixes or supersedes it
        explicit_close = bool(c.pop("_closed"))
        closed = explicit_close or (merged and stage == "done") or bool(resolved)
        if c["kind"] == "issue" and closed:
            stage = "done"
        if merged or explicit_close:
            # A merge, an issue close, or a PR close ends the card. It does not stay live for a retest tick.
            # A failed retest after merge needs a new issue.
            closed = True
            stage = "done"
            closed_t = closed_t or (last["t"] / 1000 if last else now)
        if closed and closed_t and now - closed_t > CLOSED_KEEP_S:
            continue                                       # closed cards drop off after 24 h
        quiet = bool(last) and now - last["t"] / 1000 > 86400
        parked = (not closed) and (c.pop("_parked_c", False) or (c["kind"] == "issue" and quiet) or any(PARKED.search(x) for x in c["labels"]) or (c.pop("_draft") and (not last or now - last["t"] / 1000 > 7 * 86400)))
        c.pop("_draft", None); c.pop("_parked_c", None)
        c.pop("_stop", None); c.pop("_merged_t", None)
        state = "closed" if closed else "parked" if parked else "live"
        pk = dict(c["packet"])
        if not pk.get("evidence"):
            ev = next((b["_ev"] for b in reversed(beats) if b["_ev"]), "")
            if ev:
                pk["evidence"] = ev
        missing = [f for f in ("acceptance", "next owner") if not pk.get(f)]
        last_t = last["t"] / 1000 if last else 0
        stall = state == "live" and bool(last_t) and now - last_t > STALL_S
        heads = [b["sha"] for b in beats if b["what"] == "pushed" and b.get("sha")]
        head = heads[-1] if heads else None
        crit = next((b for b in reversed(beats) if b.get("kind") == "reviewer verdict"), None)
        cis = [b["what"] for b in beats if b["what"].startswith("CI ")]
        ci_ok = not cis or cis[-1] in ("CI success", "CI skipped", "CI neutral")
        at_head = bool(crit) and (not head or not crit.get("sha") or head.startswith(crit["sha"]) or crit["sha"].startswith(head))
        if head:
            c["head"] = head
        if crit:
            c["reviewer"] = {"verdict": crit["what"].split()[1] if len(crit["what"].split()) > 1 else "", "sha": crit.get("sha"), "t": crit["t"], "at_head": at_head}
        if stage == "retest" and state == "live":
            c["nudge_to"] = "tester"                        # Tester owns the retest: merged cards nudge the lab tester
            c["nudge_via"] = "retest owner"
            pk.setdefault("next owner", "Tester")
        elif not merged and state == "live" and crit and crit["what"].startswith("Reviewer PASS") and at_head and ci_ok:
            stage = "merge"                                # PASS at the current head + green CI: Builder merges
            c["nudge_to"], c["nudge_via"] = "builder", "merge (Reviewer PASS at head)"
            pk["next owner"] = "Builder"
        elif not merged and re.search(r"tester", str(pk.get("next owner") or ""), re.I):
            c["nudge_to"], c["nudge_via"] = "builder", "unmerged (Tester only retests after merge)"
        hold = c.pop("_hold", None)
        label = live_packet.labels_held(c.get("labels"))
        if hold and hold.get("reason") and not closed and not parked:
            state, stall = "held", False
            c.pop("nudge_to", None); c.pop("nudge_via", None)
            c["hold"] = {"reason": hold["reason"], "until": hold["until"], "by": hold["by"],
                         "at": int((hold["t"] or 0) * 1000)}
        elif label and not closed and not parked:
            state, stall = "held", False
            c.pop("nudge_to", None); c.pop("nudge_via", None)
            c["hold"] = {"reason": live_packet.clean(label)[:live_packet.HOLD_MAX] or "on-hold",
                         "until": "", "by": "github", "at": int((last_t or now) * 1000)}
        if live_packet.repo_no_nudge(c.get("repo")):
            c.pop("nudge_to", None); c.pop("nudge_via", None)
            stall = False
        missing = [f for f in ("acceptance", "next owner") if not pk.get(f)]
        if resolved:
            c["resolved"] = resolved
        c.update(stage=stage, state=state, packet=pk, packet_ok=not missing, missing=missing,
                 beats=[{k: v for k, v in b.items() if not k.startswith("_")} for b in beats[-5:]],
                 last_beat_t=int(last_t * 1000), stall=stall, closed_t=int(closed_t * 1000) if closed else 0)
        out.append(c)
    # only cards with recent life make the board: live/parked with a beat in 14 days, or closed in the last 24 h
    out = [c for c in out if c["state"] == "closed" or (c["last_beat_t"] and now - c["last_beat_t"] / 1000 < 14 * 86400)]
    rank = {"live": 0, "held": 0, "parked": 1, "closed": 2}
    out.sort(key=lambda c: (rank[c["state"]], STAGES.index(c["stage"]), -c["last_beat_t"]))
    return {"updated_ct": datetime.fromtimestamp(now, CT).isoformat(timespec="seconds"),
            "stages": list(STAGES), "stats": stats(evs, now), "cards": pinned() + out[:MAX_CARDS]}


def reconcile(wave, open_now, now=None):
    """Close every non-closed issue/PR card whose item GitHub reports closed or missing. Returns how many closed."""
    if not open_now or not isinstance(wave, dict) or not isinstance(wave.get("cards"), list):
        return 0
    now = now or time.time()
    n = 0
    for c in wave["cards"]:
        if c.get("pinned") or c.get("state") == "closed" or c.get("kind") not in ("issue", "pr"):
            continue
        key = str(c.get("key") or "")
        if "#" not in key:
            continue
        repo, _, num = key.rpartition("#")
        nums = open_now.get(repo.lower())
        if nums is None:
            continue
        try:
            missing = int(num) not in nums
        except ValueError:
            continue
        if missing:
            c["state"], c["stage"], c["closed_t"], c["stall"] = "closed", "done", int(now * 1000), False
            c.pop("nudge_to", None); c.pop("nudge_via", None)
            n += 1
    return n


def stats(evs, now=None):
    """Board stats strip, from the same feed events (no GitHub calls): last 24 h + open now."""
    now = now or time.time()
    day = lambda e: now - _t(e) <= 86400
    opened, closed, merged, unmerged = {}, {}, {}, {}
    for e in evs:
        k, key = e.get("kind"), (e.get("repo"), e.get("number"))
        if key[1] is None:
            continue
        if k in ("pr_open", "issue_open"):
            opened[key] = e
            if e.get("pr_state") == "closed":
                closed[key] = e
        elif k in ("issue_close", "pr_close"):
            closed[key] = e
        elif k == "merged":
            merged[key] = e; closed[key] = e
        if k == "pr_close":
            unmerged[key] = e
    is_pr = lambda key: opened.get(key, {}).get("kind") == "pr_open" or key in merged or key in unmerged
    iss = [k for k in opened if not is_pr(k)]
    prs = [k for k in opened if is_pr(k)]
    out = {"issues_opened_24h": sum(day(opened[k]) for k in iss),
           "issues_closed_24h": sum(1 for k, e in closed.items() if not is_pr(k) and day(e)),
           "prs_opened_24h": sum(day(opened[k]) for k in prs),
           "prs_merged_24h": sum(day(e) for e in merged.values()),
           "prs_closed_unmerged_24h": sum(1 for k, e in unmerged.items() if k not in merged and day(e)),
           "issues_open": sum(1 for k in iss if k not in closed and "pr_state" in opened[k]),
           "prs_open": sum(1 for k in prs if k not in closed and "pr_state" in opened[k])}
    out["open_total"] = out["issues_open"] + out["prs_open"]
    return out


def stall_lines(m, now=None):
    """One fleet/inbox/coord.jsonl line per stalled live card (keyed by its last beat, so once per stall)."""
    lines = []
    for c in m["cards"]:
        if not c.get("stall") or not c.get("beats"):
            continue
        b = c["beats"][-1]
        lines.append({"id": f"stall60:{c['key']}:{b['id']}", "t_ct": datetime.fromtimestamp(now or time.time(), CT).isoformat(timespec="seconds"),
                      "seat": "coord", "type": "stall", "repo": c["repo"], "number": c["number"], "title": c["title"][:120],
                      "url": c["url"][:300], "reason": f"no beat for 60 min ({c['stage']})"})
    if not lines:
        return 0
    INBOX.mkdir(parents=True, exist_ok=True)
    p = INBOX / "coord.jsonl"
    known = set()
    if p.is_file():
        for raw in p.read_text(encoding="utf-8").splitlines():
            try:
                known.add(json.loads(raw).get("id"))
            except ValueError:
                pass
    fresh = [l for l in lines if l["id"] not in known]
    if fresh:
        with p.open("a", encoding="utf-8") as fh:
            for l in fresh:
                fh.write(json.dumps(l, ensure_ascii=False) + "\n")
    return len(fresh)


def write_md(m, now=None, force=False):
    """house/BOARD.md from the same model, at most once a minute."""
    now = now or time.time()
    if not force and now - _last_md[0] < MD_EVERY_S:
        return False
    _last_md[0] = now
    L = ["<!-- GENERATED by live-mesh feed/live_board.py from the live feed model (cards / packets / beats);",
         "     do not hand-edit; pinned items come from watchers/board-static.md. -->", "",
         "# \U0001F30A BOARD (live)", "", f"**Updated: {datetime.fromtimestamp(now, CT).strftime('%a %b %-d, %Y %-I:%M %p')} CT** · "
         "cards = GitHub issues / PRs · stage open > review > fix > merge > retest > done", ""]
    pins = [c for c in m["cards"] if c.get("pinned")]
    if pins:
        L += ["## Pinned", ""] + [f"- **{c['title']}** ({c['section']}, {c['owner']})" for c in pins] + [""]
    for st in STAGES:
        cs = [c for c in m["cards"] if not c.get("pinned") and c["stage"] == st and c["state"] != "closed"]
        if not cs:
            continue
        L += [f"## {st.capitalize()} ({len(cs)})", ""]
        for c in cs:
            flags = []
            if c["state"] == "parked":
                flags.append("parked")
            if c["stall"]:
                flags.append("STALL 60m+")
            if not c["packet_ok"]:
                flags.append("no packet")
            last = c["beats"][-1] if c["beats"] else None
            L.append(f"- [{c['repo'].split('/')[-1]} #{c['number']}]({c['url']}) {c['title']} · owner {c['owner']}"
                     + (f" · last beat {last['what']} {_ct(last['t'] / 1000)}" if last else "")
                     + (f" · next {c['packet'].get('next owner')}" if c['packet'].get('next owner') else "")
                     + (" · **" + ", ".join(flags) + "**" if flags else ""))
        L.append("")
    closed = [c for c in m["cards"] if c["state"] == "closed"]
    if closed:
        L += ["## Closed (last 24 h)", ""] + [f"- {c['repo'].split('/')[-1]} #{c['number']} {c['title']}" for c in closed] + [""]
    try:
        MD.parent.mkdir(parents=True, exist_ok=True)
        tmp = MD.with_suffix(f".md.{os.getpid()}.tmp")
        tmp.write_text("\n".join(L), encoding="utf-8")
        os.replace(tmp, MD)
        return True
    except OSError:
        return False


def run(extra_events=None, write=True):
    """One feed pass: model for the page header, coord stall lines, BOARD.md (debounced). Never raises."""
    try:
        m = model(extra_events)
        if write and os.environ.get("LIVE_BOARD_LOCAL") == "1":   # retired: the server holds cards + nudges
            stall_lines(m)
            write_md(m)
        return m
    except Exception as ex:  # the feed must keep writing
        print(f"[board] {type(ex).__name__}: {ex}", flush=True)
        return None
