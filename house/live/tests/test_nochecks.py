"""Railway collector with a fine-grained read-only token (LIVE_NO_CHECKS=1): no Checks API at all; github-actions
suites/runs derived from Actions runs/jobs under the SAME event ids. Run: python3 -m unittest tests/test_nochecks.py"""
import importlib.util, os, sys, tempfile, time, unittest
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
HERE = Path(__file__).resolve().parent
FEED_DIR = Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))
sys.dont_write_bytecode = True


def load_nochecks():   # a private copy of the module with NO_CHECKS on (the flag is read at import)
    os.environ["LIVE_NO_CHECKS"] = "1"
    try:
        spec = importlib.util.spec_from_file_location("uc_nochecks", FEED_DIR / "live_collect.py")
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
    finally:
        os.environ.pop("LIVE_NO_CHECKS", None)


class FF:
    CT = ZoneInfo("America/Chicago")


class Fake:
    def __init__(self, routes):
        self.routes, self.paths = routes, []

    def rest(self, path, params=None, etag=None, essential=False):
        self.paths.append(path)
        if "check-suites" in path or "check-runs" in path:
            raise AssertionError("Checks API must not be called with LIVE_NO_CHECKS=1")
        for k, v in self.routes.items():
            if path.endswith(k):
                return 200, v, None, None
        return 200, [], None, None


class NoChecks(unittest.TestCase):
    def test_graphql_has_no_checksuites_and_runs_jobs_map_to_checks_ids(self):
        uc = load_nochecks()
        self.assertTrue(uc.NO_CHECKS)
        self.assertNotIn("checkSuites", uc.Q_HISTORY); self.assertNotIn("checkSuites", uc.Q_PRS)
        self.assertIn("status { contexts", uc.Q_HISTORY)                     # commit statuses still come
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        run = {"id": 11, "check_suite_id": 501, "name": "ci", "event": "pull_request", "head_branch": "f", "status": "in_progress",
               "conclusion": None, "run_number": 3, "head_sha": "a" * 40, "created_at": now, "updated_at": now,
               "html_url": "https://github.com/example-org/x/actions/runs/11", "actor": {"login": "builder-app[bot]"}}
        job = {"id": 901, "name": "test", "status": "in_progress", "conclusion": None, "started_at": now, "completed_at": None}
        c = Fake({"/actions/runs": {"workflow_runs": [run]}, "/actions/runs/11/jobs": {"jobs": [job]}})
        with tempfile.TemporaryDirectory() as d:
            col = uc.RepoCollector("example-org/x", Path(d), FF, lambda *a: None)
            col.poll_runs(c); col.poll_jobs(c)
            ev = col.ev
            s = ev["example-org/x:suite:501"]; r = ev["example-org/x:checkrun:901"]
            self.assertEqual((s["kind"], s["app"], s["status"], s["sha"]), ("check_suite", "github-actions", "in_progress", "a" * 40))
            self.assertEqual((r["kind"], r["app"], r["status"], r["suite_id"], r["sha"]), ("check_run", "github-actions", "in_progress", 501, "a" * 40))
            self.assertIn("example-org/x:run:11", ev)
            # completed run + jobs -> no more job polling for that run
            run.update(status="completed", conclusion="success"); job.update(status="completed", conclusion="success", completed_at=now)
            col.st["etags"].pop("runs", None)
            col.poll_runs(c); col.poll_jobs(c)
            self.assertTrue(col.st["jobs"]["11"]["done"])
            n = len(c.paths); col.poll_jobs(c); self.assertEqual(len(c.paths), n)
            self.assertEqual(ev["example-org/x:checkrun:901"]["conclusion"], "success")
            col.ci_rest(c, "a" * 40)                                        # statuses only
            self.assertTrue(c.paths[-1].endswith("/statuses"))


if __name__ == "__main__":
    unittest.main()
