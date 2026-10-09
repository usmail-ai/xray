"""Tests for fetch_feed.py App-token auth and --watch survival. Stdlib only; network is mocked.
A throwaway RSA key is generated per run (openssl); no real key or token is used.

  cd house/live-mesh && python3 -m unittest -v test_fetch_feed
"""
import http.client
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_feed as ff  # noqa: E402

ENV_TOKEN = "ghp_ENV_FALLBACK_SHOULD_NEVER_BE_USED"
TMP = tempfile.TemporaryDirectory()
KEY = os.path.join(TMP.name, "throwaway.pem")
OUT = os.path.join(TMP.name, "out.json")


def setUpModule():
    subprocess.run(["openssl", "genrsa", "-out", KEY, "2048"], check=True, capture_output=True)


def tearDownModule():
    TMP.cleanup()


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def http_err(url, code):
    return urllib.error.HTTPError(url, code, "x", {}, io.BytesIO(b"{}"))


class Net:
    """Fake urlopen: counts mints, records Authorization on API GETs, replays GET status codes."""

    def __init__(self, get_codes=None):
        self.mints, self.auth, self.get_codes = 0, [], list(get_codes or [])

    def __call__(self, req, timeout=None):
        url = req.full_url
        if url.endswith("/access_tokens"):
            assert req.get_method() == "POST"
            assert req.headers["Authorization"].startswith("Bearer ")
            assert req.headers["Authorization"].count(".") == 2  # JWT
            self.mints += 1
            exp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 3600))
            return Resp(json.dumps({"token": f"ghs_minted_{self.mints}", "expires_at": exp}).encode())
        self.auth.append(req.headers.get("Authorization"))
        code = self.get_codes.pop(0) if self.get_codes else 200
        if code != 200:
            raise http_err(url, code)
        return Resp(b'{"ok": true}')


def app():
    return ff.AppToken("123", "456", KEY)


def quiet():
    return mock.patch("sys.stderr", io.StringIO())


class Jwt(unittest.TestCase):
    def test_jwt_shape_and_claims(self):
        j = app().jwt()
        self.assertEqual(len(j.split(".")), 3)
        body = json.loads(ff.base64.urlsafe_b64decode(j.split(".")[1] + "=="))
        self.assertEqual(body["iss"], "123")
        self.assertLessEqual(body["exp"] - body["iat"], 600)


class Remint55(unittest.TestCase):
    def test_stale_boundaries(self):
        a, now = app(), 1_000_000.0
        self.assertTrue(a.stale(now))  # no token yet
        a.token, a.minted_at, a.expires_at = "t", now - 54 * 60, now + 3600
        self.assertFalse(a.stale(now))
        a.minted_at = now - 55 * 60
        self.assertTrue(a.stale(now))
        a.minted_at, a.expires_at = now - 60, now + 299  # <5 min to expires_at
        self.assertTrue(a.stale(now))

    def test_get_remints_at_55_min(self):
        net = Net()
        with mock.patch("urllib.request.urlopen", net), quiet():
            gh = ff.GitHub(None, app())
            gh.get("/x"); self.assertEqual(net.mints, 1)  # first use mints
            gh.get("/x"); self.assertEqual(net.mints, 1)  # fresh: no mint
            gh.app.minted_at -= 55 * 60
            gh.get("/x"); self.assertEqual(net.mints, 2)
        self.assertEqual(net.auth[-1], "Bearer ghs_minted_2")


class Remint401(unittest.TestCase):
    def test_one_remint_on_401_then_retry_succeeds(self):
        net = Net(get_codes=[200, 401, 200])
        with mock.patch("urllib.request.urlopen", net), quiet():
            gh = ff.GitHub(None, app()); gh.get("/x")
            gh.app.minted_at -= 120
            self.assertEqual(gh.get("/x"), {"ok": True})
        self.assertEqual(net.mints, 2)
        self.assertEqual(net.auth, ["Bearer ghs_minted_1", "Bearer ghs_minted_1", "Bearer ghs_minted_2"])

    def test_persistent_401_mints_once_then_stops(self):
        net = Net(get_codes=[200, 401, 401, 401, 401])
        with mock.patch("urllib.request.urlopen", net), quiet():
            gh = ff.GitHub(None, app()); gh.get("/x")
            gh.app.minted_at -= 120
            with self.assertRaises(ff.AuthExpired):
                gh.get("/x")  # 401 -> mint -> 401 -> loud fail, no write
            for _ in range(2):  # same minute: no further mint
                with self.assertRaises(ff.AuthExpired):
                    gh.get("/x")
        self.assertEqual(net.mints, 2)

    def test_401_on_fresh_token_does_not_mint(self):
        net = Net(get_codes=[401])
        with mock.patch("urllib.request.urlopen", net), quiet():
            with self.assertRaises(ff.AuthExpired):
                ff.GitHub(None, app()).get("/x")
        self.assertEqual(net.mints, 1)  # only the initial mint


