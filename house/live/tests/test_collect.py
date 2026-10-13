"""Unit tests for the Example adapter (stdlib, no network). Run: python3 -m unittest -v tests/test_collect.py"""
import json, os, subprocess, sys, tempfile, threading, time, unittest, http.server
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



class BackfillMissingBranch(unittest.TestCase):
    """A repo without `develop` (GraphQL ref: null) must not pause backfill forever."""
    def test_missing_branch_completes(self):
        class FF: CT = None
        class C:
            def gql(self, q, v):
                if "ref" in v:
                    if v["ref"] == "refs/heads/develop":
                        return {"repository": {"ref": None}}
                    return {"repository": {"ref": {"target": {"history": {
                        "totalCount": 0, "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": []}}}}}
                return {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": False, "endCursor": None},
                                                        "nodes": []}}}
        with tempfile.TemporaryDirectory() as d:
            rc = uc.RepoCollector("acme-org/app", Path(d), FF(), lambda m: None)
            self.assertTrue(rc.backfill(C(), time.time() + 30))

    def test_repo_not_visible_raises_clearly(self):
        class FF: CT = None
        class C:
            def gql(self, q, v):
                return {"repository": None}
        with tempfile.TemporaryDirectory() as d:
            rc = uc.RepoCollector("acme-org/app", Path(d), FF(), lambda m: None)
            with self.assertRaisesRegex(RuntimeError, "404"):
                rc.backfill(C(), time.time() + 30)


class NodeMapEnv(unittest.TestCase):
    """LIVE_NODE_MAP maps a fleet's logins to its own seats without editing the kit."""
    def test_env_map_applies(self):
        import importlib, subprocess
        code = ("import sys; sys.path.insert(0, %r); import live_collect as c; "
                "print(c.node('Forge0x1[bot]'), c.node('builder-app[bot]'), c.node('stranger'))") % str(FEED_DIR)
        env = dict(os.environ, LIVE_NODE_MAP='{"forge0x1[bot]": "forge"}')
        out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True).stdout.split()
        self.assertEqual(out, ["forge", "Builder", "Others"])

    def test_bad_map_ignored(self):
        import subprocess
        code = "import sys; sys.path.insert(0, %r); import live_collect as c; print(c.node('forge0x1[bot]'))" % str(FEED_DIR)
        env = dict(os.environ, LIVE_NODE_MAP='{not json')
        out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, "Others")


def _sub(code, **env):
    import subprocess
    e = dict(os.environ); e.pop("LIVE_SHOW_UNMAPPED", None); e.pop("LIVE_NODE_MAP", None); e.update(env)
    pre = "import sys, json, tempfile; from pathlib import Path; sys.path.insert(0, %r); import live_collect as c\nclass FF: CT = None\n" % str(FEED_DIR)
    return subprocess.run([sys.executable, "-c", pre + code], env=e, capture_output=True, text=True, check=True).stdout.strip()


class FleetOnly(unittest.TestCase):
    """Logins outside the node map never reach the feed (login + title leak) unless LIVE_SHOW_UNMAPPED=1."""
    PUT = ("rc = c.RepoCollector('acme-org/app', Path(tempfile.mkdtemp()), FF(), lambda m: None)\n"
           "rc.commit_event('a'*40, '2026-10-12T10:00:00-05:00', 'secret title', 'stranger', 'main')\n"
           "rc.commit_event('b'*40, '2026-10-12T10:00:00-05:00', 'ok', 'builder-app[bot]', 'main')\n"
           "print(sorted(e['from'] for e in rc.ev.values()))")

    def test_unmapped_dropped_by_default(self):
        self.assertEqual(_sub(self.PUT), "['Builder']")

    def test_opt_in_shows_others(self):
        self.assertEqual(_sub(self.PUT, LIVE_SHOW_UNMAPPED="1"), "['Builder', 'Others']")

    def test_stored_unmapped_dropped_on_load(self):
        code = ("d = Path(tempfile.mkdtemp()); (d / 'app.json').write_text(json.dumps({'events': {"
                "'x': {'id': 'x', 'from': 'Others', 'to': 'GitHub', 'actor': 'stranger'},"
                "'y': {'id': 'y', 'from': 'Builder', 'to': 'GitHub'}}}))\n"
                "rc = c.RepoCollector('acme-org/app', d, FF(), lambda m: None); print(sorted(rc.ev))")
        self.assertEqual(_sub(code), "['y']")

    def test_fleet_only_covers_hops_and_upstream(self):
        code = ("ev = [{'from': 'Builder', 'to': 'GitHub', 'hops': ['Builder', 'Others', 'GitHub'], 'src_file': 'github-api'},"
                " {'from': 'Upstream', 'to': 'GitHub', 'external': 'upstream', 'actor': 'stranger'},"
                " {'from': 'Upstream', 'to': 'GitHub', 'external': 'upstream', 'kind': 'merged'},"
                " {'from': 'Builder', 'to': 'GitHub'},"
                " {'from': 'Others', 'to': 'GitHub', 'kind': 'lab_bug', 'src_file': 'lab'},"
                " {'from': 'Builder', 'to': 'Others', 'kind': 'prompt_message'}]\n"
                "print(len(c.fleet_only(ev)))")
        self.assertEqual(_sub(code), "4")
        self.assertEqual(_sub(code, LIVE_SHOW_UNMAPPED="1"), "6")

    def test_non_string_map_values_ignored(self):
        code = "print(c.node('x[bot]'), c.node('y[bot]'))"
        self.assertEqual(_sub(code, LIVE_NODE_MAP='{"x[bot]": null, "y[bot]": 5}').split(), ["Others", "Others"])

    def test_feed_pass_filters_before_board(self):
        src = (FEED_DIR / "live_mesh.py").read_text()
        self.assertLess(src.index("uc.fleet_only(uniq)"), src.index("live_board.run(uniq"))


