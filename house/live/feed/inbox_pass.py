"""Seat inboxes for the Example fleet (port of example-org/xray PR #5, house/live/inbox.py + board.py).

Run by the pusher every cycle (no secrets on argv; the ingest secret comes on stdin when posting):
  pull  EVENTS_JSON          -> merge a /ingest/events response (GitHub + box events the server holds) into the cache
  pass                       -> route events not seen before into $MESH_RUN/fleet/inbox/<seat>.jsonl, rebuild
                                BOARD.md (debounced 60 s, failure never stops the pass); prints "<new> <lines>"
  unsent OUT                 -> unsent lines (all seats) -> OUT ({"lines": [...]}) for POST /inbox; prints count
  sent OUT                   -> after a 200, remember those ids
The local spool ($MESH_RUN/feed/inbox-spool/<seat>.jsonl) is a ring buffer (last 300 lines a seat); the Railway
server is the source of truth (GET /inbox/<seat>).
First pass seeds silently (history is never delivered). Inbox lines carry ids, kinds, repo#number, sha, title (event
label, already in the public feed), url and a short reason; never bodies, prompt text or secrets.
"""
import json, os, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "routing"))
import inbox  # noqa: E402

RUN = Path(os.environ.get("MESH_RUN", "/srv/live-mesh-run"))
FEED = Path(os.environ.get("FEED", RUN / "feed" / "live-events.json"))
INBOX = Path(os.environ.get("LIVE_INBOX", RUN / "feed" / "inbox-spool"))   # ring buffer only: the server holds the inboxes
RING = 300
STATE = Path(os.environ.get("INBOX_STATE", RUN / "feed" / "inbox-state.json"))
CACHE = Path(os.environ.get("INBOX_CACHE", RUN / "feed" / "inbox-events.json"))
ACTIVITY = Path(os.environ.get("LIVE_ACTIVITY", RUN / "fleet" / "activity.jsonl"))
ROLES = HERE / "routing" / "inbox-roles.json"
KEEP_S = 3 * 86400
MAX_SEEN = 60000
KIND_MAP = {"pr_commit": "pr_update", "pr_force_push": "pr_update", "pr_ready": "pr_update"}


def _load(p, d):
    try:
        return json.loads(Path(p).read_text())
    except (OSError, ValueError):
        return d


def _save(p, obj):
    p = Path(p); p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + f".{os.getpid()}.tmp"); tmp.write_text(json.dumps(obj, separators=(",", ":"))); os.replace(tmp, p)


