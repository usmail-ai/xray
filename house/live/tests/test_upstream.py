"""Upstream watcher: off by default, and _pulls skips when unauthenticated."""
import os, sys, tempfile, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))))


class Upstream(unittest.TestCase):
    def setUp(self):
        self.env = {k: os.environ.get(k) for k in ("UPSTREAM_REPO", "XRAY_REPO", "UPSTREAM_PINNED", "XRAY_OURS")}
        for k in self.env:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_off_when_unset(self):
        import upstream
        self.assertFalse(upstream.enabled())
        self.assertEqual(upstream.pinned_numbers(), [])
        self.assertEqual(upstream.our_logins(), set())

    def test_pulls_skip_when_unauthenticated(self):
        import upstream
        os.environ["UPSTREAM_REPO"] = "example-org/app"
        with tempfile.TemporaryDirectory() as d:
            col = upstream.UpstreamCollector(Path(d), token="")
            self.assertFalse(col.auth)

            def pages(*a, **k):
                raise AssertionError("pages called")

            col.pages = pages
            col._pulls()


if __name__ == "__main__":
    unittest.main()
