// Bifrost live mesh: password-gated (or public) static page + in-memory feed (push-only ingest; full or delta, delta polls).
// Node 20, zero dependencies.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { seatPresence, presentSeat, foldSeatTouch, fleetConfigOf } from './presence.mjs';
import { parseAllowlist, mergeCards, sourceCardsFrom, projectAllowed, validateItem, workEventToItem, cardNoNudge, workItemNewer } from './source.mjs';
import { checkRoutesFromDir, readRoutingMap, createLoginResolver, auditLogins } from './routes.mjs';
import { fingerprint, tripwire, createClock } from './governor.mjs';
const COLLECTOR_DIR_EARLY = () => path.join(path.dirname(fileURLToPath(import.meta.url)), 'collector');
import { initArchive, appendArchive, backfillArchive, readArchive, validArchiveDate, KINDS as ARCHIVE_KINDS, cardHistory, archiveDays } from './archive.mjs';
import { pinnedOrigin } from './origin.mjs';

const PORT = Number(process.env.PORT) || 8080;
// Site mode. Default (no config): GATED = password login + private repos masked on the page, feed and logs.
// PUBLIC = no password, no masking: every repo name shows (build in public). Set by collector/site.json
// ({"public": true, "name": "Bifrost"}, committed for our deploy and copied by deploy.sh) or LIVE_PUBLIC=1|0 (env wins).
function siteConfig(env, dir) {
  let f = {};
  try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8')); if (j && typeof j === 'object' && !Array.isArray(j)) f = j; } catch {}
  const ev = String(env.LIVE_PUBLIC ?? '').trim().toLowerCase();
  const pub = ['1', 'true', 'yes', 'on'].includes(ev) ? true : ['0', 'false', 'no', 'off'].includes(ev) ? false : f.public === true;
  const name = String(env.LIVE_SITE_NAME || (typeof f.name === 'string' && f.name) || 'Bifrost').replace(/[<>&"']/g, '').slice(0, 60) || 'Bifrost';
  const title = String(env.LIVE_SITE_TITLE || (typeof f.title === 'string' && f.title) || `${name} live mesh`).replace(/[<>&"']/g, '').slice(0, 80);
  return { public: pub, name, title };
}
const SITE = siteConfig(process.env, path.join(path.dirname(fileURLToPath(import.meta.url)), 'collector'));
const PUBLIC = SITE.public;
const MESH_PASSWORD = process.env.MESH_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const INGEST_SECRET = process.env.INGEST_SECRET || '';
for (const [k, v, min] of [...(PUBLIC ? [] : [['MESH_PASSWORD', MESH_PASSWORD, 1]]), ['SESSION_SECRET', SESSION_SECRET, 32], ['INGEST_SECRET', INGEST_SECRET, 32]]) {
  if (v.length < min) { console.error(`missing or too-short env ${k}; refusing to start`); process.exit(1); }
}
const ORIGIN = pinnedOrigin(process.env);
const CARD_STALE_S = Number(process.env.CARD_STALE_S) > 0 ? Number(process.env.CARD_STALE_S) : 600;
const DATA_STALE_S = Number(process.env.DATA_STALE_S) > 0 ? Number(process.env.DATA_STALE_S) : 21600;

// POST /activity auth. Primary: the seat's OWN GitHub App installation token (Builder = app builder-app on org example-org),
// verified against GitHub per token: GraphQL viewer must be the app's bot user (login + pinned id; a PAT or user
// token is a human user, no other app can be that bot) and every repo of the token's installation must belong to the
// org. Verdicts are cached in memory by sha256(token) only; the token itself is never stored or logged.
// Installation-token auth ONLY (the static ACTIVITY_KEY_<SEAT> fallback was removed Oct 9). The token can read nothing here.
const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';   // overridable for tests only
const GH_SEATS = [{ seat: 'Builder', bot: 'builder-app[bot]', botId: 100000002, org: 'example-org' }];
const GH_OK_MS = 10 * 60000, GH_BAD_MS = 10 * 60000, GH_CACHE_MAX = 2000;
const ghCache = new Map();     // sha256(token) hex -> { seat | null, exp } or { pending: Promise }
async function ghVerify(tok) {   // -> seat, null (rejected), or throws (GitHub unreachable: caller answers 503)
  if (!/^ghs_[A-Za-z0-9._-]{20,1024}$/.test(tok)) return null;
  const key = crypto.createHash('sha256').update(tok).digest('hex'), now = Date.now();
  const c = ghCache.get(key);
  if (c && c.pending) return c.pending;
  if (c && c.exp > now) return c.seat;
  const pending = (async () => {
    const h = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'User-Agent': 'live-board',
      'X-GitHub-Api-Version': '2022-11-28' };
    const g = await fetch(GITHUB_API + '/graphql', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { login databaseId } }' }), signal: AbortSignal.timeout(6000) });
    if (g.status >= 500) throw new Error('github ' + g.status);
    const v = g.ok ? ((await g.json().catch(() => ({}))).data || {}).viewer : null;
    const m = v && GH_SEATS.find(x => x.bot === v.login && x.botId === v.databaseId);
    if (!m) return null;
    const r = await fetch(GITHUB_API + '/installation/repositories?per_page=100', { headers: h, signal: AbortSignal.timeout(6000) });
    if (r.status >= 500) throw new Error('github ' + r.status);
    if (!r.ok) return null;                       // only installation tokens can list their installation's repos
    const repos = ((await r.json().catch(() => ({}))).repositories) || [];
    return repos.length && repos.every(x => x && x.owner && x.owner.login === m.org) ? m.seat : null;
  })();
  ghCache.set(key, { pending });
  try {
    const seat = await pending;
    ghCache.set(key, { seat, exp: Date.now() + (seat ? GH_OK_MS : GH_BAD_MS) });
    if (ghCache.size > GH_CACHE_MAX) for (const [k, v] of ghCache) if (!v.pending && v.exp <= Date.now()) ghCache.delete(k);
    if (ghCache.size > GH_CACHE_MAX) ghCache.delete(ghCache.keys().next().value);
    return seat;
  } catch (e) { ghCache.delete(key); throw e; }
}
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const COOKIE = 'mesh_session';
const MAX_INGEST = 25 * 1024 * 1024;   // decoded JSON cap (the gzip body is capped at the same size)
const MAX_LOGIN_BODY = 4096;
const RL_MAX = 10, RL_WINDOW_MS = 15 * 60 * 1000;

// ---- static files: whitelist loaded into memory at startup ----
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const STATIC = new Map();
for (const f of fs.readdirSync(PUB)) {
  const ext = path.extname(f);
  if (!TYPES[ext]) continue;
  STATIC.set('/' + f, { type: TYPES[ext], body: fs.readFileSync(path.join(PUB, f)) });
}
// avatars: public/avatars/*.png, served same-origin behind the login (missing file -> 404 -> drawn fallback)
const AV = path.join(PUB, 'avatars');
if (fs.existsSync(AV)) for (const f of fs.readdirSync(AV)) {
  if (/^[a-z0-9._-]+\.png$/i.test(f)) STATIC.set('/avatars/' + f, { type: 'image/png', body: fs.readFileSync(path.join(AV, f)) });
}
if (STATIC.has('/index.html')) STATIC.set('/', STATIC.get('/index.html'));

// ---- feed (in memory, delta-capable, two sources merged by event id) ----
// cursor = "<epoch>.<seq>": epoch is random per process (a cold start invalidates every cursor), seq bumps on
// every change. Each event remembers the seq that last changed it, so ?since=<cursor> returns only those.
// Sources: "github" = the Railway collector child (read-only token, file on the volume), "box" = the box pusher
// (POST /ingest, /ingest/delta; box-only signals). Same id in both -> the github copy wins. Each source has its own
// ack cursor "<epoch>_<source>.<n>" so a collector write never invalidates the box pusher's delta base.
const EMPTY_FEED = { title: SITE.title, generated_at: null, event_count: 0, events: [] };
const EPOCH = crypto.randomBytes(6).toString('base64url');
const STARTED = Date.now();
const MAX_REMOVED = 20000;
const BOX_STALE_MS = (Number(process.env.BOX_STALE_S) || 180) * 1000;
const BOARD_BOX_STALE_MS = (Number(process.env.BOARD_BOX_STALE_S) || 900) * 1000;   // box board wins while this fresh   // box pushes every ~45 s while alive
let seq = 0, header = {}, floorSeq = 0;
const evs = new Map();          // id -> { e, h, s }  (merged view)
const removed = [];             // [{ id, s }] (ids dropped from the merged view)
let fullDirty = true, feedBody, feedGz, feedEtag;
const SRC_PRIO = ['github', 'box'];
const SRCS = Object.fromEntries(SRC_PRIO.map(n => [n, { evs: new Map(), header: null, seq: 0, at: 0 }]));
let ghRetest = new Set();       // "repo#n" with a GitHub lab retest: the box's merge-queue.md copy is then hidden
const cursor = () => `${EPOCH}.${seq}`;
const srcCursor = n => `${EPOCH}_${n}.${SRCS[n].seq}`;
const evHash = e => crypto.createHash('sha1').update(JSON.stringify(e)).digest('base64url');
function headerOf(f) { const h = {}; for (const k of Object.keys(f)) if (k !== 'events' && k !== 'cursor') h[k] = f[k]; return h; }
function dropId(id) { evs.delete(id); removed.push({ id, s: seq }); if (removed.length > MAX_REMOVED) floorSeq = removed.splice(0, removed.length - MAX_REMOVED).pop().s; }
// Every served event carries a credit (never blank): the collector sets it from logins; anything else (box, Jira, health,
// emitter, older collectors) is credited by its sender node: a roster seat, Blaze (Lead / Blaze0x1), else the github node.
let rosterSeats = null;
function creditOf(e) {
  if (typeof e.credit === 'string' && e.credit) return e.credit;
  if (!rosterSeats) { try { rosterSeats = new Set((JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'collector', 'fleet-roster.json'), 'utf8')).seats || []).map(x => String(x).toLowerCase())); } catch { rosterSeats = new Set(); } }
  const f = String(e.from || '').toLowerCase();
  if (f === 'coord') return 'blinky';
  if (['lead', 'blaze', 'blaze0x1', 'htafolla'].includes(f)) return 'Blaze';
  return rosterSeats.has(f) ? f : 'github';
}
function upsert(e) { if (!e.credit) e = { ...e, credit: creditOf(e) }; const h = evHash(e), cur = evs.get(e.id); if (!cur || cur.h !== h) evs.set(e.id, { e, h, s: seq }); }
// Fleet-only (same rule as feed/live_collect.fleet_only): a GitHub-sourced event that shows a login outside the fleet
// map is never served, whichever source sent it (box /ingest included). LIVE_SHOW_UNMAPPED=1 keeps them.
const SHOW_UNMAPPED = process.env.LIVE_SHOW_UNMAPPED === '1';
function unmapped(e) {
  if (SHOW_UNMAPPED) return false;
  const gh = String(e.src_file || '').startsWith('github') || !!e.actor || !!e.author;
  if (!gh) return false;
  if (e.from === 'Others' || e.to === 'Others' || (Array.isArray(e.hops) && e.hops.includes('Others'))) return true;
  return e.external === 'upstream' && !!e.actor && e.from === 'Upstream';
}
const shown = (n, e) => !unmapped(e) && !(n === 'box' && e.src_file === 'merge-queue.md' && ghRetest.has(`${e.repo}#${e.number}`));
function touch(id) {
  for (const n of SRC_PRIO) { const e = SRCS[n].evs.get(id); if (e && shown(n, e)) return upsert(e); }
  if (evs.has(id)) dropId(id);
}
function ingestSrc(n, events, hdr, remove = null) {   // remove === null -> full replace of that source
  const S = SRCS[n], changed = new Set();
  seq++; S.seq++; S.at = Date.now(); S.header = hdr;
  if (remove === null) { const ids = new Set(events.map(e => e.id)); for (const id of [...S.evs.keys()]) if (!ids.has(id)) { S.evs.delete(id); changed.add(id); } }
  else for (const id of remove) if (S.evs.delete(id)) changed.add(id);
  for (const e of events) { S.evs.set(e.id, e); changed.add(e.id); }
  if (n === 'github') {
    const rt = new Set(); for (const e of S.evs.values()) if (String(e.kind || '').startsWith('lab_retest_')) rt.add(`${e.repo}#${e.number}`);
    if (rt.size !== ghRetest.size || [...rt].some(k => !ghRetest.has(k))) {
      ghRetest = rt; for (const e of SRCS.box.evs.values()) if (e.src_file === 'merge-queue.md') changed.add(e.id);
    }
  }
  for (const id of changed) touch(id);
  for (const e of events) appendArchive('events', e);
  if (n === 'github') recomputeGithubDataAt();
  header = mergedHeader(); fullDirty = true;
}
const ingestFull = f => ingestSrc('box', f.events, headerOf(f));
const ingestDelta = d => ingestSrc('box', d.upsert, headerOf(d.header), d.remove);
// pusher-auth readback (ingest responses only): which seats the merged board shows working, no event data
const fleetBrief = () => { const f = header.fleet || {}; return { box_stale: !!f.box_stale, cloud_working: !!f.cloud?.working, working: Object.keys(f.working || {}).sort() }; };
// ---- builder inbox mirror (port of example-org/xray PR #5 house/live/activity.mjs): lines persist on the volume
const INBOX_KEYS = new Set(['id', 't_ct', 'seat', 'type', 'repo', 'number', 'sha', 'title', 'url', 'reason']);
const INBOX_BANNED = /body|text|message/i;   // tested against field NAMES only; values (e.g. type "prompt_message") are fine
const INBOX_FILE = path.join(process.env.MESH_DATA_DIR || '/data', 'inbox', 'builder.jsonl');
let inboxLines = [];
try { inboxLines = fs.readFileSync(INBOX_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
function saveInbox() {
  for (const l of inboxLines) appendArchive('inbox', { ...l, seat: l.seat ?? 'builder' });
  const cut = Date.now() - 7 * 86400000;
  inboxLines = inboxLines.filter(l => !(Date.parse(l.t_ct) < cut)).slice(-5000);
  try { fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true }); fs.writeFileSync(INBOX_FILE + '.tmp', inboxLines.map(l => JSON.stringify(l)).join('\n') + '\n'); fs.renameSync(INBOX_FILE + '.tmp', INBOX_FILE); } catch (e) { console.log('inbox: save failed ' + e.code); }
}
function validInboxLine(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  for (const k of Object.keys(d)) if (!INBOX_KEYS.has(k) || INBOX_BANNED.test(k)) return false;
  for (const k of ['id', 't_ct', 'seat', 'type', 'repo', 'title', 'url', 'reason']) if (typeof d[k] !== 'string' || (!d[k] && !['repo', 'url', 'title'].includes(k))) return false;
  if (typeof d.number !== 'number' || !Number.isInteger(d.number)) return false;
  if (d.sha != null && typeof d.sha !== 'string') return false;
  if (d.seat.toLowerCase() !== 'builder') return false;
  return true;
}
function linesAfter(lines, sinceId) { if (!sinceId) return lines.slice(); const at = lines.findIndex(l => l.id === sinceId); return at < 0 ? lines.slice() : lines.slice(at + 1); }
function postInbox({ secret, headerSecret, body, lines }) {
  if (typeof headerSecret !== 'string' || !headerSecret || !safeEq(headerSecret, secret)) return { status: 401, error: 'unauthorized' };
  let parsed; try { parsed = JSON.parse(body); } catch { return { status: 400, error: 'not json' }; }
  const incoming = parsed && Array.isArray(parsed.lines) ? parsed.lines : null;
  if (!incoming) return { status: 400, error: 'lines required' };
  if (incoming.some(l => !l || String(l.seat || '').toLowerCase() !== 'builder')) return { status: 403, error: 'inbox is not exposed' };
  const good = incoming.filter(validInboxLine);
  if (!good.length && incoming.length) return { status: 400, error: 'no line stored', rejected: incoming.map((l, i) => (l && typeof l.id === 'string' && l.id) ? l.id.slice(0, 120) : '#' + i) };
  if (parsed.replace === true && good.length) lines.length = 0;   // resync only after a line validates
  const known = new Set(lines.map(l => l.id)); let added = 0;
  for (const l of good) { if (known.has(l.id)) continue; known.add(l.id); lines.push(l); added++; }
  return { status: 200, added };
}
// ---- Live board: the server is the source of truth for seat inboxes, cards and nudges ---------------------------------
// Seat auth: Builder = its builder-app installation token (ghVerify, unchanged); every other seat = its own key, checked
// against SEAT_KEYS (Railway variable, JSON seat -> sha256 hex of the key; the keys themselves live only on the box).
// Our 9 seats (feed/fleet-roster.json) plus the kit's builder / builder-cloud plumbing (installation-token auth, mirror);
// no route writes to builder. The kit's sample seats (reviewer, tester, qa, coord, operator, triager, ...) are gone: their
// jobs map to ours (coord -> blinky, operator / tester / qa -> forge, reviewer -> critic), see SEAT_ALIAS.
const COS = 'blinky', OPS = 'forge', REVIEW = 'critic';
const SEAT_ALIAS = { coord: COS, coordinator: COS, cos: COS, operator: OPS, tester: OPS, qa: OPS, lab: OPS, reviewer: REVIEW, triager: COS };
const SEAT_IDS = ['builder', 'builder-cloud', 'arch1',
  'forge', 'critic', 'mill', 'blinky', 'herald', 'nibbler', 'sound', 'magnet'];
