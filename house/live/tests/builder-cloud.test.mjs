// Builder-cloud seat: own key; POST /activity (seat Builder-cloud), its own inbox mirrors every builder line (merge-ready,
// Reviewer PASS) plus nudges to builder; /cards?seat=builder-cloud = Builder's cards. Run: node --test tests/builder-cloud.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
const APP = process.env.MESH_APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = 20000 + Math.floor(Math.random() * 1000), BASE = `http://127.0.0.1:${PORT}`;
const AKEY = 'builder-cloud-' + crypto.randomBytes(8).toString('hex'), CKEY = 'reviewer-' + crypto.randomBytes(8).toString('hex');
const INGEST = crypto.randomBytes(32).toString('hex'), PW = crypto.randomBytes(8).toString('hex'), H = k => crypto.createHash('sha256').update(k).digest('hex');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-a1c-'));
let srv;
before(async () => {
  srv = spawn(process.execPath, [path.join(APP, 'server.mjs')], { env: { PORT: String(PORT), MESH_PASSWORD: PW, PATH: process.env.PATH,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), INGEST_SECRET: INGEST, MESH_DATA_DIR: DATA, COLLECTOR: 'off', GITHUB_API_URL: 'http://127.0.0.1:1',
    SEAT_KEYS: JSON.stringify({ 'builder-cloud': H(AKEY), reviewer: H(CKEY) }) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
});
after(() => { srv.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });
const A = k => ({ Authorization: 'Bearer ' + k });
const act = (body, key = AKEY) => fetch(BASE + '/activity', { method: 'POST', body: JSON.stringify(body), headers: { ...A(key), 'Content-Type': 'application/json' } });
const line = o => ({ t_ct: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19) + '-05:00', kind: 'turn', action: 'start', tag: 't1', ...o });

test('activity: builder-cloud key posts as Builder-cloud; other seat keys / wrong seat / no key refused', async () => {
  assert.equal((await act(line({ seat: 'Builder-cloud' }))).status, 202);
  assert.equal((await act(line({}))).status, 202);
  assert.equal((await act(line({ seat: 'Builder' }))).status, 403);
  assert.equal((await act(line({}), CKEY)).status, 401);
  assert.equal((await act(line({}), 'nope')).status, 401);
  const r = await (await fetch(BASE + '/activity/pull', { headers: A(INGEST) })).json();
  assert.deepEqual(r.lines.map(l => l.seat), ['Builder-cloud', 'Builder-cloud']);
});

test('inbox: builder lines (ready / reviewer pass) mirror to builder-cloud; only its own key reads it', async () => {
  const mk = (id, type, reason) => ({ id, t_ct: new Date().toISOString(), seat: 'builder', type, repo: 'example-org/x', number: 7, sha: 'abc', title: 'PR 7', url: '', reason });
  const lines = [mk('ready:x#7:abc', 'ready', 'merge-ready'), mk('cp:x#7', 'critic_pass', 'Reviewer PASS')];
  assert.equal((await fetch(BASE + '/inbox/builder', { method: 'POST', body: JSON.stringify({ lines }), headers: { 'X-Live-Ingest': INGEST, 'Content-Type': 'application/json' } })).status, 200);
  assert.equal((await fetch(BASE + '/inbox', { method: 'POST', body: JSON.stringify({ lines: [mk('cp:x#7', 'critic_pass', 'Reviewer PASS')] }), headers: { 'X-Live-Ingest': INGEST, 'Content-Type': 'application/json' } })).status, 200);
  const got = await (await fetch(BASE + '/inbox/builder-cloud', { headers: A(AKEY) })).json();
  assert.deepEqual(got.lines.map(l => [l.id, l.seat]), [['ready:x#7:abc', 'builder-cloud'], ['cp:x#7', 'builder-cloud']]);   // no dupes
  assert.deepEqual((await (await fetch(BASE + '/inbox/builder-cloud?since=cp:x%237', { headers: A(AKEY) })).json()).lines, []);
  assert.equal((await fetch(BASE + '/inbox/builder-cloud', { headers: A(CKEY) })).status, 403);
  assert.equal((await fetch(BASE + '/inbox/builder', { headers: A(AKEY) })).status, 403);   // builder's own inbox stays token-only
});

test('cards + nudges: Builder cards visible to builder-cloud; a nudge to builder lands in its inbox', async () => {
  const now = Date.now(), R = 'example-org/x', q = now - 61 * 60000;
  const card = { key: R + '#9', kind: 'pr', repo: R, number: 9, title: 'card 9', url: 'https://github.com/' + R + '/pull/9', owner: 'Builder', stage: 'fix', state: 'live',
    packet: { 'next owner': 'Builder' }, packet_ok: true, missing: [], beats: [{ t: q, what: 'pushed', url: '', id: 'b9' }], last_beat_t: q, stall: true };
  const other = { ...card, key: R + '#10', number: 10, owner: 'Reviewer', packet: { 'next owner': 'Reviewer' } };
  const r = await fetch(BASE + '/ingest', { method: 'POST', body: JSON.stringify({ title: 't', event_count: 0, generated_at: new Date().toISOString(), events: [], board: { updated_ct: 'x', cards: [card, other] } }),
    headers: { ...A(INGEST), 'Content-Type': 'application/json' } });
  assert.equal(r.status, 200);
  const cs = await (await fetch(BASE + '/cards?seat=builder-cloud', { headers: A(AKEY) })).json();
  assert.deepEqual(cs.cards.map(c => c.number), [9]);
  const inb = (await (await fetch(BASE + '/inbox/builder-cloud', { headers: A(AKEY) })).json()).lines.filter(l => l.type === 'nudge');
  assert.equal(inb.length, 1); assert.equal(inb[0].number, 9); assert.match(inb[0].reason, /^nudge L1/);
});

test('inbox privacy checks field NAMES: type prompt_message ok, a message/body/text key rejected alone (batch still lands)', async () => {
  const mk = (id, o = {}) => ({ id, t_ct: new Date().toISOString(), seat: 'builder', type: 'ready', repo: 'example-org/x', number: 8, sha: 's', title: 'PR 8', url: '', reason: 'merge-ready', ...o });
  const lines = [mk('pm:1', { seat: 'coord', type: 'prompt_message', reason: 'prompt message to coord' }), mk('bad:body', { body: 'secret' }),
    mk('bad:message', { seat: 'coord', message: 'x' }), mk('bad:text', { text: 'x' }), mk('ready:x#8:s')];
  const r = await fetch(BASE + '/inbox', { method: 'POST', body: JSON.stringify({ lines }), headers: { 'X-Live-Ingest': INGEST, 'Content-Type': 'application/json' } });
  assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.added, 2); assert.deepEqual(j.rejected, ['bad:body', 'bad:message', 'bad:text']);
  const got = (await (await fetch(BASE + '/inbox/builder-cloud', { headers: A(AKEY) })).json()).lines;
  assert.ok(got.some(l => l.id === 'ready:x#8:s')); assert.ok(!got.some(l => l.id.startsWith('bad:')));
  assert.ok(!JSON.stringify(got).includes('secret'));
});

