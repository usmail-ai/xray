import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exchange, loadCachedToken, planFromEnv, tokenReusable } from './mint-cli.mjs';

const env = {
  BURST_SEAT_ID: 'builder',
  GITHUB_APP_ID: '100',
  GITHUB_APP_INSTALLATION_ID: '200',
  GITHUB_APP_REPOS: 'example',
  BURST_APP_READ_ONLY: '1',
  GITHUB_APP_PERMISSIONS: JSON.stringify({ metadata: 'read', contents: 'read' }),
};

test('read-only plan comes from env and refuses write', () => {
  const plan = planFromEnv(env);
  assert.equal(plan.ok, true);
  assert.match(plan.url, /installations\/200\/access_tokens$/);
  const write = planFromEnv({ ...env, GITHUB_APP_PERMISSIONS: JSON.stringify({ contents: 'write' }) });
  assert.equal(write.ok, false);
});

test('a drifted or oddly shaped token is discarded', async () => {
  const plan = planFromEnv(env);
  const bad = await exchange(plan, async () => ({ json: async () => ({ token: 'ghs_' + 'a'.repeat(30), permissions: { contents: 'write' } }) }), 'jwt');
  assert.equal(bad.ok, false);
  assert.equal(Object.hasOwn(bad, 'token'), false);
  const weird = 'ghs_' + ('A'.repeat(40) + '.' + '_'.repeat(40)).repeat(5);
  const good = await exchange(plan, async () => ({ json: async () => ({ token: weird, permissions: plan.body.permissions }) }), 'jwt');
  assert.equal(good.ok, true);
  assert.equal(good.token, weird);
});

test('an installation token is reused until 120s before expiry', () => {
  const now = Date.parse('2026-10-09T15:00:00Z');
  const token = 'ghs_' + ('A'.repeat(40) + '.' + '_'.repeat(40)).repeat(5);
  const fresh = new Date(now + 10 * 60 * 1000).toISOString();
  const closing = new Date(now + 120 * 1000).toISOString();
  assert.equal(tokenReusable(fresh, now), true);
  assert.equal(tokenReusable(closing, now), false);
  assert.equal(loadCachedToken(JSON.stringify({ token, expires_at: fresh }), now), token);
  assert.equal(loadCachedToken(JSON.stringify({ token, expires_at: closing }), now), null);
  assert.equal(loadCachedToken(JSON.stringify({ token: 'ghs_short', expires_at: fresh }), now), null);
});

test('wrappers take ids from the environment', () => {
  const gh = readFileSync(new URL('./bin/gh', import.meta.url), 'utf8');
  const cred = readFileSync(new URL('./bin/git-credential', import.meta.url), 'utf8');
  const use = readFileSync(new URL('./bin/use-repo', import.meta.url), 'utf8');
  for (const src of [gh, cred, use]) {
    assert.equal(src.includes('5237506'), false);
    assert.equal(src.includes('operator0x'), false);
    assert.match(src, /BURST_BOT_LOGIN|GITHUB_APP_ID|mint-cli/);
  }
  assert.match(use, /BURST_BOT_ID/);
  assert.match(gh, /BURST_APP_READ_ONLY=1/);
});