// Builder-cloud: the cloud Builder seat (own key). It reads Builder's work: every builder inbox line is mirrored into its inbox,
// nudges to builder land in its inbox as type 'nudge', and /cards?seat=builder-cloud shows Builder's cards.
const SEAT_DISPLAY = { 'builder-cloud': 'Builder-cloud' };
const CARD_SEAT = { 'builder-cloud': 'builder' };
const SEAT_KEY_HASH = (() => { try { const o = JSON.parse(process.env.SEAT_KEYS || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
// Inbox wake. SEAT_WEBHOOKS is JSON {seat: {url, key_env?, header?}}. The key is process.env[key_env], else
// process.env.WAKE_KEY_<SEAT> (seat upper-cased, '-' -> '_'; key_env may be omitted), sent as
// Authorization: Bearer <key> unless header names a different header (then the raw key). A quiet seat sends after
// WAKE_COALESCE_MS (default 50) so a short burst is one POST. Further lines within WAKE_DEBOUNCE_S (default 60)
// wait and share the next POST's ids. Three attempts with backoff. The inbox write never waits on this.
const envNonNeg = (name, fallback) => { const n = Number(process.env[name]); return Number.isFinite(n) && n >= 0 ? n : fallback; };
const WAKE_DEBOUNCE_MS = envNonNeg('WAKE_DEBOUNCE_S', 60) * 1000;
const WAKE_COALESCE_MS = envNonNeg('WAKE_COALESCE_MS', 50);
const WAKE_RETRY_MS = envNonNeg('WAKE_RETRY_MS', 400);
const WAKE_ATTEMPTS = 3;
// Seats due at the same moment (a deploy, one event routed to 4 seats) send WAKE_STAGGER_MS apart, not all at once:
// the seats' automations share one Cursor account.
const WAKE_STAGGER_MS = envNonNeg('WAKE_STAGGER_MS', 1500);
let wakeNextSlot = 0;
function wakeSlot() { const now = Date.now(), at = Math.max(now, wakeNextSlot); wakeNextSlot = at + WAKE_STAGGER_MS; return at - now; }
function loadSeatWebhooks() {
  const raw = process.env.SEAT_WEBHOOKS;
  if (!raw) return {};
  let parsed; try { parsed = JSON.parse(raw); } catch { console.log('wake: SEAT_WEBHOOKS is not json'); return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const [seat, cfg] of Object.entries(parsed)) {
    const id = String(seat || '').toLowerCase();
    if (!SEAT_IDS.includes(id) || !cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
    const seatKeyEnv = 'WAKE_KEY_' + id.toUpperCase().replace(/-/g, '_');
    const url = typeof cfg.url === 'string' ? cfg.url : '', keyEnv = typeof cfg.key_env === 'string' ? cfg.key_env : seatKeyEnv;
    const header = typeof cfg.header === 'string' && cfg.header.trim() ? cfg.header.trim() : 'Authorization';
    let okUrl = false; try { const u = new URL(url); okUrl = u.protocol === 'http:' || u.protocol === 'https:'; } catch { okUrl = false; }
    if (!okUrl || !/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(keyEnv) || !/^[A-Za-z0-9-]{1,64}$/.test(header)) { console.log('wake: skip bad config for ' + id); continue; }
    out[id] = { url, keyEnv, seatKeyEnv, header, bearer: header.toLowerCase() === 'authorization' };
  }
  return out;
}
const SEAT_WEBHOOKS = loadSeatWebhooks();
const wakeQ = new Map();
const wakeOkAt = {};   // seat -> ISO of the last successful wake POST
// Wake health on the board: each configured seat's last good wake; quiet = none within BIFROST_WAKE_QUIET_MINUTES
// (default 240) of now (or of server start), even with no unacked line.
const WAKE_QUIET_MS = (Number(process.env.BIFROST_WAKE_QUIET_MINUTES) > 0 ? Number(process.env.BIFROST_WAKE_QUIET_MINUTES) : 240) * 60000;
const BOOT_AT = Date.now();
function wakeBoard(now = Date.now()) {
  const out = {};
  for (const seat of Object.keys(SEAT_WEBHOOKS)) {
    const last = wakeOkAt[seat] || null, t = last ? Date.parse(last) : BOOT_AT;
    out[seat] = { last_ok: last, quiet: now - t > WAKE_QUIET_MS };
  }
  return out;
}
function noteWake(seat, line) {
  try {
    const cfg = SEAT_WEBHOOKS[seat];
    if (!cfg || !line) return;
    let st = wakeQ.get(seat);
    if (!st) { st = { lastSent: 0, pending: [], timer: null, inflight: false, status: null }; wakeQ.set(seat, st); }
    st.pending.push({ id: String(line.id || '').slice(0, 300), type: String(line.type || '').slice(0, 64), repo: String(line.repo || '').slice(0, 200),
      number: Number.isInteger(line.number) ? line.number : 0, title: String(line.title || '').slice(0, 200), url: String(line.url || '').slice(0, 500), reason: String(line.reason || '').slice(0, 300) });
    armWake(seat);
  } catch { /* keep the inbox write */ }
}
function armWake(seat) {
  const st = wakeQ.get(seat);
  if (!st || st.timer || st.inflight || !st.pending.length) return;
  const remain = st.lastSent ? WAKE_DEBOUNCE_MS - (Date.now() - st.lastSent) : 0;
  const t = setTimeout(() => { st.timer = null; void flushWake(seat); }, (remain > 0 ? remain : WAKE_COALESCE_MS) + wakeSlot());
  if (t.unref) t.unref();
  st.timer = t;
}
function wakePayload(seat, batch) {
  const last = batch[batch.length - 1];
  return { seat, inbox_id: last.id, ids: batch.map(l => l.id), type: last.type, repo: last.repo, number: last.number, title: last.title, url: last.url, reason: last.reason };
}
function wakeErr(e) {
  if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'timeout';
  const code = e && e.cause && e.cause.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,40}$/.test(code) ? code : 'network';
}
async function deliverWake(cfg, body) {
  const key = process.env[cfg.keyEnv] || process.env[cfg.seatKeyEnv];
  if (typeof key !== 'string' || !key || /[\r\n]/.test(key)) return { ok: false, attempts: 0, error: 'no_key' };
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'bifrost-live' };
  if (cfg.bearer) headers.Authorization = 'Bearer ' + key; else headers[cfg.header] = key;
  let error = 'network', detail = '';
  for (let i = 1; i <= WAKE_ATTEMPTS; i++) {
    try {
      const res = await fetch(cfg.url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(8000) });
      const text = await res.text().catch(() => '');
      if (res.ok) return { ok: true, attempts: i };
      error = 'http_' + res.status;
      detail = wakeDetail(text, key, cfg.url);
    } catch (e) { error = wakeErr(e); }
    if (i < WAKE_ATTEMPTS) await new Promise(r => { const t = setTimeout(r, WAKE_RETRY_MS * (2 ** (i - 1))); if (t.unref) t.unref(); });
  }
  return { ok: false, attempts: WAKE_ATTEMPTS, error, detail };
}
// non-2xx response body for the log: one line, 160 chars, the key and the webhook url (with its automation id) removed
function wakeDetail(text, key, url) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  for (const x of [key, url, url.split('/').pop()]) if (x && x.length >= 6) t = t.split(x).join('[redacted]');
  return t.replace(/(crsr|key|sk)[_-][A-Za-z0-9_-]{8,}/gi, '[redacted]').slice(0, 160);
}
async function flushWake(seat) {
  const st = wakeQ.get(seat), cfg = SEAT_WEBHOOKS[seat];
  if (!st || st.inflight || !st.pending.length || !cfg) return;
  const batch = st.pending.splice(0, st.pending.length);
  st.inflight = true; st.lastSent = Date.now();
  let result; try { result = await deliverWake(cfg, JSON.stringify(wakePayload(seat, batch))); }
  catch { result = { ok: false, attempts: WAKE_ATTEMPTS, error: 'network' }; }
  st.status = { ok: !!result.ok, attempts: result.attempts, at: new Date().toISOString() };
  if (!result.ok) st.status.error = result.error || 'network';
  console.log(`wake: ${seat} ${result.ok ? 'ok' : 'fail'} attempts=${result.attempts}${result.ok ? '' : ' ' + st.status.error}${result.detail ? ' body=' + JSON.stringify(result.detail) : ''}`);
  if (result.ok) { touchSeat(seat); wakeOkAt[seat] = st.status.at; }
  st.inflight = false; armWake(seat);
}
// Last time the server saw each seat act through its inbox (wake 2xx, inbox read, ack); counts toward fleet "active".
// In memory: after a restart a seat is active again on its next wake, read or ack.
const seatTouch = {};
const touchSeat = (seat, t = Date.now()) => { if (seat) seatTouch[seat] = Math.max(seatTouch[seat] || 0, t); };
const sha256hex = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const bearerOf = req => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };
async function seatOf(req) {   // -> seat id | null; throws when GitHub can't verify an installation token (caller: 503)
  const tok = bearerOf(req); if (!tok) return null;
  if (tok.startsWith('ghs_')) { const s = await ghVerify(tok); return s ? String(s).toLowerCase() : null; }
  const h = sha256hex(tok);
  for (const s of SEAT_IDS) { const v = SEAT_KEY_HASH[s]; if (s !== 'builder' && typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) && safeEq(h, v)) return s; }
  return null;
}
const seatIdOf = name => { const t = String(name || '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ');
  for (const w of t.split(/\s+/)) { if (SEAT_IDS.includes(w) || w === 'lead') return w; if (SEAT_ALIAS[w]) return SEAT_ALIAS[w]; } return null; };
