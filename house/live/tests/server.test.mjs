// Node tests for app/server.mjs (throwaway secrets, local port). Run: node --test tests/server.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
const APP = process.env.MESH_APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = 18000 + Math.floor(Math.random() * 1000), BASE = `http://127.0.0.1:${PORT}`;
const CKEY = 'reviewer-key-' + crypto.randomBytes(8).toString('hex'), OKEY = 'operator-key-' + crypto.randomBytes(8).toString('hex');
const INGEST = crypto.randomBytes(32).toString('hex'), PW = crypto.randomBytes(8).toString('hex');
const AKEY = crypto.randomBytes(32).toString('hex');   // the retired static key: still set in env, must be ignored
let srv, cookie, gh, ghCalls = 0;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-data-'));   // collector feed file dir (no collector child: no token)
// fake GitHub: token -> [viewer, repos-status, repo owners]; the real one is api.github.com
const T = c => 'ghs_' + c.repeat(36);
const GH = { [T('a')]: [{ login: 'builder-app[bot]', databaseId: 100000002 }, 200, ['example-org', 'example-org']],
  [T('b')]: [{ login: 'builder-app[bot]', databaseId: 100000002 }, 200, ['someone-else']],   // app installed elsewhere
  [T('c')]: [{ login: 'ops-app[bot]', databaseId: 100000001 }, 200, ['example-org']],   // a different app
  [T('e')]: [{ login: 'builder-app[bot]', databaseId: 100000002 }, 200, ['example-org']],   // 2nd valid (fresh cache)
  [T('d')]: [{ login: 'builder-app[bot]', databaseId: 1 }, 200, ['example-org']],             // look-alike id
  [T('h')]: [{ login: 'lead-login', databaseId: 5 }, 403, []] };                           // a user token / PAT
