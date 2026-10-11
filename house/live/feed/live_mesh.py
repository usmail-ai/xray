#!/usr/bin/env python3
"""Example FULL-HISTORY adapter around upstream 0xRayAI/xray house/live-mesh/fetch_feed.py (unmodified).

Imports fetch_feed and replaces build()/write() at runtime; reuses its merge()/ordering and --watch loop.
GitHub data comes from live_collect.RepoCollector (full backfill, then incremental ETag polling; metadata
only, no bodies). Plus lab retests from merge-queue.md and /health status-code changes (code + time only).
Auth: static GH_TOKEN/GITHUB_TOKEN = the read-only ops-app token minted by the supervisor; upstream's
own App self-mint (full permissions) is disabled and there is no fallback.
"""
import fcntl
import os, re, sys, time, json, hashlib, urllib.request, urllib.error, http.client
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.dont_write_bytecode = True   # never write __pycache__ into the upstream checkout
SRC = os.environ.get("LIVE_MESH_SRC", str(Path(__file__).resolve().parent.parent.parent / "live-mesh"))
sys.path.insert(0, SRC)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_feed as ff  # noqa: E402
import live_collect as uc  # noqa: E402
import live_flow  # noqa: E402
import live_fleet  # noqa: E402
import live_board  # noqa: E402

ORG = "example-org"
HEALTH_URLS = os.environ.get("LIVE_HEALTH_URLS", "https://dev.example.com/health https://app.example.com/health").split()
MERGE_QUEUE = Path(os.environ.get("LIVE_MERGE_QUEUE", "/srv/fleet-house/house/watchers/merge-queue.md"))
QUEUE_RE = re.compile(r"^- \[(.)\] (\S+) #(\d+) ([0-9a-f]{7,40})\b")

for k in ff.AppToken.ENV:
    os.environ.pop(k, None)
ff.AppToken.from_env = classmethod(lambda cls: None)
ff.SEATS = ["Builder", "Reviewer", "Operator", "Tester", "Coord"]
ff.SERVICES = ["GitHub", "dev.example.com", "app.example.com"]

# LIVE_MODE: "all" (box, everything; the pre-split default), "github" (Railway collector: GitHub + /health +
# fleet state from GitHub; no box files) or "box" (slim box pusher: fleet files, merge-queue, Railway deploy list;
# no GitHub calls and no token). The server merges the two sources by event id.
MODE = os.environ.get("LIVE_MODE", "all")
if MODE not in ("all", "github", "box"):
    raise SystemExit(f"LIVE_MODE must be all, github or box (got {MODE!r})")
COLLECTORS: dict = {}
FLEET: dict = {}
STATS = {"passes": 0}


def ts(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


# ---- lab retests from merge-queue.md (until Tester posts from its own App)
def queue_events(state_path, github_retests):
    first = not state_path.exists()   # first read: seed the ticks already in the file silently (no live)
    st = json.loads(state_path.read_text()) if not first else {}
    out = []
    if not MERGE_QUEUE.exists():
        return out
    now = datetime.now(ff.CT).replace(microsecond=0).isoformat()
    for line in MERGE_QUEUE.read_text().splitlines():
        m = QUEUE_RE.match(line)
        if not m:
            continue
        mark, short, n, sha = m.groups()
        if mark == " ":
            continue
        v = {"x": "PASS", "X": "PASS", "!": "FAIL"}.get(mark)
        if not v:
            ff.log(f"merge-queue.md: unknown tick '[{mark}]' on {short} #{n}; skipped (not guessed)")
            continue
        repo, n = f"{ORG}/{short}", int(n)
        if (repo, n) in github_retests:
            continue
        key = f"{repo}#{n}:{sha}:{v}"
        st.setdefault(key, "seed" if first else now)
        if st[key] == "seed":
            continue
        out.append({"id": f"{repo}#{n}:retest:{sha[:7]}:{v}", "t_ct": st[key], "from": "Tester", "to": "GitHub",
                    "kind": f"lab_retest_{v.lower()}", "direction": "internal",
                    "label": f"lab retest {v} · {short} #{n}", "source": f"https://github.com/{repo}/pull/{n}",
                    "src_file": "merge-queue.md", "repo": repo, "number": n, "sha": sha,
                    "note": "from merge-queue.md; time = first seen by the watcher (file has no per-row time)"})
    if first and st:
        ff.log(f"merge-queue.md: first read, seeded {len(st)} existing ticks silently")
    tmp = state_path.with_suffix(f".tmp.{os.getpid()}"); tmp.write_text(json.dumps(st, indent=2) + "\n"); os.replace(tmp, state_path)
    return out


# ---- /health: status code + check time only, emit on change
def _status_only(url):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "live-board-feed"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status            # body is never read
    except urllib.error.HTTPError as e:
        e.close()                       # error body discarded unread
        return e.code
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError):
        return None


