"""Per-seat inbox routing, dedupe, trim, schema, and waveboard debounce."""
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import inbox
import waveboard


NOW = datetime(2026, 10, 9, 18, 0, tzinfo=timezone.utc)
SHA = "a" * 40
SHA_B = "b" * 40


def quiet_roles():
    roles = inbox.default_roles()
    roles["seats"]["cos"]["stalls"] = False
    roles["seats"]["cos"]["watcher_gaps"] = False
    return roles


def event(eid, kind, **extra):
    hints = extra.pop("hints", {})
    row = {
        "id": eid,
        "t_ct": extra.pop("t_ct", "2026-10-09T17:30:00+00:00"),
        "kind": kind,
        "repo": extra.pop("repo", "org/repo"),
        "number": extra.pop("number", 1),
        "label": extra.pop("label", kind),
        "source": extra.pop("source", "https://github.com/org/repo/pull/1"),
    }
    if hints:
        row["_inbox"] = hints
    row.update(extra)
    return row


def read_lines(path):
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class Route(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.roles = quiet_roles()

    def deliver(self, new, all_events=None, roles=None, activity=None):
        return inbox.deliver(
            new, all_events if all_events is not None else new,
            self.root, roles or self.roles, NOW, activity if activity is not None else [])

    def test_critic_gets_new_and_updated_prs_only(self):
        self.deliver([
            event("org/repo#1:open", "pr_open", hints={"title": "add route", "sha": SHA, "base": "main"}),
            event("org/repo#1:push:abcd", "pr_update", hints={"title": "add route", "sha": SHA, "base": "main"}),
            event("org/repo#1:merged", "merged", hints={"title": "add route", "sha": SHA, "base": "main"}),
        ])
        kinds = [line["type"] for line in read_lines(self.root / "critic.jsonl")]
        self.assertEqual(kinds, ["pr_open", "pr_update"])
        self.assertFalse((self.root / "chaos.jsonl").exists())

    def test_arch1_needs_critic_pass_and_green_ci_on_the_same_sha(self):
        passed = event("org/repo#1:critic", "critic_pass", hints={"sha": SHA, "title": "add route"})
        green = event("org/repo#1:ci", "ci_pass", hints={"sha": SHA, "title": "add route"})
        self.deliver([passed, green])
        ready = read_lines(self.root / "arch1.jsonl")
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0]["reason"], "critic pass and green ci")
        self.assertEqual(ready[0]["sha"], SHA)
        self.assertEqual(ready[0]["seat"], "arch1")
        other = Path(tempfile.mkdtemp())
        inbox.deliver([
            event("org/repo#2:critic", "critic_pass", number=2, hints={"sha": SHA, "title": "other"}),
            event("org/repo#2:ci", "ci_pass", number=2, hints={"sha": SHA_B, "title": "other"}),
        ], directory=other, roles=self.roles, now=NOW, activity=[])
        self.assertFalse((other / "arch1.jsonl").exists())
        blocked = Path(tempfile.mkdtemp())
        inbox.deliver([
            event("org/repo#3:critic", "critic_pass", number=3, hints={"sha": SHA, "title": "blocked"}),
            event("org/repo#3:ci", "ci_pass", number=3, t_ct="2026-10-09T17:00:00+00:00", hints={"sha": SHA, "title": "blocked"}),
            event("org/repo#3:ci-fail", "ci_fail", number=3, t_ct="2026-10-09T17:40:00+00:00", hints={"sha": SHA, "title": "blocked"}),
        ], directory=blocked, roles=self.roles, now=NOW, activity=[])
        self.assertFalse((blocked / "arch1.jsonl").exists())

    def test_chaos_gets_merges_to_develop_only(self):
        self.deliver([
            event("org/repo#4:merged", "merged", number=4, hints={"base": "develop", "sha": SHA, "title": "lab"}),
            event("org/repo#5:merged", "merged", number=5, hints={"base": "main", "sha": SHA_B, "title": "lab"}),
        ])
        lines = read_lines(self.root / "chaos.jsonl")
        self.assertEqual([line["id"] for line in lines], ["org/repo#4:merged"])
        self.assertEqual(lines[0]["reason"], "merge to develop")

    def test_operator_and_cos_match_labels_and_mentions_without_storing_text(self):
        secret = "SECRET_BODY"
        self.deliver([
            event("org/repo:deploy:1", "deploy", number=0, hints={"sha": SHA, "title": "deploy", "name": "production"}),
            event("org/repo:deploy:2", "deploy_pending", number=0, hints={"sha": SHA, "title": "hold", "hold": True}),
            event("org/repo!8:open", "issue_open", number=8, source="https://github.com/org/repo/issues/8",
                  hints={"title": "flaky suite", "labels": ["lab"]}),
            event("org/repo!9:comment:1", "comment", number=9, source="https://github.com/org/repo/issues/9",
                  hints={"title": "note", "text": f"please railway this {secret}"}),
            event("org/repo!10:comment:2", "comment", number=10, hints={"title": "thanks", "text": "thanks"}),
            event("org/repo!11:open", "issue_open", number=11, hints={"title": "choice", "labels": ["needs-decision"]}),
            event("org/repo!12:comment:3", "comment", number=12, hints={"title": "ask", "text": "ask Blaze"}),
        ])
        operator = read_lines(self.root / "operator.jsonl")
        reasons = [line["reason"] for line in operator]
        self.assertEqual(reasons, [
            "railway deploy", "railway hold", "lab issue", "asks for railway, lab, or cloud agents",
        ])
        blob = (self.root / "operator.jsonl").read_text(encoding="utf-8")
        self.assertNotIn(secret, blob)
        self.assertNotIn("body", blob)
        cos = [line["reason"] for line in read_lines(self.root / "cos.jsonl")]
        self.assertEqual(cos, ["needs decision", "needs decision"])

    def test_dedupe_and_trim(self):
        row = event("org/repo#1:open", "pr_open", hints={"title": "add route", "sha": SHA})
        self.deliver([row])
        self.deliver([row])
        self.assertEqual(len(read_lines(self.root / "critic.jsonl")), 1)
        old = {
            "id": "old", "t_ct": "2020-01-01T00:00:00+00:00", "seat": "critic", "type": "pr_open",
            "repo": "org/repo", "number": 1, "title": "old", "url": "https://github.com/org/repo/pull/1",
            "reason": "new or updated pr",
        }
        path = self.root / "critic.jsonl"
        path.write_text(json.dumps(old) + "\n" + path.read_text(encoding="utf-8"), encoding="utf-8")
        inbox.trim_inbox(self.root, NOW, 7)
        ids = [line["id"] for line in read_lines(path)]
        self.assertEqual(ids, ["org/repo#1:open"])

    def test_stall_and_watcher_gap(self):
        roles = quiet_roles()
        roles["seats"]["cos"]["stalls"] = True
        roles["stall_hours"] = 6
        opened = event("org/repo#6:open", "pr_open", number=6, t_ct="2026-10-09T10:00:00+00:00",
                       hints={"title": "quiet", "sha": SHA})
        inbox.deliver([], [opened], self.root, roles, NOW, [])
        stalls = read_lines(self.root / "cos.jsonl")
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["type"], "stall")
        self.assertTrue(stalls[0]["id"].startswith("stall:org/repo#6:"))
        roles["seats"]["cos"]["stalls"] = False
        roles["seats"]["cos"]["watcher_gaps"] = True
        roles["watcher_seats"] = ["critic"]
        gap_dir = Path(tempfile.mkdtemp())
        recent = {"t_ct": "2026-10-09T17:00:00+00:00", "seat": "critic", "kind": "watcher", "tag": "repos"}
        inbox.deliver([], [], gap_dir, roles, NOW, [recent])
        self.assertFalse((gap_dir / "cos.jsonl").exists())
        inbox.deliver([], [], gap_dir, roles, NOW, [])
        gaps = read_lines(gap_dir / "cos.jsonl")
        self.assertEqual([line["type"] for line in gaps], ["watcher_gap"])
        self.assertEqual(gaps[0]["reason"], "watcher gap")

    def test_schema_examples_have_no_body(self):
        schema = json.loads((Path(inbox.__file__).parent / "inbox.schema.json").read_text(encoding="utf-8"))
        required = schema["required"]
        self.assertNotIn("sha", required)
        self.assertTrue(schema["additionalProperties"] is False)
        banned = ("body", "text", "message", "secret")
        for line in schema["examples"]:
            self.assertTrue(set(required) <= set(line))
            self.assertFalse(set(line) - set(schema["properties"]))
            blob = json.dumps(line).casefold()
            for word in banned:
                self.assertNotIn(word, blob)


