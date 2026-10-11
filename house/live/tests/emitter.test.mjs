// Assistant / emitter node: POST /emit (assistant seat key, strict fields) -> fleet.working.Assistant, idle after EMITTER_WORKING_S.
// Run: node --test tests/emitter.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
const APP = process.env.MESH_APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = 19000 + Math.floor(Math.random() * 1000), BASE = `http://127.0.0.1:${PORT}`;
const GKEY = 'assistant-key-' + crypto.randomBytes(8).toString('hex'), CKEY = 'reviewer-key-' + crypto.randomBytes(8).toString('hex');
const PW = crypto.randomBytes(8).toString('hex'), H = k => crypto.createHash('sha256').update(k).digest('hex');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-emitter-'));
let srv, cookie;
before(async () => {
  srv = spawn(process.execPath, [path.join(APP, 'server.mjs')], { env: { PORT: String(PORT), MESH_PASSWORD: PW, PATH: process.env.PATH,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), INGEST_SECRET: crypto.randomBytes(32).toString('hex'), MESH_DATA_DIR: DATA,
    COLLECTOR: 'off', EMITTER_WORKING_S: '2', SEAT_KEYS: JSON.stringify({ assistant: H(GKEY), reviewer: H(CKEY) }) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const r = await fetch(BASE + '/login', { method: 'POST', body: 'password=' + PW, redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { srv.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });
const dot = (body, key = GKEY) => fetch(BASE + '/emit', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
const ev = (o = {}) => ({ kind: 'tool', tool: 'send_letter', t: new Date().toISOString(), ok: true, client: 'assistant', latency_ms: 812, ...o });
const fleet = async () => (await (await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie } })).json()).fleet;

test('auth: assistant key only; other seat keys, no key, GET -> refused', async () => {
  assert.equal((await dot(ev(), 'nope')).status, 401);
  assert.equal((await dot(ev(), CKEY)).status, 401);
  assert.equal((await fetch(BASE + '/emit', { method: 'POST', body: JSON.stringify(ev()) })).status, 401);
  assert.equal((await fetch(BASE + '/emit')).status, 405);
  assert.equal((await fetch(BASE + '/inbox/assistant', { headers: { Authorization: 'Bearer ' + GKEY } })).status, 401);   // write-only seat
  assert.equal((await fetch(BASE + '/cards', { headers: { Authorization: 'Bearer ' + GKEY } })).status, 401);
});
test('strict fields: customer data and malformed events are refused', async () => {
  for (const bad of [ev({ email: 'a@b.c' }), ev({ address: '1 Main St' }), ev({ user_id: 'u1' }), ev({ args: {} }), ev({ tool: 'x y' }),
    ev({ client: 'Mozilla' }), ev({ ok: 'yes' }), ev({ kind: 'call' }), ev({ latency_ms: -1 }), ev({ t: '2020-01-01T00:00:00Z' }), [ev()]])
    assert.equal((await dot(bad)).status, 422, JSON.stringify(bad));
  assert.equal((await dot('{not json')).status, 400);
  assert.equal((await dot(JSON.stringify(ev({ tool: 'a'.repeat(64) })) + ' '.repeat(2000))).status, 413);
});
test('a tool call lights Assistant (working), oauth too; idle after EMITTER_WORKING_S; no data echoed', async () => {
  const r = await dot(ev()); assert.equal(r.status, 202); assert.deepEqual(await r.json(), { ok: true });
  let f = await fleet();
  assert.equal(f.seats.Assistant.working, true); assert.equal(f.seats.Assistant.active, true);
  assert.deepEqual(Object.keys(f.working.Assistant).sort(), ['client', 'ok', 'since_ct', 'tool', 'via']);
  assert.equal(f.working.Assistant.tool, 'send_letter');
  assert.equal((await dot(ev({ kind: 'oauth', tool: 'oauth_authorize', client: 'other', latency_ms: undefined }))).status, 202);
  await new Promise(r => setTimeout(r, 2600 + 15000));   // working window (2 s) + the 15 s re-merge tick
  f = await fleet();
  assert.equal(f.seats.Assistant.working, false); assert.equal(f.seats.Assistant.active, true); assert.equal(f.working.Assistant, undefined);
});
