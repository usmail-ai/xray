import os
import tempfile
import unittest

from pathlib import Path

from supervise import remint_due, run


class Proc:
    def __init__(self, code):
        self.code = code

    def wait(self):
        return self.code


class SuperviseTest(unittest.TestCase):
    def test_restarts_until_stop_file(self):
        folder = tempfile.mkdtemp()
        stop = os.path.join(folder, "stop")
        codes = iter([1, 1, 0])

        def popen(_cmd):
            return Proc(next(codes))

        def sleep(_n):
            if not os.path.exists(stop):
                open(stop, "w").close()

        out = run(["feed"], popen, stop, sleep=sleep, pause_s=0)
        self.assertEqual(out["starts"], 1)
        self.assertEqual(out["codes"], [1])
        self.assertTrue(out["stopped"])

    def test_stops_before_the_first_start(self):
        folder = tempfile.mkdtemp()
        stop = os.path.join(folder, "stop")
        open(stop, "w").close()
        out = run(["feed"], lambda _c: Proc(0), stop, sleep=lambda _n: None)
        self.assertEqual(out["starts"], 0)
        self.assertTrue(out["stopped"])

    def test_remint_uses_wall_clock_distance(self):
        minted = 1_000_000.0
        self.assertFalse(remint_due(minted, minted + 50 * 60 - 1))
        self.assertTrue(remint_due(minted, minted + 50 * 60))
        src = Path(__file__).resolve().parent.joinpath("supervise.py").read_text()
        self.assertNotIn("monotonic", src)
        self.assertNotIn("timeout", src)

    def test_pusher_sleep_closes_the_lock_fd(self):
        src = Path(__file__).resolve().parent.joinpath("push.sh").read_text()
        self.assertIn("flock -n 9", src)
        self.assertIn('sleep "$CHECK" 9>&-', src)
        self.assertIn("push-delta.mjs", src)


if __name__ == "__main__":
    unittest.main()
