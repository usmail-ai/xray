# ---- Live board (Builder-cloud, the cloud Builder seat) ---------------------------------------------------------------
# Source into bash/zsh. No secrets in this file: the seat key comes from $LIVE_KEY (env / bot secret), is sent only
# in the Authorization header, and is never printed.
#   live_act start|end turn|subagent|watcher <tag>   -> POST /activity (202 = recorded), seat Builder-cloud
#   live_inbox                                       -> GET /inbox/builder-cloud?since=<cursor>, JSON lines on stdout;
#                                                          cursor kept in ~/.live/builder-cloud.cursor. Gets every
#                                                          Builder line (merge-ready, Reviewer PASS) + nudges to Builder.
#   live_cards                                       -> GET /cards?seat=builder-cloud (Builder's cards), JSON lines
export LIVE_URL="${LIVE_URL:-https://live.example.com}"
_live() {
  python3 - "$@" <<'PY'
import datetime, json, os, re, sys, urllib.error, urllib.parse, urllib.request
key = os.environ.get("LIVE_KEY", "").strip()
if not key:
    sys.exit("live: LIVE_KEY is not set")
url = os.environ.get("LIVE_URL", "https://live.example.com").rstrip("/")
def call(method, path, body=None):
    h = {"Authorization": "Bearer " + key}
    if body is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url + path, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except (urllib.error.URLError, OSError) as e:
        return 0, f"unreachable: {e}"
cmd = sys.argv[1]
if cmd == "act":
    action, kind, tag = (sys.argv[2:5] + ["", "", ""])[:3]
    if kind not in ("turn", "subagent", "watcher") or action not in ("start", "end") or not re.fullmatch(r"[A-Za-z0-9 ._:@#+/-]{1,40}", tag):
        sys.exit("usage: live_act start|end turn|subagent|watcher <tag: 1-40 chars of A-Za-z0-9 ._:@#+/->")
    try:
        from zoneinfo import ZoneInfo
        now = datetime.datetime.now(ZoneInfo("America/Chicago"))
    except Exception:
        now = datetime.datetime.now().astimezone()
    line = json.dumps({"t_ct": now.isoformat(timespec="seconds"), "kind": kind, "action": action, "tag": tag, "seat": "Builder-cloud"})
    code, out = call("POST", "/activity", line.encode())
    print(code, out)
    sys.exit(0 if code == 202 else 1)
if cmd == "inbox":
    cdir = os.path.expanduser("~/.live"); os.makedirs(cdir, exist_ok=True)
    cfile = os.path.join(cdir, "builder-cloud.cursor")
    since = open(cfile).read().strip() if os.path.exists(cfile) else ""
    q = "?since=" + urllib.parse.quote(since) if since else ""
    code, out = call("GET", "/inbox/builder-cloud" + q)
    if code != 200:
        sys.exit(f"live_inbox: HTTP {code} {out}")
    lines = json.loads(out).get("lines") or []
    for l in lines:
        print(json.dumps(l, ensure_ascii=False))
    if lines:
        open(cfile + ".tmp", "w").write(lines[-1]["id"] + "\n"); os.replace(cfile + ".tmp", cfile)
    sys.exit(0)
if cmd == "cards":
    code, out = call("GET", "/cards?seat=builder-cloud")
    if code != 200:
        sys.exit(f"live_cards: HTTP {code} {out}")
    for c in json.loads(out).get("cards") or []:
        print(json.dumps(c, ensure_ascii=False))
    sys.exit(0)
sys.exit("usage: _live act|inbox|cards")
PY
}
live_act()   { _live act "$@"; }
live_inbox() { _live inbox; }
live_cards() { _live cards; }
# check:  live_act start turn live-check && live_act end turn live-check && live_inbox | tail -3 && live_cards | wc -l
# ----------------------------------------------------------------------------------------------------------------
