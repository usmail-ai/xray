"""Ghost cards: open_numbers + reconcile, no network."""
import os, sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))))


class FakeClient:
    def __init__(self, pages):
        self.pages = pages

    def rest(self, url, params=None, etag=None, essential=False):
        return 200, self.pages.get(url, []), None, None


class Ghost(unittest.TestCase):
    def test_open_numbers_and_reconcile(self):
        import live_board
        import live_collect as uc
        pages = {"/repos/example-org/app/issues": [{"number": 2}, {"number": 4}]}
        got = uc.open_numbers(FakeClient(pages), ["example-org/app", "nope"])
        self.assertEqual(got, {"example-org/app": {2, 4}})
        wave = {"cards": [
            {"key": "example-org/app#1", "kind": "issue", "state": "live", "stage": "open", "pinned": False},
            {"key": "example-org/app#2", "kind": "pr", "state": "live", "stage": "review"},
            {"key": "pin:1", "kind": "pin", "state": "parked", "pinned": True},
            {"key": "other/repo#9", "kind": "issue", "state": "live", "stage": "open"},
        ]}
        n = live_board.reconcile(wave, got)
        self.assertEqual(n, 1)
        by = {c["key"]: c for c in wave["cards"]}
        self.assertEqual(by["example-org/app#1"]["state"], "closed")
        self.assertEqual(by["example-org/app#2"]["state"], "live")
        self.assertEqual(by["other/repo#9"]["state"], "live")
        self.assertTrue(by["pin:1"]["pinned"])


if __name__ == "__main__":
    unittest.main()