class DeployKit(unittest.TestCase):
    APP = HERE.parent / "app"

    def test_deploy_ships_every_server_import(self):
        imports = set(__import__("re").findall(r"from '\./([\w.-]+\.mjs)'", (self.APP / "server.mjs").read_text()))
        self.assertTrue(imports)
        dep, dock = (self.APP / "deploy.sh").read_text(), (self.APP / "Dockerfile").read_text()
        for f in imports:
            self.assertIn(f, dep); self.assertIn(f, dock)
        for f in __import__("re").findall(r'"\$APP"/([\w.-]+)', dep):
            self.assertTrue((self.APP / f).exists(), f"deploy.sh copies missing {f}")

    def test_server_passes_fleet_env_to_collector(self):
        src = (self.APP / "server.mjs").read_text()
        for k in ("LIVE_NODE_MAP", "LIVE_BRAND", "LIVE_BRAND_RE", "LIVE_SHOW_UNMAPPED"):
            self.assertIn(f"'{k}'", src)


class BoardCacheFleetOnly(unittest.TestCase):
    """The board's inbox event cache never expires; old unmapped entries must not become cards."""
    CODE = ("import os; d = Path(tempfile.mkdtemp()); f = d / 'inbox-events.json'\n"
            "f.write_text(json.dumps({'events': {"
            "'a': {'id': 'a', 'repo': 'acme-org/app', 'number': 1, 'kind': 'pr_open', 'from': 'Others', 'to': 'GitHub',"
            " 'title': 'SECRET stranger PR', 't_ct': '2026-10-12T10:00:00-05:00', 'actor': 'stranger'},"
            "'b': {'id': 'b', 'repo': 'acme-org/app', 'number': 2, 'kind': 'pr_open', 'from': 'Builder', 'to': 'GitHub',"
            " 'title': 'fleet PR', 't_ct': '2026-10-12T10:00:00-05:00'}}}))\n"
            "os.environ['INBOX_CACHE'] = str(f)\n"
            "import live_board\n"
            "print(json.dumps([e.get('title') for e in live_board._events([])]))")

    def test_cache_unmapped_hidden(self):
        out = _sub(self.CODE)
        self.assertNotIn("SECRET", out)
        self.assertIn("fleet PR", out)

    def test_cache_opt_in_shows(self):
        self.assertIn("SECRET", _sub(self.CODE, LIVE_SHOW_UNMAPPED="1"))


class HostModeBoard(unittest.TestCase):
    """Host-only installs (LIVE_MODE=github, no box pass) still get a board from the GitHub events they collect."""
    def test_server_prefers_box_board(self):
        src = (HERE.parent / "app" / "server.mjs").read_text()
        self.assertIn("BOARD_BOX_STALE_MS", src)
        self.assertNotIn("fresh(g) > fresh(b)", src)

    def test_board_from_github_events(self):
        code = ("import os; os.environ['INBOX_CACHE'] = str(Path(tempfile.mkdtemp()) / 'none.json')\n"
                "import live_board\n"
                "ev = [{'id': 'acme-org/app#5:open', 'repo': 'acme-org/app', 'number': 5, 'kind': 'pr_open', 'from': 'Builder',"
                " 'to': 'GitHub', 'title': 'fleet PR five', 'source': 'https://github.com/acme-org/app/pull/5',"
                " 't_ct': '2026-10-12T10:00:00-05:00', 'pr_state': 'open'}]\n"
                "m = live_board.run(ev, write=False)\n"
                "print(json.dumps([c['title'] for c in m['cards']]))")
        self.assertIn("fleet PR five", _sub(code))