class NoFallback(unittest.TestCase):
    def test_partial_app_env_fails_loudly(self):
        with mock.patch.dict(os.environ, {"GITHUB_APP_ID": "1"}, clear=True):
            with self.assertRaises(SystemExit):
                ff.AppToken.from_env()
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(ff.AppToken.from_env())

    def test_env_tokens_ignored_when_mint_fails(self):
        env = {"GITHUB_TOKEN": ENV_TOKEN, "GH_TOKEN": ENV_TOKEN, "GITHUB_APP_ID": "123",
               "GITHUB_APP_INSTALLATION_ID": "456", "GITHUB_APP_PRIVATE_KEY_PATH": "/nonexistent.pem"}
        seen, calls, real_run = {}, [], ff.subprocess.run

        def fake_build(args, gh):
            seen["token"] = gh.token
            gh.get("/x")  # forces a mint with a bad key

        def spy_run(cmd, *a, **k):
            calls.append(cmd[0])
            return real_run(cmd, *a, **k)

        with mock.patch.dict(os.environ, env), mock.patch.object(ff, "build", fake_build), \
                mock.patch.object(ff.subprocess, "run", spy_run), mock.patch("urllib.request.urlopen", Net()), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT]), quiet():
            self.assertEqual(ff.main(), 1)  # MintError -> keep last feed, exit 1 (one pass)
        self.assertIsNone(seen["token"])
        self.assertEqual(set(calls), {"openssl"})  # never gh

    def test_env_token_never_sent_in_app_mode(self):
        env = {"GITHUB_TOKEN": ENV_TOKEN, "GH_TOKEN": ENV_TOKEN, "GITHUB_APP_ID": "123",
               "GITHUB_APP_INSTALLATION_ID": "456", "GITHUB_APP_PRIVATE_KEY_PATH": KEY}
        net = Net()
        with mock.patch.dict(os.environ, env), mock.patch("urllib.request.urlopen", net), \
                mock.patch.object(ff, "build", lambda a, gh: (gh.get("/x"), {"event_count": 0})[1]), \
                mock.patch.object(ff, "write", lambda f, o: 0), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT]), quiet():
            self.assertEqual(ff.main(), 0)
        self.assertTrue(net.auth and all(ENV_TOKEN not in (h or "") for h in net.auth))


class WatchSurvives(unittest.TestCase):
    def run_watch(self, errors):
        """Run main() --watch with build() raising each error in turn, then one ok pass, then stop."""
        seq, hits = list(errors) + ["ok", KeyboardInterrupt], []

        def fake_build(args, gh):
            item = seq.pop(0)
            hits.append(item)
            if item == "ok":
                return {"event_count": 0}
            raise item

        buf = io.StringIO()
        with mock.patch.object(ff, "build", fake_build), mock.patch.object(ff, "write", lambda f, o: 0), \
                mock.patch("time.sleep", lambda s: None), mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT, "--watch", "1"]), \
                mock.patch("sys.stderr", buf):
            with self.assertRaises(KeyboardInterrupt):
                ff.main()
        return hits, buf.getvalue()

    def test_urlerror_and_timeout(self):
        hits, _ = self.run_watch([urllib.error.URLError("dns"), TimeoutError()])
        self.assertEqual(hits[-2:], ["ok", KeyboardInterrupt])

    def test_mint_error(self):
        hits, log = self.run_watch([ff.MintError("access_tokens HTTP 500")])
        self.assertEqual(hits[-2:], ["ok", KeyboardInterrupt])
        self.assertIn("no fallback token", log)

    def test_remote_disconnected_does_not_exit_watch(self):
        """21:04 CT Oct 5: RemoteDisconnected from gh._get <- deploy_events killed --watch."""
        hits, log = self.run_watch([http.client.RemoteDisconnected("Remote end closed connection")])
        self.assertEqual(hits[-2:], ["ok", KeyboardInterrupt])
        self.assertIn("network error (RemoteDisconnected); keeping last feed", log)

    def test_other_dropped_connection_errors(self):
        hits, _ = self.run_watch([http.client.IncompleteRead(b""), ConnectionResetError(), OSError("x")])
        self.assertEqual(hits[-2:], ["ok", KeyboardInterrupt])

    def test_remote_disconnected_from_real_get_path(self):
        """Through GitHub.get (not a mocked build): urlopen raising RemoteDisconnected is survived."""
        n = {"i": 0}

        def flaky(req, timeout=None):
            n["i"] += 1
            if n["i"] == 1:
                raise http.client.RemoteDisconnected("Remote end closed connection")
            return Resp(b"[]")

        def build(args, gh):
            gh.get("/repos/0xRayAI/muse-house/deployments")
            if n["i"] >= 2:
                raise KeyboardInterrupt
            return {"event_count": 0}

        with mock.patch("urllib.request.urlopen", flaky), mock.patch.object(ff, "build", build), \
                mock.patch("time.sleep", lambda s: None), mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT, "--watch", "1"]), quiet():
            with self.assertRaises(KeyboardInterrupt):
                ff.main()
        self.assertEqual(n["i"], 2)  # second poll ran after the dropped connection

    def test_probe_dropped_connection_is_unreachable(self):
        def drop(req, timeout=None):
            raise http.client.RemoteDisconnected("x")
        with mock.patch("urllib.request.urlopen", drop):
            self.assertEqual(ff.probe("https://example.invalid/health"), (False, "unreachable"))

    def test_mint_dropped_connection_is_minterror(self):
        def drop(req, timeout=None):
            raise http.client.IncompleteRead(b"")
        with mock.patch("urllib.request.urlopen", drop):
            with self.assertRaises(ff.MintError):
                app().mint()