const STATE_DIR = path.join(process.env.MESH_DATA_DIR || '/data', 'live');
const NUDGE_L1_MS = (Number(process.env.NUDGE_L1_S) || 3600) * 1000, NUDGE_L2_MS = (Number(process.env.NUDGE_L2_S) || 1800) * 1000;
const NUDGE_L3_MS = (Number(process.env.NUDGE_L3_S) > 0 ? Number(process.env.NUDGE_L3_S) : 7200) * 1000;
const HELD_MAX_MS = (Number(process.env.HELD_MAX_S) > 0 ? Number(process.env.HELD_MAX_S) : 72 * 3600) * 1000;
const seatInbox = {};   // seat -> [lines]
for (const s of SEAT_IDS) { try { seatInbox[s] = fs.readFileSync(path.join(STATE_DIR, 'inbox', s + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { seatInbox[s] = []; } }
if (!seatInbox.builder.length && inboxLines.length) seatInbox.builder = inboxLines.slice();   // carry the builder mirror over
if (!seatInbox['builder-cloud'].length && seatInbox.builder.length) seatInbox['builder-cloud'] = seatInbox.builder.map(l => ({ ...l, seat: 'builder-cloud' }));
function bfWrite(rel, text) { try { const f = path.join(STATE_DIR, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); } catch (e) { console.log('live: save failed ' + e.code); } }
// Inbox ack: each seat's acked line ids (persisted). GET /inbox/<seat> hides acked lines and lines whose card has moved
// past the seat's step (closed card; for reviewer: a Reviewer verdict at the card's current head newer than the line).
const inboxAcks = (() => { try { const o = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'acks.json'), 'utf8')); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
const ackedSet = s => new Set(inboxAcks[s] || []);
function ackLines(seat, what) {
  const arr = seatInbox[seat] || [], have = new Set(inboxAcks[seat] || []); let n = 0;
  const at = typeof what === 'object' && what ? arr.findIndex(l => l.id === what.upto) : -1;
  const ids = what === 'all' ? arr.map(l => l.id) : typeof what === 'object' && what ? (at < 0 ? null : arr.slice(0, at + 1).map(l => l.id))
    : arr.some(l => l.id === what) ? [what] : null;
  if (!ids) return -1;
  for (const id of ids) if (!have.has(id)) { have.add(id); n++; appendArchive('acks', { seat, line: id, t_ct: new Date().toISOString() }); }
  const live = new Set(arr.map(l => l.id)); inboxAcks[seat] = [...have].filter(id => live.has(id)).slice(-6000);
  bfWrite('acks.json', JSON.stringify(inboxAcks)); return n;
}
function lineDone(seat, l) {
  const c = bfCards.find(x => x.repo && String(x.repo).toLowerCase() === String(l.repo || '').toLowerCase() && Number(x.number) === Number(l.number));
  if (!c) return false;
  if (c.state === 'closed') return true;
  const lt = Date.parse(l.t_ct) || 0;
  if (seat === REVIEW && c.reviewer && c.reviewer.at_head && Number(c.reviewer.t) >= lt) return true;   // verdict at head = Reviewer's step done
  return false;
}
function openLines(seat, all) { const acked = ackedSet(seat); return all ? seatInbox[seat].slice() : seatInbox[seat].filter(l => !acked.has(l.id) && !lineDone(seat, l)); }
function saveSeatInbox(s) {
  for (const l of seatInbox[s]) appendArchive('inbox', { ...l, seat: l.seat ?? s });
  const cut = Date.now() - 7 * 86400000;
  seatInbox[s] = seatInbox[s].filter(l => !(Date.parse(l.t_ct) < cut)).slice(-5000);
  bfWrite('inbox/' + s + '.jsonl', seatInbox[s].map(l => JSON.stringify(l)).join('\n') + '\n');
}
// Startup route check (same rules as tools/bifrost-init --check): a seat with no route, or a rule routing to a seat
// outside the fleet, is logged loudly and shown on the board (header.routing, /healthz routing). Never a crash.
const ROUTING = checkRoutesFromDir(process.env.BIFROST_ROUTING_DIR || path.join(COLLECTOR_DIR_EARLY(), 'routing'),
  process.env.BIFROST_ROSTER || path.join(COLLECTOR_DIR_EARLY(), 'fleet-roster.json'));
if (!ROUTING.ok) console.log('ROUTING: FAIL ' + (ROUTING.error || '') + (ROUTING.unrouted.length ? ' no route for ' + ROUTING.unrouted.join(',') : '') + (ROUTING.unknown.length ? ' rules to seats outside the fleet: ' + ROUTING.unknown.join(',') : ''));
// Routing map login audit (at startup and every BIFROST_ROUTING_AUDIT_S, default 3600): every login in the map is resolved
// against GitHub with the existing read token (cached, rate-limit safe). A login GitHub does not know is refused: the
// entry is served as refused at /routing, ROUTING.ok goes false, and the CoS gets a board nudge. Unverified (no token,
// rate limit, network) is flagged, never refused.
const ROUTING_DIR = process.env.BIFROST_ROUTING_DIR || path.join(COLLECTOR_DIR_EARLY(), 'routing');
const ROUTING_BASE_OK = ROUTING.ok;
let ROUTING_MAP = readRoutingMap(ROUTING_DIR).map(e => ({ ...e, status: e.login ? 'unverified' : 'no_login' }));
const loginResolver = createLoginResolver({ api: GITHUB_API, token: process.env.GITHUB_READ_TOKEN || '',
  ttlMs: (Number(process.env.BIFROST_LOGIN_TTL_S) || 21600) * 1000 });
ROUTING.logins = { refused: [], unverified: ROUTING_MAP.filter(e => e.login).map(e => e.seat), no_login: ROUTING_MAP.filter(e => !e.login).map(e => e.seat) };
async function auditRouting() {
  const a = await auditLogins(readRoutingMap(ROUTING_DIR), loginResolver.resolve);
  ROUTING_MAP = a.entries;
  ROUTING.logins = { refused: a.refused, unverified: a.unverified, no_login: a.no_login };
  ROUTING.ok = ROUTING_BASE_OK && !a.refused.length;
  if (a.refused.length) console.log('ROUTING: FAIL login not on GitHub for ' + a.refused.join(','));
  console.log(`routing: logins ok ${a.entries.filter(e => e.status === 'ok').length} refused ${a.refused.length} unverified ${a.unverified.length}`);
}
setTimeout(() => auditRouting().catch(() => {}), 0).unref?.();
setInterval(() => auditRouting().catch(() => {}), (Number(process.env.BIFROST_ROUTING_AUDIT_S) || 3600) * 1000).unref();
// Line nudges (part of evalNudges, the one nudge path): an open (unacked, not done) inbox line older than NUDGE_LINE_S
// (default 900) gets nudge L1 and a re-wake of its seat; L2 and L3 follow one window apart, then it stops (never loops).
// Each is a nudge record (kind 'line') on the board. An ack (or the card moving on) closes them.
const NUDGE_LINE_MS = Math.max(1, Number(process.env.NUDGE_LINE_S) > 0 ? Number(process.env.NUDGE_LINE_S) : 900) * 1000;
const cosSeat = () => (typeof COORD_SEAT !== 'undefined' && COORD_SEAT) || COS;   // the CoS role (routing seats.coord)
function nudgeLines(now) {
  let changed = false;
  const open = new Set();
  for (const seat of SEAT_IDS) for (const l of openLines(seat)) {
    const t = Date.parse(l.t_ct);
    if (!Number.isFinite(t) || now - t < NUDGE_LINE_MS) continue;
    const base = `nudge:line:${seat}:${l.id}`; open.add(base);
    const mine = nudges.filter(n => n.kind === 'line' && n.line_key === base);
    const last = mine[mine.length - 1];
    if (mine.length >= 3 || (last && now - last.t < NUDGE_LINE_MS)) continue;
    const lvl = mine.length + 1;
    nudges.push({ id: `${base}:L${lvl}`, kind: 'line', line_key: base, t: now, t_ct: new Date(now).toISOString(), card: '', repo: l.repo || '',
      number: Number.isInteger(l.number) ? l.number : 0, title: String(l.title || '').slice(0, 120), url: String(l.url || '').slice(0, 300),
      stage: '', level: lvl, seat, via: 'unacked line', line: String(l.id).slice(0, 300), since: new Date(t).toISOString() });
    noteWake(seat, { ...l, reason: (`nudge L${lvl}: ` + (l.reason || '')).slice(0, 300) });
    const cos = cosSeat();
    if (lvl === 3 && cos && cos !== seat) {   // L3 with no move: the CoS role gets it too, to reassign
      nudges.push({ ...nudges[nudges.length - 1], id: `${base}:L3cos`, kind: 'reassign', seat: cos, about: seat, via: 'L3: reassign' });
      noteWake(cos, { ...l, id: `${base}:L3cos`, seat: cos, reason: `L3 no move on ${seat}: reassign`.slice(0, 300) });
    }
    changed = true;
  }
  for (const n of nudges) if ((n.kind === 'line' || (n.kind === 'reassign' && n.line_key)) && !n.closed_at && !open.has(n.line_key)) { n.closed_at = new Date(now).toISOString(); changed = true; }
  return changed;
}
// Seat nudges (same path): a seat with no route (startup route check) and a configured seat whose wake went quiet
// (no good wake within BIFROST_WAKE_QUIET_MINUTES) each hold one open nudge to the CoS on the board until fixed.
function nudgeSeats(now) {
  let changed = false;
  const want = new Map();
  for (const seat of ROUTING.unrouted) want.set(`nudge:unrouted:${seat}`, { seat, kind: 'unrouted', via: 'no route' });
  for (const seat of ROUTING.logins?.refused || []) want.set(`nudge:login:${seat}`, { seat, kind: 'unrouted', via: 'login not on GitHub' });
  const w = wakeBoard(now);
  for (const [seat, v] of Object.entries(w)) if (v.quiet) want.set(`nudge:quiet:${seat}:${v.last_ok || 'boot'}`, { seat, kind: 'quiet', via: 'wake quiet' });
  for (const [id, x] of want) if (!nudges.some(n => n.id === id)) {
    nudges.push({ id, kind: x.kind, t: now, t_ct: new Date(now).toISOString(), card: '', repo: '', number: 0, title: `${x.seat}: ${x.via}`, url: '',
      stage: '', level: 1, seat: cosSeat(), about: x.seat, via: x.via });
    changed = true;
  }
  for (const n of nudges) if ((n.kind === 'unrouted' || n.kind === 'quiet') && !n.closed_at && !want.has(n.id)) { n.closed_at = new Date(now).toISOString(); changed = true; }
  return changed;
}
function validSeatLine(d) { if (!d || typeof d.seat !== 'string' || !SEAT_IDS.includes(d.seat.toLowerCase())) return false; return validInboxLine({ ...d, seat: 'builder' }); }
function inboxLineError(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'line must be an object';
  const keys = Object.keys(d);
  const banned = keys.filter(k => INBOX_BANNED.test(k)).sort();
  const unknown = keys.filter(k => !INBOX_KEYS.has(k) && !INBOX_BANNED.test(k)).sort();
  const parts = [];
  if (banned.length) parts.push('field names must not include body, text, or message: ' + banned.join(', '));
  if (unknown.length) parts.push('unknown fields: ' + unknown.join(', '));
  const seat = typeof d.seat === 'string' ? d.seat.toLowerCase() : '';
  if (!SEAT_IDS.includes(seat)) parts.push('seat must be a seat id');
  if (typeof d.id !== 'string' || !d.id) parts.push('id required');
  if (typeof d.t_ct !== 'string' || !d.t_ct) parts.push('t_ct required');
  if (typeof d.type !== 'string' || !d.type) parts.push('type required');
  if (typeof d.reason !== 'string' || !d.reason) parts.push('reason required');
  for (const k of ['repo', 'title', 'url']) if (typeof d[k] !== 'string') parts.push(k + ' must be a string');
  if (typeof d.number !== 'number' || !Number.isInteger(d.number)) parts.push('number must be an integer');
  if (d.sha != null && typeof d.sha !== 'string') parts.push('sha must be a string');
  return parts.length ? parts.join('; ') : null;
}
function rejectedRef(l, i) {
  if (l && typeof l.id === 'string' && l.id) return l.id.slice(0, 120);
  return '#' + i;
}
function postSeatLines(parsed, onlySeat) {
  const incoming = parsed && Array.isArray(parsed.lines) ? parsed.lines : null;
  if (!incoming || incoming.length > 5000) return { status: 400, error: 'lines required' };
  if (onlySeat && incoming.some(l => !l || String(l.seat || '').toLowerCase() !== onlySeat)) return { status: 403, error: 'inbox is not exposed' };
  const rejected = []; const good = [];
  for (let i = 0; i < incoming.length; i++) {
    const l = incoming[i];
    const err = inboxLineError(l);
    if (err || !validSeatLine(l)) { rejected.push({ ref: rejectedRef(l, i), error: err || 'line refused' }); continue; }
    good.push(l);
  }
  const refs = rejected.map(r => r.ref);
  if (rejected.length) console.log(`inbox: rejected ${rejected.length} bad line(s)`);
  if (!good.length && rejected.length) {
    const why = rejected.slice(0, 8).map(r => r.ref + ': ' + r.error).join('; ');
    return { status: 400, error: ('no line stored: ' + why).slice(0, 800), rejected: refs };
  }
  const touched = new Set(); let added = 0; const fresh = [];
  if (parsed.replace === true && onlySeat && good.length && seatInbox[onlySeat]) {
    seatInbox[onlySeat].length = 0;
    touched.add(onlySeat);
  }
  for (const l of good) {
    const s = l.seat.toLowerCase(), arr = seatInbox[s]; if (arr.some(x => x.id === l.id)) continue;
    const stored = { ...l, seat: s }; arr.push(stored); touched.add(s); added++; fresh.push(stored);
    if (s === 'builder') { const c = seatInbox['builder-cloud']; if (!c.some(x => x.id === l.id)) { const copy = { ...l, seat: 'builder-cloud' }; c.push(copy); touched.add('builder-cloud'); fresh.push(copy); } } }
  for (const s of touched) saveSeatInbox(s);
  for (const l of fresh) noteWake(l.seat, l);
  return { status: 200, added, rejected: refs };
}
// ---- Assistant / emitter: the sample MCP server posts one event per tool call / OAuth sign-in (POST /emit, Bearer = the
// 'assistant' seat key, checked against SEAT_KEYS.assistant). Write-only and strict: tool name, time, ok, client class,
// latency, kind; any other field (addresses, content, emails, user ids) is refused. Not a reading seat (no inbox/cards).
const EMITTER_WORK_MS = (Number(process.env.EMITTER_WORKING_S) || 120) * 1000;   // a run of calls = working until 2 min after the last
const DOT_FIELDS = new Set(['tool', 't', 'ok', 'client', 'latency_ms', 'kind']);
const emitter = { last: 0, recent: [] };   // in memory: last event time + the last 50 events (no customer data by construction)
function validDot(d, now = Date.now()) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'object required';
  for (const k of Object.keys(d)) if (!DOT_FIELDS.has(k)) return 'unknown field ' + String(k).slice(0, 32);
  if (!['tool', 'oauth'].includes(d.kind)) return 'kind must be tool|oauth';
  if (typeof d.tool !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(d.tool)) return 'bad tool';
  if (typeof d.ok !== 'boolean') return 'ok must be boolean';
  if (!['assistant', 'other'].includes(d.client)) return 'client must be assistant|other';
  if (d.latency_ms != null && !(Number.isInteger(d.latency_ms) && d.latency_ms >= 0 && d.latency_ms <= 600000)) return 'bad latency_ms';
  const t = Date.parse(d.t); if (typeof d.t !== 'string' || d.t.length > 40 || !Number.isFinite(t) || Math.abs(now - t) > 3600000) return 'bad t';
  return null;
}
function dotsFleet(fleet, now = Date.now()) {   // Assistant node state, merged into the fleet view
  if (!emitter.last) return fleet;
  const f = fleet || { as_of: iso(now), window_min: 15, seats: {}, working: {}, active: 0, total: 0 };
  const win = (f.window_min || 15) * 60000, last = emitter.recent[emitter.recent.length - 1] || {};
  const working = now - emitter.last <= EMITTER_WORK_MS;
  f.seats = { ...(f.seats || {}), Assistant: { active: now - emitter.last <= win, last_ct: iso(emitter.last), via: 'emitter', working, ...(working ? { working_via: 'emitter' } : {}) } };
  f.working = { ...(f.working || {}) }; delete f.working.Assistant;
  if (working) f.working.Assistant = { via: 'emitter', since_ct: iso(emitter.last), tool: last.tool, client: last.client, ok: last.ok };
  return f;
}
// cards: the collector waveboard, plus one card per accepted source item. A collector pass replaces only the wave cards.
let waveCards = []; let bfCards = []; let nudges = []; let waveSig = ''; let boardSig = '';
let cardsAt = 0;
let githubDataAt = 0;
let githubCardAt = 0;
try {
  const cardsPath = path.join(STATE_DIR, 'cards.json');
  const parsed = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  bfCards = Array.isArray(parsed.cards) ? parsed.cards : [];
  waveCards = bfCards.slice();
  const u = parsed.updated_ct;
  const t = typeof u === 'number' ? u : Date.parse(String(u ?? ''));
  if (Number.isFinite(t) && t > 0) cardsAt = t;
  else if (bfCards.length) cardsAt = fs.statSync(cardsPath).mtimeMs;
} catch { /* missing file stays cardsAt 0 */ }
try { nudges = fs.readFileSync(path.join(STATE_DIR, 'nudges.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
initArchive(process.env.MESH_DATA_DIR || '/data');
const saveNudges = () => {
  for (const n of nudges) {
    appendArchive('nudges', n);
    if (n && n.closed_at) appendArchive('nudges', { ...n, id: `${n.id}#closed`, t_ct: n.closed_at });
  }
  nudges = nudges.slice(-3000);
  bfWrite('nudges.jsonl', nudges.map(n => JSON.stringify(n)).join('\n') + '\n');
};
const parsedAllow = parseAllowlist(process.env.SOURCE_ALLOWLIST, '');
if (parsedAllow.badJson) console.log('source: SOURCE_ALLOWLIST is not json');
const SOURCE_ALLOW = parsedAllow.allow;
const work = new Map();
const WORK_MAX = 5000;
function nudgeToCloud(n) {   // a nudge to Builder is also an inbox line for Builder-cloud (either seat can pick it up)
  const l = { id: n.id, t_ct: n.t_ct, seat: 'builder-cloud', type: 'nudge', repo: n.repo, number: n.number, title: n.title, url: n.url, reason: `nudge L${n.level} (${n.via})` };
  if (!validInboxLine({ ...l, seat: 'builder' })) l.title = '';
  if (!validInboxLine({ ...l, seat: 'builder' }) || seatInbox['builder-cloud'].some(x => x.id === l.id)) return;
  seatInbox['builder-cloud'].push(l); saveSeatInbox('builder-cloud'); noteWake('builder-cloud', l);
}
function itemsFromWork() {
  const latest = new Map();
  for (const e of work.values()) {
    if (e.source !== 'jira' && !projectAllowed(SOURCE_ALLOW, e.source, e.project)) continue;
    const item = workEventToItem(e);
    if (!item || validateItem(item)) continue;
    const id = item.source + '\0' + item.key;
    const prev = latest.get(id);
    if (!prev || workItemNewer(prev, item)) latest.set(id, item);
  }
  return [...latest.values()];
}
function publishBoard(updatedCt) {
  const merged = mergeCards(waveCards, sourceCardsFrom(itemsFromWork(), { seats: SEAT_IDS }));
  const sig = JSON.stringify(merged);
  if (sig === boardSig) return;
  boardSig = sig;
  bfCards = merged; cardsAt = Date.now();
  const stamp = updatedCt || new Date().toISOString();
  bfWrite('cards.json', JSON.stringify({ updated_ct: stamp, cards: bfCards }));
  for (const c of bfCards) {
    if (!c || c.kind === 'source') continue;
    const beat = Number(c.last_beat_t);
    const updated = Number.isFinite(beat) && beat > 0 ? new Date(beat).toISOString() : (typeof c.updated_ct === 'string' ? c.updated_ct : '');
    appendArchive('cards', { ...c, t_ct: updated || c.t_ct || stamp, updated_ct: updated });
  }
  recomputeGithubDataAt();
}
function setCards(wb) {
  if (!wb || !Array.isArray(wb.cards)) return;
  const sliced = wb.cards.slice(0, 200);
  const sig = JSON.stringify(sliced);
  if (sig === waveSig) return;
  waveSig = sig;
  waveCards = sliced;
  publishBoard(wb.updated_ct);
}
function holdOwner(c) {
  const owner = seatIdOf(c.owner);
  if (owner && SEAT_IDS.includes(owner)) return owner;
  const by = seatIdOf(c.hold && c.hold.by);
  if (by && SEAT_IDS.includes(by)) return by;
  return COS;
}
// NUDGE: a live card with no beat for 60 min -> level 1 to the packet's next owner (else the card owner); still no
// beat 30 min after that -> level 2 to Coord. Level 3 then repeats to that same owner every 2h until a beat lands.
// Repos in NO_NUDGE_REPOS (unset means none) are shown and never nudged. A held card raises no L1/L2/L3. It nudges
// the owner once if it stays held with no beat past HELD_MAX_S (default 72h), unless the repo is in that list.
function evalNudges(now = Date.now()) {
  let changed = false; const byKey = new Map(bfCards.map(c => [c.key, c]));
  for (const n of nudges) {
    if (n.closed_at || ['silent', 'line', 'unrouted', 'quiet'].includes(n.kind) || (n.kind === 'reassign' && n.line_key)) continue;
    const c = byKey.get(n.card);
    if (cardNoNudge(c) || cardNoNudge({ repo: n.repo, key: n.card })) {
      n.closed_at = new Date(now).toISOString(); changed = true; continue;
    }
    if (n.kind === 'held') {
      if (!c || c.state !== 'held' || c.last_beat_t !== n.beat_t) { n.closed_at = new Date(now).toISOString(); changed = true; }
      continue;
    }
    if (!c || c.state !== 'live' || c.waiting || c.last_beat_t !== n.beat_t) { n.closed_at = new Date(now).toISOString(); changed = true; }
  }
  for (const c of bfCards) {
    if (cardNoNudge(c)) continue;
    if (c.state === 'held' && !c.pinned && c.last_beat_t && now - c.last_beat_t >= HELD_MAX_MS) {
      const nid = `nudge:${c.key}:held:${c.last_beat_t}`;
      if (!nudges.some(n => n.id === nid)) {
        const seat = holdOwner(c);
        nudges.push({ id: nid, kind: 'held', t: now, t_ct: new Date(now).toISOString(), card: c.key, repo: c.repo || '', number: c.number || 0,
          title: String(c.title || '').slice(0, 120), url: String(c.url || '').slice(0, 300), stage: c.stage || '', level: 0, seat, via: 'held past max', beat_t: c.last_beat_t });
        changed = true;
        if (seat === 'builder') nudgeToCloud(nudges[nudges.length - 1]);
      }
    }
    if (c.pinned || c.state !== 'live' || c.waiting || !c.last_beat_t || now - c.last_beat_t < NUDGE_L1_MS) continue;
    const id = lvl => `nudge:${c.key}:L${lvl}:${c.last_beat_t}`, has = lvl => nudges.find(n => n.id === id(lvl));
    const mk = (lvl, seat, via, nid = id(lvl)) => { nudges.push({ id: nid, t: now, t_ct: new Date(now).toISOString(), card: c.key, repo: c.repo || '', number: c.number || 0,
      title: String(c.title || '').slice(0, 120), url: String(c.url || '').slice(0, 300), stage: c.stage || '', level: lvl, seat, via, beat_t: c.last_beat_t }); changed = true;
      if (seat === 'builder') nudgeToCloud(nudges[nudges.length - 1]); };
    const to = seatIdOf(c.nudge_to), nx = to || seatIdOf((c.packet || {})['next owner']);
    const tgt = nx || seatIdOf(c.owner) || COS, via = to ? (c.nudge_via || 'retest owner') : nx ? 'next owner' : 'card owner';
    const l1s = nudges.filter(n => n.id === id(1) || n.id.startsWith(id(1) + ':'));
    let l1 = l1s[l1s.length - 1];
    if (!l1) { mk(1, tgt, via); l1 = has(1); }
    else if (!l1.closed_at && l1.seat !== tgt) {
      l1.closed_at = new Date(now).toISOString(); changed = true;
      if (!l1s.some(n => n.seat === tgt)) { mk(1, tgt, via, id(1) + ':' + tgt); l1 = nudges[nudges.length - 1]; } }
    if (l1 && !has(2) && now - l1.t >= NUDGE_L2_MS) mk(2, COS, 'escalation');
    const l2 = has(2);
    if (l2 && !l2.closed_at) {
      const reps = nudges.filter(n => n.card === c.key && n.level === 3 && n.beat_t === c.last_beat_t && !n.closed_at);
      const prev = reps.length ? reps[reps.length - 1].t : l2.t;
      if (now - prev >= NUDGE_L3_MS) {
        mk(3, tgt, 'repeat', `nudge:${c.key}:L3:${c.last_beat_t}:${reps.length + 1}`);
        const cos = cosSeat();   // L3 with no move: the CoS role also gets it, to reassign (once per card stretch)
        const rid = `nudge:${c.key}:L3cos:${c.last_beat_t}`;
        if (cos && cos !== tgt && !nudges.some(n => n.id === rid)) { mk(3, cos, 'L3: reassign', rid); nudges[nudges.length - 1].kind = 'reassign'; }
      }
    }
  }
  if (nudgeLines(now)) changed = true;
  if (nudgeSeats(now)) changed = true;
  if (changed) saveNudges();
  return changed;
}
// SILENT SEAT: no activity / prompt / beat line for > 2 h (merged fleet last_ct) while the seat owns live work (a live
// card where it is owner, next owner or retest owner, or an open nudge to it) -> fleet.seats[name].silent and one
// nudge to Coord per seat per quiet stretch (keyed by the seat's last_ct; closes when the seat acts or owns nothing).
const SILENT_MS = (Number(process.env.SILENT_S) || 7200) * 1000;
function evalSilent(fleet, now = Date.now()) {
  if (!fleet || !fleet.seats) return false;
  let changed = false; const silentIds = new Map();
  const presence = seatPresence();
  for (const [name, o] of Object.entries(fleet.seats)) {
    const id = seatIdOf(name); if (!id || !SEAT_IDS.includes(id)) continue;   // bot seats only (not Lead)
    const owns = bfCards.some(c => !c.pinned && c.state === 'live' && cardSeats(c).includes(id)) ||
      nudges.some(n => !n.closed_at && n.kind !== 'silent' && n.seat === id);
    const folded = presentSeat(fleet.seats, name, presence);
    let last = folded.last;
    if (last > tsOf(o.last_ct)) { o.last_ct = iso(last); o.via = 'presence'; o.active = now - last <= (fleet.window_min || 15) * 60000; }
    if (folded.working && !o.working) { o.working = true; o.working_via = 'presence'; }
    if (folded.working) continue;
    if (owns && (!last || now - last > SILENT_MS)) { o.silent = true; o.silent_since = iso(last || null); silentIds.set(id, { name, last }); }
  }
  for (const n of nudges) if (n.kind === 'silent' && !n.closed_at) {
    const cur = silentIds.get(n.about);
    if (!cur || cur.last !== n.beat_t) { n.closed_at = new Date(now).toISOString(); changed = true; }
  }
  for (const [id, { name, last }] of silentIds) {
    const nid = `silent:${id}:${last}`;
    if (nudges.some(n => n.id === nid)) continue;
    nudges.push({ id: nid, kind: 'silent', t: now, t_ct: new Date(now).toISOString(), card: '', repo: '', number: 0,
      title: `${name} silent 2h while owning live work`, url: '', stage: '', level: 2, seat: COS, via: 'silent seat', about: id, beat_t: last });
    changed = true;
  }
  if (changed) saveNudges();
  return changed;
}
function cardsView(list = bfCards) {   // cards with their nudges as distinct nudge beats
  const by = new Map(); for (const n of nudges) { if (!by.has(n.card)) by.set(n.card, []); by.get(n.card).push(n); }
  return list.map(c => { const ns = (by.get(c.key) || []).filter(n => n.beat_t === c.last_beat_t); if (!ns.length) return c;
    const beats = [...(c.beats || []), ...ns.map(n => ({ t: n.t, what: `nudge L${n.level} → ${n.seat}`, nudge: true, level: n.level, seat: n.seat }))].sort((a, b) => a.t - b.t).slice(-6);
    return { ...c, beats, nudge: Math.max(...ns.map(n => n.level)), nudge_open: ns.some(n => !n.closed_at) }; });
}
const cardSeats = c => [seatIdOf(c.owner), seatIdOf((c.packet || {})['next owner']), seatIdOf(c.nudge_to)].filter(Boolean);
const boxStale = (now = Date.now()) => now - (SRCS.box.at || STARTED) > BOX_STALE_MS;
const tsOf = s => { const t = Date.parse(s || ''); return Number.isFinite(t) ? t : 0; };
const iso = t => (t ? new Date(t).toISOString() : null);
// Fleet = GitHub-derived (Railway) + box-derived seat state. "active" is recomputed against the server clock, so a
// silent box ages out on its own; box-only state is kept but flagged box_stale (not hidden) once the box is silent.
function mergeFleet(g, b, stale, now) {
  if (!g && !b) return undefined;
  const win = ((g || b).window_min || 15) * 60000;
  const names = [...new Set([...Object.keys(g?.seats || {}), ...Object.keys(b?.seats || {})])];
  const seats = {}, working = {};
  for (const s of names) {
    const gs = g?.seats?.[s], bs = b?.seats?.[s], gl = tsOf(gs?.last_ct), bl = tsOf(bs?.last_ct);
    const src = bl > gl ? bs : gs, last = Math.max(gl, bl);
    const o = { active: !!last && now - last <= win, last_ct: src?.last_ct ?? null, via: src?.via ?? null, working: false };
    if (stale && bs && bl > gl) o.box_stale = true;
    let w = g?.working?.[s] || null;
    const bw = b?.working?.[s];
    if (!w && bw && !(bw.via === 'prompt' && gl > tsOf(bw.since_ct))) {   // a prompt is answered once the seat acts on GitHub
      if (stale) { o.box_stale = true; o.working_stale = true; } else w = bw;
    }
    if (w) { o.working = true; o.working_via = w.via; working[s] = w; }
    seats[s] = o;
  }
  const gc = g?.cloud || {}, bc = b?.cloud || {};
  const ghl = Math.max(tsOf(gc.github_last_ct), tsOf(bc.github_last_ct));
  const open = stale ? [] : (bc.open_agents || []);
  const cloud = { active: open.length > 0 || (!!ghl && now - ghl <= win), open_agents: open, github_last_ct: iso(ghl),
                  last_ct: iso(Math.max(tsOf(gc.last_ct), tsOf(bc.last_ct))) , working: !!gc.working || (!stale && !!bc.working) };
  if (stale && ((bc.open_agents || []).length || bc.working)) cloud.box_stale = true;
  if (cloud.working) working.CloudAgents = g?.working?.CloudAgents || b?.working?.CloudAgents || { via: 'cloud' };
  return { as_of: iso(now), window_min: win / 60000, seats, active: Object.values(seats).filter(v => v.active).length,
           total: Math.max(names.length, g?.total || 0, b?.total || 0), cloud, working, box_stale: stale,
           missing_activity: [...new Set([...(b?.missing_activity || []), ...(g?.missing_activity || [])])].sort() };   // feed only
}
function mergedHeader(now = Date.now()) {
  const g = SRCS.github.header, b = SRCS.box.header, stale = boxStale(now);
  const h = { ...(b || {}), ...(g || {}) };
  if (!g && !b) Object.assign(h, headerOf(EMPTY_FEED));
  delete h.source; delete h.fleet;
  h.title = SITE.title;   // the server's site.json wins: a box pusher or an older collector still sends the template title
  h.generated_at = g?.generated_at || b?.generated_at || null;   // LIVE pill: the Railway collector once it runs
  h.event_count = evs.size;
  h.wakes = wakeBoard(now);   // last successful wake per seat; quiet past BIFROST_WAKE_QUIET_MINUTES
  h.routing = ROUTING;   // startup route check (bifrost-init rules)
  h.clock = typeof clock === 'undefined' ? null : clock.run;   // timed run: deadlines per seat, cleared by a seat move
  h.kinds = [...new Set([...(g?.kinds || []), ...(b?.kinds || [])])].sort();
  h.notes = [...new Set([...(g?.notes || []), ...(b?.notes || [])])];
  h.sources = {
    github: g ? { generated_at: g.generated_at ?? null, received_at: iso(SRCS.github.at) } : null,
    box: b ? { generated_at: b.generated_at ?? null, received_at: iso(SRCS.box.at), stale } : null,
  };
  // board: the box pass board while the box pushed within BOARD_BOX_STALE_S (default 900 s), else the host collector's
  const boxBoardLive = !!b?.board && SRCS.box.at > 0 && now - SRCS.box.at <= BOARD_BOX_STALE_MS;
  const bd = boxBoardLive ? b.board : (g?.board || b?.board);
  if (bd) { setCards(bd); evalNudges(now); h.board = { ...bd, cards: cardsView(), source: 'server' }; }
  const fleet = mergeFleet(g?.fleet, b?.fleet, stale, now);
  if (fleet) { if (b && !stale) evalSilent(fleet, now); h.fleet = fleet; }   // only with a fresh box view (no restart flaps)
  const df = dotsFleet(h.fleet, now); if (df) h.fleet = df;
  const tf = foldSeatTouch(h.fleet, seatTouch, now); if (tf) h.fleet = tf;   // wake / read / ack activity
  h.freshness = {
    github_latest_ct: githubDataAt ? new Date(githubDataAt).toISOString() : null,
    github_card_latest_ct: githubCardAt ? new Date(githubCardAt).toISOString() : null,
    cards_at: cardsAt ? new Date(cardsAt).toISOString() : null,
  };
  h.queue = openQueue();
  return h;
}
function openQueue() {
  const lines = [];
  for (const seat of SEAT_IDS) {
    for (const l of openLines(seat)) {
      if (!l || l.id == null) continue;
      lines.push({
        id: String(l.id).slice(0, 120), seat,
        title: String(l.title || '').slice(0, 120),
        t_ct: typeof l.t_ct === 'string' ? l.t_ct : '',
        type: typeof l.type === 'string' ? l.type : '',
      });
    }
  }
  lines.sort((a, b) => (Date.parse(a.t_ct) || 0) - (Date.parse(b.t_ct) || 0));
  return lines.slice(0, 200);
}
// active windows and box staleness move with the clock: re-merge every 15 s, publish only on a real change
const fleetSig = h => JSON.stringify([h.fleet && { ...h.fleet, as_of: 0 }, h.sources?.box?.stale, nudges.length, nudges.filter(n => n.closed_at).length]);
setInterval(() => {
  const h = mergedHeader();
  if (fleetSig(h) !== fleetSig(header)) { seq++; header = h; fullDirty = true; }
}, 15000).unref();
const GOV_MS = Math.max(200, (Number(process.env.BIFROST_TICK_S) > 0 ? Number(process.env.BIFROST_TICK_S) : 60) * 1000);
// Governor: one tick. Nudges first (evalNudges: cards, unacked lines, unrouted and quiet seats); then the tripwire: when no
// seat has moved anything (events, acks) for BIFROST_TRIPWIRE_MINUTES (default 30) and some seat has open work, the
// clock starts a timed run (the same run the CoS starts by hand with POST /clock). A seat's move clears it.
const TRIP_MS = (Number(process.env.BIFROST_TRIPWIRE_MINUTES) > 0 ? Number(process.env.BIFROST_TRIPWIRE_MINUTES) : 30) * 60000;
const PER_SEAT_MS = (Number(process.env.BIFROST_RUN_SEAT_MINUTES) > 0 ? Number(process.env.BIFROST_RUN_SEAT_MINUTES) : 2) * 60000;
const COORD_SEAT = (() => {   // the CoS role (routing seats.coord.seat): pulls the next work on an empty board
  try { const r = JSON.parse(fs.readFileSync(path.join(process.env.BIFROST_ROUTING_DIR || path.join(COLLECTOR_DIR_EARLY(), 'routing'), 'inbox-roles.json'), 'utf8'));
    const c = r?.seats?.coord; return c && !c.off && c.seat ? String(c.seat).toLowerCase() : null; } catch { return null; }
})();
const CLOCK_SEATS = (() => {   // who may start a run by hand: BIFROST_CLOCK_SEATS, else the coord (CoS) seat
  const env = String(process.env.BIFROST_CLOCK_SEATS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return env.length ? env : COORD_SEAT ? [COORD_SEAT] : [];
})();
const clock = createClock({ tripMs: TRIP_MS, perSeatMs: PER_SEAT_MS });
const trip = tripwire();
let governorChanges = 0;
const openSeats = () => SEAT_IDS.filter(s => s !== 'builder' && s !== 'builder-cloud' && openLines(s).length);
function wakeRun(run) {
  for (const [seat, by] of Object.entries(run.deadlines)) {
    const n = openLines(seat).length;
    const reason = run.reason === 'empty' ? `board empty, pull next work by ${by}`
      : `timed run (${run.reason}): move your open work or post your blocker in one line by ${by}`;
    noteWake(seat, { id: `clock:${run.started_at}:${seat}`, type: 'timed_run', title: run.reason === 'empty' ? 'board empty' : `timed run: ${n} open line(s)`, reason });
  }
  const cos = cosSeat();
  if (run.reason !== 'empty' && cos && !(cos in run.deadlines)) {   // the CoS role owns the board: told about every stall run
    noteWake(cos, { id: `clock:${run.started_at}:cos`, type: 'timed_run', title: 'board stalled',
      reason: `board stalled: timed run on ${Object.keys(run.deadlines).join(', ')}, ends ${run.ends_at}` });
  }
  console.log(`clock: ${run.reason} run started, ${Object.keys(run.deadlines).length} seat(s), ends ${run.ends_at}`);
}
function moveFp() { return fingerprint([...evs.values()].map(v => v.e), { acks: Object.values(inboxAcks).reduce((n, a) => n + (a ? a.length : 0), 0) }); }
function governorRun(now = Date.now()) {
  if (evalNudges(now)) { seq++; fullDirty = true; }
  const w = wakeBoard(now);
  const r = clock.observe(moveFp(), now, { openCards: bfCards.filter(c => c.state === 'live').length, openSeats: openSeats(), coord: COORD_SEAT });
  if (r === 'stall' || r === 'empty') wakeRun(clock.run);
  if (r === 'cleared') console.log('clock: cleared by a seat move');
  const fp = fingerprint([...evs.values()].map(v => v.e), { nudges: nudges.filter(n => !n.closed_at).map(n => n.id), routing: ROUTING.ok,
    quiet: Object.keys(w).filter(k => w[k].quiet).sort(), clock: clock.run && clock.run.started_at });
  if (trip(fp)) { governorChanges++; seq++; header = mergedHeader(); fullDirty = true; }
}
setInterval(() => governorRun(), GOV_MS).unref();
header = mergedHeader();
function full() {   // built lazily: only the first full GET after a change pays for stringify + gzip
  if (fullDirty) {
    feedBody = Buffer.from(JSON.stringify({ ...maskHeader(header), cursor: cursor(), events: [...evs.values()].map(v => mask(v.e)) }));
    feedGz = zlib.gzipSync(feedBody, { level: 6 }); feedEtag = `"${cursor()}"`; fullDirty = false;
  }
  return { body: feedBody, gz: feedGz, etag: feedEtag };
}
// Private repos (D18): on the login-page feed an event or header object of a private repo keeps only its id, times, kind and
// mesh hops (plus number / sha so replay can link packets); repo becomes 'private repo' and title / label / url / branch
// text are dropped. header.fleet and header.board are seat state, never masked (the live page needs seats' active).
const PUBLIC_KEEP = new Set(['id', 't_ct', 'kind', 'from', 'to', 'hops', 'src_file', 'seat', 'credit', 'state', 'status', 'number', 'sha', 'active']);
const HEADER_RAW = ['fleet', 'board'];
// fleet / board stay whole, but every string naming a private repo (repo field, full name, URL) is rewritten.
// One compiled pattern, rebuilt only when the private set grows (not per string per GET).
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let privRe = null, privReN = -1;
function privPattern() {
  if (privReN !== privateRepos.size) { privReN = privateRepos.size; privRe = privReN ? new RegExp([...privateRepos].sort((a, b) => b.length - a.length).map(reEsc).join('|'), 'gi') : null; }
  return privRe;
}
function scrub(v) {
  if (!privateRepos.size || v === null) return v;
  if (typeof v === 'string') return v.replace(privPattern(), 'private repo');
  if (Array.isArray(v)) return v.map(scrub);
  if (typeof v !== 'object') return v;
  const o = {}; for (const k of Object.keys(v)) o[k] = scrub(v[k]); return o;
}
// A header repo name is shown only when confirmed public (read OK and private:false); anything else is a placeholder.
// The header is never collapsed like a private event: every field is kept, repo / repos are mapped, the rest masked + scrubbed.
function maskHeader(h) {
  if (!privateRepos.size || !h || typeof h !== 'object') return h;
  const pub = new Set([...readable].map(x => x.toLowerCase()).filter(x => !privateRepos.has(x)));
  const publicRepo = r => typeof r === 'string' && pub.has(r.toLowerCase());
  const o = {};
  for (const k of Object.keys(h)) {
    if (HEADER_RAW.includes(k)) o[k] = scrub(h[k]);
    else if (k === 'repo') o[k] = publicRepo(h[k]) ? h[k] : 'private repo';
    else if (k === 'repos' && Array.isArray(h[k])) o[k] = h[k].map(r => publicRepo(r) ? r : 'private repo');
    else o[k] = scrub(mask(h[k]));
  }
  return o;
}
// Short names are for matching only (an event whose repo is a bare name); scrub never rewrites bare short names.
const privateShort = new Set();
function isPrivate(o) {
  if (!o || typeof o.repo !== 'string') return false;
  const r = o.repo.toLowerCase();
  return privateRepos.has(r) || (!r.includes('/') && privateShort.has(r));
}
function mask(v) {
  if (!privateRepos.size || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(mask);
  if (isPrivate(v)) { const o = { repo: 'private repo', label: 'private repo' }; for (const k of PUBLIC_KEEP) if (k in v) o[k] = v[k]; return o; }
  const o = {}; for (const k of Object.keys(v)) o[k] = mask(v[k]); return o;
}
function since(c, raw = false) {   // raw: unmasked (ingest-secret inbox routing only)
  const mk = raw ? x => x : mask;  // null -> client must refetch the full feed
  const m = /^([A-Za-z0-9_-]+)\.(\d+)$/.exec(String(c || ''));
  if (!m || m[1] !== EPOCH) return null;
  const s = Number(m[2]);
  if (s > seq || s < floorSeq) return null;
  if (s === seq) return 'same';
  const events = []; for (const v of evs.values()) if (v.s > s) events.push(mk(v.e));
  return { ...(raw ? header : maskHeader(header)), delta: true, cursor: cursor(), events, removed: removed.filter(r => r.s > s).map(r => r.id) };
}

// ---- GitHub collector (Railway): python child with ONLY the read-only token; writes a feed file on the volume ----
// GITHUB_READ_TOKEN = fine-grained, read-only (no Checks permission: suites/runs come from Actions instead). The child
// env is built from scratch: no ingest secret, session secret or mesh password, and the token is never logged.
const DATA_DIR = process.env.MESH_DATA_DIR || '/data';
const GH_FEED = path.join(DATA_DIR, 'feed', 'github-events.json');
const JIRA_FEED = path.join(DATA_DIR, 'feed', 'jira-events.json');
const jira = { pid: null, restarts: 0, lastWrite: 0, sig: '' };
const COLLECTOR_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'collector');
const COLLECTOR_REPOS = (process.env.COLLECTOR_REPOS || 'example-org/app example-org/mcp').split(/\s+/).filter(Boolean);
const collector = { pid: null, restarts: 0, lastExit: null, lastWrite: 0, sig: '', repos: COLLECTOR_REPOS, child: null };
// COLLECTOR_ORG=org (D18): watch every repo the token can see in that org, unioned with COLLECTOR_REPOS; re-listed every
// COLLECTOR_ORG_REFRESH_S (3600). A changed list restarts the collector child with the new repos. A failed listing keeps the last list.
async function orgRepos(org, tok) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${GITHUB_API}/orgs/${encodeURIComponent(org)}/repos?per_page=100&type=all&page=${page}`,
      { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('org list ' + r.status);
    const rows = await r.json();
    for (const x of rows) if (x && typeof x.full_name === 'string' && !x.archived) out.push(x.full_name);
    if (rows.length < 100) break;
  }
  return out;
}
// Each repo is checked once with GET /repos/<full>: 403/404 is skipped (never handed to the collector); `private` is remembered
// so the session-login page and feed mask that repo (inboxes and /cards keep the real names).
async function readableRepos(list, tok) {
  const ok = [];
  for (const full of list) {
    if (!readable.has(full)) {
      const r = await fetch(`${GITHUB_API}/repos/${full}`, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!r || !r.ok) { skipped.add(full); console.log(`collector: skip ${repoTag(full)} (${r ? r.status : 'error'})`); continue; }
      skipped.delete(full);
      const d = await r.json().catch(() => ({}));
      if (d.private !== false && !PUBLIC) {   // public mode: nothing is masked, so nothing is remembered as private
        privateRepos.add(full.toLowerCase()); privateShort.add(full.toLowerCase().split('/').pop()); seq++; floorSeq = seq; fullDirty = true; }
      readable.add(full);
    }
    ok.push(full);
  }
  return ok;
}
const readable = new Set(), privateRepos = new Set(), skipped = new Set();   // listed or pinned but unreadable (token scope)
// Logs never name a repo that is not confirmed public (private or unreadable): it shows as 'private repo #n' (n is stable
// for the process). Collector / route child output passes through redactRepos (full and short names).
const repoNo = new Map();
const hiddenRepo = full => !PUBLIC && (privateRepos.has(String(full).toLowerCase()) || [...skipped].some(x => x.toLowerCase() === String(full).toLowerCase()));
function repoTag(full) {
  if (!hiddenRepo(full)) return full;
  const k = String(full).toLowerCase(); if (!repoNo.has(k)) repoNo.set(k, repoNo.size + 1);
  return `private repo #${repoNo.get(k)}`;
}
function redactRepos(text) {
  let t = String(text);
  const hidden = [...new Set([...privateRepos, ...[...skipped].map(x => x.toLowerCase())])].sort((a, b) => b.length - a.length);
  for (const full of hidden) {
    const tag = repoTag(full), esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(esc(full), 'gi'), tag);
    const short = full.split('/').pop();
    if (short) t = t.replace(new RegExp(`(^|[^\\w./-])${esc(short)}(?![\\w-])`, 'gi'), (m, a) => a + tag);
  }
  return t;
}
async function collectorRepos(tok) {
  const org = (process.env.COLLECTOR_ORG || '').trim();
  if (!org) return COLLECTOR_REPOS;
  try { return (await readableRepos([...new Set([...COLLECTOR_REPOS, ...await orgRepos(org, tok)])], tok)).sort(); }
  catch (e) { console.log('collector: ' + redactRepos(String(e.message)).slice(0, 80) + '; keeping last repo list'); return collector.repos; }
}
async function refreshOrgRepos() {
  const next = await collectorRepos(process.env.GITHUB_READ_TOKEN || '');
  if (next.join(' ') === collector.repos.join(' ')) return;
  collector.repos = next;
  console.log(`collector: repos ${next.map(repoTag).join(' ')}`);
  if (collector.child) { collector.restarts = 0; collector.child.kill('SIGTERM'); }   // exit handler restarts with the new list
}
// fleetConfig (presence.mjs): committed fleet-roster.json / fleet-nodes.json shipped beside the collector.
const fleetConfig = (e, dir = COLLECTOR_DIR) => fleetConfigOf(e, dir);
async function startCollector() {
  const tok = process.env.GITHUB_READ_TOKEN || '';
  if (!tok || process.env.COLLECTOR === 'off') { console.log('collector: off (no GITHUB_READ_TOKEN or COLLECTOR=off)'); return; }
  if (process.env.COLLECTOR_ORG && !collector.orgTimer) {
    collector.repos = await collectorRepos(tok);
    console.log(`collector: repos ${collector.repos.map(repoTag).join(' ')}`);
    collector.orgTimer = setInterval(() => refreshOrgRepos().catch(() => {}), Number(process.env.COLLECTOR_ORG_REFRESH_S || 3600) * 1000);
    collector.orgTimer.unref();
  }
  if (!fs.existsSync(path.join(COLLECTOR_DIR, 'live_mesh.py'))) { console.log('collector: code missing; off'); return; }
  fs.mkdirSync(path.join(DATA_DIR, 'feed'), { recursive: true }); fs.mkdirSync(path.join(DATA_DIR, 'home'), { recursive: true });
  seedStore();
  const env = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: path.join(DATA_DIR, 'home'), LANG: 'C.UTF-8',
    TZ: 'America/Chicago', PYTHONDONTWRITEBYTECODE: '1', LIVE_MODE: 'github', LIVE_NO_CHECKS: '1', GH_TOKEN: tok,
    LIVE_MESH_SRC: path.join(COLLECTOR_DIR, 'upstream'),
    LIVE_HEALTH_URLS: (process.env.COLLECTOR_HEALTH_URLS || '').trim() };
  if (process.env.GITHUB_HOLD_LABEL) env.GITHUB_HOLD_LABEL = process.env.GITHUB_HOLD_LABEL;
  if (process.env.NO_NUDGE_REPOS != null) env.NO_NUDGE_REPOS = process.env.NO_NUDGE_REPOS;
  for (const k of ['UPSTREAM_REPO', 'UPSTREAM_PINNED', 'UPSTREAM_REPOS', 'XRAY_REPO', 'XRAY_OURS', 'SEAT_PRESENCE', 'LIVE_NODE_MAP', 'LIVE_BRAND', 'LIVE_BRAND_RE', 'LIVE_SHOW_UNMAPPED', 'LIVE_FLEET_SEATS']) if (process.env[k] != null) env[k] = process.env[k];
  Object.assign(env, fleetConfig(process.env));
  const healthArg = env.LIVE_HEALTH_URLS.split(/\s+/).filter(Boolean)[0] || '';
  const args = ['-B', '-u', path.join(COLLECTOR_DIR, 'live_mesh.py'), '--out', GH_FEED, '--watch', process.env.COLLECTOR_WATCH_S || '45',
    '--repos', ...collector.repos, '--deploy-repo', '', '--health', healthArg];
  const child = spawn('python3', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  collector.pid = child.pid; collector.child = child;
  console.log(`collector: started pid ${child.pid}`);
  for (const st of [child.stdout, child.stderr]) {
    let buf = '';
    st.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { console.log('collector: ' + redactRepos(buf.slice(0, i).replaceAll(tok, '[redacted]')).slice(0, 400)); buf = buf.slice(i + 1); } });
  }
  child.on('error', e => console.log('collector: spawn failed (' + e.code + ')'));
  child.on('exit', (code, sig) => {
    collector.pid = null; collector.child = null; collector.lastExit = code ?? sig; collector.restarts++;
    const wait = Math.min(300, 15 * 2 ** Math.min(collector.restarts - 1, 4)) * 1000;
    console.log(`collector: exited ${code ?? sig}; restart in ${wait / 1000}s`);
    if (!stopping) setTimeout(startCollector, wait).unref();
  });
  process.on('exit', () => { try { child.kill('SIGTERM'); } catch {} });
}
let stopping = false;
// One-time seed (deploy.sh MESH_SEED_STORE=1 ships collector/seed/): the box collector's store (GitHub metadata only,
// no bodies or secrets) so the Railway collector continues incrementally with full history instead of a cold backfill
// (a cold backfill cannot recover check suites/runs of other apps). Never overwrites an existing volume file.
function seedStore() {
  const src = path.join(COLLECTOR_DIR, 'seed');
  if (!fs.existsSync(src)) return;
  for (const rel of ['store/app.json', 'store/mcp.json', 'health-state.json']) {
    const from = path.join(src, rel), to = path.join(DATA_DIR, 'feed', rel);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to + '.seed'); fs.renameSync(to + '.seed', to);
    console.log('collector: seeded ' + rel);
  }
}
// Per-repo collect times (D18), summarized on /healthz as a count and two times.
const repoSeen = new Map();
function repoTimes(f) {
  const at = typeof f.generated_at === 'string' ? f.generated_at : new Date().toISOString();
  const newest = new Map();
  for (const e of f.events || []) {
    const r = String(e && e.repo || '').toLowerCase(), t = String(e && e.t_ct || '');
    if (r && t && Date.parse(t) > Date.parse(newest.get(r) || 0)) newest.set(r, t);
  }
  for (const full of collector.repos) {
    const k = full.toLowerCase(), t = newest.get(k) || newest.get(k.split('/').pop()) || repoSeen.get(full)?.newest_event || null;
    repoSeen.set(full, { last_collected: at, newest_event: t });
  }
}
const ageS = t => (t > 0 ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null);
function sha7(v) {
  const hex = String(v || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return hex.length >= 7 ? hex.slice(0, 7) : '';
}
function eventMovesCard(e) {
  if (!e || typeof e !== 'object') return false;
  const k = typeof e.kind === 'string' ? e.kind : '';
  if (/watcher|turn|subagent/.test(k)) return false;
  if (k === 'pr_open' || k === 'issue_open' || k === 'pr_commit' || k === 'pr_force_push' || k === 'pr_update' || k === 'merged') return true;
  if (k.startsWith('critic_')) return true;
  if ((k === 'check_run' || k === 'workflow_run' || k === 'ci_pass' || k === 'ci_fail') && (e.conclusion || k.startsWith('ci_'))) return true;
  if (k.startsWith('lab_retest_')) return true;
  if (k.startsWith('prompt') && e.from === 'Lead') return true;
  if ((k === 'issue_labeled' || k === 'pr_labeled') && /block/i.test(String(e.detail || ''))) return true;
  if (k.includes('blocker')) return true;
  return false;
}
function openCardIndex() {
  const keys = new Set();
  const heads = new Set();
  for (const c of bfCards) {
    if (!c || typeof c !== 'object' || c.kind === 'source' || c.state === 'closed') continue;
    let repo = typeof c.repo === 'string' ? c.repo.trim().toLowerCase() : '';
    let n = Number(c.number);
    if (!(repo && Number.isInteger(n) && n > 0) && typeof c.key === 'string') {
      const m = /^([^#]+)#([1-9]\d*)$/.exec(c.key.trim().toLowerCase());
      if (m) { repo = m[1]; n = Number(m[2]); }
    }
    if (!(repo && Number.isInteger(n) && n > 0)) continue;
    keys.add(repo + '#' + n);
    const head = sha7(c.head);
    if (head) heads.add(repo + '@' + head);
  }
  return { keys, heads };
}
function eventOnOpenCard(e, open) {
  const repo = e && typeof e.repo === 'string' ? e.repo.trim().toLowerCase() : '';
  if (!repo) return false;
  const n = Number(e.number);
  if (e.number != null && e.number !== '' && Number.isInteger(n) && n > 0) return open.keys.has(repo + '#' + n);
  const k = typeof e.kind === 'string' ? e.kind : '';
  if (k !== 'check_run' && k !== 'workflow_run' && k !== 'ci_pass' && k !== 'ci_fail') return false;
  const sha = sha7(e.sha || e.head_sha);
  return !!sha && open.heads.has(repo + '@' + sha);
}
function recomputeGithubDataAt() {
  const open = openCardIndex();
  let best = 0, card = 0;
  for (const e of SRCS.github.evs.values()) {
    const t = Date.parse(e && typeof e.t_ct === 'string' ? e.t_ct : '');
    if (!Number.isFinite(t) || t <= 0) continue;
    if (t > best) best = t;
    if (t > card && eventMovesCard(e) && eventOnOpenCard(e, open)) card = t;
  }
  githubDataAt = best;
  githubCardAt = card;
}
function boardWord() {
  if (cardsAt === 0) return 'building';
  if (!bfCards.length) return 'empty';
  return 'live';
}
function wakeHealth() {   // seat -> ok | fail | no_key | idle (configured, nothing sent yet); never a url or key
  const out = {};
  for (const [seat, cfg] of Object.entries(SEAT_WEBHOOKS)) {
    const st = wakeQ.get(seat)?.status;
    out[seat] = st ? (st.ok ? 'ok' : st.error === 'no_key' ? 'no_key' : 'fail') : (process.env[cfg.keyEnv] || process.env[cfg.seatKeyEnv] ? 'idle' : 'no_key');
  }
  return out;
}
function healthBody() {   // public: counts, times, ages (s) and wake states; no repo names, urls or keys
  const at = collector.repos.map(r => repoSeen.get(r)?.last_collected).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  const cardAge = ageS(cardsAt), dataAge = ageS(githubDataAt);
  const ok = !((typeof cardAge === 'number' && cardAge > CARD_STALE_S) || (typeof dataAge === 'number' && dataAge > DATA_STALE_S));
  return JSON.stringify({ ok, mode: PUBLIC ? 'public' : 'gated', collector: collector.pid ? 'running' : 'stopped', repos: collector.repos.length, repos_unreadable: skipped.size,
    oldest_collected: at.length === collector.repos.length ? at[0] || null : null, newest_collected: at.at(-1) || null,
    box_age: ageS(SRCS.box.at), collector_age: ageS(collector.lastWrite), card_age: cardAge, data_age: dataAge, board: boardWord(),
    origin: ORIGIN || null, wakes: wakeHealth(), nudged_lines: nudges.filter(n => n.kind === 'line' && !n.closed_at).length, routing: ROUTING.ok ? 'ok' : 'fail', governor_changes: governorChanges });
}
function readCollectorFeed() {   // every 2 s: ingest the collector's file when it changed (atomic rename by the writer)
  let st; try { st = fs.statSync(GH_FEED); } catch { return; }
  const sig = `${st.ino}:${st.size}:${st.mtimeMs}`;
  if (sig === collector.sig) return;
  let f; try { f = JSON.parse(fs.readFileSync(GH_FEED, 'utf8')); } catch { return; }   // mid-replace: next tick
  if (!validFeed(f)) { collector.sig = sig; console.log('collector: feed file invalid; ignored'); return; }
  collector.sig = sig; collector.lastWrite = Date.now();
  repoTimes(f);
  ingestSrc('github', f.events, headerOf(f));
  routeSoon();
}
// ---- Server inbox routing: after each collector pass, feed/inbox_pass.py (same rules as the box pusher:
// routing/inbox-roles.json) routes events not seen before into seat inboxes, then postSeatLines stores them and fires
// the SEAT_WEBHOOKS wake. State (seen / sent ids, spool) lives on the volume under $MESH_DATA_DIR/route, so an event is
// routed once across restarts; the very first pass seeds silently (history is never delivered). A line that was
// stored but not yet marked sent (crash in between) is re-posted and dropped by postSeatLines' per-seat id check.
// The python child gets no token or secret. SERVER_ROUTING=off turns this off.
const ROUTE_DIR = path.join(DATA_DIR, 'route');
const route = { busy: false, again: false, passes: 0, lines: 0, last: null };
function routeScript() {
  for (const f of [path.join(COLLECTOR_DIR, 'inbox_pass.py'), path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'feed', 'inbox_pass.py')])
    if (fs.existsSync(f)) return f;
  return '';
}
function routePy(script, args) {
  const env = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: path.join(DATA_DIR, 'home'), LANG: 'C.UTF-8',
    TZ: process.env.TZ || 'America/Chicago', MESH_RUN: ROUTE_DIR, FEED: GH_FEED, LIVE_INBOX: path.join(ROUTE_DIR, 'spool'),
    INBOX_STATE: path.join(ROUTE_DIR, 'inbox-state.json'), INBOX_CACHE: path.join(ROUTE_DIR, 'inbox-events.json'),
    LIVE_ACTIVITY: path.join(ROUTE_DIR, 'activity.jsonl'), LIVE_BOARD: 'off', PYTHONDONTWRITEBYTECODE: '1' };
  for (const k of ['SEAT_BOTS', 'SEAT_WATCHERS']) if (process.env[k]) env[k] = process.env[k];   // routing config only, no secrets
  return new Promise(resolve => {
    let out = '', err = '';
    const c = spawn('python3', ['-B', script, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; });
    c.on('error', e => resolve({ code: -1, out: '', err: String(e.code) }));
    c.on('close', code => resolve({ code, out: out.trim(), err: err.trim().split('\n').pop() || '' }));
  });
}
async function routeOnce(script) {
  fs.mkdirSync(path.join(DATA_DIR, 'home'), { recursive: true }); fs.mkdirSync(ROUTE_DIR, { recursive: true });
  const p = await routePy(script, ['pass']);
  if (p.code !== 0) { console.log('route: pass failed (' + p.code + ') ' + redactRepos(p.err).slice(0, 120)); return; }
  const out = path.join(ROUTE_DIR, 'unsent.json');
  for (let round = 0; round < 50; round++) {   // unsent hands out 500 lines at a time
    const u = await routePy(script, ['unsent', out]);
    if (u.code !== 0) { console.log('route: unsent failed (' + u.code + ')'); return; }
    if (!(Number(u.out) > 0)) break;
    let parsed; try { parsed = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { return; }
    const r = postSeatLines(parsed, null);   // stores, dedupes by id per seat, wakes; bad lines are logged and dropped
    if (r.status !== 200 && r.status !== 400) return;
    route.lines += r.added || 0;
    const s = await routePy(script, ['sent', out]);
    if (s.code !== 0) { console.log('route: sent failed (' + s.code + ')'); return; }
    if (Number(u.out) < 500) break;
  }
  route.passes++; route.last = new Date().toISOString();
  console.log(`route: pass ${p.out}`);
}
async function routePass() {
  if (route.busy) { route.again = true; return; }
  const script = routeScript();
  if (!script) { console.log('route: inbox_pass.py missing; off'); return; }
  route.busy = true;
  try { do { route.again = false; await routeOnce(script); } while (route.again); }
  catch (e) { console.log('route: ' + redactRepos(String(e.message)).slice(0, 80)); }
  finally { route.busy = false; }
}
function routeSoon() { if (process.env.SERVER_ROUTING !== 'off') routePass(); }
function jiraScript() {
  const beside = path.join(COLLECTOR_DIR, 'jira_source.py');
  if (fs.existsSync(beside)) return beside;
  const feed = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'feed', 'jira_source.py');
  return fs.existsSync(feed) ? feed : '';
}
function jiraAllowlist() {
  const raw = process.env.JIRA_PROJECTS;
  if (raw == null || !String(raw).trim()) return null;
  const skip = new Set(String(process.env.JIRA_EXCLUDE || '').split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean));
  const set = new Set();
  for (const part of String(raw).split(/[\s,]+/)) {
    const key = part.trim().toUpperCase();
    if (!key || skip.has(key) || !/^[A-Z][A-Z0-9]{1,9}$/.test(key)) continue;
    set.add(key);
  }
  return set;
}
function jiraOn() {
  const list = jiraAllowlist();
  return process.env.JIRA_SOURCE !== 'off' && !!process.env.JIRA_SITE && !!process.env.JIRA_EMAIL && !!process.env.JIRA_API_TOKEN && !!list && list.size > 0;
}
function jiraKeyProject(key) {
  const m = /^([A-Z][A-Z0-9]{1,9})-\d+$/.exec(String(key || '').toUpperCase());
  return m ? m[1] : '';
}
function jiraAllowed(e) {
  const fromKey = jiraKeyProject(e.key);
  if (!fromKey) return false;
  const skip = new Set(String(process.env.JIRA_EXCLUDE || '').split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean));
  if (skip.has(fromKey)) return false;
  if (e.project != null && String(e.project).toUpperCase() !== fromKey) return false;
  const list = jiraAllowlist();
  if (list && !list.has(fromKey)) return false;
  return true;
}
const WORK_KEYS = new Set(['id', 'source', 't', 'kind', 'key', 'title', 'url', 'state', 'status', 'project', 'actor']);
const WORK_KINDS = new Set(['opened', 'updated', 'closed', 'reopened']);
function validWork(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  for (const k of Object.keys(e)) if (!WORK_KEYS.has(k)) return null;
  if (typeof e.id !== 'string' || !/^[A-Za-z0-9:._#+/-]{1,200}$/.test(e.id)) return null;
  if (typeof e.source !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(e.source)) return null;
  if (typeof e.t !== 'string' || !Number.isFinite(Date.parse(e.t))) return null;
  if (!WORK_KINDS.has(e.kind)) return null;
  if (typeof e.key !== 'string' || e.key.length < 1 || e.key.length > 80 || e.key.includes('@')) return null;
  if (e.source === 'jira' && !jiraAllowed(e)) return null;
  const out = { id: e.id, source: e.source, t: e.t, kind: e.kind, key: e.source === 'jira' ? e.key.toUpperCase() : e.key };
  if (e.title != null) {
    if (typeof e.title !== 'string' || e.title.length > 200 || e.title.includes('@')) return null;
    out.title = e.title;
  }
  if (e.url != null) {
    if (typeof e.url !== 'string' || e.url.length > 300 || !/^https:\/\/\S+$/.test(e.url)) return null;
    out.url = e.url;
  }
  if (e.state != null) {
    if (e.state !== 'open' && e.state !== 'closed') return null;
    out.state = e.state;
  }
  if (e.status != null) {
    if (typeof e.status !== 'string' || e.status.length > 80 || e.status.includes('@')) return null;
    out.status = e.status;
  }
  if (e.source === 'jira') out.project = jiraKeyProject(e.key);
  else if (e.project != null) {
    if (typeof e.project !== 'string' || e.project.length > 80 || e.project.includes('@')) return null;
    out.project = e.project;
  }
  if (e.actor != null) {
    if (typeof e.actor !== 'string' || e.actor.length > 80 || e.actor.includes('@')) return null;
    out.actor = e.actor;
  }
  return out;
}
function loadFeedEvents() {
  try {
    const f = JSON.parse(fs.readFileSync(JIRA_FEED, 'utf8'));
    if (!f || !Array.isArray(f.events)) return [];
    return f.events.filter(e => e && typeof e === 'object' && typeof e.id === 'string');
  } catch { return []; }
}
function persistWork() {
  const disk = loadFeedEvents();
  const byId = new Map();
  for (const raw of disk) { const n = validWork(raw); if (n) byId.set(n.id, n); }
  for (const e of work.values()) byId.set(e.id, e);
  let events = [...byId.values()].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (events.length > WORK_MAX) events = events.slice(events.length - WORK_MAX);
  work.clear();
  for (const e of events) work.set(e.id, e);
  const payload = JSON.stringify({ source: 'jira', generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), events });
  fs.mkdirSync(path.dirname(JIRA_FEED), { recursive: true });
  const tmp = `${JIRA_FEED}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, JIRA_FEED);
  try { const st = fs.statSync(JIRA_FEED); jira.sig = `${st.ino}:${st.size}:${st.mtimeMs}`; } catch {}
}
function acceptWork(list) {
  let accepted = 0, rejected = 0, changed = false;
  for (const e of list || []) {
    const n = validWork(e);
    if (!n) { rejected++; continue; }
    const prev = work.get(n.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(n)) changed = true;
    work.set(n.id, n);
    accepted++;
  }
  if (work.size > WORK_MAX) {
    const drop = [...work.values()].sort((a, b) => (a.t < b.t ? -1 : 1)).slice(0, work.size - WORK_MAX);
    for (const e of drop) work.delete(e.id);
    changed = true;
  }
  if (changed) {
    try { persistWork(); } catch { console.log('source: save failed'); }
    publishBoard();
  }
  return { accepted, rejected };
}
function readJiraFeed() {
  let st; try { st = fs.statSync(JIRA_FEED); } catch { return; }
  const sig = `${st.ino}:${st.size}:${st.mtimeMs}`;
  if (sig === jira.sig) return;
  let f; try { f = JSON.parse(fs.readFileSync(JIRA_FEED, 'utf8')); } catch { return; }
  if (!f || !Array.isArray(f.events)) { jira.sig = sig; console.log('jira: feed file invalid; ignored'); return; }
  jira.lastWrite = Date.now();
  const source = typeof f.source === 'string' ? f.source : '';
  const events = f.events.map(e => (e && typeof e === 'object' && e.source == null && source ? { ...e, source } : e));
  const before = jira.sig;
  const r = acceptWork(events);
  if (jira.sig === before) jira.sig = sig;
  if (r.accepted || r.rejected) console.log(`jira: file ${r.accepted} accepted, ${r.rejected} rejected`);
}
function startJira() {
  if (jira.pid) return;
  if (!jiraOn()) {
    const any = process.env.JIRA_SITE || process.env.JIRA_EMAIL || process.env.JIRA_API_TOKEN || String(process.env.JIRA_PROJECTS || '').trim();
    if (any && process.env.JIRA_SOURCE !== 'off') console.log('jira: off (set JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECTS)');
    return;
  }
  const script = jiraScript();
  if (!script) { console.log('jira: code missing; off'); return; }
  fs.mkdirSync(path.dirname(JIRA_FEED), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'home'), { recursive: true });
  const token = process.env.JIRA_API_TOKEN, email = process.env.JIRA_EMAIL;
  const env = {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: path.join(DATA_DIR, 'home'), LANG: 'C.UTF-8',
    TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1', JIRA_SITE: process.env.JIRA_SITE, JIRA_PROJECTS: process.env.JIRA_PROJECTS || '',
    JIRA_EMAIL: email, JIRA_API_TOKEN: token,
  };
  if (process.env.JIRA_API_BASE) env.JIRA_API_BASE = process.env.JIRA_API_BASE;
  if (process.env.JIRA_EXCLUDE) env.JIRA_EXCLUDE = process.env.JIRA_EXCLUDE;
  if (process.env.JIRA_HOLD_STATUS) env.JIRA_HOLD_STATUS = process.env.JIRA_HOLD_STATUS;
  const redact = line => line.replaceAll(token, '[redacted]').replaceAll(email, '[redacted]').slice(0, 400);
  const child = spawn('python3', ['-B', '-u', script, 'pull', '--out', JIRA_FEED], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  jira.pid = child.pid;
  console.log(`jira: started pid ${child.pid}`);
  for (const st of [child.stdout, child.stderr]) {
    let buf = '';
    st.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { console.log('jira: ' + redact(buf.slice(0, i).replace(/^jira: /, ''))); buf = buf.slice(i + 1); } });
  }
  child.on('error', e => console.log('jira: spawn failed (' + e.code + ')'));
  child.on('exit', (code, sig) => {
    jira.pid = null; jira.restarts++;
    if (stopping || code === 0) return;
    const wait = Math.min(300, 15 * 2 ** Math.min(jira.restarts - 1, 4)) * 1000;
    console.log(`jira: exited ${code ?? sig}; restart in ${wait / 1000}s`);
    setTimeout(startJira, wait).unref();
  });
  process.on('exit', () => { try { child.kill('SIGTERM'); } catch {} });
}

const validEvent = e => e && typeof e === 'object' && !Array.isArray(e) &&
  typeof e.id === 'string' && typeof e.t_ct === 'string' && (e.kind == null || typeof e.kind === 'string');
function validDelta(d) {
  if (!d || typeof d !== 'object' || typeof d.base !== 'string') return false;
  if (!d.header || typeof d.header !== 'object' || Array.isArray(d.header) || 'events' in d.header) return false;
  if (d.header.generated_at != null && typeof d.header.generated_at !== 'string') return false;
  if (!Array.isArray(d.upsert) || !Array.isArray(d.remove) || d.upsert.length > 200000 || d.remove.length > 200000) return false;
  return d.remove.every(id => typeof id === 'string') && d.upsert.every(validEvent) && evs.size + d.upsert.length <= 400000;
}
function validFeed(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return false;
  if (!Array.isArray(f.events) || f.events.length > 200000) return false;
  if (f.generated_at != null && typeof f.generated_at !== 'string') return false;
  if (f.event_count != null && typeof f.event_count !== 'number') return false;
  return f.events.every(validEvent);
}

// ---- activity (write-only from off-box seats; the box pusher pulls it with the ingest secret) ----
// One JSON line: {t_ct, kind, action, to?, agent?, tag?}. The seat comes from the key, never from the body.
const ACT_KINDS = { prompt: ['received', 'sent'], turn: ['start', 'end', 'tick'], subagent: ['start', 'end', 'tick'],
  watcher: ['start', 'end', 'tick'], cloud_agent: ['launch', 'reply', 'finished', 'cancel'] };
const ACT_FIELDS = new Set(['t_ct', 'kind', 'action', 'to', 'from', 'agent', 'tag', 'seat']);   // seat: optional, must match the token; from: prompt sender (#281)
const ACT_BANNED = /body|text|message/i;          // no free text of any kind, as a key or inside a value
const ACT_VALUE = /^[A-Za-z0-9 ._:@#+\/-]{1,80}$/;
const ACT_AGENT = /^[A-Za-z0-9][A-Za-z0-9_-]{2,40}$/;
const ACT_RATE = 60, ACT_RATE_MS = 60000, ACT_KEEP = 5000, ACT_MAX_BODY = 1024;
const ACT_EPOCH = crypto.randomBytes(6).toString('base64url');
const activity = []; let actSeq = 0;
const actHits = new Map();   // seat -> [timestamps]
function validActivity(d, now = Date.now()) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'not an object';
  for (const k of Object.keys(d)) {
    if (ACT_BANNED.test(k)) return 'free-text fields are not accepted';
    if (!ACT_FIELDS.has(k)) return 'unknown field';
  }
  for (const k of Object.keys(d)) {
    const v = d[k];
    if (typeof v !== 'string' || !ACT_VALUE.test(v)) return 'fields must be short plain strings (<= 80 chars)';
    if (ACT_BANNED.test(v)) return 'free text is not accepted';
  }
  if (!ACT_KINDS[d.kind]) return 'bad kind';
  if (!ACT_KINDS[d.kind].includes(d.action)) return 'bad action for kind';
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,6})?)?([+-]\d\d:\d\d|Z)$/.test(d.t_ct || '')) return 'bad t_ct';
  const t = Date.parse(d.t_ct);
  if (isNaN(t) || t > now + 5 * 60000 || t < now - 24 * 3600000) return 't_ct out of range';
  if (d.kind === 'cloud_agent' && !ACT_AGENT.test(d.agent || '')) return 'cloud_agent needs agent id';
  if (d.agent != null && !ACT_AGENT.test(d.agent)) return 'bad agent id';
  if (d.tag != null && d.tag.length > 40) return 'tag too long';
  if (d.to != null && d.to.length > 40) return 'to too long';
  if (d.from != null && (d.kind !== 'prompt' || d.from.length > 40)) return 'from is only for prompt (<= 40 chars)';
  return null;
}
function actRateOk(seat, now = Date.now()) {
  const arr = (actHits.get(seat) || []).filter(t => now - t < ACT_RATE_MS);
  if (arr.length >= ACT_RATE) { actHits.set(seat, arr); return false; }
  arr.push(now); actHits.set(seat, arr); return true;
}
const actFails = new Map();  // ip -> [timestamps] (bad activity keys)

// ---- crypto helpers ----
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b)); // fixed-length digests => constant time
const sign = v => crypto.createHmac('sha256', SESSION_SECRET).update('mesh-session:' + v).digest('base64url');

function makeSession() { const exp = String(Date.now() + SESSION_TTL_MS); return exp + '.' + sign(exp); }
function validSession(req) {
  if (PUBLIC) return true;   // public mode: no login, the page and feed are open
  const m = /(?:^|;\s*)mesh_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  return safeEq(sig, sign(exp)) && Number(exp) > Date.now();
}

// ---- rate limit (failed logins per client IP) ----
const fails = new Map(); // ip -> [timestamps]
// Railway's edge overwrites X-Real-IP (and X-Forwarded-For) on every public request, so a
// client-sent copy never reaches us. Prefer X-Real-IP; else the RIGHTMOST XFF hop (the one the
// nearest proxy appended); else the socket peer. Never the leftmost (client-controllable) hop.
function clientIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (net.isIP(real)) return real;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const hops = xff.split(',').map(h => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last && net.isIP(last)) return last;
  }
  return req.socket.remoteAddress || 'unknown';
}
function recentFails(ip) {
  const now = Date.now(), arr = (fails.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  if (arr.length) fails.set(ip, arr); else fails.delete(ip);
  return arr;
}
setInterval(() => { for (const ip of fails.keys()) recentFails(ip); }, 60000).unref();

// ---- responses ----
const BASE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(req, res, status, type, body, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, 'Content-Length': buf.length, ...extra });
  res.end(req.method === 'HEAD' ? undefined : buf);
}
const json = (req, res, status, obj, extra) => send(req, res, status, 'application/json; charset=utf-8', JSON.stringify(obj), extra);

function loginPage(msg = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${SITE.name} · live mesh</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f17;color:#dde3ee;font:15px system-ui,sans-serif}
form{background:#141b27;padding:28px 30px;border-radius:12px;min-width:260px;box-shadow:0 8px 30px #0006}
h1{font-size:17px;margin:0 0 18px;font-weight:600;letter-spacing:.02em}input{width:100%;box-sizing:border-box;padding:10px;border-radius:7px;border:1px solid #2c3850;background:#0b0f17;color:#dde3ee;font-size:15px}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:7px;background:#6e8cff;color:#fff;font-size:15px;cursor:pointer}.e{color:#ff8f8f;font-size:13px;margin:10px 0 0}</style></head>
<body><form method="post" action="/login"><h1>${SITE.name} · live mesh</h1>
<input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required aria-label="Password">
<button type="submit">Enter</button>${msg ? `<p class="e">${msg}</p>` : ''}</form></body></html>`;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length']);
    if (len > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.resume(); return; }
    const chunks = []; let size = 0, done = false;
    req.on('data', c => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; reject(Object.assign(new Error('too large'), { code: 413 })); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', e => { if (!done) { done = true; reject(e); } });
  });
}