class Wave(unittest.TestCase):
    def test_debounce_and_a_failure_does_not_escape(self):
        calls = []

        def runner(cmd, env, timeout, check, capture_output):
            calls.append(env)
            if len(calls) == 2:
                raise RuntimeError("builder down")

        clock = {"n": 0.0}
        board = waveboard.Waveboard(
            "/workspace/0xray-fleet/house/watchers/build_waveboard.py",
            debounce_s=60, clock=lambda: clock["n"], runner=runner)
        parent = {"GITHUB_TOKEN": "write-token", "GITHUB_READ_TOKEN": "read-token", "GH_TOKEN": "write-token"}
        self.assertEqual(board.run(env=parent), "ran")
        clock["n"] = 30
        self.assertEqual(board.run(env=parent), "skipped")
        self.assertEqual(len(calls), 1)
        clock["n"] = 60
        self.assertEqual(board.run(env={"GH_TOKEN": "write-token", "GITHUB_APP_PRIVATE_KEY_PATH": "/key.pem"}), "failed")
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["GITHUB_TOKEN"], "read-token")
        self.assertEqual(calls[0]["GH_TOKEN"], "read-token")
        self.assertEqual(calls[0]["BURST_GITHUB_READONLY"], "1")
        self.assertNotIn("GITHUB_APP_PRIVATE_KEY_PATH", calls[1])
        self.assertNotIn("GH_TOKEN", calls[1])
        bare = waveboard.read_only_env({"GITHUB_APP_PRIVATE_KEY": "secret", "PATH": "/usr/bin"})
        self.assertNotIn("GITHUB_APP_PRIVATE_KEY", bare)
        self.assertEqual(bare["PATH"], "/usr/bin")
