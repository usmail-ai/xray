"""The ingest accept path checks the header and the cursor before it stores a line."""
import json
import tempfile
import unittest
from pathlib import Path

from ingest import accept


SECRET = "ingest-test-secret"
EVENT = {
    "id": "box:builder:turn:start:2026-10-09T15:00:00Z",
    "t_ct": "2026-10-09T15:00:00Z",
    "from": "builder",
    "to": "Burst",
    "kind": "turn",
    "direction": "internal",
    "label": "turn start",
    "source": "burst-box",
    "src_file": "box-events.jsonl",
    "repo": "local",
}


class AcceptTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.ledger = Path(self.folder.name) / "box-events.jsonl"
        self.feed = json.dumps({"cursor": "ab12.3", "events": []})

    def tearDown(self):
        self.folder.cleanup()

    def test_wrong_secret_does_not_write(self):
        status, body = accept(self.feed, "nope", json.dumps({"base": "ab12.3", "upsert": [EVENT]}), SECRET, self.ledger)
        self.assertEqual(status, 401)
        self.assertNotIn(SECRET, json.dumps(body))
        self.assertFalse(self.ledger.exists())

    def test_bad_base_is_409_and_returns_the_cursor(self):
        status, body = accept(self.feed, SECRET, json.dumps({"base": "ab12.1", "upsert": [EVENT]}), SECRET, self.ledger)
        self.assertEqual((status, body["cursor"]), (409, "ab12.3"))
        self.assertFalse(self.ledger.exists())

    def test_matching_base_appends_the_event(self):
        body = json.dumps({"base": "ab12.3", "upsert": [EVENT], "remove": []})
        status, payload = accept(self.feed, SECRET, body, SECRET, self.ledger)
        self.assertEqual(status, 204)
        self.assertEqual(payload, {})
        stored = json.loads(self.ledger.read_text())
        self.assertEqual(stored["id"], EVENT["id"])

    def test_free_text_field_is_refused(self):
        dirty = dict(EVENT)
        dirty["message"] = "hello"
        status, _body = accept(
            self.feed, SECRET, json.dumps({"base": "ab12.3", "upsert": [dirty]}), SECRET, self.ledger,
        )
        self.assertEqual(status, 400)
        self.assertFalse(self.ledger.exists())


if __name__ == "__main__":
    unittest.main()
