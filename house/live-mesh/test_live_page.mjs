// Tests for docs-site/static/live/live.js (the public live page's feed logic).
// Run: node --test house/live-mesh/test_live_page.mjs   (Node 18+, no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const liveDir = path.join(here, '..', '..', 'docs-site', 'static', 'live');
const sandbox = {};
vm.runInNewContext(readFileSync(path.join(liveDir, 'live.js'), 'utf8'), sandbox);
const L = sandbox.LiveMesh;
const feed = JSON.parse(readFileSync(path.join(here, 'sample', 'live-events.json'), 'utf8'));
const schema = JSON.parse(readFileSync(path.join(here, 'schema.json'), 'utf8'));
const ids = (list) => list.map((e) => e.id);

test('merge sorts by time, dedupes by id, keeps every sample event', () => {
  const merged = L.mergeEvents([], feed.events);
  assert.equal(merged.length, new Set(ids(feed.events)).size);
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i - 1]._t <= merged[i]._t);
  assert.deepEqual(ids(L.mergeEvents(merged, feed.events)), ids(merged), 'merging the same feed twice adds nothing');
  const shuffled = [...feed.events].reverse();
  assert.deepEqual(ids(L.mergeEvents([], shuffled)), ids(merged), 'input order does not matter');
});

test('a later poll adds only new ids and a re-sent id replaces the old copy', () => {
  const half = Math.floor(feed.events.length / 2);
  const known = L.mergeEvents([], feed.events.slice(0, half + 5));
  const relabeled = { ...feed.events[0], label: 'relabeled' };
  const merged = L.mergeEvents(known, [...feed.events.slice(half), relabeled]);
  assert.equal(merged.length, feed.events.length);
  assert.equal(merged.find((e) => e.id === relabeled.id).label, 'relabeled');
  assert.ok(!('_t' in feed.events[0]), 'inputs are not mutated');
});

test('replay shows exactly the events up to the chosen time', () => {
  const ev = L.mergeEvents([], feed.events);
  assert.equal(L.countUpTo(ev, ev[0]._t - 1), 0);
  assert.equal(L.countUpTo(ev, ev.at(-1)._t), ev.length);
  const k = Math.floor(ev.length / 3);
  const upTo = L.eventsUpTo(ev, ev[k]._t);
  assert.ok(upTo.length >= k + 1, 'the event at the chosen time is included');
  assert.ok(upTo.every((e) => e._t <= ev[k]._t));
  assert.ok(ev.slice(upTo.length).every((e) => e._t > ev[k]._t), 'nothing after the chosen time');
});

test('pings in flight are the events inside the ping span', () => {
  const ev = L.mergeEvents([], feed.events);
  const last = ev.at(-1);
  const pings = L.pingsAt(ev, last._t + 500, 1100);
  assert.ok(pings.some((p) => p.e.id === last.id));
  const p = pings.find((x) => x.e.id === last.id);
  assert.ok(Math.abs(p.p - 500 / 1100) < 1e-9);
  assert.equal(L.pingsAt(ev, last._t + 5000, 1100).length, 0);
});

test('applyFeed: Live follows now, a rewound view stays put', () => {
  const half = Math.floor(feed.events.length / 2);
  const start = { events: L.mergeEvents([], feed.events.slice(0, half)), live: true, t: 0, generatedAt: null };
  const now = Date.parse('2026-10-06T03:00:00-05:00');
  const live = L.applyFeed(start, feed, now);
  assert.equal(live.state.live, true);
  assert.equal(live.state.t, now);
  assert.equal(live.added.length, feed.events.length - half);
  assert.equal(live.state.generatedAt, Date.parse(feed.generated_at));
  const rewound = L.applyFeed({ ...start, live: false, t: 12345 }, feed, now);
  assert.equal(rewound.state.live, false);
  assert.equal(rewound.state.t, 12345);
  const older = L.applyFeed(live.state, { ...feed, generated_at: '2020-01-01T00:00:00-06:00', events: [] }, now);
  assert.equal(older.state.generatedAt, live.state.generatedAt, 'an older fallback copy never moves "updated" backwards');
  assert.equal(older.added.length, 0);
});

