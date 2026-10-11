"""nudges.py: pull prints new open nudges once; comment posts Builder's at most once per card per level."""
import io, json, os, sys, tempfile, time, unittest
from contextlib import redirect_stdout
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))))


class Nudges(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory(); os.environ["MESH_RUN"] = self.d.name
        import importlib, nudges
        self.n = importlib.reload(nudges)
        now = int(time.time() * 1000)
        mk = lambda c, lvl, seat, **k: {"id": f"nudge:{c}:L{lvl}:1", "card": c, "repo": c.split("#")[0], "number": int(c.split("#")[1]),
                                        "title": "t", "url": "u", "level": lvl, "seat": seat, "beat_t": now - 61 * 60000, **k}
        self.server = [mk("o/r#200", 1, "builder"), mk("o/r#212", 1, "operator"), mk("o/r#200", 2, "coord"), mk("o/r#7", 1, "builder", closed_at="x")]
        self.n.fetch = lambda since: self.server[[x["id"] for x in self.server].index(since) + 1:] if since else list(self.server)

    def tearDown(self):
        self.d.cleanup()

    def out(self, fn, *a):
        b = io.StringIO()
        with redirect_stdout(b):
            fn(*a)
        return b.getvalue().strip()

    def test_pull_once(self):
        got = json.loads(self.out(self.n.cmd_pull))
        self.assertEqual([(g["card"], g["seat"], g["level"]) for g in got], [("o/r#200", "builder", 1), ("o/r#212", "operator", 1), ("o/r#200", "coord", 2)])
        self.assertEqual(got[0]["age_min"], 61)
        self.assertEqual(json.loads(self.out(self.n.cmd_pull)), [])

    def test_comment_once_per_card_per_level(self):
        posts = []
        post = lambda repo, num, body: posts.append((repo, num, body)) or True
        self.assertEqual(self.out(self.n.cmd_comment, post), "1")              # only Builder's open L1 (Coord L2 is not Builder's)
        self.assertEqual(posts[0][:2], ("o/r", 200)); self.assertIn("Nudge L1", posts[0][2])
        self.server.append(dict(self.server[0], id="nudge:o/r#200:L1:2"))       # same card + level again (new stall)
        self.assertEqual(self.out(self.n.cmd_comment, post), "0")
        self.assertEqual(len(posts), 1)


class ParkedNudges(Nudges):
    def test_parked_card_never_pulled_or_commented(self):
        feed = Path(self.d.name) / "feed"; feed.mkdir(exist_ok=True)
        (feed / "live-events.json").write_text(json.dumps({"board": {"cards": [{"key": "o/r#200", "state": "parked"}, {"key": "o/r#212", "state": "live"}]}}))
        got = json.loads(self.out(self.n.cmd_pull))
        self.assertEqual([g["card"] for g in got], ["o/r#212"])
        posts = []
        self.assertEqual(self.out(self.n.cmd_comment, lambda *a: posts.append(a) or True), "0")
        self.assertEqual(posts, [])


if __name__ == "__main__":
    unittest.main()