class Secrets(unittest.TestCase):
    def test_no_token_or_jwt_in_logs(self):
        buf, net = io.StringIO(), Net(get_codes=[200, 401, 200])
        with mock.patch("sys.stderr", buf), mock.patch("urllib.request.urlopen", net):
            gh = ff.GitHub(None, app()); gh.get("/x"); gh.app.minted_at -= 120; gh.get("/x")
        out = buf.getvalue()
        for s in ("ghs_minted", "Bearer", "BEGIN"):
            self.assertNotIn(s, out)

    def test_bad_key_error_does_not_echo_key_or_stderr(self):
        with self.assertRaises(ff.MintError) as cm:
            ff.AppToken("1", "2", "/nonexistent.pem").jwt()
        self.assertEqual(str(cm.exception), "JWT sign failed (CalledProcessError)")
        self.assertIsNone(cm.exception.__cause__)

    def test_no_gh_cli_or_personal_credentials_in_source(self):
        src = Path(ff.__file__).read_text()
        for bad in ("gh auth", ".config/gh", "hosts.yml"):
            self.assertNotIn(bad, src)
        self.assertEqual(src.count("subprocess.run("), 1)  # the openssl JWT sign only
        self.assertIn('subprocess.run(["openssl"', src)



class PushEventTests(unittest.TestCase):
    """Fleet push events: seat mapping, dedupe against PR events, live-wire never loops."""
    SINCE = ff.datetime(2026, 10, 6, 0, 0, tzinfo=ff.timezone.utc)

    class FakeGH:
        def __init__(self, events, msgs=None):
            self.events, self.msgs, self.lookups = events, msgs or {}, 0

        def get_cached(self, path, params=None):
            return self.events

        def get(self, path, params=None):
            self.lookups += 1
            return {"commit": {"message": self.msgs[path.rsplit("/", 1)[1]]}}

    @staticmethod
    def push(eid, login, branch, head, commits=None, t="2026-10-06T11:00:00Z"):
        p = {"ref": f"refs/heads/{branch}", "head": head}
        if commits is not None:
            p["commits"] = commits
        return {"id": eid, "type": "PushEvent", "created_at": t, "actor": {"login": login}, "payload": p}

    def setUp(self):
        ff.REPRESENTED.clear()
        ff.PUSH_MSG.clear()

    def test_push_maps_seat_and_labels(self):
        gh = self.FakeGH([
            self.push("1", "forge0x1[bot]", "mill/live-feed-pushes", "a" * 40, [{"sha": "a" * 40, "message": "feed: pushes\n\nbody"}]),
            self.push("2", "forge0x1[bot]", "main", "b" * 40),
            {"id": "3", "type": "IssuesEvent", "created_at": "2026-10-06T11:00:00Z"},
            self.push("4", "htafolla", "main", "c" * 40),                         # not a fleet seat
            self.push("5", "forge0x1[bot]", "main", "d" * 40, t="2026-10-05T01:00:00Z"),  # before window
        ], msgs={"b" * 40: "chore: bump"})
        out = ff.push_events(gh, "0xRayAI/xray", self.SINCE)
        self.assertEqual([(e["from"], e["to"], e["kind"]) for e in out], [("mill", "GitHub", "push"), ("forge", "GitHub", "push")])
        self.assertEqual(out[0]["label"], "pushed xray mill/live-feed-pushes · feed: pushes")
        self.assertEqual(out[1]["label"], "pushed xray main · chore: bump")
        self.assertEqual(gh.lookups, 1, "message looked up only when the payload has no commits")
        ff.push_events(gh, "0xRayAI/xray", self.SINCE)
        self.assertEqual(gh.lookups, 1, "looked-up message is cached")

    def test_dedupe_against_pr_commits_and_merge(self):
        ff.REPRESENTED["0xRayAI/xray"] = {"e" * 40, "f" * 40}   # a PR commit, a merge commit
        gh = self.FakeGH([
            self.push("1", "forge0x1[bot]", "mill/x", "e" * 40, [{"sha": "e" * 40, "message": "fix"}]),
            self.push("2", "forge0x1[bot]", "main", "f" * 40, [{"sha": "f" * 40, "message": "squash (#1)"}]),
            self.push("3", "forge0x1[bot]", "main", "9" * 40, [{"sha": "9" * 40, "message": "direct"}]),
        ])
        out = ff.push_events(gh, "0xRayAI/xray", self.SINCE)
        self.assertEqual([e["id"] for e in out], ["0xRayAI/xray:push:3"], "PR update and merge are not double-counted")

    def test_pr_events_mark_commits_and_merge_sha_represented(self):
        pr = {"number": 7, "title": "t", "html_url": "u", "user": {"login": "forge0x1[bot]"},
              "head": {"ref": "mill/x", "sha": "2" * 40}, "created_at": "2026-10-06T10:00:00Z",
              "merged_at": "2026-10-06T10:30:00Z", "merged_by": {"login": "forge0x1[bot]"},
              "merge_commit_sha": "3" * 40}
        gh = mock.Mock()
        gh.pages.side_effect = lambda path, *a, **k: iter(
            [{"sha": "1" * 40, "commit": {"committer": {"date": "2026-10-06T10:00:00Z"}, "message": "a"}},
             {"sha": "2" * 40, "commit": {"committer": {"date": "2026-10-06T10:10:00Z"}, "message": "b"}}]
            if path.endswith("/commits") else [])
        gh.get.return_value = {"check_runs": []}
        ff.pr_events(gh, "0xRayAI/xray", pr, self.SINCE)
        self.assertEqual(ff.REPRESENTED["0xRayAI/xray"], {"1" * 40, "2" * 40, "3" * 40})

    def test_live_wire_push_never_becomes_an_event(self):
        gh = self.FakeGH([self.push("1", "forge0x1[bot]", "live-wire", "7" * 40, [{"sha": "7" * 40, "message": "live-wire: replay snapshot"}])])
        self.assertEqual(ff.push_events(gh, "0xRayAI/xray", self.SINCE), [])

    def test_feed_push_ledger_folds_in(self):
        led = Path(TMP.name) / "feed-pushes.jsonl"
        rec = {"id": "live-wire:push:20261006T110000", "t_ct": "2026-10-06T06:00:00-05:00", "from": "mill",
               "to": "GitHub", "kind": "feed_push", "direction": "internal", "label": "mill pushed live-wire · 3 events",
               "source": "https://github.com/0xRayAI/xray/commits/live-wire", "src_file": "x", "repo": "0xRayAI/xray"}
        old = dict(rec, id="old", t_ct="2026-10-01T06:00:00-05:00")
        led.write_text(json.dumps(old) + "\n" + json.dumps(rec) + "\n")
        out = ff.feed_push_events(led, self.SINCE)
        self.assertEqual([e["id"] for e in out], [rec["id"]])
        self.assertEqual(out[0]["src_file"], "feed-pushes.jsonl")

    def test_events_poll_is_conditional_and_304_reuses_body(self):
        seen = []

        def fake(req, timeout=None):
            seen.append(req.headers.get("If-none-match"))
            if len(seen) == 1:
                r = Resp(json.dumps([{"id": "1"}]).encode())
                r.headers = {"ETag": '"v1"'}
                return r
            raise urllib.error.HTTPError(req.full_url, 304, "nm", {}, io.BytesIO(b""))

        gh = ff.GitHub("tok")
        with mock.patch.object(ff.urllib.request, "urlopen", fake):
            self.assertEqual(gh.get_cached("/repos/o/r/events", {"per_page": 100}), [{"id": "1"}])
            self.assertEqual(gh.get_cached("/repos/o/r/events", {"per_page": 100}), [{"id": "1"}])
        self.assertEqual(seen, [None, '"v1"'])
        self.assertEqual(gh.not_modified, 1)


