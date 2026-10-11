"""merge-queue.md: the first read seeds existing ticks silently; later ticks emit once. Run: python3 -m unittest tests/test_queue_seed.py"""
import os, sys, tempfile, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "feed"))
sys.dont_write_bytecode = True
SRC = os.environ.get("LIVE_MESH_SRC", "/srv/live-mesh-src/house/live-mesh")


@unittest.skipUnless(Path(SRC, "fetch_feed.py").exists(), "upstream checkout missing (feed/bootstrap.sh)")
class QueueSeed(unittest.TestCase):
    def test_seed_then_emit(self):
        import live_mesh as um
        with tempfile.TemporaryDirectory() as d:
            q, st = Path(d, "merge-queue.md"), Path(d, "retest-seen.json")
            um.MERGE_QUEUE = q
            q.write_text("- [x] app #10 abcdef1 ok\n- [!] app #11 abcdef2 no\n- [ ] app #12 abcdef3\n")
            self.assertEqual(um.queue_events(st, set()), [])            # first read: seeded, no live
            self.assertEqual(um.queue_events(st, set()), [])            # still nothing new
            q.write_text(q.read_text() + "- [x] app #13 abcdef4 ok\n")
            ev = um.queue_events(st, set())
            self.assertEqual([(e["number"], e["kind"]) for e in ev], [(13, "lab_retest_pass")])
            self.assertEqual(len(um.queue_events(st, set())), 1)        # same id re-sent (dedupe by id downstream)


if __name__ == "__main__":
    unittest.main()