let ghDown = false;
before(async () => {
  gh = http.createServer((req, res) => {
    ghCalls++;
    const tok = (req.headers.authorization || '').slice(7), e = GH[tok];
    if (ghDown) { res.writeHead(502); return res.end(); }
    if (!e) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"message":"Bad credentials"}'); }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/graphql') return res.end(JSON.stringify({ data: { viewer: e[0] } }));
    if (req.url.startsWith('/installation/repositories')) { res.statusCode = e[1]; return res.end(JSON.stringify({ repositories: e[2].map((o, i) => ({ full_name: o + '/r' + i, owner: { login: o } })) })); }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(r => gh.listen(0, '127.0.0.1', r));
  srv = spawn(process.execPath, [path.join(APP, 'server.mjs')], { env: { PORT: String(PORT), MESH_PASSWORD: PW,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), INGEST_SECRET: INGEST, ACTIVITY_KEY_Builder: AKEY, GITHUB_API_URL: `http://127.0.0.1:${gh.address().port}`, PATH: process.env.PATH, MESH_DATA_DIR: DATA, BOX_STALE_S: '4', NUDGE_L2_S: '1', SEAT_KEYS: JSON.stringify({ reviewer: crypto.createHash('sha256').update(CKEY).digest('hex'), operator: crypto.createHash('sha256').update(OKEY).digest('hex') }) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const r = await fetch(BASE + '/login', { method: 'POST', body: 'password=' + PW, redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { srv.kill(); gh.close(); fs.rmSync(DATA, { recursive: true, force: true }); });
const feed = n => JSON.stringify({ title: 't', event_count: n, generated_at: new Date().toISOString(),
  events: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, t_ct: '2026-10-08T10:00:00-05:00', kind: 'commit', label: 'x'.repeat(200) })) });
const ingest = (body, headers = {}) => fetch(BASE + '/ingest', { method: 'POST', body,
  headers: { Authorization: 'Bearer ' + INGEST, 'Content-Type': 'application/json', ...headers } });

test('gzip ingest above the old 2 MB cap', async () => {
  const raw = Buffer.from(feed(15000)); assert.ok(raw.length > 2 * 1024 * 1024);
  const r = await ingest(zlib.gzipSync(raw), { 'Content-Encoding': 'gzip' });
  assert.equal(r.status, 200); assert.equal((await r.json()).events, 15000);
});
test('plain ingest still accepted', async () => { assert.equal((await ingest(feed(10))).status, 200); });
test('gzip bomb over 25 MB decoded is 413', async () => {
  assert.equal((await ingest(zlib.gzipSync(Buffer.alloc(30 * 1024 * 1024)), { 'Content-Encoding': 'gzip' })).status, 413);
});
test('unknown encoding is 415; bad token is 401', async () => {
  assert.equal((await ingest('x', { 'Content-Encoding': 'br' })).status, 415);
  assert.equal((await fetch(BASE + '/ingest', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer nope' } })).status, 401);
});
test('feed needs login, is gzipped, and honours ETag', async () => {
  await ingest(feed(10));
  assert.equal((await fetch(BASE + '/live-events.json')).status, 401);
  const r = await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie, 'Accept-Encoding': 'gzip' } });
  assert.equal(r.status, 200); assert.equal((await r.json()).events.length, 10);
  const r2 = await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie, 'If-None-Match': r.headers.get('etag') } });
  assert.equal(r2.status, 304);
});
test('avatars served behind login only', async () => {
  assert.equal((await fetch(BASE + '/avatars/builder.png')).status, 401);
  const r = await fetch(BASE + '/avatars/builder.png', { headers: { Cookie: cookie } });
  assert.ok(r.status === 200 || r.status === 404);
});
const ev = (id, extra = {}) => ({ id, t_ct: '2026-10-09T08:00:00-05:00', kind: 'commit', ...extra });
const get = (q = '', headers = {}) => fetch(BASE + '/live-events.json' + q, { headers: { Cookie: cookie, 'Accept-Encoding': 'gzip', ...headers } });
const delta = (body, auth = INGEST) => fetch(BASE + '/ingest/delta', { method: 'POST', body: zlib.gzipSync(JSON.stringify(body)),
  headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
test('delta: cursor flow, since-polls carry only changes, 304 when current, reset on stale epoch', async () => {
  const r0 = await ingest(JSON.stringify({ title: 't', generated_at: 'g0', events: [ev('a'), ev('b'), ev('c')] }));
  const a0 = (await r0.json()).cursor; assert.match(a0, /^[A-Za-z0-9_-]+_box\.\d+$/);   // the box's own ack cursor
  const f0 = await (await get()).json(); const c0 = f0.cursor; assert.match(c0, /^[A-Za-z0-9_-]+\.\d+$/); assert.equal(f0.events.length, 3);
  assert.equal((await get('?since=' + c0)).status, 304);
  // pusher delta: b changed, d new, c removed; header replaced
  const r1 = await delta({ base: a0, header: { title: 't', generated_at: 'g1' }, upsert: [ev('b', { status: 'x' }), ev('d')], remove: ['c'] });
  assert.equal(r1.status, 200); assert.notEqual((await r1.json()).cursor, a0);
  const d = await (await get('?since=' + c0)).json(); const c1 = d.cursor; assert.notEqual(c1, c0);
  assert.equal(d.delta, true); assert.equal(d.generated_at, 'g1');
  assert.deepEqual(d.events.map(e => e.id).sort(), ['b', 'd']); assert.deepEqual(d.removed, ['c']);
  assert.equal((await get('?since=' + c1)).status, 304);
  const f1 = await (await get()).json(); assert.deepEqual(f1.events.map(e => e.id).sort(), ['a', 'b', 'd']); assert.equal(f1.cursor, c1);
  // a full ingest that changes nothing per event still advances the cursor but the delta carries 0 events
  await ingest(JSON.stringify({ ...f1, cursor: undefined, generated_at: 'g2' }));
  const d2 = await (await get('?since=' + c1)).json(); const c2 = d2.cursor; assert.equal(d2.events.length, 0); assert.equal(d2.generated_at, 'g2'); assert.notEqual(c2, c1);
  // stale or foreign cursors -> reset (client refetches the full feed)
  assert.equal((await (await get('?since=other.1')).json()).reset, true);
  assert.equal((await (await get('?since=' + c2.split('.')[0] + '.999999')).json()).reset, true);
  assert.equal((await (await get('?since=garbage')).json()).reset, true);
});
test('delta ingest: base mismatch is 409 with no change; bad token 401; malformed 422', async () => {
  const before = await (await get()).json();
  const r = await delta({ base: 'nope.1', header: { generated_at: 'x' }, upsert: [ev('zz')], remove: [] });
  assert.equal(r.status, 409); assert.match((await r.json()).cursor, /_box\.\d+$/);
  assert.equal((await get('?since=' + before.cursor)).status, 304);
  assert.equal((await delta({ base: before.cursor, header: {}, upsert: [], remove: [] }, 'wrong')).status, 401);
  assert.equal((await delta({ base: before.cursor, header: {}, upsert: [{ id: 1 }], remove: [] })).status, 422);
  assert.equal((await delta({ base: before.cursor, header: { events: [] }, upsert: [], remove: [] })).status, 422);
});

test('two sources: collector file + box push merge by id; box base survives collector writes; box staleness', async () => {
  const now = Date.now(), ct = t => new Date(t).toISOString();
  const box = { title: 't', generated_at: ct(now), events: [ev('shared', { from: 'box' }), ev('boxonly'),
      ev('mq', { src_file: 'merge-queue.md', repo: 'example-org/x', number: 7 })],
    fleet: { window_min: 15, total: 2, seats: { Tester: { active: true, last_ct: ct(now - 60000), via: 'files' }, Builder: { last_ct: null } },
             working: { Tester: { via: 'files', since_ct: ct(now - 30000) } }, cloud: { active: true, open_agents: ['bc-1'], working: true },
             missing_activity: ['Coord'] } };
  const a0 = (await (await ingest(JSON.stringify(box))).json()).cursor;
  const gfile = path.join(DATA, 'feed', 'github-events.json'); fs.mkdirSync(path.dirname(gfile), { recursive: true });
  const ghFeed = { title: 't', generated_at: ct(now - 5000), backfill_complete: true, source: 'github',
    events: [ev('shared', { from: 'github' }), ev('ghonly'), ev('rt', { kind: 'lab_retest_pass', repo: 'example-org/x', number: 7 })],
    fleet: { window_min: 15, total: 2, seats: { Builder: { active: true, last_ct: ct(now - 120000), via: 'github' }, Tester: { last_ct: null } },
             working: { Builder: { via: 'check', since_ct: ct(now - 60000) } }, cloud: { active: false, working: false } } };
  fs.writeFileSync(gfile + '.tmp', JSON.stringify(ghFeed)); fs.renameSync(gfile + '.tmp', gfile);
  let f; for (let i = 0; i < 40; i++) { f = await (await get()).json(); if (f.sources && f.sources.github) break; await new Promise(r => setTimeout(r, 100)); }
  const ids = f.events.map(e => e.id).sort();
  assert.deepEqual(ids, ['boxonly', 'ghonly', 'rt', 'shared']);                      // mq hidden: GitHub has that retest
  assert.equal(f.events.find(e => e.id === 'shared').from, 'github');                  // same id: github copy wins
  assert.equal(f.generated_at, ghFeed.generated_at);                                   // LIVE pill = collector freshness
  assert.equal(f.fleet.seats.Builder.working, true); assert.equal(f.fleet.seats.Tester.working, true);
  assert.equal(f.fleet.active, 2); assert.equal(f.fleet.cloud.active, true); assert.equal(f.fleet.box_stale, false);
  assert.equal('source' in f, false);
  assert.deepEqual(f.fleet.missing_activity, ['Coord']);                                // gap flag carried (feed only)
  // the collector write did not invalidate the box pusher's delta base
  const r = await delta({ base: a0, header: { ...box, events: undefined }, upsert: [ev('box2')], remove: [] });
  assert.equal(r.status, 200);
  // box goes silent (BOX_STALE_S=4 here): its seat state stays, flagged stale; its spinner and open agents stop
  await new Promise(r => setTimeout(r, 4500 + 15500));
  const g = await (await get()).json();
  assert.equal(g.fleet.box_stale, true); assert.equal(g.sources.box.stale, true);
  assert.equal(g.fleet.seats.Tester.box_stale, true); assert.equal(g.fleet.seats.Tester.working, false);
  assert.equal(g.fleet.seats.Tester.working_stale, true); assert.equal(g.fleet.seats.Tester.active, true);
  assert.equal(g.fleet.seats.Builder.working, true); assert.equal(g.fleet.cloud.active, false); assert.equal(g.fleet.cloud.box_stale, true);
  assert.ok(g.events.some(e => e.id === 'boxonly'));                                   // box events are kept, not hidden
});

const act = (body, key = T('a')) => fetch(BASE + '/activity', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) + '\n',
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
const pull = (q = '', key = INGEST) => fetch(BASE + '/activity/pull' + q, { headers: { Authorization: 'Bearer ' + key } });
const nowCt = () => new Date().toISOString().replace('Z', '+00:00');
test('activity: Builder installation token only, seat forced, strict fields, pull with the ingest secret only', async () => {
  const ok = await act({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'pr-202' });
  assert.equal(ok.status, 202); assert.deepEqual(await ok.json(), { ok: true });
  // the retired static key is rejected even though ACTIVITY_KEY_Builder is still in this server's env
  assert.equal((await act({ t_ct: nowCt(), kind: 'turn', action: 'start' }, AKEY)).status, 401);
  // the key reads nothing: not the feed, not the pull, not ingest
  assert.equal((await fetch(BASE + '/live-events.json', { headers: { Authorization: 'Bearer ' + AKEY } })).status, 401);
  assert.equal((await pull('', AKEY)).status, 401);
  assert.equal((await fetch(BASE + '/ingest', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer ' + AKEY } })).status, 401);
  assert.equal((await fetch(BASE + '/activity', { headers: { Authorization: 'Bearer ' + AKEY } })).status, 405);
  assert.equal((await act({ t_ct: nowCt(), kind: 'turn', action: 'start' }, 'x'.repeat(64))).status, 401);
  // validation
  const bad = async (b, why) => { const r = await act(b); assert.equal(r.status, 422, JSON.stringify(b)); if (why) assert.match((await r.json()).error, why); };
  await bad({ t_ct: nowCt(), kind: 'turn', action: 'start', who: 'Reviewer' }, /unknown field/);
  await bad({ t_ct: nowCt(), kind: 'prompt', action: 'sent', to: 'Reviewer', body: 'hi' }, /free-text/);
  await bad({ t_ct: nowCt(), kind: 'prompt', action: 'sent', text: 'hi' }, /free-text/);
  await bad({ t_ct: nowCt(), kind: 'prompt', action: 'sent', message: 'hi' }, /free-text/);
  await bad({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'see message' }, /free text/);
  await bad({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'x'.repeat(81) }, /short plain/);
  await bad({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'line\nbreak' }, /short plain/);
  await bad({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 7 }, /short plain/);
  await bad({ t_ct: nowCt(), kind: 'chat', action: 'start' }, /bad kind/);
  await bad({ t_ct: nowCt(), kind: 'turn', action: 'launch' }, /bad action/);
  await bad({ t_ct: nowCt(), kind: 'cloud_agent', action: 'launch' }, /agent id/);
  await bad({ t_ct: '2020-01-01T00:00:00-05:00', kind: 'turn', action: 'start' }, /range/);
  await bad({ t_ct: 'yesterday', kind: 'turn', action: 'start' }, /t_ct/);
  assert.equal((await act(JSON.stringify({ t_ct: nowCt(), kind: 'turn', action: 'end' }) + '\n' + '{}')).status, 422);
  assert.equal((await act('{"t_ct": ' + JSON.stringify(nowCt()) + ', "kind": "turn", "action": "start", "tag": "' + 'x'.repeat(2000) + '"}')).status, 413);
  // pull: seat forced to Builder, only allowed fields
  const r = await (await pull()).json();
  assert.equal(r.lines.length, 1);
  const l = r.lines[0];
  assert.deepEqual(Object.keys(l).sort(), ['action', 'id', 'kind', 'seat', 'seq', 't_ct', 'tag']);
  assert.equal(l.seat, 'Builder'); assert.equal(l.tag, 'pr-202');
  const r2 = await (await pull(`?epoch=${r.epoch}&after=${r.last}`)).json();
  assert.equal(r2.lines.length, 0); assert.equal(r2.last, r.last);
  assert.equal((await (await pull(`?epoch=stale&after=${r.last}`)).json()).lines.length, 1);   // new epoch -> from the start
});
test('activity: Builder own builder-app installation token is verified with GitHub, cached by hash, never readable', async () => {
  const line = () => ({ t_ct: nowCt(), kind: 'turn', action: 'tick', tag: 'gh-auth' });
  const before = (await (await pull()).json()).last;
  let n = ghCalls;
  assert.equal((await act(line(), T('e'))).status, 202);
  assert.equal(ghCalls - n, 2);                                     // viewer + installation repos
  n = ghCalls;
  assert.equal((await act(line(), T('e'))).status, 202);
  assert.equal(ghCalls, n);                                         // cached verdict: no GitHub call
  for (const c of ['b', 'c', 'd', 'h', 'z']) assert.equal((await act(line(), T(c))).status, 401, c);
  n = ghCalls;
  assert.equal((await act(line(), T('b'))).status, 401); assert.equal(ghCalls, n);   // negative verdict cached too
  ghDown = true;
  assert.equal((await act(line(), 'ghs_' + 'y'.repeat(36))).status, 503);           // GitHub down: retry later, not cached
  ghDown = false;
  const r = await (await pull()).json();
  assert.ok(r.lines.filter(l => l.seq > before).every(l => l.seat === 'Builder'));
  assert.equal(r.lines.filter(l => l.seq > before && l.tag === 'gh-auth').length, 2);
  assert.ok(!JSON.stringify(r).includes(T('a')));
  // the token reads nothing here
  assert.equal((await fetch(BASE + '/live-events.json', { headers: { Authorization: 'Bearer ' + T('a') } })).status, 401);
  assert.equal((await pull('', T('a'))).status, 401);
});
test('activity: optional seat must match the token seat (case-insensitive) else 403; stored seat from the token', async () => {
  const before = (await (await pull()).json()).last;
  assert.equal((await act({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'seat-ok', seat: 'builder' })).status, 202);
  assert.equal((await act({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'seat-ok2', seat: 'Builder' })).status, 202);
  const bad = await act({ t_ct: nowCt(), kind: 'turn', action: 'start', tag: 'seat-bad', seat: 'Reviewer' });
  assert.equal(bad.status, 403); assert.deepEqual(await bad.json(), { error: 'seat mismatch' });
  assert.equal((await act({ t_ct: nowCt(), kind: 'turn', action: 'start', seat: 'Reviewer' }, AKEY)).status, 401);   // auth first
  const lines = (await (await pull()).json()).lines.filter(l => l.seq > before);
  assert.deepEqual(lines.map(l => l.tag), ['seat-ok', 'seat-ok2']);
  assert.ok(lines.every(l => l.seat === 'Builder'));
});
test('activity: 60/min per seat', async () => {
  let codes = [];
  for (let i = 0; i < 62; i++) codes.push((await act({ t_ct: nowCt(), kind: 'watcher', action: 'tick' })).status);
  assert.ok(codes.filter(c => c === 202).length <= 60);
  assert.equal(codes.at(-1), 429);
});

// GitHub's newer installation tokens are long and contain '.' and '_' (Builder, Oct 9)
import { test as _t2 } from 'node:test';
_t2('accepts long ghs_ tokens with . and _ in the shape check', () => {
  const re = /^ghs_[A-Za-z0-9._-]{20,1024}$/;
  if (!re.test('ghs_' + 'a'.repeat(200) + '.' + 'b_c'.repeat(60))) throw new Error('long token rejected');
  if (re.test('ghs_ bad token')) throw new Error('space accepted');
});
test('inbox (xray PR #5 port): POST /inbox/builder needs the ingest secret header; GET needs Builder installation token', async () => {
  const line = (id) => ({ id, t_ct: new Date().toISOString(), seat: 'builder', type: 'ready', repo: 'example-org/x', number: 7, sha: 'abcdef1', title: 'x #7', url: 'https://github.com/example-org/x/pull/7', reason: 'reviewer pass and green ci' });
  const post = (body, h = { 'X-Live-Ingest': INGEST }) => fetch(BASE + '/inbox/builder', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...h } });
  assert.equal((await post({ lines: [line('r1')] }, {})).status, 401);
  assert.equal((await post({ lines: [line('r1')] }, { Authorization: 'Bearer ' + INGEST })).status, 401);   // header only
  assert.equal((await post({ lines: [{ ...line('c1'), seat: 'reviewer' }] })).status, 403);                  // only builder mirrored
  const m1 = await post({ lines: [{ ...line('m1'), message: 'hi' }] });                                      // nothing stored
  assert.equal(m1.status, 400);
  const m1b = await m1.json();
  assert.match(m1b.error, /no line stored/);
  assert.deepEqual(m1b.rejected, ['m1']);
  const ok = await post({ lines: [line('r1'), line('r2'), line('r1')] });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).added, 2);
  assert.equal((await (await post({ lines: [line('r2')] })).json()).added, 0);
  const get = (tok, q = '') => fetch(BASE + '/inbox/builder' + q, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(INGEST)).status, 401);
  assert.equal((await get(T('c'))).status, 401);                                                            // ops-app: not an activity seat
  const g = await get(T('a')); assert.equal(g.status, 200); assert.deepEqual((await g.json()).lines.map(l => l.id), ['r1', 'r2']);
  assert.deepEqual((await (await get(T('a'), '?since=r1')).json()).lines.map(l => l.id), ['r2']);
  const kept = await post({ lines: [line('keep')] });
  assert.equal(kept.status, 200);
  const badReplace = await post({ replace: true, lines: [{ ...line('nope'), message: 'x' }] });
  assert.equal(badReplace.status, 400);
  assert.ok((await idsOf()).includes('keep'));
  const mixed = await post({ replace: true, lines: [line('new1'), { ...line('bad'), body: 'no' }] });
  assert.equal(mixed.status, 200);
  const mix = await mixed.json();
  assert.equal(mix.added, 1);
  assert.deepEqual(mix.rejected, ['bad']);
  assert.deepEqual(await idsOf(), ['new1']);
  async function idsOf() { return (await (await get(T('a'))).json()).lines.map(l => l.id); }
});
test('GET /ingest/events: ingest secret only; events since the cursor', async () => {
  assert.equal((await fetch(BASE + '/ingest/events')).status, 401);
  const now = new Date().toISOString();
  await ingest(JSON.stringify({ title: 't', generated_at: now, events: [{ id: 'ie1', t_ct: now, kind: 'pr_open', label: 'x' }] }));
  const a = await (await fetch(BASE + '/ingest/events', { headers: { Authorization: 'Bearer ' + INGEST } })).json();
  assert.ok(a.reset && a.events.some(e => e.id === 'ie1') && a.cursor);
  await ingest(JSON.stringify({ title: 't', generated_at: now, events: [{ id: 'ie1', t_ct: now, kind: 'pr_open', label: 'x' }, { id: 'ie2', t_ct: now, kind: 'merged', label: 'y' }] }));
  const b = await (await fetch(BASE + '/ingest/events?since=' + a.cursor, { headers: { Authorization: 'Bearer ' + INGEST } })).json();
  assert.deepEqual(b.events.map(e => e.id), ['ie2']);
});