def health_events(args, state_path):
    st = json.loads(state_path.read_text()) if state_path.exists() else {}
    if st.get("schema") != "live-health-v1":
        st = {"schema": "live-health-v1", "urls": {}, "events": []}
    now = time.time()
    for url in HEALTH_URLS:
        u = st["urls"].setdefault(url, {})
        if now - u.get("last_probe_unix", 0) < args.health_every:
            continue
        code = _status_only(url)
        t = datetime.now(ff.CT).replace(microsecond=0)
        if code != u.get("http_status", "unset"):
            host = url.split("//", 1)[-1].split("/", 1)[0]
            ok = code is not None and 200 <= code < 300
            st["events"].append({
                "id": f"health:{host}:{code}:{t.strftime('%Y-%m-%dT%H:%M:%S')}", "t_ct": t.isoformat(),
                "from": host, "to": "Operator", "kind": "health_ok" if ok else "health_fail",
                "direction": "internal", "label": f"{host} /health {code if code is not None else 'unreachable'}",
                "source": url, "src_file": "health-probe", "http_status": code})
        u.update(http_status=code, last_probe_unix=now, last_probe_t=t.isoformat())
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_path.with_suffix(f".tmp.{os.getpid()}"); tmp.write_text(json.dumps(st, indent=2) + "\n"); os.replace(tmp, state_path)
    return list(st["events"])


TOKEN_MAX_AGE_S = 50 * 60   # installation tokens live 1 h; measured on the WALL clock (box pauses freeze monotonic time)
EXIT_REMINT = 75            # supervisor: exit code meaning "token expired, re-mint now"


def token_check():
    """Exit (no write) when the supervisor-minted token is too old by the wall clock."""
    minted = os.environ.get("LIVE_TOKEN_MINTED")
    if minted and minted.isdigit() and time.time() - int(minted) > TOKEN_MAX_AGE_S:
        ff.log(f"token minted {int(time.time()) - int(minted)}s ago (wall clock) -> exit {EXIT_REMINT} to re-mint")
        raise SystemExit(EXIT_REMINT)


def build(args, gh):
    ff._live_pass_t0 = time.time()
    token_check()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token and MODE != "box":
        raise SystemExit("no GH_TOKEN/GITHUB_TOKEN (read-only token); refusing to run unauthenticated")
    c = uc.Client(token or "")
    out_dir = Path(args.out).parent
    t0 = time.time()
    events, backfill_done = [], {}
    for repo in (args.repos if MODE != "box" else []):
        col = COLLECTORS.get(repo) or COLLECTORS.setdefault(repo, uc.RepoCollector(repo, out_dir / "store", ff, ff.log))
        try:
            backfill_done[repo] = col.run(c, time.time() + uc.BACKFILL_SECONDS)
        except uc.AuthExpired as e:   # never write a stale feed that looks fresh; let the supervisor re-mint
            ff.log(f"{repo}: {e} (token expired) -> exit {EXIT_REMINT} to re-mint; feed not written")
            raise SystemExit(EXIT_REMINT)
        events.extend(col.ev.values())
    gh_retests = {(e["repo"], e["number"]) for e in events if e["kind"].startswith("lab_retest_")}
    if MODE != "github":            # merge-queue.md lives on the box (the server drops a box retest GitHub also has)
        events.extend(queue_events(out_dir / "retest-seen.json", gh_retests))
    if args.health and MODE != "box":
        events.extend(health_events(args, Path(args.health_state)))
    fleet = FLEET.get("f") or FLEET.setdefault("f", live_fleet.Fleet(out_dir / "fleet-state.json", ff.CT))
    if MODE != "github":
        events.extend(fleet.scan())     # lab bugs/runs + board cards from local files (no API, no LLM)
    uniq = ff.merge([dict(e) for e in events])
    live_flow.Flow(COLLECTORS, uc.node).apply(uniq)   # hop list per event (real flow direction)
    fleet_state = fleet.fleet_state(uniq)
    wave = live_board.run(uniq) if MODE != "github" else None   # cards / packets / beats (same events)
    STATS["passes"] += 1
    gaps = sorted({f"{r}: deployments {v}" for r, col in COLLECTORS.items()
                   for k, v in col.st["gaps"].items() if k == "deployments" and v})
    ff.log(f"pass {STATS['passes']}: REST {c.calls} calls ({c.not_modified} x 304), GraphQL {c.gql_calls} q / "
           f"{c.gql_points} pts, core remaining {c.remaining}, gql remaining {c.gql_remaining}, "
           f"{time.time() - t0:.0f}s, backfill done {all(backfill_done.values())}, "
           f"fleet {fleet_state['active']}/{fleet_state['total']} active")
    first = min((e["t_ct"] for e in uniq), default=None, key=lambda t: ts(t))
    return {
        "title": "Example live mesh",
        "sources": [f"https://github.com/{r}" for r in args.repos] + HEALTH_URLS + [MERGE_QUEUE.name],
        "repo": args.repos[0], "repos": args.repos, "seats": ff.SEATS, "services": ff.SERVICES,
        "notes": [
            "Example fleet, full GitHub history (backfilled from repo creation, then incremental): PRs, PR pushes, "
            "reviews, reviewer verdicts (latest per PR), comment METADATA (no bodies), issues and issue events, "
            "commits on develop/main, tags, releases, check suites/runs, commit statuses (Railway = deploy*), "
            "workflow runs; plus lab retests and /health status-code changes.",
            f"Window: full history (first event {first}).",
            "Read-only GitHub token. No bodies of any kind are stored. Titles/messages relabeled for Example branding.",
            "/health events carry only the HTTP status code and the check time.",
            "Lab and board events come from files the fleet writes on the box (ids, severity, status words, counts, "
            "times and a short source tag only). Fleet seats are active if an owned file changed or the seat acted "
            "on GitHub in the last 15 min.",
        ] + [f"Gap: {g}" for g in gaps],
        "backfill_complete": all(backfill_done.values()),
        "source": MODE,
        "fleet": fleet_state,
        **({"board": wave} if wave else {}),
        "generated_at": datetime.now(ff.CT).isoformat(),
        "kinds": sorted({e["kind"] for e in uniq}),
        "event_count": len(uniq),
        "events": uniq,
    }