class GithubSourcedWidened(unittest.TestCase):
    def test_author_only_and_github_star_sources_filtered(self):
        code = ("ev = [{'from': 'Others', 'to': 'GitHub', 'author': 'stranger'},"
                " {'from': 'GitHub', 'to': 'Others', 'src_file': 'github-deployments'},"
                " {'from': 'Others', 'to': 'Builder', 'src_file': 'fleet/prompts'}]\n"
                "print(len(c.fleet_only(ev)))")
        self.assertEqual(_sub(code), "1")


class AbsentBranchCommits(unittest.TestCase):
    def test_poll_commits_404_marks_absent_and_skips(self):
        code = ("import urllib.error\n"
                "rc = c.RepoCollector('acme-org/app', Path(tempfile.mkdtemp()), FF(), lambda m: None)\n"
                "calls = []\n"
                "def paged(cl, path, params, key, stop=None, **k):\n"
                "    calls.append(params['sha'])\n"
                "    if params['sha'] == 'develop': raise urllib.error.HTTPError('u', 404, 'Not Found', {}, None)\n"
                "    return iter(())\n"
                "rc.paged = paged; rc._etag_new = None\n"
                "rc.poll_commits(None); rc.poll_commits(None)\n"
                "print(json.dumps(calls))")
        self.assertEqual(json.loads(_sub(code)), ["develop", "main", "main"])

if __name__ == "__main__":
    unittest.main()


class LiveGuardTest(unittest.TestCase):
    def test_dev_refuses_live_out(self):
        import live_mesh
        with self.assertRaises(SystemExit):
            live_mesh.guard_out("/srv/live/run/feed/live-events.json")


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


class StoredNodeMap(unittest.TestCase):
    """A LIVE_NODE_MAP change relabels events already in the store."""

    def test_stored_actor_follows_current_map(self):
        code = (
            "import json,sys,tempfile; from pathlib import Path; sys.path.insert(0,%r); import live_collect as c\n"
            "d=Path(tempfile.mkdtemp()); (d/'app.json').write_text(json.dumps({'events':{"
            "'x':{'id':'x','from':'Others','to':'GitHub','actor':'my-builder[bot]','src_file':'github-api'},"
            "'y':{'id':'y','from':'Others','to':'GitHub','author':'stranger','src_file':'github-api'},"
            "'z':{'id':'z','from':'GitHub','to':'Example','actor':'my-builder[bot]','src_file':'github-api'},"
            "'w':{'id':'w','from':'Builder','to':'GitHub','author':'my-builder[bot]','src_file':'github-api'}}}))\n"
            "class FF: CT=None\n"
            "rc=c.RepoCollector('acme-org/app', d, FF(), lambda m: None)\n"
            "print(' '.join(sorted(rc.ev)), rc.ev['x']['from'], rc.ev['z']['from'], rc.ev['w']['from'])"
        ) % str(FEED_DIR)
        env = dict(os.environ, LIVE_NODE_MAP='{"my-builder[bot]":"Maker"}')
        out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.split(), ["w", "x", "z", "Maker", "GitHub", "Maker"])


class GithubModeBoard(unittest.TestCase):
    def test_github_mode_builds_board_from_events(self):
        code = (
            "import os,sys,tempfile; from pathlib import Path\n"
            "os.environ['LIVE_MODE']='github'; os.environ['GH_TOKEN']='t'\n"
            "sys.path.insert(0,%r)\n"
            "import live_mesh\n"
            "ev={'id':'1','t_ct':'2026-10-12T10:00:00-05:00','from':'Builder','to':'GitHub','kind':'pr_open',"
            "'direction':'internal','label':'opened','source':'https://github.com/acme-org/app/pull/1',"
            "'src_file':'github-api','repo':'acme-org/app','number':1,'title':'ship','pr_state':'open'}\n"
            "class Col:\n"
            "    def __init__(self):\n"
            "        self.ev={'1':ev}; self.st={'prs':{},'gaps':{}}\n"
            "    def run(self,c,deadline):\n"
            "        return True\n"
            "live_mesh.COLLECTORS['acme-org/app']=Col()\n"
            "live_mesh.uc.open_numbers=lambda *a, **k: {}\n"
            "class A:\n"
            "    repos=['acme-org/app']; health=None; health_every=60; health_state='/tmp/unused-health.json'\n"
            "A.out=str(Path(tempfile.mkdtemp())/'github-events.json')\n"
            "feed=live_mesh.build(A(), None)\n"
            "print(any(c.get('number')==1 for c in (feed.get('board') or {}).get('cards') or []))\n"
        ) % str(FEED_DIR)
        out = subprocess.run([sys.executable, "-c", code], env=dict(os.environ), capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "True")
