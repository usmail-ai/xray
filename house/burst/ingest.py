#!/usr/bin/env python3
"""Accept one Burst delta and append it to the box ledger.

The secret arrives in the X-Burst-Ingest header. It is never logged and never
read from a URL. A base that is not the feed cursor is 409.
"""
from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HEADER = "X-Burst-Ingest"
ALLOWED = {
    "id", "t_ct", "from", "to", "kind", "direction", "label", "source", "src_file", "repo",
}


def secret_ok(got: str | None, secret: str) -> bool:
    if not isinstance(got, str) or not isinstance(secret, str) or not got or not secret:
        return False
    left = got.encode()
    right = secret.encode()
    if len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


def read_cursor(feed_text: str) -> str | None:
    try:
        data = json.loads(feed_text)
    except (TypeError, ValueError):
        return None
    cursor = data.get("cursor") if isinstance(data, dict) else None
    return cursor if isinstance(cursor, str) and cursor else None


def event_ok(event: object) -> bool:
    if not isinstance(event, dict):
        return False
    if any(key not in ALLOWED for key in event):
        return False
    if not isinstance(event.get("id"), str) or not event["id"] or len(event["id"]) > 160:
        return False
    for value in event.values():
        if not isinstance(value, str) or len(value) > 200:
            return False
    return isinstance(event.get("t_ct"), str) and bool(event["t_ct"])


def accept(feed_text: str, header_secret: str | None, body_text: str, secret: str, ledger: Path):
    """Return (status, body). A 204 body is empty. The secret is not copied into body."""
    if not secret_ok(header_secret, secret):
        return 401, {"error": "unauthorized"}
    cursor = read_cursor(feed_text)
    if cursor is None:
        return 409, {"cursor": ""}
    try:
        body = json.loads(body_text)
    except (TypeError, ValueError):
        return 400, {"error": "not json"}
    if not isinstance(body, dict) or body.get("base") != cursor:
        return 409, {"cursor": cursor}
    if body.get("remove"):
        return 400, {"error": "remove is not accepted"}
    upsert = body.get("upsert") or []
    if not isinstance(upsert, list):
        return 400, {"error": "upsert must be a list"}
    clean = []
    for event in upsert:
        if not event_ok(event):
            return 400, {"error": "bad event"}
        clean.append(event)
    if clean:
        ledger.parent.mkdir(parents=True, exist_ok=True)
        with ledger.open("a", encoding="utf-8") as handle:
            for event in clean:
                handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return 204, {}


def serve(feed_path: Path, ledger: Path, secret: str, host: str, port: int) -> None:
    if not secret:
        raise SystemExit(2)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            return

        def do_POST(self) -> None:  # noqa: N802
            path = urlsplit(self.path).path
            if path != "/ingest":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length") or "0")
            if length > 65536:
                self._json(413, {"error": "body too large"})
                return
            raw = self.rfile.read(length).decode("utf-8")
            try:
                feed_text = feed_path.read_text(encoding="utf-8")
            except OSError:
                feed_text = ""
            status, body = accept(feed_text, self.headers.get(HEADER), raw, secret, ledger)
            self._json(status, body)

        def _json(self, status: int, body: dict) -> None:
            if status == 204:
                self.send_response(204)
                self.end_headers()
                return
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    ThreadingHTTPServer((host, port), Handler).serve_forever()


def main() -> None:
    secret = os.environ.get("INGEST_SECRET", "")
    feed = os.environ.get("BURST_FEED_FILE", "")
    if not secret or not feed:
        raise SystemExit(2)
    ledger = Path(os.environ.get("BURST_BOX_EVENTS", str(Path(feed).parent / "box-events.jsonl")))
    host = os.environ.get("BURST_INGEST_HOST", "127.0.0.1")
    port = int(os.environ.get("BURST_INGEST_PORT", "8791"))
    serve(Path(feed), ledger, secret, host, port)


if __name__ == "__main__":
    main()