ff.build = build


_REAL_SLEEP = time.sleep


def _cadence_sleep(n):
    """Keep write cadence near --watch seconds: sleep the remainder after the pass, not a full watch on top."""
    started = getattr(ff, "_live_pass_t0", None)
    elapsed = (time.time() - started) if started else 0
    _REAL_SLEEP(max(5.0, float(n) - elapsed))


ff.time.sleep = _cadence_sleep   # fetch_feed.main uses time.sleep(args.watch); ff.time is the time module



LIVE_ROOT = Path("/srv/live-mesh-live")      # pinned releases (release.sh); the only code allowed to write live
LIVE_OUT = Path("/srv/live-mesh-run/feed/live-events.json")


def guard_out(out):
    """Dev/test runs (repo checkout) must never touch the live feed: they write e.g. dev-events.json elsewhere."""
    code = Path(__file__).resolve()
    if Path(out).resolve() == LIVE_OUT and LIVE_ROOT.resolve() not in code.parents:
        raise SystemExit(f"refusing to write the live feed from a dev checkout ({code.parent}); use release.sh")


def write(feed, out):
    """live-events.json (atomic) + append-only live-events.jsonl of new or CHANGED events (content hash).
    Runs under an flock: during a release the old and new feed overlap and share these files."""
    guard_out(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out.parent / "write.lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        n = _write(feed, out)
    mark = os.environ.get("LIVE_WRITE_MARK")   # release.sh waits for this (new release has written once)
    if mark:
        Path(mark).write_text(f"{time.time():.0f}\n")
    return n


def _write(feed, out):
    stream = out.with_suffix(".jsonl")
    seen_path = out.parent / "jsonl-seen.json"
    seen = set(json.loads(seen_path.read_text())) if seen_path.exists() else set()
    def h(e):
        return hashlib.sha1(json.dumps(e, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
    new = [(e, h(e)) for e in feed["events"]]
    new = [(e, k) for e, k in new if k not in seen]
    tmp = out.with_suffix(f".json.tmp.{os.getpid()}")
    tmp.write_text(json.dumps(feed, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(tmp, out)
    if MODE == "github":                # Railway collector: the server reads this file; no append-only archive
        return len(new)
    if new:
        with stream.open("a") as f:
            for e, k in new:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
                seen.add(k)
        tmp = seen_path.with_suffix(f".tmp.{os.getpid()}"); tmp.write_text(json.dumps(sorted(seen))); os.replace(tmp, seen_path)
    return len(new)


ff.write = write

if __name__ == "__main__":
    sys.argv[0] = "fetch_feed.py"
    sys.exit(ff.main())
