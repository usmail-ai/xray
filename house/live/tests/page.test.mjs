// Generated page (app/public/index.html): inline script compiles; Replay + ping-node guard are wired in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = process.env.MESH_APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const html = fs.readFileSync(path.join(APP, 'public', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test('inline scripts compile', () => { for (const s of inline) assert.doesNotThrow(() => new Function(s)); });
test('Replay: live on first load, ends into live, indicator', () => {
  assert.match(html, /REPLAY_MS = 6500, REPLAY_WINDOW_MS = 5 \* 60 \* 1000, REPLAY_MIN_EVENTS = 20/);
  assert.match(html, /if \(first && !reduced && startReplay\(\)\) fresh = \[\];/);
  assert.match(html, /\(replay && state\.t >= replay\.end\)\) goLive\(\);/);
  assert.match(html, /function goLive\(\) \{ endReplay\(\);/);
  assert.match(html, /'REPLAY'/);
});
test('pings never target an undrawn node (upstream lowercase reviewer)', () => {
  assert.match(html, /return fixPings\(L\.pingsAt\(/);
  assert.match(html, /return fixPings\(flashes\.filter/);
  assert.match(html, /function hopPing\(pk\)/);
});
test('branding: Lead is labeled Lead / Architect; banned role word absent', () => {
  const cfg = fs.readFileSync(path.join(APP, 'public', 'live-config.js'), 'utf8');
  const banned = new RegExp(['f', 'o', 'u', 'n', 'd', 'e', 'r'].join(''), 'i');   // spelled out nowhere in the repo
  assert.doesNotMatch(cfg, banned);
  assert.doesNotMatch(html, banned);
  assert.match(cfg, /Lead: 'Lead', X: 'Others'/);
  assert.match(cfg, /Lead: 'Architect', X: 'other actors'/);
});
test('draw-loop guards: missing endpoints skipped + logged once; frame errors never stop the loop', () => {
  assert.match(html, /if \(!hasPos\(ed\[0\], 'edge'\) \|\| !hasPos\(ed\[1\], 'edge'\)\) return;/);
  assert.match(html, /if \(!hasPos\(pk\.src, 'ping'\) \|\| !hasPos\(pk\.dst, 'ping'\)\) return;/);
  assert.match(html, /catch \(err\) \{ warnOnce\('frame:'/);
});
test('board: every feed name maps to a drawn node; instances -> Example, QaOne/QaTwo -> QA; 7 seats', () => {
  const L = { SOURCES: [], AGENTS: [], SEAT_NAMES: [], SATS: {}, COLOR: {}, LABEL: {}, SUB: {}, GLYPH: {}, SQUARE: {},
    EDGES: [], BOT_IMAGES: [], KIND_WORD: {}, applyFeed: (st, feed) => ({ state: { events: feed.events } }) };
  new Function('window', 'location', fs.readFileSync(path.join(APP, 'public', 'live-config.js'), 'utf8'))(
    { LiveMesh: L }, { search: '' });
  assert.deepEqual(L.SEAT_NAMES, ['Builder', 'Builder-cloud', 'Reviewer', 'Tester', 'QA', 'Operator', 'blinky']);
  for (const k of ['dev.example.com', 'labtest', 'app.example.com', 'QaOne', 'QaTwo', 'lead-alt', 'forge', 'CI']) assert.ok(!(k in L.SATS), k);
  assert.equal(Object.keys(L.SATS).length, 14);   // + Builder-cloud
  assert.equal(L.LABEL['Builder-cloud'], 'Builder-cloud'); assert.ok(L.EDGES.some(e => e[0] === 'Builder-cloud' && e[1] === 'GitHub'));
  assert.equal(L.LABEL.Assistant, 'Assistant / emitter'); assert.ok(L.AGENTS.some((a) => a[0] === 'Assistant')); assert.ok(!L.SEAT_NAMES.includes('Assistant'));   // emitter node, not a counted bot
  assert.equal(L.LABEL.CloudAgents, 'Cloud agents'); assert.equal(L.botImage('CloudAgents'), null);   // 'C' glyph, no image
  assert.ok(L.AGENTS.some((a) => a[0] === 'CloudAgents' && a[1] === 'cloud agents'));                 // header seat
  assert.ok(!L.SEAT_NAMES.includes('CloudAgents'));                                                     // not counted
  assert.equal(L.liveNodeKey('cursoragent', null), 'CloudAgents'); assert.equal(L.liveNodeKey('Cloud agents', null), 'CloudAgents');
  assert.equal(L.liveNodeKey('CI', null), 'GitHub'); assert.equal(L.liveNodeKey('forge', null), 'GitHub');
  assert.deepEqual(L.liveColor({ kind: 'check_run', conclusion: 'success' }), [90, 220, 120]);
  assert.deepEqual(L.liveColor({ kind: 'workflow_run', conclusion: 'failure' }), [240, 90, 80]);
  assert.deepEqual(L.liveColor({ kind: 'commit_status', state: 'pending' }), [165, 175, 190]);
  assert.equal(L.liveColor({ kind: 'merged' }), null);

  assert.equal(L.LABEL.Lead, 'Lead'); assert.equal(L.SUB.Lead, 'Architect'); assert.equal(L.botImage('Lead'), 'avatars/lead.png');
  assert.equal(L.LABEL['mymuse.house'], 'Example'); assert.equal(L.LABEL.QA, 'QA');
  for (const ed of L.EDGES) assert.ok(ed[0] in L.SATS && ed[1] in L.SATS, ed.join('-'));
  const names = ['Builder', 'Reviewer', 'reviewer', 'Tester', 'QaOne', 'QaTwo', 'QA', 'Operator', 'Coord', 'CI', 'Others',
    'GitHub', 'Railway', 'Example', 'lead-alt', 'Lead', 'dev.example.com', 'app.example.com', 'labtest', 'mystery',
    'lead-alt', 'lead-login'];
  const ev = names.map((n, i) => ({ id: 'e' + i, t_ct: '2026-10-08T13:00:00-05:00', kind: 'x', from: n, to: n, hops: [n, 'dev.example.com'] }));
  ev.push({ id: 'h', t_ct: '2026-10-08T13:00:00-05:00', kind: 'health_ok', from: 'app.example.com', to: 'Example' });
  const out = L.applyFeed({ events: [] }, { events: ev }).state.events;
  for (const e of out) {
    assert.ok(e.from in L.SATS && e.to in L.SATS, e.id + ' ' + e.from + '->' + e.to);
    if (e.hops) assert.ok(e.hops.every((k) => k in L.SATS), e.id);
  }
  assert.deepEqual([out.at(-1).from, out.at(-1).to], ['Railway', 'mymuse.house']);
  assert.equal(out.find((e) => e.id === 'e4').to, 'QA');
  for (const i of [14, 20, 21]) assert.equal(out.find((e) => e.id === 'e' + i).from, 'Lead', names[i]);   // lead-alt / lead-alt / lead-login
  const more = [['op_deploy', 'Operator', 'dev.example.com', ['Operator', 'Railway', 'Example'], ['Operator', 'Railway', 'mymuse.house']],
    ['op_commit', 'Operator', 'GitHub', ['Operator', 'GitHub'], ['Operator', 'GitHub']],
    ['cos_file', 'Coord', 'Example', ['Coord', 'Example'], ['blinky', 'mymuse.house']],
    ['check_run', 'GitHub', 'Builder', ['GitHub', 'Builder'], ['GitHub', 'Builder']],
    ['check_suite', 'GitHub', 'GitHub', ['GitHub'], null],
    ['cloud_reply', 'Operator', 'CloudAgents', ['Operator', 'CloudAgents'], ['Operator', 'CloudAgents']],
    ['cloud_finished', 'CloudAgents', 'Operator', ['CloudAgents', 'Operator'], ['CloudAgents', 'Operator']]];
  const o2 = L.applyFeed({ events: [] }, { events: more.map((m, i) => ({ id: 'm' + i, t_ct: '2026-10-08T13:00:00-05:00', kind: m[0], from: m[1], to: m[2], hops: m[3] })) }).state.events;
  more.forEach((m, i) => assert.deepEqual(o2[i].hops, m[4], m[0]));
  assert.deepEqual([o2[4].from, o2[4].to], ['GitHub', 'GitHub']);   // one-node check: drawn as a ring on GitHub
});
test('live queue: every new id flashes once in time order, late ones tagged, none capped or lost while not live', () => {
  assert.doesNotMatch(html, /slice\(-12\)/);
  const a = html.indexOf('  // Live queue:'), b = html.indexOf('  function currentPings(nowWall) {', a);
  assert.ok(a > 0 && b > a);
  const now = Date.now(), ev = (id, ageS) => ({ id, _t: now - ageS * 1000, hops: ['Builder', 'GitHub', 'Railway', 'dev.example.com'] });
  const run = new Function('window', 'state', 'flashes', 'STAGGER_MS', 'FLASH_MS', 'performance',
    html.slice(a, b) + '\nreturn { queueFresh, playFresh };');
  const win = {}, state = { live: false }, flashes = [];
  const q = run(win, state, flashes, 450, 1600, { now: () => 0 });
  const batch = Array.from({ length: 34 }, (_, i) => ev('e' + i, 200 - i));   // 34 new ids, oldest first
  batch.push(ev('m187', 400), ev('old', 3600));                               // a late merge + a 1 h old import
  q.queueFresh(batch); q.playFresh();
  assert.equal(flashes.length, 0, 'nothing plays while Replay / rewound');
  state.live = true; q.playFresh();
  assert.equal(flashes.length, 35, 'all 35 recent ids play (no newest-12 cap)');
  assert.equal(flashes[0].e.id, 'm187');
  assert.ok(flashes[0].late && flashes[0].dur === 4800);
  assert.ok(flashes.every((f, i) => !i || f.start > flashes[i - 1].start));
  assert.ok(flashes[34].start <= 9000, 'big batch compresses into ~9 s');
  assert.deepEqual(win.LIVE_LIVE_STATS, { queued: 36, played: 35, late: 35, history: 1 });
  q.queueFresh([ev('n1', 5)]); q.playFresh();
  assert.ok(!flashes[35].late && flashes[35].start > flashes[34].start, 'next batch queues after, not on top');
});
test('one-node events draw a ring pulse instead of a self-edge; check colors applied to pings', () => {
  assert.match(html, /if \(pk\.src === pk\.dst\) \{   \/\/ one-node event/);
  assert.match(html, /var uc = L\.liveColor && L\.liveColor\(pk\.e\); if \(uc\) pk\.col = uc;/);
  assert.doesNotMatch(html, /'GitHub' : 'forge'/);
});
test('Cloud agents seat reads the feed cloud state, not the bot count', () => {
  assert.match(html, /if \(k === 'CloudAgents'\) return !!\(f && f\.cloud && f\.cloud\.active\);/);
});

test('LIVE pill is honest about generated_at age', () => {
  assert.match(html, /behind ' \+ m \+ ' min/);
  assert.match(html, /\.pill\.behind/);
  assert.match(html, /\(now - state\.generatedAt\) > 90000/);
});



test('working: canvas label keeps the rolling sheen; header chip blinks its EXISTING dot in the seat color', () => {
  assert.match(html, /function fleetWorking\(k\)/);
  assert.match(html, /seat-color sheen sweeping/);                       // canvas, under the node icon
  assert.match(html, /s\.dot\.classList\.toggle\('blink', spinning\)/);
  assert.match(html, /if \(spinning\) s\.dot\.style\.background = rgb\(c\)/);
  assert.match(html, /\.seat \.dot\.blink \{ animation: live-blink/);
  assert.match(html, /prefers-reduced-motion: reduce\) \{ \.seat \.dot\.blink \{ animation: none/);
  assert.doesNotMatch(html, /s\.spin/);                                  // no extra element in the chip
  assert.doesNotMatch(html, /\.seat \.spin/);
  assert.doesNotMatch(html, /\u2699/);
});
test('one seat state: header text, dot and node label all come from L.seatView(seatState(..)) (working > live > active > idle)', () => {
  const L = { SOURCES: [], AGENTS: [], SEAT_NAMES: [], SATS: {}, COLOR: {}, LABEL: {}, SUB: {}, GLYPH: {}, SQUARE: {},
    EDGES: [], BOT_IMAGES: [], KIND_WORD: {}, applyFeed: (st, feed) => ({ state: { events: feed.events } }) };
  new Function('window', 'location', fs.readFileSync(path.join(APP, 'public', 'live-config.js'), 'utf8'))({ LiveMesh: L }, { search: '' });
  const want = { working: ['WORKING', true, true, true], live: ['LIVE', true, false, false], active: ['ACTIVE', true, false, false], idle: ['IDLE', false, false, false] };
  for (const working of [false, true]) for (const live of [false, true]) for (const active of [false, true]) {
    const st = L.seatState(working, live, active);
    assert.equal(st, working ? 'working' : live ? 'live' : active ? 'active' : 'idle');
    const v = L.seatView(st), [word, lit, blink, nodeWorking] = want[st];
    assert.deepEqual([v.word, v.lit, v.blink, v.nodeWorking], [word, lit, blink, nodeWorking], `${working}/${live}/${active}`);
    assert.equal(v.blink, v.nodeWorking);                       // dot blinks <=> node shows 'working'
    assert.equal(v.word === 'IDLE', !v.lit);                    // header word idle <=> node unlit
  }
  // the page derives chip text, dot and node from that one state (no other source of truth left)
  assert.match(html, /function seatState\(k, hot\) \{ return L\.seatState\(fleetWorking\(k\), !!\(hot && hot\[k\]\), fleetActive\(k\)\); \}/);
  assert.match(html, /v = L\.seatView\(seatState\(a\[0\], hot\)\), on = v\.lit;/);
  assert.match(html, /s\.st\.textContent = s\.role \+ ' · ' \+ v\.word;/);
  assert.match(html, /var spinning = v\.blink;/);
  assert.match(html, /var nv = L\.seatView\(seatState\(key, hot\)\); nodeView\[key\] = nv;/);
  assert.match(html, /drawNode\(key, nv\.lit, fs, pul, nv\.nodeWorking, nowWall\);/);
  assert.doesNotMatch(html, /hot\[a\[0\]\] \? 'LIVE'/);         // the old split derivation is gone
  assert.doesNotMatch(html, /fleetWorking\(key\), nowWall/);
});

test('near-real-time poll: config sets 10 s, page polls on L.POLL_MS after the overlay loads', async () => {
  const vm = await import('node:vm');
  const pub = path.join(APP, 'public');
  const ctx = { window: {}, console, URLSearchParams, location: { search: '', hash: '', href: 'http://x/' }, document: { addEventListener() {} } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(pub, 'live.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(pub, 'live-config.js'), 'utf8'), ctx);
  assert.equal(ctx.LiveMesh.POLL_MS, 10000);
  assert.match(html, /setInterval\(poll, L\.POLL_MS\)/);
  assert.ok(html.indexOf('src="live-config.js"') < html.indexOf('setInterval(poll, L.POLL_MS)'));
});
test('delta polls: full once, then ?since=cursor; new ids play once; 304 = no feed; reset refetches full', async () => {
  const vm = await import('node:vm');
  const pub = path.join(APP, 'public');
  const ctx = { console, URLSearchParams, location: { search: '', hash: '', href: 'http://x/' }, document: { addEventListener() {} },
    LIVE_FEED_URL: '/live-events.json' };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(pub, 'live.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(pub, 'live-config.js'), 'utf8'), ctx);
  const L = ctx.LiveMesh;
  const e = (id, extra = {}) => ({ id, t_ct: '2026-10-09T07:5' + id.slice(-1) + ':00-05:00', kind: 'commit', from: 'Builder', to: 'GitHub', ...extra });
  const replies = [], urls = [];
  const fake = (url) => { urls.push(url); const [status, body] = replies.shift();
    return Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) }); };
  const mem = {};
  let state = { events: [], live: true, t: 0 };
  const step = async () => { const r = await L.fetchFeed(fake, Date.now(), mem); if (!r.feed) return null;
    const out = L.applyFeed(state, r.feed, Date.now()); state = out.state; return out.added; };
  replies.push([200, { cursor: 'E.1', generated_at: '2026-10-09T07:55:00-05:00', event_count: 2, fleet: { a: 1 }, events: [e('e1'), e('e2')] }]);
  assert.deepEqual([...await step()].sort(), ['e1', 'e2']);
  assert.equal(urls[0], '/live-events.json');
  replies.push([200, { delta: true, cursor: 'E.2', generated_at: '2026-10-09T07:56:00-05:00', event_count: 3, fleet: { a: 2 },
    events: [e('e2', { status: 'done' }), e('e3')], removed: [] }]);
  assert.deepEqual([...await step()], ['e3']);                         // the changed e2 does not replay
  assert.equal(urls[1], '/live-events.json?since=E.1');
  assert.equal(state.events.length, 3);
  assert.equal(state.events.find((x) => x.id === 'e2').status, 'done');
  assert.equal(state.generatedAt, Date.parse('2026-10-09T07:56:00-05:00'));
  assert.equal(ctx.LIVE_FLEET.a, 2);
  replies.push([304, null]);
  assert.equal(await step(), null);
  assert.equal(urls[2], '/live-events.json?since=E.2');
  replies.push([200, { reset: true, cursor: 'F.1' }], [200, { cursor: 'F.1', generated_at: '2026-10-09T07:57:00-05:00', events: [e('e1'), e('e4')] }]);
  assert.deepEqual([...await step()], ['e4']);                         // reset -> full refetch, only unseen ids play
  assert.deepEqual(urls.slice(3), ['/live-events.json?since=E.2', '/live-events.json']);
  assert.equal(mem.cursor, 'F.1');
});
test('ambient Replay loop: dimmed overlay every 10 s, visual only, toggle + ?replay=0 + reduced motion', () => {
  assert.match(html, /AMBIENT_EVERY_MS = 10000, AMBIENT_MS = 5000, AMBIENT_WINDOW_MS = 5 \* 60 \* 1000, AMBIENT_ALPHA = 0\.4;/);
  assert.match(html, /var ambientOn = !reduced && !\/\[\?&\]replay=0\(&\|\$\)\/\.test\(location\.search\);/);
  assert.match(html, /<input id="ambient" type="checkbox" checked>/);
  assert.match(html, /if \(!ambientOn \|\| !state\.live \|\| replay \|\| document\.hidden\)/);
  // ghosts drawn dimmed first, live pings on top at full brightness
  assert.match(html, /ctx\.globalAlpha = AMBIENT_ALPHA; ghosts\.forEach\(drawPing\); ctx\.globalAlpha = 1; \}\n    pings\.forEach\(drawPing\);/);
  // visual only: the loop never touches live state / speed / replay, and makes no fetches
  const body = html.split('function ambientPings(nowWall) {')[1].split('function draw(')[0];
  assert.doesNotMatch(body, /state\.(live|t|generatedAt)\s*=|speed\s*=|replay\s*=|rewindTo|goLive|fetch|setInterval|setTimeout|flashes/);
});
test('Live board: rainbow trail only on replay pings, REPLAY tag beside (never replacing) the pill, reduced motion off', () => {
  assert.match(html, /<span class="pill" id="pill">LIVE<\/span><span class="spec-tag" id="specTag" aria-hidden="true">\u{1FA9E} REPLAY<\/span>/u);
  assert.match(html, /\.spec-tag \{[^}]*opacity: 0;[^}]*transition: opacity \.3s/);
  assert.match(html, /prefers-reduced-motion: reduce\) \{ \.spec-tag, \.spec-tag\.on \{ transition: none; \} \}/);
  assert.match(html, /var tagOn = !!ambient \|\| !!replay;/);
  assert.match(html, /if \(!reduced\) \{ ghosts\.forEach\(function \(g\) \{ g\.live = true; \}\); if \(replay\) pings\.forEach/);
  assert.match(html, /if \(pk\.live\) replayTrail\(a, m, b, p, nowWall\);\n      else for \(var k = 5;/);
  // the tag code never writes the pill
  const tag = html.split('var tagOn =')[1].split('\n')[1];
  assert.doesNotMatch(tag, /pill/);
  // live flashes never get the trail
  assert.doesNotMatch(html.split('function playFresh() {')[1].split('function currentPings')[0], /replayTrail/);
});
test('working-gone regression: Replay / ambient / Live board code never touches working state or seat chips', () => {
  const grab = (a, b) => html.split(a)[1].split(b)[0];
  const parts = [grab('function startReplay() {', '\n  }\n'), grab('function replayTrail(', 'function ambientPings'),
    grab('function ambientPings(nowWall) {', 'function draw('), grab('var tagOn =', '    pings.forEach(drawPing);')];
  for (const p of parts) assert.doesNotMatch(p, /working|LIVE_FLEET|seatEls|seatState|chipView|nodeView|\.seat\b/);
  // seat state still derives from the fleet only (not the replay clock)
  assert.match(html, /function seatState\(k, hot\) \{ return L\.seatState\(fleetWorking\(k\), !!\(hot && hot\[k\]\), fleetActive\(k\)\); \}/);
});
test('board panel: split 2/3 + 1/3, model from feed.board, textContent only, glow on related beats, toggle', () => {
  assert.match(html, /grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/);
  assert.match(html, /<b>\u{1F30A} Board<\/b>/u);
  assert.match(html, /if \(r\.feed\.board && Array\.isArray\(r\.feed\.board\.cards\)\)/);
  assert.match(html, /\.wave\.collapsed \.wave-body \{ display: none; \}/);
  assert.match(html, /f\.landed = 1; waveGlow\(f\.e\);/);
  const js = html.split('// 🌊 Board panel')[1].split('function draw(')[0];
  assert.doesNotMatch(js, /innerHTML|fetch\(|setInterval|setTimeout/);
  assert.match(js, /wbSafeUrl/);
});
test('pre-alpha naming: page is 🌈 Live board, replay tag 🪞 REPLAY, panel 🌊 Board', () => {
  assert.match(html, /<title>\u{1F308} Live board/u);
  assert.match(html, /<h1>\u{1F308} Live board<\/h1>/u);
  assert.match(html, /id="specTag" aria-hidden="true">\u{1FA9E} REPLAY</u);
  assert.doesNotMatch(html, /\u{1F308} REPLAY/u);
  assert.match(html, /<b>\u{1F30A} Board<\/b>/u);
});
test('board stats strip: 24h counts + open now from feed.board.stats, textContent only', () => {
  assert.match(html, /<div class="wave-stats" id="waveStats"/);
  for (const k of ['issues_opened_24h', 'issues_closed_24h', 'prs_opened_24h', 'prs_merged_24h', 'prs_closed_unmerged_24h', 'open_total']) assert.match(html, new RegExp('S\\.' + k));
  assert.match(html, /wb\.stats = r\.feed\.board\.stats \|\| null/);
});
test('silent seat: amber "silent 2h" on node and chip from fleet.seats[name].silent, never while working', () => {
  assert.match(html, /return !!\(f && f\.seats && f\.seats\[name\] && f\.seats\[name\]\.silent\);/);
  assert.match(html, /var silentNow = !spinning && fleetSilent\(key\);/);
  assert.match(html, /ctx\.fillText\('silent 2h', x, top\)/);
  assert.match(html, /var sil = !v\.blink && fleetSilent\(a\[0\]\); if \(sil\) s\.st\.textContent \+= ' · silent 2h';/);
});