test("parked card ('Parked:' comment): its open nudge closes, no new nudge, cards show parked; live again re-arms", async () => {
  const now = Date.now(), R = 'example-org/p', q = now - 61 * 60000, O = { 'X-Live-Ingest': INGEST };
  const card = st => ({ key: R + '#221', kind: 'pr', repo: R, number: 221, title: 'card 221', url: '', owner: 'Builder', stage: 'fix', state: st,
    packet: { 'next owner': 'Builder' }, packet_ok: true, missing: [], beats: [{ t: q, what: st === 'parked' ? 'parked' : 'pushed', url: '', id: 'b221' }], last_beat_t: q, stall: st === 'live' });
  const push = st => fetch(BASE + '/ingest', { method: 'POST', body: JSON.stringify({ title: 't', event_count: 0, generated_at: new Date().toISOString(), events: [], board: { updated_ct: 'x', cards: [card(st)] } }),
    headers: { ...A(INGEST), 'Content-Type': 'application/json' } });
  const mine = async () => (await (await fetch(BASE + '/cards?seat=builder-cloud', { headers: A(AKEY) })).json()).cards.find(c => c.number === 221);
  assert.equal((await push('live')).status, 200);
  let c = await mine(); assert.equal(c.state, 'live'); assert.equal(c.nudge_open, true);
  assert.equal((await push('parked')).status, 200);
  c = await mine(); assert.equal(c.state, 'parked'); assert.ok(!c.nudge_open);
  assert.equal((await push('parked')).status, 200);
  c = await mine(); assert.ok(!c.nudge_open);   // no new nudge while parked
});

