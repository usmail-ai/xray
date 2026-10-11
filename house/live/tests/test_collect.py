"""Unit tests for the Example adapter (stdlib, no network). Run: python3 -m unittest -v tests/test_collect.py"""
import json, os, sys, tempfile, threading, time, unittest, http.server
from pathlib import Path
HERE = Path(__file__).resolve().parent
FEED_DIR = Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))
sys.path.insert(0, str(FEED_DIR))
sys.dont_write_bytecode = True
import live_collect as uc  # noqa: E402


class Verdicts(unittest.TestCase):
    def m(self, body):
        x = uc.CRITIC_RE.match(body)
        return x.groups() if x else None

    def test_prefixes(self):
        self.assertEqual(self.m("**Reviewer: PASS: ready for lab test** @ af8c8d0"), ("PASS", None))
        self.assertEqual(self.m("**Reviewer: FAIL (P0/P1)** @ b599aab"), ("FAIL", None))
        self.assertEqual(self.m("**Reviewer: HOLD** @ 1234567"), ("HOLD", None))
        self.assertEqual(self.m("**Reviewer re-check: PASS, ready** @ d07d2c2"), (None, "PASS"))
        self.assertEqual(self.m("**Reviewer re-check:** pending @ abcdef1"), (None, None))

    def test_not_verdicts(self):
        for b in ("Reviewer: PASS", "**Reviewer: PASSED**", "Light PASS", "> **Reviewer: PASS**"):
            self.assertIsNone(self.m(b), b)

    def test_sha(self):
        self.assertEqual(uc.SHA_RE.search("**Reviewer: PASS** @ `af8c8d0`").group(1), "af8c8d0")


class Branding(unittest.TestCase):
    def test_relabel_keeps_repo_ids(self):
        self.assertEqual(uc.brand("Acme checkout fix in app"), "Example checkout fix in app")
        self.assertEqual(uc.brand("acmeco  docs\nline"), "Example docs line")
        self.assertEqual(uc.brand("mcp health"), "mcp health")
        self.assertEqual(uc.brand("chore: also ignore Acme_sdk.zip"), "chore: also ignore Example_sdk.zip")
        self.assertEqual(uc.brand("Fix DirectAcmeClient"), "Fix DirectExampleClient")
        self.assertEqual(uc.brand("acme-org/app#12"), "acme-org/app#12")
        at = "info" + chr(64) + "example.com"   # built from parts so the repo holds no address
        self.assertEqual(uc.brand(f"fix(support): wire {at} as SSOT"), "fix(support): wire [email] as SSOT")
        self.assertEqual(uc.brand("bump pkg@1.2.3 and @types/node"), "bump pkg@1.2.3 and @types/node")


class Logins(unittest.TestCase):
    def test_graphql_bot_suffix(self):
        self.assertEqual(uc.gql_login({"login": "railway-app", "__typename": "Bot"}), "railway-app[bot]")
        self.assertEqual(uc.gql_login({"login": "lead-alt", "__typename": "User"}), "lead-alt")
        for login in ("lead-alt", "LEAD-ALT", "lead-login", "Lead-Login"):   # Lead's logins -> Lead node
            self.assertEqual(uc.node(login), "Lead")
        self.assertEqual((uc.node("builder-app[bot]"), uc.node("someone"), uc.node(None)), ("Builder", "Others", "GitHub"))
        for login in ("cursoragent", "CursorAgent", "cursor-agent", "cursoragent[bot]"):    # Cursor cloud agents
            self.assertEqual(uc.node(login), "CloudAgents")
        self.assertEqual((uc.node("cursor[bot]"), uc.node("railway-app[bot]")), ("Others", "Others"))   # Bugbot, Railway app
        self.assertIsNone(uc.gql_login(None))

    def test_commit_login(self):
        self.assertEqual(uc.commit_login({"author": {"name": "builder-app[bot]", "user": None}}), "builder-app[bot]")
        self.assertEqual(uc.commit_login({"author": {"name": "H T", "user": {"login": "lead-login"}}}), "lead-login")
        self.assertIsNone(uc.commit_login({"author": {"name": "Someone", "user": None}}))

    def test_nodes(self):
        self.assertEqual(uc.node("builder-app[bot]"), "Builder")
        self.assertEqual(uc.node("reviewer-app"), "Reviewer")
        self.assertEqual(uc.node("some-new-app[bot]"), "Others")   # not filtered out


class _H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"status":"ok","provider":"SECRET-PROVIDER","model":"SECRET-MODEL"}'
        self.send_response(int(self.path.strip("/") or 200)); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass


