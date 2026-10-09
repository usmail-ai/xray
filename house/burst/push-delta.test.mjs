import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsFromActivity, pushDelta } from './push-delta.mjs';

const SECRET = 'ingest-test-secret';
const LINE = JSON.stringify({
  t_ct: '2026-10-09T15:00:00Z',
  seat: 'builder',
  kind: 'turn',
  action: 'start',
  tag: 'burst',
});

function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('activity lines become feed events and free text is not copied', () => {
  const events = eventsFromActivity(`${LINE}\nnot json\n{"seat":"builder"}\n`);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'box:builder:turn:start:2026-10-09T15:00:00Z');
  assert.equal(events[0].from, 'builder');
  assert.equal(events[0].kind, 'turn');
  assert.equal(JSON.stringify(events[0]).includes('body'), false);
});

test('a new line is posted once and the secret stays out of the url', async () => {
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (opts.method === 'POST') return jsonRes(204, {});
    return jsonRes(200, { cursor: 'ab12.3', events: [] });
  };
  const result = await pushDelta({
    fetchFn,
    feedUrl: 'https://feed.example/live-events.json',
    ingestUrl: 'https://feed.example/ingest',
    secret: SECRET,
    events: eventsFromActivity(LINE),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 204);
  assert.equal(calls.length, 2);
  const post = calls[1];
  assert.equal(post.opts.method, 'POST');
  assert.equal(post.opts.headers['X-Burst-Ingest'], SECRET);
  assert.equal(post.url.includes(SECRET), false);
  assert.equal(calls[0].url.includes(SECRET), false);
  const body = JSON.parse(post.opts.body);
  assert.equal(body.base, 'ab12.3');
  assert.equal(body.upsert.length, 1);
  assert.deepEqual(body.remove, []);
});

test('a 409 refetches the feed and posts once more', async () => {
  let posts = 0;
  const fetchFn = async (url, opts = {}) => {
    if (opts.method === 'POST') {
      posts += 1;
      if (posts === 1) return jsonRes(409, { cursor: 'ab12.4' });
      return jsonRes(204, {});
    }
    const cursor = posts === 0 ? 'ab12.3' : 'ab12.4';
    return jsonRes(200, { cursor, events: [] });
  };
  const result = await pushDelta({
    fetchFn,
    feedUrl: 'https://feed.example/live-events.json',
    ingestUrl: 'https://feed.example/ingest',
    secret: SECRET,
    events: eventsFromActivity(LINE),
  });
  assert.equal(result.ok, true);
  assert.equal(posts, 2);
});

test('an event already in the feed is not posted', async () => {
  let posts = 0;
  const events = eventsFromActivity(LINE);
  const fetchFn = async (_url, opts = {}) => {
    if (opts.method === 'POST') posts += 1;
    return jsonRes(200, { cursor: 'ab12.3', events: [{ id: events[0].id }] });
  };
  const result = await pushDelta({
    fetchFn,
    feedUrl: 'https://feed.example/live-events.json',
    ingestUrl: 'https://feed.example/ingest',
    secret: SECRET,
    events,
  });
  assert.equal(result.status, 304);
  assert.equal(posts, 0);
});

test('a secret in the url is refused before any request', async () => {
  let called = 0;
  const result = await pushDelta({
    fetchFn: async () => { called += 1; return jsonRes(200, {}); },
    feedUrl: `https://feed.example/${SECRET}`,
    ingestUrl: 'https://feed.example/ingest',
    secret: SECRET,
    events: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 2);
  assert.equal(called, 0);
});