test('inbox ack: --ack id / upto / all hide lines for that seat only; reviewer lines drop once a Reviewer verdict lands at the card head', async () => {
  const CK = { Authorization: 'Bearer ' + CKEY }, R = 'example-org/q', t0 = new Date(Date.now() - 600000).toISOString();
  const mk = (id, n) => ({ id, t_ct: t0, seat: 'reviewer', type: 'pr_update', repo: R, number: n, sha: null, title: 'PR', url: '', reason: 'new or updated pr' });
  await fetch(BASE + '/inbox', { method: 'POST', body: JSON.stringify({ lines: [mk('c:1', 1), mk('c:2', 2), mk('c:3', 3), mk('c:4', 4)] }), headers: { 'X-Live-Ingest': INGEST, 'Content-Type': 'application/json' } });
  const open = async () => (await (await fetch(BASE + '/inbox/reviewer', { headers: CK })).json()).lines.map(l => l.id);
  const ack = (b, h = CK) => fetch(BASE + '/inbox/reviewer/ack', { method: 'POST', body: JSON.stringify(b), headers: { ...h, 'Content-Type': 'application/json' } });
  assert.deepEqual(await open(), ['c:1', 'c:2', 'c:3', 'c:4']);
  assert.equal((await ack({ id: 'c:1' }, A(AKEY))).status, 403);                       // another seat cannot ack
  assert.equal((await ack({ id: 'nope' })).status, 404);
  assert.equal((await ack({ id: 'c:1' })).status, 200);
  assert.deepEqual(await open(), ['c:2', 'c:3', 'c:4']);
  // card #2: Reviewer verdict at head after the line -> done for reviewer
  const now = Date.now(), card = { key: R + '#2', kind: 'pr', repo: R, number: 2, title: 'c', url: '', owner: 'Builder', stage: 'merge', state: 'live', packet: {}, packet_ok: false, missing: [],
    beats: [{ t: now - 1000, what: 'Reviewer PASS', kind: 'reviewer verdict', sha: 'abc1234', url: '', id: 'v' }], last_beat_t: now - 1000, stall: false,
    head: 'abc1234', reviewer: { verdict: 'PASS', sha: 'abc1234', t: now - 1000, at_head: true } };
  await fetch(BASE + '/ingest', { method: 'POST', body: JSON.stringify({ title: 't', event_count: 0, generated_at: new Date().toISOString(), events: [], board: { updated_ct: 'x', cards: [card] } }), headers: { ...A(INGEST), 'Content-Type': 'application/json' } });
  assert.deepEqual(await open(), ['c:3', 'c:4']);
  assert.equal((await ack({ upto: 'c:3' })).status, 200); assert.deepEqual(await open(), ['c:4']);
  const r = await (await ack({ all: true })).json(); assert.equal(r.open, 0); assert.deepEqual(await open(), []);
  assert.equal((await (await fetch(BASE + '/inbox/reviewer?all=1', { headers: CK })).json()).lines.length, 4);   // history kept
});

test('nudge retarget: an open L1 to the old owner closes and a new L1 goes to the current owner (Reviewer PASS at head -> Builder)', async () => {
  const now = Date.now(), R = 'example-org/rt', q = now - 61 * 60000;
  const card = extra => ({ key: R + '#5', kind: 'pr', repo: R, number: 5, title: 'c5', url: '', owner: 'Lead', stage: 'merge', state: 'live', packet: {}, packet_ok: false, missing: [],
    beats: [{ t: q, what: 'Reviewer PASS', url: '', id: 'b5' }], last_beat_t: q, stall: true, ...extra });
  const push = c => fetch(BASE + '/ingest', { method: 'POST', body: JSON.stringify({ title: 't', event_count: 0, generated_at: new Date().toISOString(), events: [], board: { updated_ct: 'x', cards: [c] } }), headers: { ...A(INGEST), 'Content-Type': 'application/json' } });
  await push(card({}));
  let inb = (await (await fetch(BASE + '/inbox/builder-cloud?all=1', { headers: A(AKEY) })).json()).lines.filter(l => l.number === 5);
  assert.equal(inb.length, 0);                                                         // first L1 went to lead
  await push(card({ nudge_to: 'builder', nudge_via: 'merge (Reviewer PASS at head)', packet: { 'next owner': 'Builder' } }));
  inb = (await (await fetch(BASE + '/inbox/builder-cloud?all=1', { headers: A(AKEY) })).json()).lines.filter(l => l.number === 5);
  assert.equal(inb.length, 1); assert.match(inb[0].reason, /Reviewer PASS at head/);
  const c = (await (await fetch(BASE + '/cards?seat=builder-cloud', { headers: A(AKEY) })).json()).cards.find(x => x.number === 5);
  assert.deepEqual(c.beats.filter(b => b.nudge).map(b => b.what), ['nudge L1 → lead', 'nudge L1 → builder']); assert.equal(c.nudge_open, true);
  await push(card({ nudge_to: 'builder', nudge_via: 'merge (Reviewer PASS at head)', packet: { 'next owner': 'Builder' } }));   // stable: no third
  assert.equal((await (await fetch(BASE + '/cards?seat=builder-cloud', { headers: A(AKEY) })).json()).cards.find(x => x.number === 5).beats.filter(b => b.nudge).length, 2);
});
