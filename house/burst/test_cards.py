"""Packet parsing, amber cards, idle watchers, stall routing, the 24h drop, debounce."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import cards


NOW = datetime(2026, 10, 9, 18, 0, tzinfo=timezone.utc)
BLOCK = """
Notes before.

## Packet
- goal: Ship the gate
- constraints: No extra GitHub calls. See https://github.com/org/repo/pull/1 and https://evil.example/secret
- path: house/burst
- acceptance: Tests pass
- evidence: pending
- next owner: reviewer
- escalate: coordinator

## Other
ignore me
"""
LINE = (
    "goal: Ship the gate · constraints: read only · path: house/burst · "
    "acceptance: Tests pass · evidence: pending · next owner: reviewer · escalate: coordinator"
)


def _open(when: datetime, **extra):
    event = {
        "id": "org/repo#1:open",
        "t_ct": when.isoformat(timespec="seconds"),
        "kind": "pr_open",
        "from": "builder",
        "to": "GitHub",
        "repo": "org/repo",
        "number": 1,
        "label": "opened",
        "source": "https://github.com/org/repo/pull/1",
    }
    event.update(extra)
    return event


class PacketParse(unittest.TestCase):
    def test_block_and_single_line(self):
        block = cards.parse_packet(BLOCK)
        line = cards.parse_packet(LINE)
        self.assertEqual(block["goal"], "Ship the gate")
        self.assertEqual(block["next_owner"], "reviewer")
        self.assertEqual(block["acceptance"], "Tests pass")
        self.assertIn("https://github.com/org/repo/pull/1", block["constraints"])
        self.assertNotIn("evil.example", block["constraints"])
        self.assertEqual(line["path"], "house/burst")
        self.assertEqual(line["escalate"], "coordinator")
        self.assertEqual(cards.parse_packet("no packet here"), {})
        long = cards.parse_packet("## Packet\n- goal: " + ("a" * 400) + "\n- acceptance: ok\n")
        self.assertEqual(len(long["goal"]), 200)

    def test_missing_acceptance_or_next_owner_is_amber(self):
        partial = _open(NOW - timedelta(minutes=5))
        partial["_inbox"] = {"packet": {"goal": "Ship", "acceptance": "Tests pass"}}
        card = cards.build_cards([partial], now=NOW)[0]
        self.assertTrue(card["amber"])
        self.assertEqual(card["badge"], "no packet")
        self.assertEqual(card["packet"]["evidence"], "opened")
        full = _open(NOW - timedelta(minutes=5))
        full["_inbox"] = {"text": LINE}
        ready = cards.build_cards([full], now=NOW)[0]
        self.assertFalse(ready["amber"])
        self.assertEqual(ready["badge"], "packet")
        self.assertEqual(ready["packet"]["evidence"], "opened")


class Beats(unittest.TestCase):
    def test_same_second_watcher_is_not_a_beat(self):
        stamp = "2026-10-09T09:02:00-05:00"
        events = [
            {"id": "w-start", "kind": "watcher", "action": "start", "t_ct": stamp, "seat": "builder", "tag": "repos"},
            {"id": "w-end", "kind": "watcher", "action": "end", "t_ct": stamp, "seat": "builder", "tag": "repos"},
            _open(NOW - timedelta(minutes=10)),
        ]
        beats = cards.beats_from(events)
        self.assertEqual([beat["id"] for beat in beats], ["org/repo#1:open"])
        later = "2026-10-09T09:03:00-05:00"
        spanned = [
            {"id": "w-start", "kind": "watcher", "action": "start", "t_ct": stamp, "seat": "builder"},
            {"id": "w-end", "kind": "watcher", "action": "end", "t_ct": later, "seat": "builder"},
        ]
        self.assertEqual(cards.beats_from(spanned), [])


class Board(unittest.TestCase):
    def setUp(self):
        cards._MD_LAST.clear()

    def test_stall_routes_to_the_coordinator_inbox(self):
        quiet = _open(NOW - timedelta(minutes=61))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            inbox_dir = root / "inbox"
            env = {"BURST_INBOX": str(inbox_dir), "BURST_COORDINATOR": "coordinator",
                   "BURST_WAVEBOARD_MD": str(root / "WAVEBOARD.md")}
            feed = {"events": [quiet]}
            with patch.dict(os.environ, env, clear=False):
                first = cards.publish(feed, root, now=NOW, mono=0)
                second = cards.publish(feed, root, now=NOW, mono=30)
            self.assertEqual(first, "wrote")
            self.assertEqual(second, "skipped")
            card = feed["waveboard"]["cards"][0]
            self.assertTrue(card["stall"])
            self.assertEqual(card["state"], "live")
            lines = (inbox_dir / "coordinator.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            stored = json.loads(lines[0])
            self.assertEqual(stored["seat"], "coordinator")
            self.assertEqual(stored["type"], "stall")
            self.assertEqual(stored["reason"], "no beat for 60 minutes")
            self.assertNotIn("_inbox", json.dumps(feed["waveboard"]))

    def test_closed_cards_drop_after_24h(self):
        recent = _open(NOW - timedelta(hours=25))
        recent_close = {
            "id": "org/repo#1:closed",
            "t_ct": (NOW - timedelta(hours=23)).isoformat(timespec="seconds"),
            "kind": "pr_close",
            "from": "builder",
            "repo": "org/repo",
            "number": 1,
            "label": "closed",
            "source": "https://github.com/org/repo/pull/1",
        }
        old_close = dict(recent_close, t_ct=(NOW - timedelta(hours=25)).isoformat(timespec="seconds"))
        self.assertEqual(len(cards.build_cards([recent, recent_close], now=NOW)), 1)
        self.assertEqual(cards.build_cards([recent, old_close], now=NOW), [])

    def test_markdown_debounce_and_pinned_static(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            static = root / "waveboard-static.md"
            static.write_text(
                "### org/repo#9 · Pinned work\n- owner: coordinator\n- stage: open\n- state: live\n"
                "- url: https://github.com/org/repo/issues/9\n- acceptance: stays\n- next owner: coordinator\n",
                encoding="utf-8",
            )
            env = {
                "BURST_INBOX": str(root / "inbox"),
                "BURST_WAVEBOARD_STATIC": str(static),
                "BURST_WAVEBOARD_MD": str(root / "WAVEBOARD.md"),
                "BURST_COORDINATOR": "coordinator",
            }
            feed = {"events": []}
            with patch.dict(os.environ, env, clear=False):
                self.assertEqual(cards.publish(feed, root, now=NOW, mono=0), "wrote")
                written = (root / "WAVEBOARD.md").read_text(encoding="utf-8")
                self.assertEqual(cards.publish(feed, root, now=NOW, mono=30), "skipped")
                self.assertEqual((root / "WAVEBOARD.md").read_text(encoding="utf-8"), written)
                self.assertEqual(cards.publish(feed, root, now=NOW, mono=60), "wrote")
            self.assertIn("org/repo#9", written)
            self.assertIn("pinned", written)
            self.assertEqual(feed["waveboard"]["cards"][0]["pinned"], True)
            self.assertEqual(feed["waveboard"]["cards"][0]["badge"], "packet")


class Schema(unittest.TestCase):
    def test_examples_match_the_card_fields(self):
        schema = json.loads((Path(cards.__file__).parent / "card.schema.json").read_text(encoding="utf-8"))
        self.assertTrue(schema["additionalProperties"] is False)
        required = schema["required"]
        banned = ("body", "secret", "ghs_")
        for line in schema["examples"]:
            self.assertTrue(set(required) <= set(line))
            blob = json.dumps(line).casefold()
            for word in banned:
                self.assertNotIn(word, blob)


if __name__ == "__main__":
    unittest.main()
