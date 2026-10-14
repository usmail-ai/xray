// Freshness light, card history, and the open queue. Example repos only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initArchive, appendArchive, cardHistory } from '../app/archive.mjs';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const html = fs.readFileSync(path.join(APP, 'public', 'index.html'), 'utf8');

test('freshness stays green when a non-card event is newer than the cards', () => {
  const L = { SOURCES: [], AGENTS: [], SEAT_NAMES: [], SATS: {}, COLOR: {}, LABEL: {}, SUB: {}, GLYPH: {}, SQUARE: {},
    EDGES: [], BOT_IMAGES: [], KIND_WORD: {}, applyFeed: (st, feed) => ({ state: { events: feed.events } }) };
  new Function('window', 'location', fs.readFileSync(path.join(APP, 'public', 'live-config.js'), 'utf8'))({ LiveMesh: L }, { search: '' });
  const now = Date.parse('2026-10-13T15:00:00-05:00');
  const min = 60000;
  const comment = L.freshTone(now - min, now - 10 * min, now - 10 * min, now);
  assert.equal(comment.tone, 'green');
  assert.equal(comment.line, 'Updated 1 min ago');
  const quiet = L.freshTone(now - 5 * min, now - 70 * min, now - 70 * min, now);
  assert.equal(quiet.tone, 'green');
  assert.equal(quiet.line, 'Updated 5 min ago');
  const behind = L.freshTone(now - min, now - 70 * min, now - min, now);
  assert.equal(behind.tone, 'red');
  assert.equal(behind.line, 'Cards last changed 1 h ago');
  const building = L.freshTone(now - min, 0, 0, now);
  assert.equal(building.tone, 'amber');
  assert.equal(building.line, 'Cards still building');
  assert.match(html, /L\.freshTone\(light\.dataAt, light\.cardsAt, light\.moveAt, now\)/);
  assert.match(html, /github_card_latest_ct/);
  assert.match(html, /No recent changes/);
  const cfg = fs.readFileSync(path.join(APP, 'public', 'live-config.js'), 'utf8');
  assert.match(cfg, /if \(c\.state === 'parked'\) return 'parked'/);
  assert.doesNotMatch(html, /dataAt > cardsAt/);
});

test('card history keeps a later state and drops a row with no key', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'board-hist-'));
  initArchive(data);
  const open = { key: 'example/repo#1', state: 'live', stage: 'review', owner: 'builder', title: 'One', t_ct: '2026-05-12T15:00:00Z', updated_ct: '2026-05-12T15:00:00Z', repo: 'example/repo', number: 1 };
  const parked = { key: 'example/repo#2', state: 'parked', stage: 'review', owner: 'builder', title: 'Held aside', t_ct: '2026-05-13T15:00:00Z', updated_ct: '2026-05-13T15:00:00Z', repo: 'example/repo', number: 2 };
  assert.equal(appendArchive('cards', open), true);
  assert.equal(appendArchive('cards', { ...open, state: 'closed', stage: 'done', updated_ct: '2026-05-20T15:00:00Z', t_ct: '2026-05-20T15:00:00Z' }), true);
  assert.equal(appendArchive('cards', parked), true);
  assert.equal(appendArchive('cards', { state: 'live', title: 'missing key' }), false);
  const hist = cardHistory();
  const by = Object.fromEntries(hist.cards.map(c => [c.id, c]));
  assert.equal(by['example/repo#1'].state, 'closed');
  assert.equal(by['example/repo#1'].opened_ct, '2026-05-12T15:00:00Z');
  assert.ok(by['example/repo#1'].closed_ct);
  assert.equal(by['example/repo#2'].state, 'parked');
  assert.equal(by['example/repo#2'].closed_ct, '');
  assert.ok(hist.cards.every(c => c.id));
  fs.rmSync(data, { recursive: true, force: true });
});

