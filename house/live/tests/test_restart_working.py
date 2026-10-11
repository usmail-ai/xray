"""Regression (working-gone, 2026-10-09): a feed restart (release.sh swap) must keep open working windows."""
import json, os, sys, tempfile, time, unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))))
import live_fleet  # noqa: E402
CT = ZoneInfo("America/Chicago")


def ct(ago_s):
    return datetime.fromtimestamp(time.time() - ago_s, CT).isoformat(timespec="seconds")


class RestartKeepsWorking(unittest.TestCase):
    def run_case(self, keep_state):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / "fleet").mkdir(); (root / "feed").mkdir()
            lines = [{"t_ct": ct(3000), "by": "Operator", "action": "launch", "agent": "bc-aaaa1111", "repo": "o/r", "tag": "x"},
                     {"t_ct": ct(2400), "by": "Operator", "action": "finished", "agent": "bc-aaaa1111", "repo": "o/r", "tag": "x"},
                     {"t_ct": ct(17 * 60), "by": "Operator", "action": "reply", "agent": "bc-11111111", "repo": "o/r", "tag": "y"}]
            (root / "fleet" / "cloud-agents.jsonl").write_text("".join(json.dumps(x) + "\n" for x in lines))
            state = root / "feed" / "fleet-state.json"
            f = live_fleet.Fleet(state, CT)
            f.scan_cloud()
            self.assertEqual(f.working_state([]).get("CloudAgents", {}).get("agent"), "bc-11111111")
            f.scan()
            if not keep_state:
                state.unlink()                          # cold start: no persisted state at all
            g = live_fleet.Fleet(state, CT)          # the new release's process
            g.scan()
            w = g.working_state([])
            self.assertIn("CloudAgents", w, "open cloud reply (17 min old, window 60 min) lost on restart")
            self.assertEqual(w["CloudAgents"]["agent"], "bc-11111111")
            self.assertTrue(g.fleet_state([])["cloud"]["working"])

    def test_warm_restart_keeps_open_cloud_window(self):
        self.run_case(True)

    def test_cold_restart_rebuilds_open_cloud_window(self):
        self.run_case(False)


if __name__ == "__main__":
    unittest.main()
