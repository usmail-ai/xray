"""Flow hops + fleet scan (temp tree). Privacy: bug text, names, emails never reach events."""
import json, os, sys, tempfile, time, unittest
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get("MESH_FEED_DIR", HERE.parent / "feed"))))
import live_flow  # noqa: E402
import live_fleet
from live_fleet import _ts  # noqa: E402
CT = ZoneInfo("America/Chicago")
SECRET = ["Jane Customer", "jane" + chr(64) + "example.com", "42 Elm Street", "repro: click the button"]


class Col:
    def __init__(self, prs, ev, main=(), develop=()):
        self.st = {"prs": prs, "branch_shas": {"main": dict.fromkeys(main, 1), "develop": dict.fromkeys(develop, 1)}}
        self.ev = ev


def node(login):
    return {"builder-app[bot]": "Builder", "lead-alt": "Lead"}.get(login, "Others" if login else "GitHub")


class FlowTest(unittest.TestCase):
    def setUp(self):
        R = "example-org/app"
        col = Col({"7": {"author": "builder-app[bot]", "head": "h7"}},
                  {"x": {"kind": "pr_commit", "sha": "c7", "number": 7}}, main={"m1", "d1"}, develop={"d1"})
        self.f, self.R = live_flow.Flow({R: col}, node), R

    def hops(self, **e):
        e.setdefault("repo", self.R)
        return self.f.hops(e)

    def test_rules(self):
        self.assertEqual(self.hops(kind="pr_open", **{"from": "Lead"}), ["Lead", "GitHub"])
        self.assertEqual(self.hops(kind="check_run", sha="c7"), ["GitHub", "Builder"])   # CI folded into GitHub
        self.assertEqual(self.hops(kind="op_deploy", instance="app.example.com"), ["Operator", "Railway", "app.example.com"])
        self.assertEqual(self.hops(kind="op_deploy"), ["Operator", "Railway"])          # live-mesh deploys
        self.assertEqual(self.hops(kind="op_commit"), ["Operator", "GitHub"])
        self.assertEqual(self.hops(kind="cos_file"), ["Coord", "Example"])
        self.assertEqual(self.hops(kind="cos_commit"), ["Coord", "Example"])
        self.assertEqual(self.hops(kind="cloud_reply", **{"from": "Operator", "to": "CloudAgents"}), ["Operator", "CloudAgents"])
        self.assertEqual(self.hops(kind="cloud_finished", **{"from": "CloudAgents", "to": "Operator"}), ["CloudAgents", "Operator"])
        self.assertEqual(self.hops(kind="pr_open", **{"from": "CloudAgents"}), ["CloudAgents", "GitHub"])
        self.assertEqual(self.hops(kind="prompt_message", **{"from": "Lead", "to": "Operator"}), ["Lead", "Operator"])
        self.assertEqual(self.hops(kind="critic_pass", number=7), ["Reviewer", "GitHub", "Builder"])
        self.assertEqual(self.hops(kind="merged", base="develop", **{"from": "Builder"}),
                         ["Builder", "GitHub", "Railway", "dev.example.com"])
        self.assertEqual(self.hops(kind="merged", base="main", **{"from": "Lead"})[-1], "app.example.com")
        self.assertEqual(self.hops(kind="deploy", sha="m1"), ["Railway", "app.example.com"])   # main-only SHA
        self.assertEqual(self.hops(kind="deploy", sha="d1"), ["Railway", "dev.example.com"])   # shared with develop
        self.assertEqual(self.hops(kind="lab_retest_pass"), ["Tester", "GitHub"])
        self.assertEqual(self.hops(kind="lab_calls", **{"from": "Tester", "to": "labtest"}), ["Tester", "labtest", "Tester"])
        # applied twice (every watch pass re-applies): to stays the instance, never the tester
        e = {"id": "x", "kind": "lab_run", "from": "QA", "to": "labtest", "instance": "labtest"}
        self.f.apply([e]); self.f.apply([e])
        self.assertEqual((e["from"], e["to"], e["hops"]), ("QA", "Example", ["QA", "Example", "QA"]))
        self.assertEqual(e["tags"], ["labtest"])
        # board view: instances -> Example, QaOne/QaTwo -> QA, tags on the label (idempotent)
        cases = [({"kind": "lab_run", "from": "QaOne", "to": "app.example.com", "instance": "app.example.com", "label": "test run"},
                  ["QA", "Example", "QA"], "test run · prod / qa-one"),
                 ({"kind": "deploy", "sha": "m1", "label": "deploy SUCCESS"}, ["Railway", "Example"], "deploy SUCCESS · prod"),
                 ({"kind": "merged", "from": "Builder", "base": "develop", "label": "merged #1"},
                  ["Builder", "GitHub", "Railway", "Example"], "merged #1 · dev"),
                 ({"kind": "health_ok", "from": "app.example.com", "label": "/health 200"}, ["Railway", "Example"], "/health 200 · prod"),
                 ({"kind": "lab_bug", "from": "QaTwo", "to": "dev.example.com", "label": "new bug"},
                  ["QA", "Example"], "new bug · dev / qa-two"),
                 ({"kind": "op_deploy", "instance": "dev.example.com", "label": "deploy app-project · development · SUCCESS"},
                  ["Operator", "Railway", "Example"], "deploy app-project · development · SUCCESS · dev")]
        for ev, hops, label in cases:
            ev.update(id="c", repo=self.R)
            self.f.apply([ev]); self.f.apply([ev])
            self.assertEqual((ev["hops"], ev["label"]), (hops, label))
            self.assertNotIn(ev["hops"][-1], ev["hops"][:-1] if ev["kind"] != "lab_run" else [])
        self.assertEqual(self.hops(kind="health_ok", **{"from": "dev.example.com"}), ["dev.example.com", "Example"])

    def test_apply_sets_from_to(self):
        e = [{"kind": "check_run", "sha": "c7", "repo": self.R, "from": "CI", "to": "GitHub"},
             {"kind": "workflow_run", "sha": "zz", "repo": self.R, "from": "GitHub", "to": "CI"},       # no author
             {"kind": "pr_comment", "repo": self.R, "from": "CI", "to": "GitHub"}]                    # Actions bot write
        self.f.apply(e); self.f.apply(e)
        self.assertEqual((e[0]["from"], e[0]["to"], e[0]["hops"]), ("GitHub", "Builder", ["GitHub", "Builder"]))
        for x in e[1:]:
            self.assertEqual((x["from"], x["to"], x["hops"]), ("GitHub", "GitHub", ["GitHub"]))   # GitHub-only pulse