test('nudges: L1 to next owner after 60 min quiet, L2 to Coord 30 min later, one open per card per level, a beat closes; per-seat auth', async () => {
  const H = k => ({ headers: k ? { Authorization: 'Bearer ' + k } : {} });
  const now = Date.now(), R = 'example-org/app';
  const card = (n, quietMin, extra = {}) => ({ key: R + '#' + n, kind: 'pr', repo: R, number: n, title: 'card ' + n, url: 'https://github.com/' + R + '/pull/' + n,
    owner: 'Builder', stage: 'fix', state: 'live', packet: {}, packet_ok: false, missing: [], beats: [{ t: now - quietMin * 60000, what: 'pushed', url: '', id: 'b' + n }], last_beat_t: now - quietMin * 60000, stall: quietMin >= 60, ...extra });
  const push = cards => ingest(JSON.stringify({ title: 't', event_count: 0, generated_at: new Date().toISOString(), events: [], board: { updated_ct: 'x', cards } }));
  const A = card(901, 61, { packet: { 'next owner': 'Reviewer' } }), B = card(902, 10), C = card(903, 200, { state: 'parked' }), D = card(904, 70), E = card(905, 65, { stage: 'retest', nudge_to: 'tester', packet: { 'next owner': 'Tester' } });
  assert.equal((await push([A, B, C, D, E])).status, 200);
  assert.equal((await fetch(BASE + '/nudges', H())).status, 401);
  assert.equal((await fetch(BASE + '/nudges', H('nope'))).status, 401);
  assert.equal((await fetch(BASE + '/nudges', H(CKEY))).status, 403);                 // operator key only
  let ns = (await (await fetch(BASE + '/nudges', H(OKEY))).json()).nudges.filter(n => n.kind !== 'silent');
  assert.deepEqual(ns.map(n => [n.card.split('#')[1], n.level, n.seat]).sort(), [['901', 1, 'reviewer'], ['904', 1, 'builder'], ['905', 1, 'tester']]);   // retest -> Tester
  await push([A, B, C, D]);   // 905 done (tick / fixed / resolved) -> its nudge closes before any L2
  assert.ok((await (await fetch(BASE + '/nudges', H(OKEY))).json()).nudges.filter(n => n.kind !== 'silent').find(n => n.card.endsWith('#905')).closed_at);   // timing: B (10 min) and parked C get none
  await new Promise(r => setTimeout(r, 1200));                                       // L2 window (NUDGE_L2_S=1)
  ns = (await (await fetch(BASE + '/nudges', H(OKEY))).json()).nudges.filter(n => n.kind !== 'silent');
  assert.deepEqual(ns.filter(n => n.level === 2).map(n => [n.card.split('#')[1], n.seat]).sort(), [['901', 'coord'], ['904', 'coord']]);   // none for closed 905
  await push([A, B, C, D]); await fetch(BASE + '/nudges', H(OKEY));
  ns = (await (await fetch(BASE + '/nudges', H(OKEY))).json()).nudges.filter(n => n.kind !== 'silent');
  assert.equal(ns.length, 5);                                                          // dedupe: one per card per level
  const since = (await (await fetch(BASE + '/nudges?since=' + encodeURIComponent(ns[2].id), H(OKEY))).json()).nudges.filter(n => n.kind !== 'silent');
  assert.equal(since.length, 2);
  const cards = await (await fetch(BASE + '/cards?seat=reviewer', H(CKEY))).json();
  assert.deepEqual(cards.cards.map(c => c.number), [901]);                             // next owner Reviewer
  assert.deepEqual(cards.cards[0].beats.filter(b => b.nudge).map(b => b.what), ['nudge L1 → reviewer', 'nudge L2 → coord']);
  assert.equal((await fetch(BASE + '/cards?seat=coord', H(CKEY))).status, 403);
  assert.equal((await fetch(BASE + '/cards?seat=reviewer', H())).status, 401);
  assert.equal((await (await fetch(BASE + '/cards?seat=reviewer', H(OKEY))).json()).cards.length, 1);
  const feedNow = await (await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie } })).json();
  assert.ok(feedNow.board.cards.find(c => c.number === 901).nudge === 2);      // the page sees nudge beats
  const A2 = { ...A, last_beat_t: now, beats: [...A.beats, { t: now, what: 'pushed', id: 'b2' }] };   // a real beat
  await push([A2, B, C, D]);
  ns = (await (await fetch(BASE + '/nudges', H(OKEY))).json()).nudges.filter(n => n.kind !== 'silent');
  assert.ok(ns.filter(n => n.card.endsWith('#901')).every(n => n.closed_at));
  assert.ok(ns.filter(n => n.card.endsWith('#904')).every(n => !n.closed_at));
  // seat inboxes on the server
  const line = { id: 'L-c1', t_ct: new Date().toISOString(), seat: 'reviewer', type: 'pr_open', repo: R, number: 5, title: 't', url: '', reason: 'r' };
  const post = h => fetch(BASE + '/inbox', { method: 'POST', body: JSON.stringify({ lines: [line] }), headers: { 'Content-Type': 'application/json', ...h } });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ 'X-Live-Ingest': INGEST })).status, 200);
  assert.equal((await fetch(BASE + '/inbox/reviewer', H())).status, 401);
  assert.equal((await fetch(BASE + '/inbox/reviewer', H(OKEY))).status, 403);           // only the seat itself
  assert.deepEqual((await (await fetch(BASE + '/inbox/reviewer', H(CKEY))).json()).lines.map(l => l.id), ['L-c1']);
  assert.deepEqual((await (await fetch(BASE + '/inbox/reviewer?since=L-c1', H(CKEY))).json()).lines, []);
});

