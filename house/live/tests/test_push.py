"""push_to_host.sh: pushes right after each feed write (mtime watch), skips unchanged, keepalive, backoff,
and sends DELTAS after the first acknowledged push (full resync on a server restart). Runs the real script
against a fake /ingest and against the real app/server.mjs; local only, throwaway secrets."""
import gzip, http.server, json, os, secrets, socket, subprocess, tempfile, threading, time, unittest, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "feed" / "push_to_host.sh"


def feed(n, ids=None, gen="g"):
    ids = ids if ids is not None else [f"e{i}" for i in range(3)]
    return {"n": n, "generated_at": gen, "events": [{"id": i, "t_ct": "2026-10-09T08:00:00-05:00", "kind": "commit"} for i in ids]}


class Ingest(http.server.BaseHTTPRequestHandler):
    hits, status, seq = [], 200, 0
    def do_POST(self):
        body = json.loads(gzip.decompress(self.rfile.read(int(self.headers["Content-Length"]))))
        Ingest.hits.append((time.time(), self.path, body, self.headers.get("Authorization")))
        code, out = Ingest.status, {"ok": True}
        if code == 200:
            if self.path == "/ingest/delta" and body["base"] != f"E.{Ingest.seq}":
                code, out = 409, {"error": "cursor mismatch"}
            else:
                Ingest.seq += 1; out["cursor"] = f"E.{Ingest.seq}"
        self.send_response(code); self.end_headers(); self.wfile.write(json.dumps(out).encode())
    def log_message(self, *a): pass


class Base(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        self.feed = self.d / "f.json"
        self.env = dict(os.environ, MESH_RUN=str(self.d), PUSH_ENV=str(self.d / "env"), PUSH_LOG=str(self.d / "push.log"),
                        PUSH_STATE=str(self.d / "acked.json"), FEED=str(self.feed), CHECK="1", RETRY="2", INTERVAL="300")

    def write(self, f):   # atomic replace, like live_mesh.write
        tmp = self.d / f"f.json.{os.getpid()}"; tmp.write_text(json.dumps(f)); os.replace(tmp, self.feed)

    def run_pusher(self, seconds, during=None, **env):
        p = subprocess.Popen(["bash", str(SCRIPT)], env=dict(self.env, **env))
        try:
            if during: during()
            time.sleep(seconds)
        finally:
            p.terminate(); p.wait(5)
        return p


class PushOnWriteTest(Base):
    def setUp(self):
        super().setUp()
        Ingest.hits, Ingest.status, Ingest.seq = [], 200, 0
        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Ingest)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        (self.d / "env").write_text(f"MESH_URL=http://127.0.0.1:{self.srv.server_port}\nINGEST_SECRET=t3st\n")
        self.write(feed(0))

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close()

    def test_push_on_change_only_then_delta(self):
        marks = {}
        def during():
            time.sleep(3.5)                       # unchanged for 3.5 s: exactly one push (the initial full one)
            marks["before"] = len(Ingest.hits)
            marks["w"] = time.time(); self.write(feed(1, ["e0", "e1", "e2", "e3"]))
        self.run_pusher(3.5, during)
        self.assertEqual(marks["before"], 1)
        self.assertEqual([h[1] for h in Ingest.hits], ["/ingest", "/ingest/delta"])
        full, delta = Ingest.hits[0][2], Ingest.hits[1][2]
        self.assertEqual(len(full["events"]), 3)
        self.assertEqual(delta["base"], "E.1")
        self.assertEqual([e["id"] for e in delta["upsert"]], ["e3"])   # only the new event
        self.assertEqual(delta["remove"], [])
        self.assertEqual(delta["header"], {"n": 1, "generated_at": "g"})
        self.assertLess(Ingest.hits[1][0] - marks["w"], 2.5)            # pushed within ~CHECK of the write
        self.assertEqual(Ingest.hits[0][3], "Bearer t3st")
        log = (self.d / "push.log").read_text()
        self.assertNotIn("t3st", log)
        self.assertEqual(log.count("push 200"), 2)
        self.assertIn("mode=delta:1:0", log)
        st = json.loads((self.d / "acked.json").read_text())
        self.assertEqual(st["cursor"], "E.2"); self.assertEqual(sorted(st["hashes"]), ["e0", "e1", "e2", "e3"])

    def test_cursor_mismatch_resyncs_in_full_same_tick(self):
        (self.d / "acked.json").write_text(json.dumps({"cursor": "OLD.7", "hashes": {"e0": "x"}}))
        self.run_pusher(1.5)
        self.assertEqual([h[1] for h in Ingest.hits], ["/ingest/delta", "/ingest"])
        self.assertEqual(json.loads((self.d / "acked.json").read_text())["cursor"], "E.1")

    def test_keepalive_when_unchanged(self):
        self.run_pusher(3.5, INTERVAL="2")
        self.assertGreaterEqual(len(Ingest.hits), 2)
        self.assertEqual(Ingest.hits[1][1], "/ingest/delta")
        self.assertEqual(Ingest.hits[1][2]["upsert"], [])

    def test_failure_backs_off_and_lock_is_released(self):
        Ingest.status = 503
        self.run_pusher(3.0)                    # RETRY=2: about 2 tries, not one per CHECK
        self.assertLessEqual(len(Ingest.hits), 2)
        self.assertFalse((self.d / "acked.json").exists())
        time.sleep(0.3)                         # TERMed pusher's sleep must not keep the lock
        rc = subprocess.run(["flock", "-n", str(self.d / "push.log.lock"), "true"]).returncode
        self.assertEqual(rc, 0)