test('ping mapping matches render_mesh.resolve_nodes', () => {
  const r = (e) => [...L.resolveNodes(e)];
  assert.deepEqual(r({ kind: 'x_in_mention', from: 'someone', to: 'herald' }), ['X', 'herald']);
  assert.deepEqual(r({ kind: 'x_reply', from: 'herald', to: 'X' }), ['herald', 'X']);
  assert.deepEqual(r({ kind: 'deploy', from: 'GitHub', to: 'x' }), ['GitHub', 'mymuse.house']);
  assert.deepEqual(r({ kind: 'probe', from: 'x', to: 'y' }), ['mymuse.house', 'blinky']);
  assert.deepEqual(r({ kind: 'critic_pass', from: 'mill', to: 'critic' }), ['critic', 'GitHub']);
  assert.deepEqual(r({ kind: 'ci_pass', from: 'forge', to: 'forge' }), ['GitHub', 'forge']);
  assert.deepEqual(r({ kind: 'merged', from: 'Blaze0x1', to: 'GitHub' }), ['GitHub', 'forge']);
  assert.deepEqual(r({ kind: 'review', from: 'stranger', to: 'nobody' }), ['GitHub', 'forge']);
  for (const e of feed.events) {
    const [s, d] = L.resolveNodes(e);
    assert.ok(L.SATS[s] && L.SATS[d] && s !== d, `${e.id} maps to two drawn nodes`);
  }
  const legacy = new Set(['fix', 'probe', 'x_root', 'x_reply']);  // render_mesh falls back to the raw kind
  for (const k of schema.$defs.kind.enum) if (!legacy.has(k)) assert.ok(L.KIND_WORD[k], `kind word for ${k}`);
});

test('labels, CT times and fetch fallback', async () => {
  assert.equal(L.cleanLabel('a Dist b'), 'a \u2026 b');
  assert.equal(L.fmtCt(Date.parse('2026-10-06T02:13:17-05:00')), 'Oct 6 02:13:17 CT');
  assert.equal(L.ago(90e3), '2 min ago');
  assert.equal(L.headline({ repo: '0xRayAI/xray', number: 227, kind: 'merged' }), 'xray #227 \u00b7 merge');

  const calls = [];
  const res = (status, body, headers = {}) => ({
    status, ok: status >= 200 && status < 300, json: async () => body,
    headers: { get: (h) => headers[h] ?? null },
  });
  const now = 1_000_000_000_000;
  const mem = {};
  let script = [res(200, feed, { ETag: '"abc"' })];
  const fake = async (url, opts) => { calls.push({ url, opts }); return script.shift(); };
  let r = await L.fetchFeed(fake, now, mem);
  assert.equal(r.source, 'GitHub API');
  assert.ok(calls[0].url.startsWith('https://api.github.com/repos/0xRayAI/xray/contents/') && calls[0].url.includes('ref=live-wire'));
  assert.equal(calls[0].opts.headers.Accept, 'application/vnd.github.raw');
  assert.equal(mem.etag, '"abc"');

  script = [res(304, null)];
  r = await L.fetchFeed(fake, now, mem);
  assert.equal(r.feed, null, '304 means nothing new');
  assert.equal(calls[1].opts.headers['If-None-Match'], '"abc"');

  script = [res(403, {}, { 'X-RateLimit-Reset': String(now / 1000 + 900) }), res(200, feed)];
  r = await L.fetchFeed(fake, now, mem);
  assert.match(calls[3].url, /^https:\/\/raw\.githubusercontent\.com\/.*\?t=\d+$/);
  assert.equal(mem.apiBlockedUntil, now + 900e3);
  script = [res(500, {}), res(200, feed)];
  r = await L.fetchFeed(fake, now + 1000, mem);
  assert.equal(r.source, 'Pages copy', 'skips the API while rate-limited, then raw, then same-origin');
  assert.match(calls.at(-1).url, /^live-events\.json\?t=\d+$/);
});

