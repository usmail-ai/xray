// Board source choice (app/server.mjs): the box pass board wins while the box pushed within BOARD_BOX_STALE_S,
// even if the host collector's feed is newer; once the box is stale the host collector's board is used.
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
const INGEST = crypto.randomBytes(32).toString('hex'), PW = crypto.randomBytes(8).toString('hex');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-board-'));
let srv, cookie;
const sleep = ms => new Promise(r => setTimeout(r, ms));
before(async () => {
  srv = spawn(process.execPath, [path.join(APP, 'server.mjs')], { env: { PORT: String(PORT), MESH_PASSWORD: PW,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), INGEST_SECRET: INGEST, PATH: process.env.PATH, MESH_DATA_DIR: DATA,
    BOARD_BOX_STALE_S: '2' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await sleep(100); }
  const r = await fetch(BASE + '/login', { method: 'POST', body: 'password=' + PW, redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { srv.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });
const R = 'example-org/app', now = Date.now();
const card = (n, title) => ({ key: R + '#' + n, kind: 'pr', repo: R, number: n, title, url: 'https://github.com/' + R + '/pull/' + n,
  owner: 'Builder', stage: 'fix', state: 'live', packet: {}, packet_ok: false, missing: [], beats: [], last_beat_t: now, stall: false });
const gfile = path.join(DATA, 'feed', 'github-events.json');
function writeHost(n) {   // returns the feed's generated_at
  fs.mkdirSync(path.dirname(gfile), { recursive: true });
  const f = { title: 't', generated_at: new Date(Date.now() + 60000).toISOString(), source: 'github', events: [], board: { cards: [card(n, 'host card')] } };
  fs.writeFileSync(gfile + '.tmp', JSON.stringify(f)); fs.renameSync(gfile + '.tmp', gfile);
  return f.generated_at;
}
async function titles(hostAt) {   // wait until the server has read the host feed written at hostAt
  for (let i = 0; i < 60; i++) {
    const f = await (await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie } })).json();
    if (f.sources?.github?.generated_at === hostAt) return ((f.board || {}).cards || []).map(c => c.title);
    await sleep(100);
  }
  throw new Error('host feed never read');
}
test('fresh box board wins even when the host feed is newer; a stale box falls back to the host board', async () => {
  const r = await fetch(BASE + '/ingest', { method: 'POST', headers: { Authorization: 'Bearer ' + INGEST, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 't', generated_at: new Date().toISOString(), events: [], board: { cards: [card(1, 'box card')] } }) });
  assert.equal(r.status, 200);
  let t = await titles(writeHost(2));            // host feed generated later than the box feed
  assert.ok(t.includes('box card') && !t.includes('host card'), JSON.stringify(t));
  await sleep(2300);                              // box silent past BOARD_BOX_STALE_S=2
  t = await titles(writeHost(3));
  assert.ok(t.includes('host card') && !t.includes('box card'), JSON.stringify(t));
});
