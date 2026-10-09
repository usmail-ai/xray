import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeed } from './delta.mjs';

test('delta base mismatch is 409 and a current since is 304', () => {
  const feed = createFeed('epoch');
  feed.ingestFull({ generated_at: '2026-10-09T14:00:00Z', events: [{ id: 'a', t_ct: '2026-10-09T14:00:00Z' }] });
  const cur = feed.cursor();
  assert.equal(feed.since(cur).status, 304);
  const mismatch = feed.ingestDelta({ base: 'other.0', header: {}, upsert: [], remove: [] });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.cursor, cur);
  assert.equal(feed.since('epoch.0').status, 200);
  const delta = feed.since('epoch.0');
  assert.equal(delta.body.events.length, 1);
  assert.equal(feed.ingestDelta({
    base: cur,
    header: { generated_at: '2026-10-09T14:01:00Z' },
    upsert: [{ id: 'b', t_ct: '2026-10-09T14:01:00Z' }],
    remove: [],
  }), null);
  assert.equal(feed.since(cur).status, 200);
  assert.deepEqual(feed.since(cur).body.events.map((e) => e.id), ['b']);
  assert.equal(feed.since(feed.cursor()).status, 304);
});