const cookie = (val, maxAgeS) => `${COOKIE}=${val}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeS}`;

// ---- routes ----
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;

  if (p === '/healthz' && (m === 'GET' || m === 'HEAD')) return send(req, res, 200, 'application/json; charset=utf-8', healthBody());
  if (p === '/archive' && m === 'GET') {
    const key = String(process.env.ARCHIVE_KEY || '');
    const tok = bearerOf(req);
    if (!key || !tok) return json(req, res, 401, { error: 'unauthorized' });
    if (!safeEq(tok, key)) return json(req, res, 401, { error: 'unauthorized' });
    const date = url.searchParams.get('date') || '';
    const kind = url.searchParams.get('kind') || '';
    if (!validArchiveDate(date) || !ARCHIVE_KINDS.includes(kind)) return json(req, res, 400, { error: 'bad date or kind' });
    return json(req, res, 200, { date, kind, lines: readArchive(date, kind).lines });
  }
  if ((p === '/history' || p === '/history/cards') && m === 'GET') {
    if (!validSession(req)) return json(req, res, 401, { error: 'unauthorized' });
    if (p === '/history/cards') return json(req, res, 200, cardHistory());
    const date = url.searchParams.get('date') || '';
    if (!date) return json(req, res, 200, { days: archiveDays() });
    if (!validArchiveDate(date)) return json(req, res, 400, { error: 'bad date' });
    return json(req, res, 200, { date, events: readArchive(date, 'events').lines });
  }
  if (p === '/robots.txt' && (m === 'GET' || m === 'HEAD')) return send(req, res, 200, 'text/plain; charset=utf-8', 'User-agent: *\nDisallow: /\n');

  if (p === '/ingest' || p === '/ingest/delta') {
    if (m !== 'POST') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!tok || !safeEq(tok, INGEST_SECRET)) { req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
    const enc = String(req.headers['content-encoding'] || 'identity').trim().toLowerCase();
    if (enc !== 'identity' && enc !== 'gzip') { req.resume(); return json(req, res, 415, { error: 'unsupported content-encoding' }); }
    let body;
    try { body = await readBody(req, MAX_INGEST); } catch (e) { return json(req, res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'too large' : 'bad request' }); }
    if (enc === 'gzip') {
      // maxOutputLength bounds the decoded size (zip-bomb guard)
      try { body = zlib.gunzipSync(body, { maxOutputLength: MAX_INGEST }); }
      catch (e) { return json(req, res, e && e.code === 'ERR_BUFFER_TOO_LARGE' ? 413 : 400, { error: e && e.code === 'ERR_BUFFER_TOO_LARGE' ? 'too large' : 'bad gzip' }); }
    }
    let feed;
    try { feed = JSON.parse(body.toString('utf8')); } catch { return json(req, res, 400, { error: 'invalid json' }); }
    if (p === '/ingest/delta') {   // events changed since the pusher's last acknowledged push; base must be current
      if (!validDelta(feed)) return json(req, res, 422, { error: 'not a delta' });
      if (feed.base !== srcCursor('box')) return json(req, res, 409, { error: 'cursor mismatch', cursor: srcCursor('box') });
      ingestDelta(feed);
      return json(req, res, 200, { ok: true, cursor: srcCursor('box'), events: evs.size, upserts: feed.upsert.length, removes: feed.remove.length, fleet: fleetBrief() });
    }
    if (!validFeed(feed)) return json(req, res, 422, { error: 'not a feed' });
    ingestFull(feed);
    return json(req, res, 200, { ok: true, cursor: srcCursor('box'), events: evs.size, event_count: feed.event_count ?? null, fleet: fleetBrief() });
  }

  if (p === '/activity') {   // write-only; answers {ok} or an error, never any data
    if (m !== 'POST') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
    const ip = clientIp(req), now = Date.now();
    const bad = (actFails.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
    if (bad.length >= RL_MAX) { req.resume(); return json(req, res, 429, { error: 'too many bad keys' }, { 'Retry-After': String(RL_WINDOW_MS / 1000) }); }
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    let seat = null;
    if (tok.startsWith('ghs_')) {   // installation token (Builder); else only the Builder-cloud seat key; anything else -> 401
      try { seat = await ghVerify(tok); } catch { req.resume(); return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    } else if (tok) { const want = SEAT_KEY_HASH['builder-cloud'];
      if (typeof want === 'string' && /^[0-9a-f]{64}$/.test(want) && safeEq(sha256hex(tok), want)) seat = SEAT_DISPLAY['builder-cloud']; }
    if (!seat) { bad.push(now); actFails.set(ip, bad); req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
    let body;
    try { body = await readBody(req, ACT_MAX_BODY); } catch (e) { return json(req, res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'too large' : 'bad request' }); }
    const text = body.toString('utf8').replace(/\r?\n$/, '');
    if (text.includes('\n')) return json(req, res, 422, { error: 'one JSON line per request' });
    let d;
    try { d = JSON.parse(text); } catch { return json(req, res, 400, { error: 'invalid json' }); }
    const why = validActivity(d, now);
    if (why) return json(req, res, 422, { error: why });
    // optional seat (one line format everywhere): must name the token's own seat; the stored seat comes from the token
    if (d.seat != null && d.seat.toLowerCase() !== seat.toLowerCase()) return json(req, res, 403, { error: 'seat mismatch' });
    if (!actRateOk(seat, now)) return json(req, res, 429, { error: 'rate limited (60/min)' }, { 'Retry-After': '60' });
    actSeq++;
    const line = { id: `${ACT_EPOCH}.${actSeq}`, seq: actSeq, seat, t_ct: d.t_ct, kind: d.kind, action: d.action };
    for (const k of ['to', 'from', 'agent', 'tag']) if (d[k] != null) line[k] = d[k];
    activity.push(line); if (activity.length > ACT_KEEP) activity.splice(0, activity.length - ACT_KEEP);
    appendArchive('activity', line);
    return json(req, res, 202, { ok: true });
  }

  if (p === '/emit') {   // write-only Assistant / emitter events from the sample MCP server; answers {ok} or an error, never data
    if (m !== 'POST') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
    const ip = clientIp(req), now = Date.now();
    const bad = (actFails.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
    if (bad.length >= RL_MAX) { req.resume(); return json(req, res, 429, { error: 'too many bad keys' }, { 'Retry-After': String(RL_WINDOW_MS / 1000) }); }
    const tok = bearerOf(req), want = SEAT_KEY_HASH.assistant;
    if (!tok || typeof want !== 'string' || !/^[0-9a-f]{64}$/.test(want) || !safeEq(sha256hex(tok), want)) { bad.push(now); actFails.set(ip, bad); req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
    let d; try { d = JSON.parse((await readBody(req, 1024)).toString('utf8')); } catch (e) { return json(req, res, e && e.code === 413 ? 413 : 400, { error: e && e.code === 413 ? 'too large' : 'invalid json' }); }
    const why = validDot(d, now); if (why) return json(req, res, 422, { error: why });
    emitter.last = now; emitter.recent.push({ tool: d.tool, t: d.t, ok: d.ok, client: d.client, latency_ms: d.latency_ms ?? null, kind: d.kind }); emitter.recent = emitter.recent.slice(-50);
    const h = mergedHeader(now); if (fleetSig(h) !== fleetSig(header)) { seq++; header = h; fullDirty = true; }
    return json(req, res, 202, { ok: true });
  }

  if (p === '/ingest/events') {   // the box pusher only (ingest secret): events changed since ?since=<cursor> (inbox routing)
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!tok || !safeEq(tok, INGEST_SECRET)) return json(req, res, 401, { error: 'unauthorized' });
    const d = since(url.searchParams.get('since'), true);
    if (d === 'same') return json(req, res, 200, { cursor: cursor(), events: [] });
    if (d) return json(req, res, 200, { cursor: d.cursor, events: d.events });
    const all = [...evs.values()].map(v => v.e).filter(e => e.kind === 'pr_open' || e.kind === 'issue_open' || Date.now() - Date.parse(e.t_ct || '') < 3 * 86400000);   // card events always
    return json(req, res, 200, { cursor: cursor(), reset: true, events: all });
  }

  if (p === '/inbox' && m === 'POST') {   // box pusher (X-Live-Ingest = ingest secret): seat inbox lines for any seat
    const hs = req.headers['x-live-ingest'];
    if (typeof hs !== 'string' || !hs || !safeEq(hs, INGEST_SECRET)) { req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
    let parsed; try { parsed = JSON.parse((await readBody(req, 4 << 20)).toString('utf8')); } catch { return json(req, res, 400, { error: 'not json' }); }
    const r = postSeatLines(parsed, null);
    if (r.status === 200) { seq++; header = mergedHeader(); fullDirty = true; }
    return json(req, res, r.status, r.status === 200 ? { ok: true, added: r.added, rejected: r.rejected } : { error: r.error, ...(r.rejected ? { rejected: r.rejected } : {}) });
  }
  if (p === '/ingest/source') {
    if (m !== 'POST') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
    const hs = req.headers['x-live-ingest'];
    if (typeof hs !== 'string' || !hs || !safeEq(hs, INGEST_SECRET)) { req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
    let parsed;
    try { parsed = JSON.parse((await readBody(req, 1 << 20)).toString('utf8')); }
    catch (e) { return json(req, res, e && e.code === 413 ? 413 : 400, { error: e && e.code === 413 ? 'too large' : 'not json' }); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.events) || parsed.events.length > 500) {
      return json(req, res, 422, { error: 'events must be a list of at most 500' });
    }
    const source = typeof parsed.source === 'string' ? parsed.source : '';
    const events = parsed.events.map(e => (e && typeof e === 'object' && e.source == null && source ? { ...e, source } : e));
    const r = acceptWork(events);
    return json(req, res, 200, { ok: true, accepted: r.accepted, rejected: r.rejected });
  }
  const inboxM = /^\/inbox\/([a-z0-9-]{2,16})$/.exec(p);
  if (inboxM && m === 'GET') {   // a seat reads its own inbox: GET /inbox/<seat>?since=<id>
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who) return json(req, res, 401, { error: 'unauthorized' });
    if (!SEAT_IDS.includes(inboxM[1]) || who !== inboxM[1]) return json(req, res, 403, { error: 'inbox is not exposed' });
    const since = url.searchParams.get('since'), all = url.searchParams.get('all') === '1';
    const base = since && seatInbox[who].some(l => l.id === since) ? linesAfter(seatInbox[who], since) : seatInbox[who];
    const keep = new Set(openLines(who, all).map(l => l.id)); touchSeat(who);
    return json(req, res, 200, { seat: who, lines: base.filter(l => keep.has(l.id)).slice(0, 1000) });
  }
  if (p === '/clock') {   // POST /clock: the CoS starts the same timed run the tripwire starts (BIFROST_CLOCK_SEATS keys only)
    if (m !== 'POST') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    req.resume();
    if (!who) return json(req, res, 401, { error: 'unauthorized' });
    if (!CLOCK_SEATS.includes(who)) return json(req, res, 403, { error: 'not a clock seat' });
    const seats = openSeats();
    if (!seats.length) return json(req, res, 200, { ok: true, started: false, reason: 'no open work' });
    const run = clock.startByHand(Date.now(), seats, who); wakeRun(run); touchSeat(who);
    seq++; header = mergedHeader(); fullDirty = true;
    return json(req, res, 200, { ok: true, started: true, clock: run });
  }
  const ackM = /^\/inbox\/([a-z0-9-]{2,16})\/ack$/.exec(p);
  if (ackM) {   // POST /inbox/<seat>/ack {"id": "<line id>"} | {"upto": "<line id>"} | {"all": true}: that seat's key only
    if (m !== 'POST') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'POST' });
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who) { req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
    if (!SEAT_IDS.includes(ackM[1]) || who !== ackM[1]) { req.resume(); return json(req, res, 403, { error: 'not your inbox' }); }
    let d; try { d = JSON.parse((await readBody(req, 4096)).toString('utf8')); } catch { return json(req, res, 400, { error: 'invalid json' }); }
    const what = d && d.all === true ? 'all' : d && typeof d.id === 'string' && d.id.length <= 300 ? d.id : d && typeof d.upto === 'string' && d.upto.length <= 300 ? { upto: d.upto } : null;
    if (!what) return json(req, res, 400, { error: 'id or all required' });
    const n = ackLines(who, what); touchSeat(who);
    if (n < 0) return json(req, res, 404, { error: 'no such line' });
    return json(req, res, 200, { ok: true, acked: n, open: openLines(who, false).length });
  }
  if (p === '/routing') {   // GET /routing: the routing map, read-only (seat, login, aliases, status). No keys, no webhook URLs.
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    let who = null; try { who = await seatOf(req); } catch { /* fall through to session / public */ }
    if (!who && !PUBLIC && !validSession(req)) return json(req, res, 401, { error: 'unauthorized' });
    return json(req, res, 200, { ok: ROUTING.ok, seats: ROUTING_MAP.map(e => ({ seat: e.seat, login: e.login, aliases: e.aliases, status: e.status })) });
  }
  if (p === '/cards') {   // GET /cards?seat=<seat>: that seat's key (CoS blinky and forge may read any seat); ?seat=all (or blinky / forge) sees all.
    // Public mode: no key needed, any ?seat= (default all cards); a key that is sent still limits to its own seat.
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who && !PUBLIC) return json(req, res, 401, { error: 'unauthorized' });   // public mode: cards are readable without a key
    const want = String(url.searchParams.get('seat') || who || 'all').toLowerCase();
    if (who && want !== who && who !== COS && who !== OPS) return json(req, res, 403, { error: 'not your seat' });
    const all = want === 'all' || want === 'coord' || want === COS || want === OPS;
    const cs = CARD_SEAT[want] || want;
    return json(req, res, 200, { seat: want, cards: cardsView(bfCards.filter(c => all || cardSeats(c).includes(cs))) });
  }
  if (p === '/nudges') {   // GET /nudges?since=<id>: forge's key only (forge delivers them; was the kit's Operator)
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who) return json(req, res, 401, { error: 'unauthorized' });
    if (who !== OPS) return json(req, res, 403, { error: 'forge only' });
    evalNudges();
    return json(req, res, 200, { nudges: linesAfter(nudges, url.searchParams.get('since')).slice(0, 500) });
  }

  if (p === '/inbox/builder') {   // POST: box mirror (X-Live-Ingest = ingest secret); GET: Builder's installation token only
    if (m === 'POST') {
      const hs = req.headers['x-live-ingest'];
      if (typeof hs !== 'string' || !hs || !safeEq(hs, INGEST_SECRET)) { req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
      let parsed; try { parsed = JSON.parse((await readBody(req, 1 << 20)).toString('utf8')); } catch { return json(req, res, 400, { error: 'not json' }); }
      const r = postSeatLines(parsed, 'builder');
      return json(req, res, r.status, r.status === 200 ? { ok: true, added: r.added, rejected: r.rejected } : { error: r.error, ...(r.rejected ? { rejected: r.rejected } : {}) });
    }
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET, POST' });
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    let seat = null;
    if (tok.startsWith('ghs_')) { try { seat = await ghVerify(tok); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); } }
    if (!seat) return json(req, res, 401, { error: 'unauthorized' });
    if (String(seat).toLowerCase() !== 'builder') return json(req, res, 403, { error: 'inbox is not exposed' });
    return json(req, res, 200, { lines: linesAfter(seatInbox.builder, url.searchParams.get('since')) });
  }

  if (p === '/activity/pull') {   // the box pusher only (ingest secret): lines after ?after=<seq> of this epoch
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!tok || !safeEq(tok, INGEST_SECRET)) return json(req, res, 401, { error: 'unauthorized' });
    const after = /^\d{1,12}$/.test(url.searchParams.get('after') || '') && url.searchParams.get('epoch') === ACT_EPOCH ? Number(url.searchParams.get('after')) : 0;
    const lines = activity.filter(l => l.seq > after).slice(0, 1000);
    return json(req, res, 200, { epoch: ACT_EPOCH, last: lines.length ? lines[lines.length - 1].seq : Math.max(after, 0), lines });
  }

  if (p === '/login') {
    if (PUBLIC) { req.resume(); return send(req, res, 303, 'text/plain', '', { Location: '/' }); }   // nothing to log in to
    if (m !== 'POST') return send(req, res, 303, 'text/plain', '', { Location: '/' });
    const ip = clientIp(req);
    if (recentFails(ip).length >= RL_MAX) { req.resume(); return send(req, res, 429, 'text/html; charset=utf-8', loginPage('Too many attempts. Try again later.'), { 'Retry-After': String(RL_WINDOW_MS / 1000) }); }
    let pw = '';
    try { pw = new URLSearchParams((await readBody(req, MAX_LOGIN_BODY)).toString('utf8')).get('password') || ''; }
    catch { return send(req, res, 400, 'text/html; charset=utf-8', loginPage('Bad request.')); }
    if (pw && safeEq(pw, MESH_PASSWORD)) {
      fails.delete(ip);
      return send(req, res, 303, 'text/plain', '', { Location: '/', 'Set-Cookie': cookie(makeSession(), SESSION_TTL_MS / 1000) });
    }
    const arr = recentFails(ip); arr.push(Date.now()); fails.set(ip, arr);
    return send(req, res, 401, 'text/html; charset=utf-8', loginPage('Wrong password.'));
  }

  if (p === '/logout') {
    req.resume();
    return send(req, res, 303, 'text/plain', '', { Location: '/', 'Set-Cookie': cookie('', 0) });
  }

  if (m !== 'GET' && m !== 'HEAD') return send(req, res, 405, 'text/plain', 'method not allowed', { Allow: 'GET, HEAD' });

  if (p === '/favicon.ico' && (PUBLIC || validSession(req))) {   // public mode: open like the page (was a 401)
    const fi = STATIC.get('/favicon.png');
    return fi ? send(req, res, 200, fi.type, fi.body) : send(req, res, 204, 'image/png', Buffer.alloc(0));
  }
  if (!validSession(req)) {
    if (p === '/live-events.json') return json(req, res, 401, { error: 'login required' });
    return send(req, res, 401, 'text/html; charset=utf-8', loginPage());
  }

  if (p === '/live-events.json') {
    const gzOk = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (url.searchParams.has('since')) {   // delta poll: only events changed since the client's cursor
      const d = since(url.searchParams.get('since'));
      if (d === 'same') return send(req, res, 304, 'application/json; charset=utf-8', Buffer.alloc(0), { ETag: `"${cursor()}"` });
      const buf = Buffer.from(JSON.stringify(d || { reset: true, cursor: cursor() }));
      if (gzOk && buf.length > 1024) return send(req, res, 200, 'application/json; charset=utf-8', zlib.gzipSync(buf, { level: 6 }), { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
      return send(req, res, 200, 'application/json; charset=utf-8', buf, { Vary: 'Accept-Encoding' });
    }
    const f = full();
    if (String(req.headers['if-none-match'] || '') === f.etag) return send(req, res, 304, 'application/json; charset=utf-8', Buffer.alloc(0), { ETag: f.etag, Vary: 'Accept-Encoding' });
    if (gzOk) return send(req, res, 200, 'application/json; charset=utf-8', f.gz, { 'Content-Encoding': 'gzip', ETag: f.etag, Vary: 'Accept-Encoding' });
    return send(req, res, 200, 'application/json; charset=utf-8', f.body, { ETag: f.etag, Vary: 'Accept-Encoding' });
  }
  const f = STATIC.get(p);
  if (f) return send(req, res, 200, f.type, f.body);
  return send(req, res, 404, 'text/plain; charset=utf-8', 'not found');
}

const server = http.createServer({ requireHostHeader: false }, (req, res) => {
  handle(req, res).catch(() => { if (!res.headersSent) send(req, res, 500, 'text/plain', 'error'); else res.destroy(); });
});
server.requireHostHeader = false;
server.requestTimeout = 30000;
server.headersTimeout = 15000;
function githubFeedEvents() {
  try {
    const f = JSON.parse(fs.readFileSync(GH_FEED, 'utf8'));
    return f && Array.isArray(f.events) ? f.events : [];
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.log('archive: github feed ' + (e.code || 'read'));
    return [];
  }
}
backfillArchive({ inboxes: seatInbox, extraInbox: inboxLines, nudges, acks: inboxAcks, cards: bfCards, events: githubFeedEvents() });
server.listen(PORT, () => console.log(`live mesh listening on :${PORT} (${PUBLIC ? 'public: no password, no masking' : 'gated'})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
// started last: the feed validators above are initialized by now
if (process.env.COLLECTOR !== 'off') {
  readCollectorFeed();            // warm start from the volume before the first pass
  setInterval(readCollectorFeed, 2000).unref();
  startCollector().catch(e => console.log("collector: start failed " + String(e.message).slice(0, 80)));
}
readJiraFeed();
setInterval(readJiraFeed, 2000).unref();
startJira();
