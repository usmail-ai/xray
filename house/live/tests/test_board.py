"""Board model (cards / packets / beats) + packet parser: Lead 1:53 PM spec."""
import json, os, sys, tempfile, time, unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))))
CT = ZoneInfo("America/Chicago")
R = "example-org/app"


def ct(ago):
    return datetime.fromtimestamp(time.time() - ago, CT).isoformat(timespec="seconds")


class Packet(unittest.TestCase):
    def test_block_and_single_line(self):
        import live_packet as p
        body = ("x\n## Packet\n- Goal: fix it, see https://evil.example/x and https://github.com/u/r/pull/1\n"
                "- **Acceptance**: tests green; ping bob@example.com\n- Next owner: Reviewer\n- Path: " + "a" * 400 + "\n## Notes\nGoal: no")
        d = p.parse(body)
        self.assertEqual(d["next owner"], "Reviewer")
        self.assertNotIn("evil", d["goal"]); self.assertIn("https://github.com/u/r/pull/1", d["goal"])
        self.assertIn("[email]", d["acceptance"]); self.assertLessEqual(len(d["path"]), 200)
        self.assertEqual(p.parse("Packet: goal: ship | acceptance: green | next owner: Builder; escalate: Lead"),
                         {"goal": "ship", "acceptance": "green", "next owner": "Builder", "escalate": "Lead"})
        self.assertEqual(p.parse("no packet here"), {})
        self.assertEqual(p.parse("[docs](https://notion.so/x) text\n## Packet\n- Goal: [d](https://notion.so/y) z"), {"goal": "d z"})