test('the center node is Burst', () => {
  assert.equal(L.HUB_LABEL, 'Burst');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /L\.HUB_LABEL/);
  assert.ok(!html.includes("fillText('mesh'"));
});

test('page has no external scripts and no longer depends on the mp4', () => {
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.ok(!/mesh-live\.mp4|<video/i.test(html));
  assert.ok(!/<(script|link)[^>]+(src|href)="(https?:)?\/\//i.test(html));
  assert.match(html, /<script src="live\.js"><\/script>/);
});

test('seat images map to bots/<seat>.png, rails get none, badges are one letter', () => {
  for (const k of L.BOT_IMAGES) assert.equal(L.botImage(k), `bots/${k}.png`);
  for (const k of ['GitHub', 'X', 'mymuse.house', 'constructor', 'stranger']) assert.equal(L.botImage(k), null);
  assert.equal(L.badgeLetter('mill'), 'M');
  assert.equal(L.badgeLetter('critic'), 'C');
  assert.equal(L.badgeLetter('mymuse.house'), 'M');
  const bots = path.join(liveDir, 'bots');
  for (const f of readdirSync(bots)) {
    assert.ok(L.SEAT_NAMES.includes(f.replace(/\.png$/, '')) && f.endsWith('.png'), `${f} is named for a seat`);
    assert.ok(statSync(path.join(bots, f)).size < 20000, `${f} stays small`);
  }
});

test('reduced motion turns off bob, pulse and the entry ease', () => {
  assert.deepEqual([...L.bob('forge', 12345, true)], [0, 0]);
  assert.equal(L.pulse(L.PULSE_MS / 2, true), 0);
  assert.equal(L.entry(0, 3, true), 1);
  const [dx, dy] = L.bob('forge', 12345, false);
  assert.ok(Math.abs(dx) <= 1.5 && Math.abs(dy) <= 3, 'bob stays within a few px');
  assert.notDeepEqual([...L.bob('forge', 12345, false)], [...L.bob('critic', 12345, false)], 'own phase per seat');
  assert.ok(Math.abs(L.pulse(L.PULSE_MS / 2, false) - 1) < 1e-9);
  assert.equal(L.pulse(L.PULSE_MS + 1, false), 0);
  assert.equal(L.entry(0, 0, false), 0);
  assert.equal(L.entry(L.ENTRY_MS + 9 * 90, 9, false), 1, 'mesh fully in within ~1.5 s (+ stagger)');
});

test('wordmark cells decode to the recipe grid; no stamp PNG on the page', () => {
  const cells = L.markCells();
  assert.equal(cells.length, L.MARK.h);
  assert.ok(cells.every((r) => r.length === L.MARK.w));
  const flat = cells.flat();
  assert.ok(flat.includes(1) && flat.includes(2), 'stencil white and orange both present');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.ok(!/stamp[-\w]*\.(png|jpe?g)|<img/i.test(html + readFileSync(path.join(liveDir, 'live.js'), 'utf8')));
  assert.match(html, /prefers-reduced-motion: reduce/);
});

test('prototype names in the feed never reach Object.prototype', () => {
  const e = { kind: 'comment', from: 'constructor', to: '__proto__' };
  assert.deepEqual([...L.resolveNodes(e)], ['GitHub', 'forge']);
  assert.deepEqual([...L.eventColor(e)], [180, 190, 210]);
  assert.equal(L.whoTag(e), 'CONSTRUC');
  const hot = L.hotNodes([{ src: 'GitHub', dst: 'forge', e }]);
  assert.deepEqual(Object.keys(hot).sort(), ['GitHub', 'forge']);
});

test('transport: Live shows as playing; a slider pick plays from there', () => {
  assert.equal(L.isPlaying(true, false), true, 'Live = playing, before and after new events');
  assert.equal(L.isPlaying(false, true), true);
  assert.equal(L.isPlaying(false, false), false, 'paused only when rewound and stopped');
  const b = [1000e3, 2000e3];
  assert.equal(L.sliderAction(1500e3, b), 'play');
  assert.equal(L.sliderAction(b[0], b), 'play');
  assert.equal(L.sliderAction(b[1], b), 'live');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /sliderAction\(v, b\) === 'live'\) goLive\(\); else \{ rewindTo\(v\); playing = true; \}/);
  assert.match(html, /L\.isPlaying\(state\.live, playing\) \? '&#10074;&#10074; Pause'/);
});