function start(data, extra) {
  const port = 22000 + Math.floor(Math.random() * 20000);
  const ingest = crypto.randomBytes(32).toString('hex');
  const password = 'pw-' + crypto.randomBytes(4).toString('hex');
  const child = spawn(process.execPath, [path.join(APP, 'server.mjs')], {
    env: {
      PORT: String(port), MESH_PASSWORD: password,
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'), INGEST_SECRET: ingest,
      PATH: process.env.PATH, MESH_DATA_DIR: data, COLLECTOR: 'on', ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  return { child, base, ingest, password, logs: () => logs };
}

async function ready(base, logs) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error('healthz did not come up\n' + logs());
}

async function stop(child) {
  if (!child || child.exitCode != null) return;
  const done = new Promise(r => child.once('exit', r));
  child.kill();
  await done;
}

test('merge-commit CI does not move the card clock; CI on an open head does; the queue does not delete the inbox', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'board-ci-'));
  const now = Date.now();
  const opened = new Date(now - 70 * 60 * 1000).toISOString();
  const onHead = new Date(now - 20 * 60 * 1000).toISOString();
  const mergeCi = new Date(now - 2 * 60 * 1000).toISOString();
  const closedNum = new Date(now - 60 * 1000).toISOString();
  fs.mkdirSync(path.join(data, 'feed'), { recursive: true });
  fs.writeFileSync(path.join(data, 'feed', 'github-events.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    board: { cards: [
      { key: 'example/repo#7', repo: 'example/repo', number: 7, kind: 'pr', state: 'live', title: 'Open', head: 'deadbee', owner: 'builder', stage: 'review', last_beat_t: now - 20 * 60 * 1000 },
      { key: 'example/repo#8', repo: 'example/repo', number: 8, kind: 'pr', state: 'closed', title: 'Merged', head: 'c10sed1', owner: 'builder', stage: 'done' },
    ] },
    events: [
      { id: 'gh-open', t_ct: opened, kind: 'pr_open', repo: 'example/repo', number: 7, title: 'Open', from: 'builder', sha: 'deadbee0123456789abcdef' },
      { id: 'gh-head', t_ct: onHead, kind: 'check_run', conclusion: 'success', repo: 'example/repo', sha: 'deadbee0123456789abcdef', from: 'GitHub' },
      { id: 'gh-merge', t_ct: mergeCi, kind: 'check_run', conclusion: 'success', repo: 'example/repo', sha: 'abc9999deadbeef000000000', from: 'GitHub' },
      { id: 'gh-closed', t_ct: closedNum, kind: 'ci_pass', conclusion: 'success', repo: 'example/repo', number: 8, from: 'GitHub' },
    ],
  }));
  const srv = start(data);
  try {
    await ready(srv.base, srv.logs);
    const login = await fetch(srv.base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=' + encodeURIComponent(srv.password) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const live = await (await fetch(srv.base + '/live-events.json', { headers: { Cookie: cookie } })).json();
    assert.equal(Date.parse(live.freshness.github_latest_ct), Date.parse(closedNum));
    assert.equal(Date.parse(live.freshness.github_card_latest_ct), Date.parse(onHead));
    const line = { id: 'line-1', t_ct: new Date().toISOString(), seat: 'forge', type: 'pr', repo: 'example/repo', number: 7, title: 'Needs a look', url: 'https://github.com/example/repo/pull/7', reason: 'review' };
    const posted = await fetch(srv.base + '/inbox', { method: 'POST', headers: { 'X-Live-Ingest': srv.ingest, 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: [line] }) });
    assert.equal(posted.status, 200, await posted.text());
    const again = await (await fetch(srv.base + '/live-events.json', { headers: { Cookie: cookie } })).json();
    assert.ok(again.queue.some(l => l.id === 'line-1' && l.seat === 'forge'));
    const file = path.join(data, 'live', 'inbox', 'forge.jsonl');
    assert.ok(fs.readFileSync(file, 'utf8').includes('line-1'));
    const cards = await (await fetch(srv.base + '/history/cards', { headers: { Cookie: cookie } })).json();
    assert.ok(cards.cards.some(c => c.id === 'example/repo#7' && c.state === 'live' && !c.closed_ct));
  } finally {
    await stop(srv.child);
    fs.rmSync(data, { recursive: true, force: true });
  }
});