class FleetTest(unittest.TestCase):
    def test_scan_ids_counts_privacy(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "qa/bugs").mkdir(parents=True)
            (root / "qa/runs").mkdir()
            (root / "labtest/ai/gate-results-2026-10-08-dev-abc1234").mkdir(parents=True)
            (root / "fleet-house/house").mkdir(parents=True)
            body = "# Bug\n**Severity:** S2\n**Status:** OPEN\n" + "\n".join(SECRET)
            (root / "qa/bugs/BUG-lab-tester-031.md").write_text(body)
            (root / "qa/bugs/PROD-05-some-free-text-slug.md").write_text("Severity: S4\n" + SECRET[0])
            (root / "qa/runs/lab-qa-one-retest-2026-10-08.md").write_text("PASS\nPASS\nFAIL\n" + SECRET[1])
            for i, c in enumerate([0, 0, 1]):
                (root / f"labtest/ai/gate-results-2026-10-08-dev-abc1234/0{i}-step.exit").write_text(str(c))
            (root / "qa/runs/mq-0001").mkdir()
            (root / "qa/runs/mq-0001/http-app.txt").write_text(
                "== dev.example.com\nHTTP/2 200 \nset-cookie: s=abc\nHTTP/2 404 \n" + SECRET[3] + "\nGET /api/x [401] {}\n")
            (root / "qa/runs/mq-0001/body.tmp").write_text(SECRET[1])
            (root / "fleet-house/house/JIRA-BOARD-MAP.md").write_text("- **SCRUM-1** (In Progress): " + SECRET[0])
            (root / "fleet-house/house/BOARD.md").write_text("## Track QA (x)\n- PARKED " + SECRET[2])
            live_fleet.WS = root
            live_fleet.LABQA, live_fleet.LABTEST = root / "qa", root / "labtest"
            live_fleet.HOUSE = root / "fleet-house/house"
            live_fleet.OP_REPO = root / "no-repo"
            f = live_fleet.Fleet(root / "state.json", CT)
            ev = f.scan()
            by = {e["kind"]: e for e in ev}
            labels = sorted(e["label"] for e in ev)
            self.assertIn("new bug tester-031 (S2)", labels)
            self.assertIn("new bug PROD-05 (S4)", labels)
            self.assertIn("test run, 2 pass / 1 fail", labels)
            self.assertIn("test run, 2 pass / 1 fail", [e["label"] for e in ev if e["source"] == "qa/runs"])
            self.assertEqual(by["board_card"]["card_status"], "In Progress")
            calls = by["lab_calls"]
            self.assertEqual((calls["from"], calls["to"], calls["calls"], calls["status_classes"]),
                             ("Tester", "dev.example.com", 3, {"2xx": 1, "4xx": 2}))
            gate = [e for e in ev if e["source"] == "labtest/gate-results"][0]
            self.assertEqual((gate["from"], gate["to"]), ("Operator", "labtest"))   # labtest runs = Operator's
            self.assertEqual(by["board_status"]["status_word"], "PARKED")
            blob = json.dumps(ev) + (root / "state.json").read_text()
            for s in SECRET + ["some-free-text-slug", str(root), "set-cookie", "/api/x"]:
                self.assertNotIn(s, blob)
            self.assertEqual(f.scan(), ev)   # no change -> no new events
            fs = f.fleet_state([], now=time.time())
            self.assertEqual((fs["total"], fs["seats"]["Tester"]["active"], fs["seats"]["Builder"]["active"]), (7, True, False))
            self.assertEqual(list(fs["seats"]), ["Builder", "Builder-cloud", "Reviewer", "Tester", "QA", "Operator", "Coord"])
            self.assertTrue(fs["seats"]["QA"]["active"])   # QaOne' run log / QA gate results fold into QA