test('quiet edges are still: dots only ride an edge with a ping in flight', () => {
  assert.equal(L.edgeTraffic(false), null);
  assert.ok(L.edgeTraffic(true).count > 0);
  assert.equal(L.orbitStep(16, [], false), 0, 'hub orbit still on a quiet feed');
  assert.equal(L.orbitStep(16, [{}], true), 0, 'and under reduced motion');
  assert.ok(L.orbitStep(16, [{}], false) > 0);
  const ev = L.mergeEvents([], feed.events);
  const quiet = L.pingsAt(ev, ev.at(-1)._t + 60e3, 1100);
  assert.equal(quiet.length, 0, 'an hour-old feed has nothing in the recent window');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /var tr = L\.edgeTraffic\(burst\);\s+if \(!tr\) return;/);
});

test('seat status follows the dots: LIVE in flight and one window after landing, rewound and now', () => {
  const ev = L.mergeEvents([], [{ id: 'a', t_ct: '2026-10-06T03:00:00-05:00', kind: 'merged', from: 'forge', to: 'GitHub' }]);
  const t = ev[0]._t, span = 1100 * 600;
  const at = (x) => L.activeSeats(L.recentItems(ev, x, 2 * span), x, span, false);
  // rewound view (feed clock)
  assert.equal(at(t - 1).forge, undefined, 'not before the event');
  assert.equal(at(t + span / 2).forge, 1, 'dot in flight');
  assert.equal(at(t + span * 1.5).forge, 1, 'landed, window not passed');
  assert.equal(at(t + span * 2).forge, undefined, 'idle after the window');
  // now (wall clock flashes, staggered)
  const fl = [{ e: ev[0], start: 10_000 }];
  assert.equal(L.activeSeats(fl, 9_000, 1600, true).forge, 1, 'queued flash already counts');
  assert.equal(L.activeSeats(fl, 10_800, 1600, true).forge, 1);
  assert.equal(L.activeSeats(fl, 12_000, 1600, true).forge, 1, 'landed, window not passed');
  assert.equal(L.activeSeats(fl, 13_200, 1600, true).forge, undefined);
  assert.equal(L.activeSeats(fl, 10_800, 1600, true).GitHub, 1, 'both ends of the dot');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /var hot = state\.live \? L\.activeSeats\(flashes/);
  assert.match(html, /nowWall - f\.start < 2 \* FLASH_MS/);
});