test('silent seat: >2h without activity while owning live work -> fleet seat silent + one Coord nudge per quiet stretch', async () => {
  const H = { headers: { Authorization: 'Bearer ' + OKEY } }, now = Date.now(), R = 'example-org/app';
  const iso = ms => new Date(ms).toISOString();
  const c = { key: R + '#950', kind: 'pr', repo: R, number: 950, title: 'x', url: '', owner: 'Lead', stage: 'review', state: 'live',
    packet: { 'next owner': 'Reviewer' }, beats: [{ t: now - 5 * 60000, what: 'pushed', id: 'z' }], last_beat_t: now - 5 * 60000 };
  const push = (lastCritic, lastChaos, cards = [c]) => ingest(JSON.stringify({ title: 't', event_count: 0, generated_at: iso(now), events: [],
    fleet: { window_min: 15, seats: { Reviewer: { last_ct: iso(lastCritic) }, Tester: { last_ct: iso(lastChaos) }, Lead: { last_ct: iso(now - 9e6) } } },
    board: { cards } }));
  const silent = async () => (await (await fetch(BASE + '/nudges', H)).json()).nudges.filter(n => n.kind === 'silent' && n.about === 'reviewer');
  await push(now - 3 * 3600e3, now - 3 * 3600e3);          // Reviewer owns #950 (next owner) and is quiet 3h; Tester owns nothing
  let s = await silent();
  assert.deepEqual(s.map(n => [n.about, n.seat, n.level, !!n.closed_at]), [['reviewer', 'coord', 2, false]]);
  const f = await (await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie } })).json();
  assert.equal(f.fleet.seats.Reviewer.silent, true); assert.ok(!f.fleet.seats.Tester.silent); assert.ok(!f.fleet.seats.Lead.silent);   // humans never
  await push(now - 3 * 3600e3, now - 3 * 3600e3); s = await silent();
  assert.equal(s.length, 1);                                // deduped within the quiet stretch
  await push(now - 60e3, now - 3 * 3600e3); s = await silent();
  assert.ok(s[0].closed_at);                                // the seat acted: closed
  await push(now - 60e3, now - 3 * 3600e3, []); s = await silent();
  assert.equal(s.length, 1);
});

