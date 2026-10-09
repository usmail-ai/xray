import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptLine, clearTokenCache, installTokenShape, postActivity, validActivity, verifyInstallationToken, tokenCacheKeys } from './activity.mjs';

const now = Date.parse('2026-10-09T14:00:00Z');

test('a turn start is stored under the seat the caller names', () => {
  const lines = [];
  const out = acceptLine(lines, {
    t_ct: '2026-10-09T14:00:00Z',
    seat: 'SEAT1',
    kind: 'turn',
    action: 'start',
    tag: 'issue-212',
  }, 'SEAT1', now);
  assert.equal(out.ok, true);
  assert.equal(lines[0].by, 'SEAT1');
  assert.equal(lines[0].seq, 1);
});

test('free text and unknown fields are refused', () => {
  assert.equal(validActivity({ t_ct: '2026-10-09T14:00:00Z', kind: 'turn', action: 'start', note: 'hello' }, now), 'unknown field');
  assert.equal(validActivity({ t_ct: '2026-10-09T14:00:00Z', kind: 'turn', action: 'start', tag: 'see the body' }, now), 'free text is not accepted');
});

test('a cloud agent line needs an agent id', () => {
  assert.equal(validActivity({
    t_ct: '2026-10-09T14:00:00Z', seat: 'builder', kind: 'cloud_agent', action: 'launch',
  }, now), 'cloud_agent needs agent id');
});

test('a tag of 80 characters is stored and 81 is refused', () => {
  const tag = 'a'.repeat(80);
  assert.equal(validActivity({
    t_ct: '2026-10-09T09:00:00-05:00', seat: 'builder', kind: 'lab_run', action: 'pass', tag,
  }, now), null);
  assert.equal(validActivity({
    t_ct: '2026-10-09T09:00:00-05:00', seat: 'builder', kind: 'lab_run', action: 'pass', tag: tag + 'a',
  }, now), 'tag too long');
});

test('the seat stamp must match the caller', () => {
  const lines = [];
  const out = acceptLine(lines, {
    t_ct: '2026-10-09T09:00:00-05:00', seat: 'gate', kind: 'review', action: 'pass', tag: 'pr-1',
  }, 'builder', now);
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.equal(out.error, 'seat mismatch');
  assert.equal(lines.length, 0);
});

test('an optional seat matches the token case-insensitively and the stored seat is the token', () => {
  const lines = [];
  const omitted = acceptLine(lines, {
    t_ct: '2026-10-09T09:00:00-05:00', kind: 'turn', action: 'start', tag: 'issue-1',
  }, 'builder', now);
  assert.equal(omitted.ok, true);
  assert.equal(lines[0].seat, 'builder');
  const cased = acceptLine(lines, {
    t_ct: '2026-10-09T09:00:01-05:00', seat: 'Builder', kind: 'turn', action: 'end', tag: 'issue-1',
  }, 'builder', now);
  assert.equal(cased.ok, true);
  assert.equal(lines[1].seat, 'builder');
  assert.equal(lines[1].by, 'builder');
});

function liveToken() {
  const chunk = 'A'.repeat(40) + '.' + '_'.repeat(40) + '-';
  return 'ghs_' + chunk.repeat(6);
}

const seats = [{ seat: 'builder', bot: 'builder-bot[bot]', botId: 1001, org: 'example-org' }];

function ghFetch(status = 200) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (String(url).endsWith('/graphql')) {
      return { status, ok: status === 200, json: async () => ({ data: { viewer: { login: 'builder-bot[bot]', databaseId: 1001 } } }) };
    }
    return { status, ok: status === 200, json: async () => ({ repositories: [{ owner: { login: 'example-org' } }] }) };
  };
  return { fetchFn, calls };
}

test('a long installation token with dot and underscore is sent to GitHub', async () => {
  clearTokenCache();
  const token = liveToken();
  assert.ok(token.length > 380);
  assert.match(token, /\./);
  assert.match(token, /_/);
  assert.equal(installTokenShape(token), true);
  assert.equal(/^ghs_[A-Za-z0-9]{20,255}$/.test(token), false);
  const { fetchFn, calls } = ghFetch();
  const out = await verifyInstallationToken(token, seats, fetchFn, now);
  assert.equal(out.ok, true);
  assert.equal(out.seat, 'builder');
  assert.ok(calls.length >= 1);
  assert.ok(tokenCacheKeys().every((k) => !k.includes(token) && k.length === 64));
});

test('a bad token shape is 401 and GitHub is not called', async () => {
  clearTokenCache();
  let called = 0;
  const out = await verifyInstallationToken('ghs_short', seats, async () => { called += 1; }, now);
  assert.equal(out.status, 401);
  assert.equal(called, 0);
});

test('post activity is write-only and has no static key', async () => {
  clearTokenCache();
  const src = readFileSync(new URL('./activity.mjs', import.meta.url), 'utf8');
  assert.equal(src.includes('ACTIVITY_KEY'), false);
  const lines = [];
  const { fetchFn } = ghFetch();
  const body = JSON.stringify({ t_ct: '2026-10-09T14:00:00Z', seat: 'builder', kind: 'turn', action: 'start', tag: 'issue-1' });
  const out = await postActivity({ body, token: liveToken(), seats, lines, fetchFn, now });
  assert.equal(out.status, 204);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].seat, 'builder');
  assert.equal(Object.hasOwn(out, 'events'), false);
  const mismatch = await postActivity({
    body: JSON.stringify({ t_ct: '2026-10-09T14:00:00Z', seat: 'gate', kind: 'turn', action: 'start', tag: 'issue-1' }),
    token: liveToken(), seats, lines, fetchFn, now,
  });
  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.error, 'seat mismatch');
  assert.equal(lines.length, 1);
  const key = await postActivity({
    body: JSON.stringify({ t_ct: '2026-10-09T14:00:00Z', kind: 'turn', action: 'start', tag: 'issue-1' }),
    token: 'static-activity-key', seats, lines, fetchFn, now,
  });
  assert.equal(key.status, 401);
  assert.equal(lines.length, 1);
});

test('github 5xx is 503 and is not cached', async () => {
  clearTokenCache();
  const { fetchFn } = ghFetch(503);
  const token = liveToken();
  const out = await verifyInstallationToken(token, seats, fetchFn, now);
  assert.equal(out.status, 503);
  assert.equal(tokenCacheKeys().length, 0);
});