test('image manifest: only listed seats are requested, and every listed file exists (no 404s)', () => {
  const files = new Set(readdirSync(path.join(liveDir, 'bots')));
  for (const k of L.BOT_IMAGES) assert.ok(L.SEAT_NAMES.includes(k) && files.has(`${k}.png`), `${k}.png committed`);
  for (const k of L.SEAT_NAMES.filter((s) => !L.BOT_IMAGES.includes(s))) assert.equal(L.botImage(k), null, `${k} draws a letter, no request`);
  assert.equal(L.botImage('mill'), null);
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /L\.BOT_IMAGES\.forEach\(function \(k\) \{\n\s+var img/);
});

test('blackout countdown formats d h m s and flips to lifted; fleet line counts seat status', () => {
  const end = Date.parse(L.BLACKOUT_UNTIL);
  assert.equal(L.BLACKOUT_UNTIL, '2026-10-11T09:08:00-05:00');
  assert.equal(L.countdown(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000), '2d 03h 04m 05s');
  assert.equal(L.blackoutLine(end - 61e3), 'BLACKOUT until Sun Oct 11, 9:08 AM CT \u00b7 0d 00h 01m 01s');
  assert.equal(L.blackoutLine(end), 'Blackout lifted');
  assert.equal(L.blackoutLine(end + 1), 'Blackout lifted');
  assert.equal(L.fleetLine({}), `Fleet: 0 live / ${L.SEAT_NAMES.length} idle`);
  assert.equal(L.fleetLine({ forge: 1, GitHub: 1, critic: 1 }), `Fleet: 2 live / ${L.SEAT_NAMES.length - 2} idle`, 'rails do not count');
});

// Check 3 (amended, Blaze 04:21 CT "show wires with basic motion, the wires are moving just not packets"):
// no packets or dots without real traffic; faint idle wire flow allowed.
test('check 3: no packets or dots without real traffic; faint idle wire flow allowed (Blaze 04:21)', () => {
  // With the wire-glow phase and bob frozen, a quiet frame has no other moving part: no edge dots
  // (edgeTraffic null), hub orbit still (orbitStep 0), no pings in the window, no pulse.
  const ev = L.mergeEvents([], feed.events);
  const quietT = ev.at(-1)._t + 3600e3;
  assert.equal(L.pingsAt(ev, quietT, 1100).length, 0);
  assert.equal(L.orbitStep(16, L.pingsAt(ev, quietT, 1100), false), 0);
  assert.equal(L.pulse(-1, false), 0);
  const frozen = { glow: L.wireGlow(0, 0.3, true), bob: [...L.bob('mill', 0, true)] };
  assert.deepEqual(frozen, { glow: null, bob: [0, 0] });
  for (const t of [0, 16, 1000, 60000]) {
    assert.deepEqual([...L.bob('mill', t, true)], frozen.bob);
    assert.equal(L.wireGlow(t, 0.3, true), frozen.glow);
  }
  const page = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(page, /\.pill \{ display: inline-block; width: 16ch; text-align: center; white-space: nowrap;/, 'freshness pill fits behind N min');
  assert.notEqual(L.wireGlow(1000, 0, false), L.wireGlow(1500, 0, false), 'idle glow travels');
  assert.ok(L.wireGlow(1e9, 0.5, false) >= 0 && L.wireGlow(1e9, 0.5, false) < 1);
  assert.equal(L.wireGlow(1000, 0, true), null, 'glow stops under reduced motion');
  assert.equal(L.edgeTraffic(false), null, 'no packets on a quiet edge (#233 check 3)');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.ok(!/setLineDash|lineDashOffset/.test(html), 'solid wires: no dash gaps');
  assert.match(html, /var gp = L\.wireGlow\(nowWall, [^;]+, reduced\);\s+if \(gp != null\) \{/);
});

test('glyph nodes: X draws the 𝕏 glyph instead of a box and drops "X" from its label', () => {
  assert.equal(L.GLYPH.X, '\u{1D54F}');
  assert.equal(L.LABEL.X, '');
  assert.equal(L.SUB.X, '@0xRayAI');
  assert.ok(L.SATS.X, 'X is still a drawn node and keeps its wires');
  assert.equal(L.GLYPH['mymuse.house'], '\u{1F3E0}', 'muse node is the house emoji');
  assert.equal(L.LABEL['mymuse.house'], '');
  assert.equal(L.SUB['mymuse.house'], 'live site');
  assert.equal(L.GLYPH.GitHub, undefined, 'GitHub is a vector mark, not a font glyph');
  assert.match(L.MARK_PATH.GitHub, /^M6\.766 11\.328c[-0-9.,c lsCvVhHaAzZ]+$/, 'Octicons mark-github-16 path');
  assert.equal(L.LABEL.GitHub, '', 'GitHub name dropped');
  assert.equal(L.SUB.GitHub, 'PRs', 'sublabel kept');
  const page = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(page, /ctx\.fill\(new Path2D\(mark\)\)/);
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /glyph = L\.GLYPH\[key\], mark = L\.MARK_PATH\[key\];[\s\S]*?else if \(glyph\) \{/);
});

test('image seats draw bare (no ring); only letter seats keep circle + ring; blackout line is amber bold', () => {
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /bare = !sq && \(!!glyph \|\| !!\(img && img\.complete && img\.naturalWidth\)\)/);
  assert.match(html, /if \(isHot && !bare\) \{/, 'no concentric rings around image seats');
  const letter = html.slice(html.indexOf('if (bare) {'), html.indexOf('if (!sq) r = 18;'));
  const [imgPart, letterPart] = letter.split('} else {');
  assert.ok(!/\.stroke\(\)/.test(imgPart), 'image branch strokes nothing');
  assert.match(letterPart, /badgeLetter[\s\S]*ctx\.arc\(x, y, r, 0, 7\); ctx\.stroke\(\)/, 'letter seat keeps its ring');
  assert.match(html, /#blackout \{ color: #ffb347; font-weight: 700;/);
});

test('glyph seats: mill is the gear, nibbler the earthworm; no letter seats left but the fallback stays', () => {
  assert.equal(L.GLYPH.mill, '\u2699\uFE0F');
  assert.equal(L.GLYPH.nibbler, '\u{1FAB1}');
  const lettered = [...L.SEAT_NAMES].filter((k) => !L.GLYPH[k] && !L.BOT_IMAGES.includes(k));
  assert.deepEqual(lettered, [], 'every seat has an image or a glyph');
  assert.equal(L.badgeLetter('newseat'), 'N', 'letter fallback kept for future seats');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /if \(!sq && isHot\) \{ ctx\.fillStyle = rgb\(c, 0\.22\)/, 'glyph seats keep the LIVE glow');
});

test('nibbler seat: on the mesh and strip, wired to X and blinky, its events land on it, fleet counts it', () => {
  assert.ok(L.SEAT_NAMES.includes('nibbler'));
  assert.deepEqual([...L.AGENTS.find((a) => a[0] === 'nibbler')], ['nibbler', 'feed scout']);
  assert.ok(L.SATS.nibbler && L.COLOR.nibbler);
  const taken = Object.entries(L.SATS).filter(([k]) => k !== 'nibbler').map(([, v]) => v.join());
  assert.ok(!taken.includes(L.SATS.nibbler.join()), 'free spot');
  assert.ok(!Object.entries(L.COLOR).some(([k, v]) => k !== 'nibbler' && v.join() === L.COLOR.nibbler.join()), 'distinct colour');
  const edges = [...L.EDGES].filter((e) => e.includes('nibbler')).map((e) => e.join('-'));
  assert.deepEqual(edges, ['nibbler-X', 'blinky-nibbler']);
  assert.deepEqual([...L.resolveNodes({ kind: 'comment', from: 'nibbler', to: 'GitHub' })], ['nibbler', 'GitHub']);
  assert.equal(L.whoTag({ kind: 'comment', from: 'nibbler' }), 'NIBBLER');
  assert.equal(L.SEAT_NAMES.length, 7);
  assert.equal(L.fleetLine({ nibbler: 1 }), 'Fleet: 1 live / 6 idle');
});

test('push and feed_push ride from the seat to GitHub with their own words', () => {
  assert.deepEqual([...L.resolveNodes({ kind: 'push', from: 'mill', to: 'GitHub' })], ['mill', 'GitHub']);
  assert.deepEqual([...L.resolveNodes({ kind: 'feed_push', from: 'mill', to: 'GitHub' })], ['mill', 'GitHub']);
  assert.deepEqual([...L.resolveNodes({ kind: 'push', from: 'someone', to: 'GitHub' })], ['GitHub', 'forge'], 'unknown pusher falls back to the GitHub rail');
  assert.equal(L.KIND_WORD.push, 'push');
  assert.equal(L.KIND_WORD.feed_push, 'live-wire push');
  assert.deepEqual([...L.eventColor({ kind: 'push', from: 'forge' })], [...L.COLOR.forge]);
  assert.deepEqual([...L.eventColor({ kind: 'feed_push', from: 'mill' })], [88, 210, 180]);
  assert.equal(L.headline({ repo: '0xRayAI/xray', kind: 'feed_push' }), 'xray \u00b7 live-wire push');
});

test('the pill is feed freshness and working is not in the fleet count', () => {
  const now = Date.parse('2026-10-09T15:00:00Z');
  assert.equal(L.freshnessLabel(now - 90_000, now), 'LIVE');
  assert.equal(L.freshnessLabel(now - 90_001, now), 'behind 2 min');
  assert.equal(L.freshnessLabel(now - 30_000, now), 'LIVE');
  assert.equal(L.BURST_POLL_MS, 10000);
  const hot = { forge: 1 };
  assert.equal(L.fleetLine(hot), 'Fleet: 1 live / 6 idle');
  const until = new Date(now + 60_000).toISOString();
  const working = L.seatWorking({ mill: until, forge: new Date(now - 1000).toISOString() }, now);
  assert.equal(working.mill, 1);
  assert.equal(working.forge, undefined);
  assert.equal(L.fleetLine(hot), 'Fleet: 1 live / 6 idle', 'a working seat is not added to N of M');
});

test('a cursor poll treats 304 as unchanged and 409 as a full refetch', async () => {
  const mem = { cursor: 'epoch.1' };
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (calls.length === 1) return { status: 304, ok: false };
    return { status: 200, ok: true, json: async () => ({ cursor: 'epoch.2', events: [] }) };
  };
  let r = await L.burstPoll(fetchFn, 0, mem);
  assert.equal(r.status, 304);
  assert.equal(r.feed, null);
  assert.match(calls[0], /since=epoch\.1/);
  mem.cursor = 'epoch.1';
  const resync = [];
  const fetch409 = async (url) => {
    resync.push(url);
    if (resync.length === 1) return { status: 409, ok: false, json: async () => ({ cursor: 'epoch.9' }) };
    return { status: 200, ok: true, json: async () => ({ cursor: 'epoch.9', events: [{ id: 'a', t_ct: '2026-10-09T15:00:00Z' }] }) };
  };
  r = await L.burstPoll(fetch409, 1_000, mem);
  assert.equal(r.feed.cursor, 'epoch.9');
  assert.equal(mem.cursor, 'epoch.9');
  assert.ok(!resync[1].includes('since='));
});

test('the header dot blinks in the seat color and the chip gains no extra word', () => {
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  assert.match(html, /dot\.classList\.toggle\('blink', seatState === 'working'/);
  assert.match(html, /\.dot\.blink \{ animation: blink/);
  assert.match(html, /prefers-reduced-motion: reduce\) \{[\s\S]*\.dot\.blink \{ animation: none/);
  assert.equal(html.includes('⚙'), false);
  assert.match(html, /s\.role \+ ' · ' \+ seatState/);
});

test('chip, dot, and node label share one seat state', () => {
  assert.equal(L.seatState(true, true), 'working');
  assert.equal(L.seatState(false, true), 'working');
  assert.equal(L.seatState(true, false), 'active');
  assert.equal(L.seatState(false, false), 'idle');
  const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
  const calls = html.match(/L\.seatState\(/g) || [];
  assert.equal(calls.length, 2);
  assert.match(html, /drawNode\(key, seatState/);
  assert.match(html, /sub = seatState/);
  assert.equal(html.includes("on ? 'LIVE' : 'IDLE'"), false);
  assert.equal(html.includes('IDLE'), false);
  const js = readFileSync(path.join(liveDir, 'live.js'), 'utf8');
  assert.equal(js.includes('missing_activity'), false);
  assert.equal(html.includes('missing_activity'), false);
});