class FakeGitHub(http.server.BaseHTTPRequestHandler):
    """api.github.com stand-in for /activity auth: Builder's builder-app installation token on org example-org."""
    token = ""
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        ok = self.headers.get("Authorization") == f"Bearer {self.token}"
        self._send(200 if ok else 401, {"data": {"viewer": {"login": "builder-app[bot]", "databaseId": 100000002}}} if ok else {})
    def do_GET(self):
        ok = self.headers.get("Authorization") == f"Bearer {self.token}"
        self._send(200 if ok else 401, {"repositories": [{"full_name": "example-org/r", "owner": {"login": "example-org"}}]} if ok else {})


class RealServerTest(Base):
    """pusher -> real server.mjs -> since-poll, including a server restart (cold start -> 409 -> full)."""
    def start(self):
        self.srv = subprocess.Popen(["node", str(ROOT / "app" / "server.mjs")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    env={"PATH": os.environ["PATH"], "PORT": str(self.port), "MESH_PASSWORD": self.pw,
                                         "SESSION_SECRET": secrets.token_hex(32), "INGEST_SECRET": self.secret,
                                         "GITHUB_API_URL": f"http://127.0.0.1:{self.gh.server_address[1]}",
                                         "COLLECTOR": "off", "MESH_DATA_DIR": str(self.d / "data")})
        for _ in range(50):
            try: urllib.request.urlopen(f"{self.base}/healthz", timeout=1); break
            except OSError: time.sleep(0.1)
        req = urllib.request.Request(f"{self.base}/login", data=f"password={self.pw}".encode(), method="POST")
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a): return None
        try: urllib.request.build_opener(NoRedirect).open(req)
        except urllib.error.HTTPError as e: self.cookie = e.headers["Set-Cookie"].split(";")[0]

    def get(self, q=""):
        req = urllib.request.Request(f"{self.base}/live-events.json{q}", headers={"Cookie": self.cookie})
        try:
            with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e: return e.code, None

    def setUp(self):
        super().setUp()
        s = socket.socket(); s.bind(("127.0.0.1", 0)); self.port = s.getsockname()[1]; s.close()
        self.base, self.pw, self.secret = f"http://127.0.0.1:{self.port}", secrets.token_hex(8), secrets.token_hex(32)
        self.akey = "ghs_" + secrets.token_hex(20)        # Builder's installation token (fake GitHub verifies it)
        FakeGitHub.token = self.akey
        self.gh = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeGitHub)
        threading.Thread(target=self.gh.serve_forever, daemon=True).start()
        (self.d / "env").write_text(f"MESH_URL={self.base}\nINGEST_SECRET={self.secret}\n")
        self.start()

    def tearDown(self):
        self.srv.kill(); self.srv.wait(); self.gh.shutdown(); self.gh.server_close()

    def test_delta_end_to_end_and_restart(self):
        self.write(feed(0, ["a", "b", "c"], gen="g0"))
        self.run_pusher(1.2, ONCE="1")
        st, full = self.get(); c0 = full["cursor"]
        self.assertEqual(sorted(e["id"] for e in full["events"]), ["a", "b", "c"])
        self.write({**feed(1, ["a", "c", "d"], gen="g1"), "events": [{"id": i, "t_ct": "2026-10-09T08:00:00-05:00", "kind": "commit",
                    **({"status": "x"} if i == "c" else {})} for i in ["a", "c", "d"]]})
        self.run_pusher(1.2, ONCE="1")
        log = (self.d / "push.log").read_text()
        self.assertIn("mode=delta:2:1", log)                      # c changed + d new, b removed
        st, d = self.get(f"?since={c0}")
        self.assertEqual(st, 200); self.assertTrue(d["delta"]); self.assertEqual(d["generated_at"], "g1")
        self.assertEqual(sorted(e["id"] for e in d["events"]), ["c", "d"]); self.assertEqual(d["removed"], ["b"])
        self.assertEqual(self.get(f"?since={d['cursor']}")[0], 304)
        # server restart (redeploy / cold start): the pusher's delta is refused (409) and it resyncs in full
        self.srv.kill(); self.srv.wait(); self.start()
        self.assertEqual(self.get(f"?since={d['cursor']}")[1].get("reset"), True)   # page cursor is stale too
        self.run_pusher(1.5, ONCE="1")
        log = (self.d / "push.log").read_text().splitlines()
        self.assertIn(" 409 mode=delta", log[-2])
        self.assertIn(" 200 mode=full", log[-1])
        self.assertEqual(sorted(e["id"] for e in self.get()[1]["events"]), ["a", "c", "d"])
        self.assertNotIn(self.secret, "\n".join(log))

    def test_activity_post_is_pulled_into_the_box_jsonl_once(self):
        from datetime import datetime, timezone
        self.write(feed(0))
        body = json.dumps({"t_ct": datetime.now(timezone.utc).isoformat(timespec="seconds"), "kind": "turn",
                           "action": "start", "tag": "pr-202"}).encode()
        req = urllib.request.Request(f"{self.base}/activity", data=body, method="POST",
                                     headers={"Authorization": f"Bearer {self.akey}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r: self.assertEqual(r.status, 202)
        self.run_pusher(1.5, ONCE="1")
        self.run_pusher(1.5, ONCE="1")                               # second pull: nothing new, no duplicate
        out = (self.d / "fleet" / "remote-activity.jsonl").read_text().splitlines()
        self.assertEqual(len(out), 1)
        line = json.loads(out[0])
        self.assertEqual(sorted(line), ["action", "kind", "seat", "t_ct", "tag"]); self.assertEqual(line["seat"], "Builder")
        log = (self.d / "push.log").read_text()
        self.assertIn("activity pulled 1", log)
        for secret in (self.akey, self.secret): self.assertNotIn(secret, log + out[0])


if __name__ == "__main__":
    unittest.main()