class Health(unittest.TestCase):
    def test_status_only_never_reads_body(self):
        import live_mesh as um
        srv = http.server.HTTPServer(("127.0.0.1", 0), _H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            port = srv.server_address[1]
            self.assertEqual(um._status_only(f"http://127.0.0.1:{port}/200"), 200)
            self.assertEqual(um._status_only(f"http://127.0.0.1:{port}/503"), 503)
            with tempfile.TemporaryDirectory() as d:
                um.HEALTH_URLS[:] = [f"http://127.0.0.1:{port}/200"]
                args = type("A", (), {"health_every": 0})()
                ev = um.health_events(args, Path(d) / "h.json")
                ev2 = um.health_events(args, Path(d) / "h.json")   # unchanged code -> no new event
                self.assertEqual(len(ev), 1); self.assertEqual(len(ev2), 1)
                blob = json.dumps(ev) + (Path(d) / "h.json").read_text()
                self.assertNotIn("SECRET", blob); self.assertNotIn("provider", blob)
                self.assertEqual(ev[0]["http_status"], 200)
        finally:
            srv.shutdown()


class Stream(unittest.TestCase):
    def test_jsonl_appends_only_new_or_changed(self):
        import live_mesh as um
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "live-events.json"
            e = {"id": "a", "t_ct": "2026-10-08T10:00:00-05:00", "kind": "workflow_run", "status": "in_progress"}
            self.assertEqual(um.write({"events": [e]}, out), 1)
            self.assertEqual(um.write({"events": [e]}, out), 0)          # same content -> no duplicate
            self.assertEqual(um.write({"events": [dict(e, status="completed")]}, out), 1)   # changed -> appended
            self.assertEqual(len(out.with_suffix(".jsonl").read_text().splitlines()), 2)


if __name__ == "__main__":
    unittest.main()


class LiveGuardTest(unittest.TestCase):
    def test_dev_refuses_live_out(self):
        import live_mesh
        with self.assertRaises(SystemExit):
            live_mesh.guard_out("/srv/live-mesh-run/feed/live-events.json")


class IncrementalCITest(unittest.TestCase):
    def test_stale_ci_marked_done_without_fetch(self):
        import live_collect as uc
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        class FF:
            CT = ZoneInfo('America/Chicago')
            @staticmethod
            def log(*a, **k): pass
        with tempfile.TemporaryDirectory() as d:
            col = uc.RepoCollector('example-org/x', Path(d), FF, FF.log)
            old = datetime.fromtimestamp(time.time() - 3 * 3600, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            sha = 'ab' * 20
            col.st['ci'][sha] = {'date': old, 'done': False, 'last': 0}
            calls = []
            col.ci_rest = lambda c, s: calls.append(s)
            col.refresh_ci(object(), time.time() + 30, limit=6)
            self.assertTrue(col.st['ci'][sha]['done'])
            self.assertEqual(calls, [])   # stale closed locally; no REST


class AuthExpiryTest(unittest.TestCase):
    """Paused box -> token past its 1 h life -> 401s. The feed must exit (re-mint), never write a stale feed."""
    def _http_error(self, code):
        import urllib.error, io
        return urllib.error.HTTPError("https://api.github.com/x", code, "x", {}, io.BytesIO(b""))

    def test_rest_401_raises_auth_expired(self):
        import live_collect as uc
        from unittest import mock
        c = uc.Client("t")
        with mock.patch("urllib.request.urlopen", side_effect=self._http_error(401)):
            with self.assertRaises(uc.AuthExpired):
                c.rest("/repos/a/b/pulls")
        self.assertFalse(issubclass(uc.AuthExpired, OSError))   # per-step handlers must not swallow it

    def test_gql_401_raises_auth_expired(self):
        import live_collect as uc
        from unittest import mock
        with mock.patch("urllib.request.urlopen", side_effect=self._http_error(401)):
            with self.assertRaises(uc.AuthExpired):
                uc.Client("t").gql("query{x}", {})

    def test_collector_run_propagates_auth_expired(self):
        import live_collect as uc
        from unittest import mock
        from zoneinfo import ZoneInfo
        class FF:
            CT = ZoneInfo("America/Chicago")
            @staticmethod
            def log(*a, **k): pass
        with tempfile.TemporaryDirectory() as d:
            col = uc.RepoCollector("example-org/x", Path(d), FF, FF.log)
            with mock.patch("urllib.request.urlopen", side_effect=self._http_error(401)):
                with self.assertRaises(uc.AuthExpired):
                    col.run(uc.Client("t"), time.time() + 5)

    def test_token_age_guard_uses_wall_clock(self):
        import live_mesh
        from unittest import mock
        with mock.patch.dict(os.environ, {"LIVE_TOKEN_MINTED": str(int(time.time()) - 51 * 60)}):
            with self.assertRaises(SystemExit) as cm:
                live_mesh.token_check()
            self.assertEqual(cm.exception.code, live_mesh.EXIT_REMINT)
        with mock.patch.dict(os.environ, {"LIVE_TOKEN_MINTED": str(int(time.time()) - 60)}):
            live_mesh.token_check()   # fresh: no exit
