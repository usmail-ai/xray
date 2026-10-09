"""release.sh flips one symlink, then signals the old supervisor."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "release.sh"


class ReleaseTests(unittest.TestCase):
    def test_swap_renames_then_stops_the_old_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            pin = Path(tmp) / "rel-1" / "house" / "burst"
            pin.mkdir(parents=True)
            (pin / "supervise.py").write_text("# pin\n", encoding="utf-8")
            state = Path(tmp) / "state"
            stop = Path(tmp) / "old.stop"
            env = os.environ.copy()
            env["BURST_STATE"] = str(state)
            env["BURST_OLD_STOP"] = str(stop)
            out = subprocess.run(
                ["sh", str(SCRIPT), str(pin.parent.parent)],
                check=True, capture_output=True, text=True, env=env)
            link = state / "current"
            self.assertTrue(link.is_symlink())
            self.assertEqual(os.path.realpath(link), os.path.realpath(pin.parent.parent))
            self.assertFalse((state / "current.next").exists())
            self.assertTrue(stop.is_file())
            self.assertEqual(out.stdout.strip(), os.path.realpath(pin.parent.parent))

    def test_a_tree_without_supervise_exits_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            pin = Path(tmp) / "empty"
            pin.mkdir()
            env = os.environ.copy()
            env["BURST_STATE"] = str(Path(tmp) / "state")
            out = subprocess.run(
                ["sh", str(SCRIPT), str(pin)],
                capture_output=True, text=True, env=env)
            self.assertEqual(out.returncode, 2)
            self.assertFalse((Path(tmp) / "state" / "current").exists())


if __name__ == "__main__":
    unittest.main()