def _t(e):
    try:
        return datetime.fromisoformat(str(e.get("t_ct")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0


def adapt(events):
    """Example feed events -> the field names inbox.py routes on (hints only; the events themselves are unchanged)."""
    by_sha = {}
    for e in events:
        if e.get("number") is not None and e.get("sha"):
            by_sha[str(e["sha"])[:12]] = e["number"]
    out = []
    for e in events:
        e = dict(e)
        h = {}
        if e.get("kind") in KIND_MAP:
            e["kind"] = KIND_MAP[e["kind"]]
        sha = e.get("sha") or e.get("head_sha") or e.get("merge_sha")
        if sha:
            h["sha"] = str(sha)
        if e.get("number") is None and sha and str(sha)[:12] in by_sha:
            e["number"] = by_sha[str(sha)[:12]]
        if e.get("number") is not None:
            try:
                e["number"] = int(e["number"])
            except (TypeError, ValueError):
                e.pop("number")
        if e.get("kind") == "critic_pass" or e.get("recheck_result") == "PASS":
            e["kind"] = "critic_pass"
        for k in ("message", "text", "body"):
            e.pop(k, None)                               # never routed, never copied
        h["title"] = e.get("label") or ""
        e["_inbox"] = h
        out.append(e)
    return out


_direct_core = inbox._direct


def _direct_all(event, roles):
    """PR #5 routes plus the extra Chat Bot seats (roles.extra_seats: kinds / merge_bases / needles)."""
    out = _direct_core(event, roles)
    kind = inbox._kind(event)
    hay = str(event.get("label") or "").casefold()
    for seat, r in (roles.get("extra_seats") or {}).items():
        if not isinstance(r, dict) or not r:
            continue
        hit = kind in (r.get("kinds") or [])
        hit = hit or (kind == "merged" and str(event.get("base") or "").casefold() in [b.casefold() for b in r.get("merge_bases") or []])
        hit = hit or (kind.startswith("issue") or "comment" in kind) and any(n in hay for n in r.get("needles") or [])
        if hit:
            line = inbox._line(event, seat, r.get("reason") or "routed")
            if line:
                out.append(line)
    return out


inbox._direct = _direct_all


def cache_events():
    c = _load(CACHE, {"events": {}})
    return c, c.setdefault("events", {})


def cmd_pull(path):
    d = _load(path, {})
    c, ev = cache_events()
    for e in d.get("events") or []:
        if isinstance(e, dict) and isinstance(e.get("id"), str):
            ev[e["id"]] = e
    c["cursor"] = d.get("cursor") or c.get("cursor")
    _save(CACHE, c)
    if d.get("reset"):   # a full resync (first pull, server restart): history, never delivered
        st = _load(STATE, {})
        seen = st.get("seen") or {}
        for e in d.get("events") or []:
            if isinstance(e, dict) and isinstance(e.get("id"), str):
                seen.setdefault(e["id"], int(_t(e)))
        st["seen"] = seen
        _save(STATE, st)
    print(c.get("cursor") or "")


def cmd_pass(now=None):
    now = now or time.time()
    c, ev = cache_events()
    for e in _load(FEED, {}).get("events") or []:
        if isinstance(e, dict) and isinstance(e.get("id"), str):
            ev[e["id"]] = e
    for k in [k for k, e in ev.items() if now - _t(e) > KEEP_S and e.get("kind") not in ("pr_open", "issue_open")]:   # card events stay (board)
        del ev[k]
    st = _load(STATE, {})
    seen = st.get("seen") or {}
    ids = sorted(ev, key=lambda k: _t(ev[k]))
    new = [ev[k] for k in ids if k not in seen]
    first = not st.get("seeded")
    for e in new:
        seen[e["id"]] = int(_t(e))
    if len(seen) > MAX_SEEN:
        seen = dict(sorted(seen.items(), key=lambda kv: kv[1])[-MAX_SEEN:])
    lines = 0
    if not first and new:
        acts = []
        if ACTIVITY.is_file():
            for raw in ACTIVITY.read_text().splitlines()[-2000:]:
                try:
                    acts.append(json.loads(raw))
                except ValueError:
                    pass
        roles = json.loads(ROLES.read_text())
        written = inbox.deliver(adapt(new), adapt([ev[k] for k in ids]), directory=INBOX, roles=roles,
                                now=datetime.fromtimestamp(now, timezone.utc), activity=acts)
        lines = sum(written.values())
        inbox.maybe_board(len(new), log=lambda m: print(m, file=sys.stderr))
    _save(STATE, {"seeded": True, "seen": seen, "sent": st.get("sent") or []})
    ring()
    _save(CACHE, c)
    print(f"{0 if first else len(new)} {lines}")


def ring():
    """Keep the local spool small: the last RING lines per seat (unsent lines wait here while the server is down)."""
    for p in INBOX.glob("*.jsonl"):
        rows = p.read_text(encoding="utf-8").splitlines()
        if len(rows) > RING:
            tmp = p.with_suffix(".tmp"); tmp.write_text("\n".join(rows[-RING:]) + "\n", encoding="utf-8"); os.replace(tmp, p)


def cmd_unsent(out):
    st = _load(STATE, {})
    sent = set(st.get("sent") or [])
    lines = []
    for p in sorted(INBOX.glob("*.jsonl")):
        for raw in p.read_text().splitlines():
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if isinstance(d, dict) and d.get("seat") and d.get("id") not in sent:
                lines.append(d)
    Path(out).write_text(json.dumps({"lines": lines[:500]}))
    print(len(lines[:500]))


def cmd_sent(out):
    st = _load(STATE, {})
    sent = (st.get("sent") or []) + [d["id"] for d in _load(out, {}).get("lines") or []]
    st["sent"] = sent[-20000:]
    _save(STATE, st)


if __name__ == "__main__":
    cmd, *a = sys.argv[1:] or ["pass"]
    {"pull": cmd_pull, "pass": cmd_pass, "unsent": cmd_unsent, "sent": cmd_sent, "builder-unsent": cmd_unsent, "builder-sent": cmd_sent}[cmd](*a)