class OperatorCosTest(unittest.TestCase):
    def test_sources_seed_silently_then_emit_ids_counts_only(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            house, lt, repo, feed = root / "house", root / "labtest", root / "op-repo", root / "feed"
            for p in (house / "watchers", house / "triager-notes", lt / "ai", repo, feed):
                p.mkdir(parents=True)
            (house / "HOUSE.md").write_text("# House\n" + SECRET[0])
            (house / "watchers/merge-queue.md").write_text("- [x] app #1 abcdef1\n- [ ] app #2 abcdef2\n")
            rw = feed / "railway-deploys.json"
            dep = lambda i, st, cli: {"id": i, "project": "app-project", "service": "app-project", "env": "production",
                                      "status": st, "created": "2026-10-08T18:00:00Z", "cli": cli}
            rw.write_text(json.dumps({"polled_at": "2026-10-08T18:10:00+00:00", "deploys": [dep("aaaa1111", "SUCCESS", True)]}))
            env = dict(os.environ, GIT_AUTHOR_NAME="ops-app[bot]", GIT_AUTHOR_EMAIL="op", GIT_COMMITTER_NAME="op",
                       GIT_COMMITTER_EMAIL="op")
            git = lambda *a: subprocess.run(["git", "-C", str(repo), *a], env=env, capture_output=True, check=True)
            git("init", "-q", "-b", "feat/x"); (repo / "a").write_text("1"); git("add", "a"); git("commit", "-qm", SECRET[3])
            live_fleet.WS, live_fleet.HOUSE, live_fleet.LABTEST = root, house, lt
            live_fleet.LABQA, live_fleet.OP_REPO = root / "qa", repo
            f = live_fleet.Fleet(feed / "fleet-state.json", CT)
            ev = f.scan()
            self.assertEqual([e for e in ev if e["kind"].startswith(("op_", "cos_"))], [])   # first read: silent seed
            # now things change
            time.sleep(1.1)
            rw.write_text(json.dumps({"polled_at": "2026-10-08T18:20:00+00:00", "deploys": [
                dep("aaaa1111", "REMOVED", True), dep("bbbb2222", "BUILDING", True), dep("cccc3333", "SUCCESS", False)]}))
            (repo / "a").write_text("2"); git("commit", "-qam", SECRET[2])
            (house / "watchers/merge-queue.md").write_text("- [x] app #1 abcdef1\n- [!] app #2 abcdef2\n")
            (house / "triager-notes/POS-77-free-text-slug.md").write_text(SECRET[1])
            (lt / "ai/run.json").write_text(json.dumps({"passed": 5, "failed": 2, "notes": SECRET[0]}))
            ev = [e for e in f.scan() if e["kind"].startswith(("op_", "cos_")) or e.get("source") == "labtest/run"]
            got = sorted((e["kind"], e["label"]) for e in ev)
            self.assertIn(("op_deploy", "deploy app-project · production · REMOVED"), got)
            self.assertIn(("op_deploy", "deploy app-project · production · BUILDING"), got)
            self.assertNotIn("cccc3333", json.dumps(ev))                      # GitHub-triggered: not the Operator's
            self.assertEqual(sum(k == "op_commit" for k, _ in got), 1)
            self.assertIn(("cos_file", "merge-queue · 1 pass / 1 fail / 0 open"), got)
            self.assertIn(("cos_file", "triager note POS-77"), got)
            self.assertIn(("lab_run", "test run, 5 pass / 2 fail"), got)
            for e in ev:
                self.assertIn(e["from"], ("Operator", "Coord"))
            blob = json.dumps(ev) + (feed / "fleet-state.json").read_text()
            for s in SECRET + ["free-text-slug", str(root)]:
                self.assertNotIn(s, blob)
            fs = f.fleet_state([], now=time.time())
            self.assertTrue(fs["seats"]["Coord"]["active"] and fs["seats"]["Operator"]["active"])
            n = len(f.scan())
            self.assertEqual(len(f.scan()), n)                                  # no change -> nothing new
            f2 = live_fleet.Fleet(feed / "fleet-state.json", CT); f2.scan()   # restart, no change:
            self.assertTrue(f2.fleet_state([], now=time.time())["seats"]["Operator"]["active"])   # still active


class CloudAgentsTest(unittest.TestCase):
    def test_tail_seed_fields_and_state(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            log = root / "fleet" / "cloud-agents.jsonl"
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            line = lambda **k: json.dumps(k) + "\n"
            log.write_text(line(t_ct=iso(now - 7200), by="Operator", action="launch", agent="bc-old00001", repo="example-org/x", tag="old")
                           + line(t_ct=iso(now - 60), by="Operator", action="reply", agent="bc-22222222",
                                  repo="example-org/app", tag="assistant-plugin PR1+PR4", prompt=SECRET[3]))
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            ev = [e for e in f.scan() if e["kind"].startswith("cloud_")]
            self.assertEqual([(e["from"], e["to"], e["label"]) for e in ev],
                             [("Operator", "CloudAgents", "reply · assistant-plugin PR1+PR4 · app")])   # old line seeded
            self.assertNotIn(SECRET[3], json.dumps(ev) + (root / "feed/fleet-state.json").read_text())   # extra fields ignored
            cs = f.cloud_state([], now)
            self.assertTrue(cs["active"]); self.assertEqual(cs["open_agents"], ["bc-22222222", "bc-old00001"])
            with open(log, "a") as fh:   # finished + a partial line still being written
                fh.write(line(t_ct=iso(now), by="Operator", action="finished", agent="bc-22222222", repo="example-org/app", tag="done")
                         + line(t_ct=iso(now), by="Operator", action="finished", agent="bc-old00001", repo="example-org/x", tag="x")
                         + '{"t_ct": "' + iso(now))
            ev = [e for e in f.scan() if e["kind"] == "cloud_finished"]
            self.assertEqual(sorted((e["from"], e["to"]) for e in ev), [("CloudAgents", "Operator")] * 2)
            self.assertFalse(f.cloud_state([], now)["active"])
            gh = [{"src_file": "github-api", "from": "CloudAgents", "t_ct": iso(now - 120)}]
            self.assertTrue(f.cloud_state(gh, now)["active"])                 # cursoragent on GitHub < 15 min
            self.assertNotIn("CloudAgents", f.fleet_state(gh, now)["seats"])     # not one of the counted bots
            self.assertTrue(f.fleet_state(gh, now)["cloud"]["active"])


class PromptsTest(unittest.TestCase):
    def test_tail_dedupe_seats_and_active(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            log = root / "fleet" / "prompts.jsonl"
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            line = lambda t, to, **k: json.dumps(dict(t_ct=iso(t), to=to, **{"from": "Lead"}, **k)) + "\n"
            dup = line(now - 300, "Operator")
            log.write_text(line(now - 3 * 86400, "Reviewer") + line(now - 360, "Operator", text=SECRET[3]) + dup + dup)
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            ev = [e for e in f.scan() if e["kind"] == "prompt_message"]
            self.assertEqual([(e["from"], e["to"], e["label"]) for e in ev], [("Lead", "Operator", "message")] * 2)  # old seeded, dup once
            self.assertNotIn(SECRET[3], json.dumps(ev) + (root / "feed/fleet-state.json").read_text())   # text never read in
            st = f.fleet_state([], now)["seats"]
            # sender (Lead) is not a counted bot; target Operator is working (spinner) until they act
            self.assertTrue(st["Operator"]["working"]); self.assertFalse(st["Reviewer"]["active"])
            with open(log, "a") as fh:
                fh.write(dup + line(now, "Coordinator") + line(now, "QA two") + line(now, "qa-one")
                         + line(now - 1, "QA") + line(now, "Growth") + line(now, "nobody")
                         + json.dumps({"t_ct": iso(now), "from": "Reviewer", "to": "Tester"}) + "\n" + '{"t_ct": "')
            ev = sorted((e["from"], e["to"]) for e in f.scan() if e["kind"] == "prompt_message" and _ts(e["t_ct"]) >= now - 5)
            self.assertEqual(ev, [("Lead", "Coord"), ("Lead", "Others"), ("Lead", "Others"),
                                  ("Lead", "QA"), ("Lead", "QA"), ("Lead", "QA"), ("Reviewer", "Tester")])  # any seat; dup skipped
            st = f.fleet_state([], now)["seats"]
            self.assertTrue(st["Coord"]["working"] and st["QA"]["working"] and st["Reviewer"]["active"] and st["Tester"]["working"])
            self.assertFalse(st["Tester"]["active"])  # working spinner != active count


class WorkingSpinnerTest(unittest.TestCase):
    def test_prompt_and_cloud_spinners(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            (root / "fleet" / "prompts.jsonl").write_text(
                json.dumps({"t_ct": iso(now - 60), "from": "Lead", "to": "Operator", "text": SECRET[3]}) + "\n"
                + json.dumps({"t_ct": iso(now - 30), "from": "Operator", "to": "Builder"}) + "\n")
            (root / "fleet" / "cloud-agents.jsonl").write_text(
                json.dumps({"t_ct": iso(now - 120), "by": "Operator", "action": "launch", "agent": "bc-spin0001",
                            "repo": "example-org/x", "tag": "spin"}) + "\n")
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            list(f.scan())
            fs = f.fleet_state([], now)
            self.assertTrue(fs["seats"]["Builder"]["working"])          # unanswered Operator -> Builder
            # Operator answered Lead's prompt (sent + cloud by): no longer 'prompt'; it SENT a pulse 30 s ago, so the
            # fail-safe rule keeps it working (via pulse) for 10 min after that, then it stops
            self.assertEqual(fs["seats"]["Operator"]["working_via"], "pulse")
            self.assertFalse(f.fleet_state([], now + 11 * 60)["seats"]["Operator"]["working"])
            self.assertTrue(fs["cloud"]["working"] and fs["working"]["CloudAgents"]["via"] == "cloud")
            self.assertEqual(fs["active"], sum(1 for v in fs["seats"].values() if v["active"]))  # working not counted
            self.assertNotIn(SECRET[3], json.dumps(fs) + (root / "feed/fleet-state.json").read_text())
            # seat activity after the prompt clears Builder spinner
            gh = [{"src_file": "github-api", "from": "Builder", "t_ct": iso(now - 5)}]
            self.assertFalse(f.fleet_state(gh, now)["seats"]["Builder"]["working"])


    def test_pr_check_spinner(self):
        """Open PR with failing/queued check in the last 30 min spins the author; merge clears it."""
        iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
        now = time.time()
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / "feed").mkdir()
            live_fleet.WS = root
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            feed = [
                {"id": "example-org/x#7:open", "kind": "pr_open", "from": "Builder", "to": "GitHub",
                 "repo": "example-org/x", "number": 7, "t_ct": iso(now - 600)},
                {"id": "example-org/x#7:commit:abc", "kind": "pr_commit", "from": "Others", "to": "GitHub",
                 "repo": "example-org/x", "number": 7, "sha": "abc1234deadbeef", "t_ct": iso(now - 300)},
                {"id": "example-org/x:checkrun:1", "kind": "check_run", "from": "GitHub", "to": "GitHub",
                 "repo": "example-org/x", "sha": "abc1234deadbeef", "status": "completed",
                 "conclusion": "failure", "label": "test failure", "t_ct": iso(now - 120)},
            ]
            w = f.working_state(feed, now)
            self.assertEqual(w["Builder"]["via"], "check")
            self.assertIn("#7", w["Builder"]["pr"])
            # merge clears
            feed.append({"id": "example-org/x#7:merged", "kind": "merged", "from": "Builder", "to": "GitHub",
                         "repo": "example-org/x", "number": 7, "t_ct": iso(now - 60)})
            self.assertNotIn("Builder", f.working_state(feed, now))
            # success check does not spin
            feed2 = [e for e in feed if e["kind"] != "merged" and e["kind"] != "check_run"]
            feed2.append({"id": "example-org/x:checkrun:2", "kind": "check_run", "from": "GitHub", "to": "GitHub",
                          "repo": "example-org/x", "sha": "abc1234deadbeef", "status": "completed",
                          "conclusion": "success", "label": "ok", "t_ct": iso(now - 30)})
            self.assertNotIn("Builder", f.working_state(feed2, now))


if __name__ == "__main__":
    unittest.main()


class LocalActivityTest(unittest.TestCase):
    """fleet/activity.jsonl on the box (Operator background work): start without a later end = working, 60 min cap,
    not counted in N of M, only t_ct/seat/kind/action/tag read."""
    def test_operator_working_from_local_lines(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            log = root / "fleet" / "activity.jsonl"
            L = lambda t, **k: json.dumps({"t_ct": iso(t), **k}) + "\n"
            log.write_text(L(now - 30, seat="Operator", kind="subagent", action="start", tag="railway-collector", text=SECRET[3])
                           + L(now - 2 * 3600, seat="Tester", kind="turn", action="start", tag="old")      # > 60 min: expired
                           + L(now - 20, seat="Nobody", kind="turn", action="start")                      # unknown seat
                           + "not json\n")
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            f.scan()
            fs = f.fleet_state([], now)
            self.assertTrue(fs["seats"]["Operator"]["working"]); self.assertEqual(fs["seats"]["Operator"]["working_via"], "subagent")
            self.assertFalse(fs["seats"]["Operator"]["active"]); self.assertEqual(fs["active"], 0)   # not in N of M
            self.assertFalse(fs["seats"]["Tester"]["working"])
            self.assertNotIn(SECRET[3], (root / "feed/fleet-state.json").read_text())
            with open(log, "a") as fh:
                fh.write(L(now - 5, seat="Operator", kind="subagent", action="end", tag="railway-collector"))
            f.scan()
            self.assertFalse(f.fleet_state([], now)["seats"]["Operator"]["working"])
            with open(log, "a") as fh:            # a start older than 60 min with no end stops counting
                fh.write(L(now - 61 * 60, seat="Operator", kind="turn", action="start", tag="t1"))
            f.scan()
            self.assertFalse(f.fleet_state([], now)["seats"]["Operator"]["working"])
            f2 = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)    # state survives a restart (offset kept)
            with open(log, "a") as fh:
                fh.write(L(now - 1, seat="Operator", kind="turn", action="start", tag="t2"))
            f2.scan()
            self.assertTrue(f2.fleet_state([], now)["seats"]["Operator"]["working"])


class PulseWorkingTest(unittest.TestCase):
    """Fail-safe working from prompts.jsonl pulses a seat SENT (10 min), names normalized; gap flag missing_activity."""
    def test_pulse_working_and_missing_activity(self):
        self.assertEqual([live_fleet.seat_of(n) for n in ("Coordinator", "Lab Tester: Tester", "operator", "Coord",
                          "QA", "nobody", "")], ["Coord", "Tester", "Operator", "Coord", "QA", None, None])
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            P = lambda t, frm, to: json.dumps({"t_ct": iso(t), "from": frm, "to": to, "text": SECRET[3]}) + "\n"
            (root / "fleet" / "prompts.jsonl").write_text(
                P(now - 3 * 60, "Coordinator", "Operator") + P(now - 30 * 60, "Lab Tester: Tester", "Operator")
                + P(now - 2 * 60, "Operator", "Reviewer"))
            (root / "fleet" / "activity.jsonl").write_text(
                json.dumps({"t_ct": iso(now - 5 * 60), "seat": "Operator", "kind": "turn", "action": "end", "tag": "x"}) + "\n")
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            f.scan()
            fs = f.fleet_state([], now)
            self.assertEqual(fs["working"]["Coord"]["via"], "pulse"); self.assertTrue(fs["seats"]["Coord"]["working"])
            self.assertFalse(fs["seats"]["Tester"]["working"])              # its pulse is 30 min old (> 10 min)
            self.assertTrue(fs["seats"]["Operator"]["working"])            # sent a pulse 2 min ago
            # gap flag: pulsed within 60 min but no activity.jsonl line in it (Operator has one)
            self.assertEqual(fs["missing_activity"], ["Coord", "Tester"])
            self.assertNotIn(SECRET[3], (root / "feed/fleet-state.json").read_text())
            # 11 min later Coord is no longer working from the pulse alone
            self.assertFalse(f.fleet_state([], now + 11 * 60)["seats"]["Coord"]["working"])


class RemoteActivityTest(unittest.TestCase):
    """fleet/remote-activity.jsonl (pulled from POST /activity) drives Builder like prompts / cloud-agents lines."""
    def test_builder_cloud_own_node(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            (root / "fleet" / "remote-activity.jsonl").write_text(
                json.dumps({"t_ct": iso(now - 20), "seat": "Builder-cloud", "kind": "turn", "action": "start", "tag": "x"}) + "\n")
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            f.scan()
            fs = f.fleet_state([], now)
            self.assertTrue(fs["seats"]["Builder-cloud"]["active"]); self.assertTrue(fs["seats"]["Builder-cloud"]["working"])
            self.assertFalse(fs["seats"]["Builder"]["active"])   # its own node, not folded into Builder
            self.assertEqual(fs["total"], 7)

    def test_builder_active_and_working(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "fleet").mkdir(); (root / "feed").mkdir()
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "q"
            iso = lambda t: datetime.fromtimestamp(t, CT).replace(microsecond=0).isoformat()
            now = time.time()
            log = root / "fleet" / "remote-activity.jsonl"
            L = lambda t, **k: json.dumps({"t_ct": iso(t), "seat": "Builder", **k}) + "\n"
            log.write_text(L(now - 3 * 86400, kind="turn", action="start")             # old history: seeds, no spinner
                           + L(now - 20, kind="turn", action="start", tag="pr-202", text=SECRET[3])
                           + json.dumps({"t_ct": iso(now), "seat": "Reviewer", "kind": "turn", "action": "start"}) + "\n")
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            f.scan()
            st = f.fleet_state([], now)["seats"]
            self.assertTrue(st["Builder"]["active"]); self.assertEqual(st["Builder"]["via"], "activity")
            self.assertTrue(st["Builder"]["working"]); self.assertEqual(st["Builder"]["working_via"], "turn")
            self.assertFalse(st["Reviewer"]["active"] or st["Reviewer"]["working"])   # seat comes from the key only
            self.assertNotIn(SECRET[3], (root / "feed/fleet-state.json").read_text())
            with open(log, "a") as fh:
                fh.write(L(now - 10, kind="turn", action="end", tag="pr-202"))
            f.scan()
            st = f.fleet_state([], now)["seats"]
            self.assertTrue(st["Builder"]["active"]); self.assertFalse(st["Builder"]["working"])
            # prompt received: Lead -> Builder message, Builder working until it acts again
            with open(log, "a") as fh:
                fh.write(L(now - 5, kind="prompt", action="received"))
            ev = [e for e in f.scan() if e["kind"] == "prompt_message" and e["source"] == "remote/activity"]
            self.assertEqual([(e["from"], e["to"], e["label"]) for e in ev], [("Lead", "Builder", "message")])
            fs = f.fleet_state([], now)
            self.assertTrue(fs["seats"]["Builder"]["working"]); self.assertEqual(fs["working"]["Builder"]["via"], "prompt")
            with open(log, "a") as fh:
                fh.write(L(now - 2, kind="turn", action="end"))
            f.scan()
            self.assertFalse(f.fleet_state([], now)["seats"]["Builder"]["working"])   # Builder acted after the prompt
            # cloud_agent: exactly a cloud-agents line with by=Builder
            with open(log, "a") as fh:
                fh.write(L(now - 1, kind="cloud_agent", action="launch", agent="bc-1234abcd", tag="pr-202"))
            ev = [e for e in f.scan() if e["kind"] == "cloud_launch"]
            self.assertEqual([(e["from"], e["to"], e["by"]) for e in ev], [("Builder", "CloudAgents", "Builder")])
            fs = f.fleet_state([], now)
            self.assertTrue(fs["cloud"]["working"]); self.assertIn("bc-1234abcd", fs["cloud"]["open_agents"])
            # subagent start with a target emits a hop; open subagent keeps Builder working
            with open(log, "a") as fh:
                fh.write(L(now, kind="subagent", action="start", agent="sub-1", to="Reviewer"))
            ev = [e for e in f.scan() if e["kind"] == "subagent_start"]
            self.assertEqual([(e["from"], e["to"]) for e in ev], [("Builder", "Reviewer")])
            self.assertEqual(f.fleet_state([], now)["working"]["Builder"]["via"], "subagent")
            # stale open items stop spinning after 30 min
            self.assertFalse(f.fleet_state([], now + 31 * 60)["seats"]["Builder"]["working"])


class LabWorkTest(unittest.TestCase):
    """Tester / QA working while their lab trees change (mtimes only) or processes inside them burn CPU."""
    def test_files_and_busy_processes(self):
        import os, subprocess, sys
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "feed").mkdir(); (root / "fleet").mkdir()
            run = root / "qa" / "runs" / "mq-abc123" / "src"; run.mkdir(parents=True)
            art = root / "private" / "qa-artifacts" / "lab-qa-one" / "deep"; art.mkdir(parents=True)
            (root / "qa" / "runs" / "mq-abc123" / "node_modules").mkdir()
            live_fleet.WS, live_fleet.OP_REPO = root, root / "none"
            live_fleet.HOUSE, live_fleet.LABTEST, live_fleet.LABQA = root / "h", root / "l", root / "qa"
            secret = art / "result.txt"; secret.write_text(SECRET[3])
            now = time.time()
            old = now - 3600
            for p in [run / "a.test.ts", art.parent, art, secret, run, run.parent, run.parent / "node_modules"]:
                if p.is_file() or not p.exists(): p.write_text("x") if not p.exists() else None
            for dp, dn, fn in os.walk(root):
                for n in dn + fn: os.utime(os.path.join(dp, n), (old, old))
            f = live_fleet.Fleet(root / "feed" / "fleet-state.json", CT)
            f.scan()
            fs = f.fleet_state([], now)
            self.assertFalse(fs["seats"]["Tester"]["working"] or fs["seats"]["QA"]["working"])   # stale trees
            # a file deep in the run changes -> Tester working via files; node_modules churn alone would not count
            os.utime(run / "a.test.ts", (now - 30, now - 30))
            f.scan(); fs = f.fleet_state([], now)
            self.assertTrue(fs["seats"]["Tester"]["working"]); self.assertEqual(fs["working"]["Tester"]["via"], "files")
            self.assertTrue(fs["seats"]["Tester"]["active"])
            self.assertFalse(f.fleet_state([], now + 151)["seats"]["Tester"]["working"])        # clears after 150 s
            # QA: a change deep inside an old private artifact tree (stat only, contents never read)
            os.utime(secret, (now - 10, now - 10))
            f.scan(); fs = f.fleet_state([], now)
            self.assertTrue(fs["seats"]["QA"]["working"])
            self.assertNotIn(SECRET[3], (root / "feed" / "fleet-state.json").read_text())
            self.assertNotIn("result.txt", (root / "feed" / "fleet-state.json").read_text())
            # busy process inside the run (writes nothing): working via run, held 120 s; not active, not in N of M
            for p in [run / "a.test.ts"]: os.utime(p, (old, old))
            f.work["files"] = {}; f.seat_mtime = {}
            f.scan()                                  # baseline CPU
            busy = subprocess.Popen([sys.executable, "-c", "import time\nt=time.time()\nwhile time.time()-t<20: pass"], cwd=run)
            idle = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], cwd=run)   # idle: no CPU
            try:
                time.sleep(2.5)
                f.scan(); t = time.time()
                busy.kill(); busy.wait()
                fs = f.fleet_state([], t)
                self.assertTrue(fs["seats"]["Tester"]["working"]); self.assertEqual(fs["working"]["Tester"]["via"], "run")
                self.assertFalse(fs["seats"]["Tester"]["active"]); self.assertEqual(fs["active"], 1)   # QA (files) only
                f.scan()                              # only the idle process left: stays lit for the hold, then clears
                self.assertTrue(f.fleet_state([], time.time())["seats"]["Tester"]["working"])
                self.assertFalse(f.fleet_state([], t + 121)["seats"]["Tester"]["working"])
            finally:
                idle.kill(); idle.wait()


class FleetSeatsConfig(unittest.TestCase):
    def test_list_replaces_the_counted_seats(self):
        seats, fold, board = live_fleet.load_seat_config('["Alpha","Beta"]')
        self.assertEqual((seats, fold, board), (["Alpha", "Beta"], {}, ["Alpha", "Beta"]))
        old = live_fleet.SEATS, live_fleet.BOARD, live_fleet.BOARD_SEATS
        live_fleet.SEATS, live_fleet.BOARD, live_fleet.BOARD_SEATS = seats, fold, board
        try:
            with tempfile.TemporaryDirectory() as d:
                f = live_fleet.Fleet(Path(d) / "state.json", CT)
                now = time.time()
                ev = {"src_file": "github-api", "from": "Alpha", "t_ct": datetime.fromtimestamp(now, CT).isoformat()}
                fs = f.fleet_state([ev], now=now)
            self.assertEqual(fs["total"], 2)
            self.assertEqual(list(fs["seats"]), ["Alpha", "Beta"])
            self.assertTrue(fs["seats"]["Alpha"]["active"])
            self.assertFalse(fs["seats"]["Beta"]["active"])
        finally:
            live_fleet.SEATS, live_fleet.BOARD, live_fleet.BOARD_SEATS = old

    def test_bad_json_keeps_the_example_list(self):
        seats, fold, board = live_fleet.load_seat_config("{not json")
        self.assertEqual(board, ["Builder", "Builder-cloud", "Reviewer", "Tester", "QA", "Operator", "Coord"])
        self.assertEqual(fold, {"QaOne": "QA", "QaTwo": "QA"})
        self.assertIn("QaOne", seats)