test('collector health arg is COLLECTOR_HEALTH_URLS, with no example host', () => {
  const src = fs.readFileSync(path.join(APP, 'server.mjs'), 'utf8');
  assert.equal(src.includes('dev.example.com/health'), false);
  assert.match(src, /COLLECTOR_HEALTH_URLS/);
  assert.match(src, /LIVE_FLEET_SEATS/);
});

test('fresh box board wins over a newer host board', async () => {
  const now = Date.now();
  const box = { key: 'example-org/app#7001', kind: 'pr', repo: 'example-org/app', number: 7001, title: 'box card', url: '', owner: 'Builder', stage: 'review', state: 'live', packet: {}, beats: [], last_beat_t: now };
  const host = { key: 'example-org/app#7002', kind: 'pr', repo: 'example-org/app', number: 7002, title: 'host card', url: '', owner: 'Builder', stage: 'review', state: 'live', packet: {}, beats: [], last_beat_t: now };
  assert.equal((await ingest(JSON.stringify({ title: 't', event_count: 0, generated_at: new Date(now).toISOString(), events: [], board: { cards: [box] } }))).status, 200);
  const gfile = path.join(DATA, 'feed', 'github-events.json');
  const ghFeed = { title: 't', generated_at: new Date(now + 5000).toISOString(), event_count: 0, events: [], board: { updated_ct: 't', cards: [host] } };
  fs.mkdirSync(path.dirname(gfile), { recursive: true });
  fs.writeFileSync(gfile + '.tmp', JSON.stringify(ghFeed));
  fs.renameSync(gfile + '.tmp', gfile);
  let f;
  for (let i = 0; i < 40; i++) {
    f = await (await fetch(BASE + '/live-events.json', { headers: { Cookie: cookie } })).json();
    if (f.sources && f.sources.github) break;
    await new Promise(r => setTimeout(r, 200));
  }
  assert.ok(f.sources && f.sources.github);
  assert.ok(f.board.cards.some(c => c.number === 7001));
  assert.equal(f.board.cards.some(c => c.number === 7002), false);
});