class Loud401(unittest.TestCase):
    def test_auth_expired_is_not_an_oserror(self):
        self.assertFalse(issubclass(ff.AuthExpired, OSError))

    def test_watch_exits_75_without_writing(self):
        writes = []

        def fake_build(args, gh):
            raise ff.AuthExpired("GitHub HTTP 401")

        with mock.patch.object(ff, "build", fake_build), mock.patch.object(ff, "write", lambda f, o: writes.append(1)), \
                mock.patch("time.sleep", lambda s: None), mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT, "--watch", "1"]), quiet():
            self.assertEqual(ff.main(), 75)
        self.assertEqual(writes, [])

    def test_wall_clock_mint_age_exits_75_without_writing(self):
        writes = []
        env = {"BURST_TOKEN_MINTED": "1000"}
        with mock.patch.object(ff, "build", lambda a, gh: {"event_count": 0, "events": []}), \
                mock.patch.object(ff, "write", lambda f, o: writes.append(1)), \
                mock.patch.object(ff.time, "time", return_value=1000 + 50 * 60), \
                mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT]), quiet():
            self.assertEqual(ff.main(), 75)
        self.assertEqual(writes, [])

    def test_probe_does_not_read_the_body(self):
        class Resp:
            def __init__(self):
                self.read_called = False

            def getcode(self):
                return 200

            def read(self, n=-1):
                self.read_called = True
                raise AssertionError("body was read")

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        resp = Resp()
        with mock.patch("urllib.request.urlopen", return_value=resp):
            self.assertEqual(ff.probe("https://example.test/health"), (True, "200"))
        self.assertFalse(resp.read_called)

    def test_check_run_401_is_not_swallowed(self):
        pr = {"number": 1, "title": "t", "html_url": "u", "user": {"login": "forge0x1[bot]"},
              "head": {"ref": "mill/x", "sha": "a" * 40}, "created_at": "2026-10-09T14:00:00Z"}
        gh = mock.Mock()
        gh.pages.return_value = iter([])
        gh.get.side_effect = urllib.error.HTTPError("https://api.github.com/x", 401, "no", {}, None)
        with self.assertRaises(ff.AuthExpired):
            ff.pr_events(gh, "0xRayAI/xray", pr, ff.datetime(2026, 10, 9, tzinfo=ff.timezone.utc))

    def test_branch_tip_on_any_branch_skips_the_commit_message(self):
        ff.BRANCH_TIPS.clear()
        ff.REPRESENTED.clear()
        sha1, sha2 = "a" * 40, "b" * 40
        secret = "SECRET SUBJECT do not store"

        class GH:
            def __init__(self):
                self.n = 0

            def get_cached(self, path, params=None):
                self.n += 1
                sha = sha1 if self.n == 1 else sha2
                return [{"name": "topic/not-main", "commit": {"sha": sha}}]

            def get(self, path, params=None):
                return {"author": {"login": "forge0x1[bot]"},
                        "commit": {"message": secret, "committer": {"date": "2026-10-09T15:00:00Z"}}}

        gh = GH()
        since = ff.datetime(2026, 10, 9, tzinfo=ff.timezone.utc)
        self.assertEqual(ff.branch_tip_events(gh, "0xRayAI/xray", since), [])
        out = ff.branch_tip_events(gh, "0xRayAI/xray", since)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["from"], "forge")
        self.assertNotIn(secret, json.dumps(out[0]))
        self.assertIn("topic/not-main", out[0]["label"])
        self.assertNotIn("live-wire", out[0]["label"])

    def test_read_token_does_not_load_an_app_key(self):
        token = "github_pat_example"
        env = {"GITHUB_READ_TOKEN": token, "GITHUB_APP_ID": "1",
               "GITHUB_APP_INSTALLATION_ID": "2", "GITHUB_APP_PRIVATE_KEY_PATH": "/missing.pem"}
        seen = {}

        def fake_build(args, gh):
            seen["token"] = gh.token
            seen["app"] = gh.app
            return {"event_count": 0, "events": []}

        buf = io.StringIO()
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ff, "build", fake_build), \
                mock.patch.object(ff, "write", lambda f, o: 0), mock.patch("sys.stderr", buf), \
                mock.patch.object(sys, "argv", ["fetch_feed.py", "--out", OUT]):
            self.assertEqual(ff.main(), 0)
        self.assertEqual(seen["token"], token)
        self.assertIsNone(seen["app"])
        self.assertNotIn(token, buf.getvalue())