class Model(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory(); root = Path(self.d.name)
        os.environ.update(MESH_RUN=str(root), INBOX_CACHE=str(root / "none.json"), LIVE_INBOX=str(root / "inbox"),
                          LIVE_BOARD=str(root / "BOARD.md"), LIVE_BOARD_STATIC=str(root / "static.md"))
        (root / "static.md").write_text("## Waiting on Lead\n- **Prod promotion.** only on Lead's word, mail a@b.com\n")
        import importlib, live_board
        self.w = importlib.reload(live_board); self.root = root

    def tearDown(self):
        self.d.cleanup()

    def ev(self, n, kind, ago, **kw):
        if kind == "pr_open":
            kw.setdefault("pr_state", "open")
        return {"id": f"{R}#{n}:{kind}:{ago}", "t_ct": ct(ago), "kind": kind, "repo": R, "number": n, "from": "Builder", "source": f"https://github.com/{R}/pull/{n}", **kw}

    def test_cards_stages_packets_stall_md(self):
        sha = "abcdef1234567"
        evs = [self.ev(1, "pr_open", 5000, title="fix a", packet={"goal": "g", "acceptance": "tests", "next owner": "Reviewer"}),
               self.ev(1, "pr_commit", 4000, sha=sha),
               {"id": "cr1", "t_ct": ct(3900), "kind": "check_run", "repo": R, "sha": sha, "conclusion": "failure", "source": "https://github.com/ci/1"},
               self.ev(2, "pr_open", 600, title="fix b"),                                       # no packet
               self.ev(2, "critic_pass", 300),
               {"id": "w1", "t_ct": ct(100), "kind": "watcher", "repo": R, "number": 2, "start_ct": ct(100), "end_ct": ct(100)},
               self.ev(3, "pr_open", 9000, title="done one"), self.ev(3, "merged", 8000, merge_sha="f00ba12"),
               self.ev(3, "lab_retest_pass", 7000), self.ev(3, "pr_commit", 6000, sha="1111111")]   # after close: ignored
        m = self.w.model(evs)
        c = {x["key"]: x for x in m["cards"]}
        a, b, d = c[f"{R}#1".lower()], c[f"{R}#2".lower()], c[f"{R}#3".lower()]
        self.assertEqual((a["stage"], a["state"], a["packet_ok"]), ("fix", "live", True))
        self.assertTrue(a["stall"])                                                              # 65 min, no beat
        self.assertEqual(a["packet"]["evidence"], "https://github.com/ci/1")                    # from the latest beat
        self.assertEqual((b["stage"], b["packet_ok"], b["missing"], b["packet"]["next owner"]), ("merge", False, ["acceptance"], "Builder"))   # PASS + green CI: Builder merges
        self.assertEqual([x["what"] for x in b["beats"]], ["opened", "Reviewer PASS"])            # idle watcher: no beat
        self.assertFalse(b["stall"])
        self.assertEqual((d["stage"], d["state"]), ("done", "closed"))
        self.assertEqual([x["what"] for x in d["beats"]], ["opened", "merged", "retest PASS"])  # stops when closed
        pin = [x for x in m["cards"] if x.get("pinned")][0]
        self.assertEqual(pin["title"], "Prod promotion"); self.assertNotIn("@", json.dumps(m))
        self.assertEqual(self.w.stall_lines(m), 1); self.assertEqual(self.w.stall_lines(m), 0)  # once per stall
        line = json.loads((self.root / "inbox" / "coord.jsonl").read_text())
        self.assertEqual((line["seat"], line["type"], line["number"]), ("coord", "stall", 1))
        self.assertTrue(self.w.write_md(m, force=True)); self.assertFalse(self.w.write_md(m))  # once a minute
        md = (self.root / "BOARD.md").read_text()
        self.assertIn("## Pinned", md); self.assertIn("STALL 60m+", md); self.assertIn("no packet", md)

    def test_owner_comment_is_a_beat_other_comments_are_not(self):
        evs = [self.ev(8, "pr_open", 9000, title="x"), self.ev(8, "merged", 8000),
               dict(self.ev(8, "pr_comment", 600), **{"from": "Operator"}),          # e.g. ops-app's nudge comment
               dict(self.ev(8, "pr_comment", 300), **{"from": "Builder"})]
        c = [c for c in self.w.model(evs)["cards"] if c.get("number") == 8][0]
        self.assertEqual([b["what"] for b in c["beats"]], ["opened", "merged", "owner comment"])

    def merged_card(self, n=20, *more):
        return [self.ev(n, "pr_open", 9000, title="m"), self.ev(n, "merged", 8000), *more]

    def card(self, evs, n=20):
        return [c for c in self.w.model(evs)["cards"] if c.get("number") == n][0]

    def test_retest_nudges_chaos_not_author(self):
        c = self.card(self.merged_card())
        self.assertEqual((c["stage"], c["state"], c["nudge_to"], c["packet"]["next owner"]), ("retest", "live", "tester", "Tester"))
        self.assertEqual(c["owner"], "Builder")

    def test_done_on_pass_or_fail_tick(self):
        for v in ("pass", "fail"):
            c = self.card(self.merged_card(20, self.ev(20, f"lab_retest_{v}", 600)))
            self.assertEqual((c["stage"], c["state"]), ("done", "closed"), v)
            self.assertNotIn("nudge_to", c)

    def test_done_when_later_merged_pr_fixes_it(self):
        evs = self.merged_card(20) + [self.ev(21, "pr_open", 900, title="fix", fixes=[20]), self.ev(21, "merged", 600)]
        c = self.card(evs)
        self.assertEqual((c["stage"], c["state"], c["resolved"]), ("done", "closed", "fixed by #21"))
        evs = self.merged_card(20) + [self.ev(21, "pr_open", 900, title="fix", fixes=[20])]          # not merged yet
        self.assertEqual(self.card(evs)["stage"], "retest")

    def test_done_when_owner_says_resolved(self):
        c = self.card(self.merged_card(20, dict(self.ev(20, "pr_comment", 300), resolved=True)))
        self.assertEqual((c["stage"], c["state"], c["beats"][-1]["what"]), ("done", "closed", "owner: resolved"))
        c = self.card(self.merged_card(20, dict(self.ev(20, "pr_comment", 300), **{"from": "Others", "resolved": True})))
        self.assertEqual(c["stage"], "retest")                                                     # only the owner

    def test_parked_comment_parks_until_a_newer_beat(self):
        import live_collect as uc
        for body in ("Parked: waiting on Lead", "  parked: x", "PARKED: y"):
            self.assertTrue(uc.PARKED_COMMENT_RE.match(body), body)
        self.assertFalse(uc.PARKED_COMMENT_RE.match("not Parked: yet"))
        base = [self.ev(30, "pr_open", 9000, title="p"), self.ev(30, "pr_commit", 8000)]
        park = dict(self.ev(30, "pr_comment", 5000), **{"from": "Coord", "parked": True})
        c = self.card(base + [park], 30)
        self.assertEqual((c["state"], c["stall"], c["beats"][-1]["what"]), ("parked", False, "parked"))
        for later in (self.ev(30, "pr_commit", 100), self.ev(30, "ci_pass", 100, conclusion="success"),
                      self.ev(30, "critic_pass", 100), self.ev(30, "merged", 100),
                      dict(self.ev(30, "pr_comment", 100), **{"from": "Others"})):
            self.assertEqual(self.card(base + [park, later], 30)["state"], "live", later["kind"])
        self.assertEqual(self.card(base + [self.ev(30, "pr_commit", 6000), park], 30)["state"], "parked")   # older beat: stays parked
        merged = self.merged_card(31, dict(self.ev(31, "pr_comment", 300), **{"from": "Coord", "parked": True}))
        c = self.card(merged, 31); self.assertEqual(c["state"], "parked"); self.assertNotIn("nudge_to", c)   # no retest nudge

    def test_critic_pass_at_head_next_owner_builder_not_chaos(self):
        import live_collect as uc
        self.assertIn("reviewer-app[bot]", uc.CRITIC_LOGINS)
        self.assertTrue(uc.CRITIC_RE.match("**Reviewer: PASS: ready for lab test** @ 425dc03 (still a draft)"))
        op = dict(self.ev(40, "pr_open", 9000, title="d", draft=True), packet={"next owner": "Tester"})
        push = dict(self.ev(40, "pr_commit", 8000), sha="425dc03d41a8")
        ci = self.ev(40, "ci_pass", 7000, conclusion="success")
        crit = dict(self.ev(40, "critic_pass", 6000), sha="425dc03")
        c = self.card([op, push, ci, crit], 40)
        self.assertEqual((c["stage"], c["nudge_to"], c["packet"]["next owner"]), ("merge", "builder", "Builder"))
        self.assertEqual(c["reviewer"]["at_head"], True); self.assertEqual(c["head"], "425dc03")
        cb = [b for b in c["beats"] if b.get("kind") == "reviewer verdict"][0]
        self.assertEqual((cb["what"], cb["sha"]), ("Reviewer PASS", "425dc03"))
        newer = dict(self.ev(40, "pr_commit", 5000), sha="bbbbbbb1")             # pushed after the PASS: not at head
        c = self.card([op, push, ci, crit, newer], 40)
        self.assertFalse(c["reviewer"]["at_head"]); self.assertEqual(c["nudge_to"], "builder")   # never Tester before merge
        self.assertNotEqual(c["packet"]["next owner"], "Builder")
        c = self.card([op, push, ci, crit, self.ev(40, "merged", 4000)], 40)    # after merge Tester owns the retest
        self.assertEqual((c["stage"], c["nudge_to"]), ("retest", "tester"))

    def test_collector_flags(self):
        import re, live_collect as uc
        self.assertEqual(uc.card_fields({"number": 21, "body": "Fixes #20, supersedes #19; see #21"})["fixes"], [19, 20])
        self.assertTrue(uc.RESOLVED_RE.search("Nothing on #200 is waiting on Builder."))
        self.assertFalse(uc.RESOLVED_RE.search("still working on it"))

    def test_unknown_state_quiet_card_hidden(self):
        e = self.ev(7, "pr_open", 200000, title="pre-capture"); e.pop("pr_state")
        self.assertEqual([c for c in self.w.model([e])["cards"] if not c.get("pinned")], [])

    def test_closed_drops_after_24h(self):
        evs = [self.ev(5, "pr_open", 200000, title="old"), self.ev(5, "merged", 190000), self.ev(5, "lab_retest_pass", 180000)]
        self.assertEqual([c for c in self.w.model(evs)["cards"] if not c.get("pinned")], [])


if __name__ == "__main__":
    unittest.main()


class CollectorCapture(unittest.TestCase):
    def test_card_fields_keep_packet_not_body(self):
        import live_collect as uc
        f = uc.card_fields({"title": "t", "state": "open", "labels": [{"name": "S2"}], "body": "secret prose\n## Packet\n- Goal: g\n- Next owner: Reviewer"})
        self.assertEqual(f["packet"], {"goal": "g", "next owner": "Reviewer"})
        self.assertNotIn("secret", json.dumps(f))


class Stats(unittest.TestCase):
    def test_counts_24h_and_open(self):
        import live_board as w
        e = lambda n, k, ago, **kw: {"id": f"{n}:{k}", "t_ct": ct(ago), "kind": k, "repo": R, "number": n, **kw}
        evs = [e(1, "issue_open", 3600, pr_state="open"), e(2, "issue_open", 90000, pr_state="open"), e(2, "issue_close", 600),
               e(3, "issue_open", 200000, pr_state="open"),
               e(10, "pr_open", 100, pr_state="open"), e(11, "pr_open", 5000, pr_state="closed"), e(11, "merged", 4000),
               e(12, "pr_open", 9000, pr_state="closed"), e(12, "pr_close", 8000), e(13, "pr_open", 300000, pr_state="open"),
               e(14, "pr_open", 300000)]                                    # pre-capture: state unknown, not counted open
        self.assertEqual(w.stats(evs), {"issues_opened_24h": 1, "issues_closed_24h": 1, "prs_opened_24h": 3, "prs_merged_24h": 1,
                                        "prs_closed_unmerged_24h": 1, "issues_open": 2, "prs_open": 2, "open_total": 4})
