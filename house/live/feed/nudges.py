"""Live board nudges (the server holds them; see app/server.mjs evalNudges).

  nudges.py pull      -> new nudges since the last pull, as a JSON list on stdout:
                         [{"id", "card", "seat", "level", "url", "title", "age_min"}]   (age = minutes since the
                         card's last beat). For the Operator routine, which delivers them as direct bot messages.
  nudges.py comment   -> Builder's open nudges: one GitHub comment on the card via ops-app, at most once per card
                         per level. Run by the pusher each inbox cycle; prints how many it posted.
Auth: the Operator seat key ($SEAT_KEYS_DIR/operator.key, never printed). Server: $MESH_URL or MESH_URL in .push-env.
Each command keeps its own cursor ($MESH_RUN/feed/nudges-<cmd>.json); a failed call leaves the cursor alone."""
import json, os, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

RUN = Path(os.environ.get("MESH_RUN", "/srv/live/run"))
KEYS = Path(os.environ.get("SEAT_KEYS_DIR", RUN / "secrets" / "seat-keys"))
BOARD = "https://live.example.com"
GH = os.environ.get("NUDGE_GH", "/srv/bin/op/gh")


def _url():
    u = os.environ.get("MESH_URL")
    if not u:
        try:
            for line in (RUN / ".push-env").read_text().splitlines():
                if line.startswith("MESH_URL="):
                    u = line.split("=", 1)[1].strip().strip("'\"")
        except OSError:
            pass
    return (u or BOARD).rstrip("/")


def _state(name):
    p = RUN / "feed" / f"nudges-{name}.json"
    try:
        return p, json.loads(p.read_text())
    except (OSError, ValueError):
        return p, {}


def _save(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp"); tmp.write_text(json.dumps(d)); os.replace(tmp, p)


def fetch(since):
    key = (KEYS / "operator.key").read_text().strip()
    q = f"?since={urllib.parse.quote(since)}" if since else ""
    req = urllib.request.Request(_url() + "/nudges" + q, headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode()).get("nudges") or []


def parked_cards():
    """Card keys the box's own board model shows as parked ('Parked:' comment etc.): never nudged."""
    try:
        wb = json.loads((RUN / "feed" / "live-events.json").read_text()).get("board") or {}
    except (OSError, ValueError):
        return set()
    return {c.get("key") for c in wb.get("cards") or [] if c.get("state") == "parked"}


def view(n, now=None):
    now = now or time.time()
    return {"id": n["id"], "card": n["card"], "seat": n["seat"], "level": n["level"], "url": n.get("url", ""),
            "title": n.get("title", ""), "age_min": int((now * 1000 - (n.get("beat_t") or 0)) / 60000)}


def cmd_pull():
    p, st = _state("pull")
    allv = fetch(st.get("since"))
    parked = parked_cards()
    new = [n for n in allv if not n.get("closed_at") and n.get("card") not in parked]
    print(json.dumps([view(n) for n in new], ensure_ascii=False))
    if allv:
        st["since"] = allv[-1]["id"]
        _save(p, st)


def comment_body(n):
    return (f"⏰ **Nudge L{n['level']}** (Live board): no beat on this card for "
            f"{60 if n['level'] == 1 else 90}+ min. Next: **Builder**. Live board: {BOARD}")


def cmd_comment(post=None):
    p, st = _state("comment")
    done = set(st.get("done") or [])
    got = fetch(st.get("since"))
    posted, parked = 0, parked_cards()
    for n in got:
        k = f"{n['card']}:L{n['level']}"
        if n.get("seat") != "builder" or n.get("closed_at") or n.get("card") in parked or k in done or not n.get("repo") or not n.get("number"):
            continue
        ok = (post or _gh_comment)(n["repo"], int(n["number"]), comment_body(n))
        if ok:
            done.add(k); posted += 1
    if got:
        st["since"] = got[-1]["id"]
    st["done"] = sorted(done)[-5000:]
    _save(p, st)
    print(posted)


def _gh_comment(repo, number, body):
    env = dict(os.environ, PATH="/srv/bin/op:" + os.environ.get("PATH", ""))
    r = subprocess.run([GH, "api", f"repos/{repo}/issues/{number}/comments", "-f", f"body={body}", "--silent"],
                       env=env, capture_output=True, text=True, timeout=60)
    if r.returncode:
        print(f"[nudges] comment {repo}#{number} failed: {r.stderr.strip()[:200]}", file=sys.stderr)
    return r.returncode == 0


if __name__ == "__main__":
    {"pull": cmd_pull, "comment": cmd_comment}[(sys.argv[1:] or ["pull"])[0]]()