class FailsafeFeed(unittest.TestCase):
    def test_missing_activity_is_on_the_feed_map(self):
        now = time.time()
        root = Path(tempfile.mkdtemp())
        prompts = root / "prompts.jsonl"
        seats = root / "seats.json"
        when = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now - 30))
        prompts.write_text(json.dumps({
            "t_ct": when, "seat": "Chief of Staff", "kind": "prompt", "action": "SENT",
        }) + "\n", encoding="utf-8")
        seats.write_text(json.dumps({
            "aliases": {"Chief of Staff": "CoS", "Lab Tester: Chaos": "Chaos"},
        }), encoding="utf-8")
        env = {
            "BURST_PROMPTS": str(prompts), "BURST_SEATS": str(seats),
            "BURST_ACTIVITY": str(root / "absent.jsonl"), "BURST_LABS": "",
        }
        ff.CHECK_NOTES.clear()
        with mock.patch.dict(os.environ, env, clear=False):
            working, _box, missing = ff._working_map(now)
        self.assertIn("CoS", working)
        self.assertEqual(missing, ["CoS"])
        page = Path(__file__).resolve().parents[1] / ".." / "docs-site" / "static" / "live" / "live.js"
        self.assertNotIn("missing_activity", page.read_text(encoding="utf-8"))

    def test_prompts_default_to_fleet_path_and_legacy_lines_pulse(self):
        now = time.time()
        root = Path(tempfile.mkdtemp())
        (root / "fleet").mkdir()
        when = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now - 30))
        (root / "fleet" / "prompts.jsonl").write_text(
            json.dumps({"t_ct": when, "from": "Blaze", "to": "Operator"}) + "\n"
            + json.dumps({"t_ct": when, "seat": "Chief of Staff", "kind": "prompt", "action": "sent"}) + "\n",
            encoding="utf-8")
        seats = root / "seats.json"
        seats.write_text(json.dumps({"aliases": {"Chief of Staff": "CoS"}}), encoding="utf-8")
        env = {"BURST_SEATS": str(seats), "BURST_ACTIVITY": str(root / "absent.jsonl"), "BURST_LABS": ""}
        ff.CHECK_NOTES.clear()
        cwd = os.getcwd()
        try:
            os.chdir(root)
            with mock.patch.dict(os.environ, env, clear=False):
                os.environ.pop("BURST_PROMPTS", None)
                working, _box, missing = ff._working_map(now)
        finally:
            os.chdir(cwd)
        self.assertIn("Operator", working)
        self.assertIn("CoS", working)
        self.assertEqual(missing, ["CoS", "Operator"])


class BoxEventTest(unittest.TestCase):
    def test_box_ledger_folds_in_and_cursor_advances(self):
        folder = tempfile.TemporaryDirectory()
        root = Path(folder.name)
        ledger = root / "box-events.jsonl"
        ledger.write_text(json.dumps({
            "id": "box:builder:turn:start:2026-10-09T15:00:00Z",
            "t_ct": "2026-10-09T15:04:00-05:00",
            "from": "builder",
            "to": "Burst",
            "kind": "turn",
            "direction": "internal",
            "label": "turn start",
            "source": "burst-box",
            "src_file": "somewhere",
            "repo": "local",
        }) + "\n")
        since = __import__("datetime").datetime(2026, 10, 9, tzinfo=__import__("datetime").timezone.utc)
        got = ff.box_events(ledger, since)
        self.assertEqual(got[0]["src_file"], "box-events.jsonl")
        out = root / "live-events.json"
        first = ff.next_cursor(out)
        second = ff.next_cursor(out)
        epoch, seq = first.split(".")
        epoch2, seq2 = second.split(".")
        self.assertEqual(epoch, epoch2)
        self.assertEqual(int(seq2), int(seq) + 1)
        folder.cleanup()


if __name__ == "__main__":
    unittest.main(verbosity=2)
