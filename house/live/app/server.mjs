// Example live mesh: password-gated static page + in-memory feed (push-only ingest; full or delta, delta polls).
// Node 20, zero dependencies.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT) || 8080;
const MESH_PASSWORD = process.env.MESH_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const INGEST_SECRET = process.env.INGEST_SECRET || '';
for (const [k, v, min] of [['MESH_PASSWORD', MESH_PASSWORD, 1], ['SESSION_SECRET', SESSION_SECRET, 32], ['INGEST_SECRET', INGEST_SECRET, 32]]) {
  if (v.length < min) { console.error(`missing or too-short env ${k}; refusing to start`); process.exit(1); }
}

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
const EMPTY_FEED = { title: 'Example live mesh', generated_at: null, event_count: 0, events: [] };
const EPOCH = crypto.randomBytes(6).toString('base64url');
const STARTED = Date.now();
const MAX_REMOVED = 20000;
const BOX_STALE_MS = (Number(process.env.BOX_STALE_S) || 180) * 1000;   // box pushes every ~45 s while alive
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
function upsert(e) { const h = evHash(e), cur = evs.get(e.id); if (!cur || cur.h !== h) evs.set(e.id, { e, h, s: seq }); }
const shown = (n, e) => !(n === 'box' && e.src_file === 'merge-queue.md' && ghRetest.has(`${e.repo}#${e.number}`));
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
  if (parsed.replace === true) lines.length = 0;   // pusher resync (e.g. after a bad seed)
  const known = new Set(lines.map(l => l.id)); let added = 0;
  for (const l of incoming) { if (!validInboxLine(l)) continue; if (known.has(l.id)) continue; known.add(l.id); lines.push(l); added++; }
  return { status: 200, added };
}
// ---- Live board: the server is the source of truth for seat inboxes, cards and nudges ---------------------------------
// Seat auth: Builder = its builder-app installation token (ghVerify, unchanged); every other seat = its own key, checked
// against SEAT_KEYS (Railway variable, JSON seat -> sha256 hex of the key; the keys themselves live only on the box).
const SEAT_IDS = ['builder', 'reviewer', 'tester', 'qa', 'coord', 'operator', 'growth', 'qa-one', 'qa-two', 'triager', 'seat-c',
  'chatbot', 'seo-researcher', 'seo-writer', 'offsite-copier', 'builder-cloud'];
// Builder-cloud: the cloud Builder seat (own key). It reads Builder's work: every builder inbox line is mirrored into its inbox,
// nudges to builder land in its inbox as type 'nudge', and /cards?seat=builder-cloud shows Builder's cards.
const SEAT_DISPLAY = { 'builder-cloud': 'Builder-cloud' };
const CARD_SEAT = { 'builder-cloud': 'builder' };
const SEAT_KEY_HASH = (() => { try { const o = JSON.parse(process.env.SEAT_KEYS || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
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
  for (const w of t.split(/\s+/)) { if (SEAT_IDS.includes(w) || w === 'lead') return w; if (w === 'lab') return 'qa'; } return null; };
const STATE_DIR = path.join(process.env.MESH_DATA_DIR || '/data', 'live');
const NUDGE_L1_MS = (Number(process.env.NUDGE_L1_S) || 3600) * 1000, NUDGE_L2_MS = (Number(process.env.NUDGE_L2_S) || 1800) * 1000;
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
  for (const id of ids) if (!have.has(id)) { have.add(id); n++; }
  const live = new Set(arr.map(l => l.id)); inboxAcks[seat] = [...have].filter(id => live.has(id)).slice(-6000);
  bfWrite('acks.json', JSON.stringify(inboxAcks)); return n;
}
function lineDone(seat, l) {
  const c = bfCards.find(x => x.repo && String(x.repo).toLowerCase() === String(l.repo || '').toLowerCase() && Number(x.number) === Number(l.number));
  if (!c) return false;
  if (c.state === 'closed') return true;
  const lt = Date.parse(l.t_ct) || 0;
  if (seat === 'reviewer' && c.reviewer && c.reviewer.at_head && Number(c.reviewer.t) >= lt) return true;   // verdict at head = Reviewer's step done
  return false;
}
function openLines(seat, all) { const acked = ackedSet(seat); return all ? seatInbox[seat].slice() : seatInbox[seat].filter(l => !acked.has(l.id) && !lineDone(seat, l)); }
function saveSeatInbox(s) { const cut = Date.now() - 7 * 86400000; seatInbox[s] = seatInbox[s].filter(l => !(Date.parse(l.t_ct) < cut)).slice(-5000); bfWrite('inbox/' + s + '.jsonl', seatInbox[s].map(l => JSON.stringify(l)).join('\n') + '\n'); }
function validSeatLine(d) { if (!d || typeof d.seat !== 'string' || !SEAT_IDS.includes(d.seat.toLowerCase())) return false; return validInboxLine({ ...d, seat: 'builder' }); }
function postSeatLines(parsed, onlySeat) {
  const incoming = parsed && Array.isArray(parsed.lines) ? parsed.lines : null;
  if (!incoming || incoming.length > 5000) return { status: 400, error: 'lines required' };
  if (onlySeat && incoming.some(l => !l || String(l.seat || '').toLowerCase() !== onlySeat)) return { status: 403, error: 'inbox is not exposed' };
  const touched = new Set(); let added = 0; const rejected = [];   // a bad line is skipped alone, never the whole batch
  for (const l of incoming) { if (!validSeatLine(l)) { rejected.push(l && typeof l.id === 'string' ? l.id.slice(0, 120) : null); continue; }
    const s = l.seat.toLowerCase(), arr = seatInbox[s]; if (arr.some(x => x.id === l.id)) continue; arr.push({ ...l, seat: s }); touched.add(s); added++;
    if (s === 'builder') { const c = seatInbox['builder-cloud']; if (!c.some(x => x.id === l.id)) { c.push({ ...l, seat: 'builder-cloud' }); touched.add('builder-cloud'); } } }
  for (const s of touched) saveSeatInbox(s);
  if (rejected.length) console.log(`inbox: rejected ${rejected.length} bad line(s)`);
  return { status: 200, added, rejected };
}
// ---- Assistant / emitter: the Example MCP server posts one event per tool call / OAuth sign-in (POST /emit, Bearer = the
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
// cards: the box feed pass's model (header.board on every push) is stored here; nudges are made from it
let bfCards = []; let nudges = [];
try { bfCards = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'cards.json'), 'utf8')).cards || []; } catch {}
try { nudges = fs.readFileSync(path.join(STATE_DIR, 'nudges.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
const saveNudges = () => { nudges = nudges.slice(-3000); bfWrite('nudges.jsonl', nudges.map(n => JSON.stringify(n)).join('\n') + '\n'); };
function nudgeToCloud(n) {   // a nudge to Builder is also an inbox line for Builder-cloud (either seat can pick it up)
  const l = { id: n.id, t_ct: n.t_ct, seat: 'builder-cloud', type: 'nudge', repo: n.repo, number: n.number, title: n.title, url: n.url, reason: `nudge L${n.level} (${n.via})` };
  if (!validInboxLine({ ...l, seat: 'builder' })) l.title = '';
  if (!validInboxLine({ ...l, seat: 'builder' }) || seatInbox['builder-cloud'].some(x => x.id === l.id)) return;
  seatInbox['builder-cloud'].push(l); saveSeatInbox('builder-cloud');
}
function setCards(wb) {
  if (!wb || !Array.isArray(wb.cards)) return;
  const sig = JSON.stringify(wb.cards); if (sig === JSON.stringify(bfCards)) return;
  bfCards = wb.cards.slice(0, 200); bfWrite('cards.json', JSON.stringify({ updated_ct: wb.updated_ct || null, cards: bfCards }));
}
// NUDGE: a live card with no beat for 60 min -> level 1 to the packet's next owner (else the card owner); still no
// beat 30 min after that -> level 2 to Coord. One open nudge per card per level (keyed by the card's last beat);
// a new beat closes them.
function evalNudges(now = Date.now()) {
  let changed = false; const byKey = new Map(bfCards.map(c => [c.key, c]));
  for (const n of nudges) { if (n.closed_at || n.kind === 'silent') continue; const c = byKey.get(n.card);
    if (!c || c.state !== 'live' || c.last_beat_t !== n.beat_t) { n.closed_at = new Date(now).toISOString(); changed = true; } }
  for (const c of bfCards) {
    if (c.pinned || c.state !== 'live' || !c.last_beat_t || now - c.last_beat_t < NUDGE_L1_MS) continue;
    const id = lvl => `nudge:${c.key}:L${lvl}:${c.last_beat_t}`, has = lvl => nudges.find(n => n.id === id(lvl));
    const mk = (lvl, seat, via, nid = id(lvl)) => { nudges.push({ id: nid, t: now, t_ct: new Date(now).toISOString(), card: c.key, repo: c.repo || '', number: c.number || 0,
      title: String(c.title || '').slice(0, 120), url: String(c.url || '').slice(0, 300), stage: c.stage || '', level: lvl, seat, via, beat_t: c.last_beat_t }); changed = true;
      if (seat === 'builder') nudgeToCloud(nudges[nudges.length - 1]); };
    const to = seatIdOf(c.nudge_to), nx = to || seatIdOf((c.packet || {})['next owner']);
    const tgt = nx || seatIdOf(c.owner) || 'coord', via = to ? (c.nudge_via || 'retest owner') : nx ? 'next owner' : 'card owner';
    const l1s = nudges.filter(n => n.id === id(1) || n.id.startsWith(id(1) + ':'));
    let l1 = l1s[l1s.length - 1];
    if (!l1) { mk(1, tgt, via); l1 = has(1); }
    else if (!l1.closed_at && l1.seat !== tgt) {   // the card's owner logic moved (e.g. Reviewer PASS at head -> Builder): retarget
      l1.closed_at = new Date(now).toISOString(); changed = true;
      if (!l1s.some(n => n.seat === tgt)) { mk(1, tgt, via, id(1) + ':' + tgt); l1 = nudges[nudges.length - 1]; } }
    if (l1 && !has(2) && now - l1.t >= NUDGE_L2_MS) mk(2, 'coord', 'escalation');
  }
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
  for (const [name, o] of Object.entries(fleet.seats)) {
    const id = seatIdOf(name); if (!id || !SEAT_IDS.includes(id)) continue;   // bot seats only (not Lead)
    const owns = bfCards.some(c => !c.pinned && c.state === 'live' && cardSeats(c).includes(id)) ||
      nudges.some(n => !n.closed_at && n.kind !== 'silent' && n.seat === id);
    const last = tsOf(o.last_ct);
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
      title: `${name} silent 2h while owning live work`, url: '', stage: '', level: 2, seat: 'coord', via: 'silent seat', about: id, beat_t: last });
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
  h.generated_at = g?.generated_at || b?.generated_at || null;   // LIVE pill: the Railway collector once it runs
  h.event_count = evs.size;
  h.kinds = [...new Set([...(g?.kinds || []), ...(b?.kinds || [])])].sort();
  h.notes = [...new Set([...(g?.notes || []), ...(b?.notes || [])])];
  h.sources = {
    github: g ? { generated_at: g.generated_at ?? null, received_at: iso(SRCS.github.at) } : null,
    box: b ? { generated_at: b.generated_at ?? null, received_at: iso(SRCS.box.at), stale } : null,
  };
  if (b?.board) { setCards(b.board); evalNudges(now); h.board = { ...b.board, cards: cardsView(), source: 'server' }; }
  const fleet = mergeFleet(g?.fleet, b?.fleet, stale, now);
  if (fleet) { if (b && !stale) evalSilent(fleet, now); h.fleet = fleet; }   // only with a fresh box view (no restart flaps)
  const df = dotsFleet(h.fleet, now); if (df) h.fleet = df;
  return h;
}
// active windows and box staleness move with the clock: re-merge every 15 s, publish only on a real change
const fleetSig = h => JSON.stringify([h.fleet && { ...h.fleet, as_of: 0 }, h.sources?.box?.stale, nudges.length, nudges.filter(n => n.closed_at).length]);
setInterval(() => {
  const h = mergedHeader();
  if (fleetSig(h) !== fleetSig(header)) { seq++; header = h; fullDirty = true; }
}, 15000).unref();
header = mergedHeader();
function full() {   // built lazily: only the first full GET after a change pays for stringify + gzip
  if (fullDirty) {
    feedBody = Buffer.from(JSON.stringify({ ...header, cursor: cursor(), events: [...evs.values()].map(v => v.e) }));
    feedGz = zlib.gzipSync(feedBody, { level: 6 }); feedEtag = `"${cursor()}"`; fullDirty = false;
  }
  return { body: feedBody, gz: feedGz, etag: feedEtag };
}
function since(c) {  // null -> client must refetch the full feed
  const m = /^([A-Za-z0-9_-]+)\.(\d+)$/.exec(String(c || ''));
  if (!m || m[1] !== EPOCH) return null;
  const s = Number(m[2]);
  if (s > seq || s < floorSeq) return null;
  if (s === seq) return 'same';
  const events = []; for (const v of evs.values()) if (v.s > s) events.push(v.e);
  return { ...header, delta: true, cursor: cursor(), events, removed: removed.filter(r => r.s > s).map(r => r.id) };
}

// ---- GitHub collector (Railway): python child with ONLY the read-only token; writes a feed file on the volume ----
// GITHUB_READ_TOKEN = fine-grained, read-only (no Checks permission: suites/runs come from Actions instead). The child
// env is built from scratch: no ingest secret, session secret or mesh password, and the token is never logged.
const DATA_DIR = process.env.MESH_DATA_DIR || '/data';
const GH_FEED = path.join(DATA_DIR, 'feed', 'github-events.json');
const COLLECTOR_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'collector');
const COLLECTOR_REPOS = (process.env.COLLECTOR_REPOS || 'example-org/app example-org/mcp').split(/\s+/).filter(Boolean);
const collector = { pid: null, restarts: 0, lastExit: null, lastWrite: 0, sig: '' };
function startCollector() {
  const tok = process.env.GITHUB_READ_TOKEN || '';
  if (!tok || process.env.COLLECTOR === 'off') { console.log('collector: off (no GITHUB_READ_TOKEN or COLLECTOR=off)'); return; }
  if (!fs.existsSync(path.join(COLLECTOR_DIR, 'live_mesh.py'))) { console.log('collector: code missing; off'); return; }
  fs.mkdirSync(path.join(DATA_DIR, 'feed'), { recursive: true }); fs.mkdirSync(path.join(DATA_DIR, 'home'), { recursive: true });
  seedStore();
  const env = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: path.join(DATA_DIR, 'home'), LANG: 'C.UTF-8',
    TZ: 'America/Chicago', PYTHONDONTWRITEBYTECODE: '1', LIVE_MODE: 'github', LIVE_NO_CHECKS: '1', GH_TOKEN: tok,
    LIVE_MESH_SRC: path.join(COLLECTOR_DIR, 'upstream'),
    LIVE_HEALTH_URLS: process.env.COLLECTOR_HEALTH_URLS || 'https://dev.example.com/health https://app.example.com/health' };
  const args = ['-B', '-u', path.join(COLLECTOR_DIR, 'live_mesh.py'), '--out', GH_FEED, '--watch', process.env.COLLECTOR_WATCH_S || '45',
    '--repos', ...COLLECTOR_REPOS, '--deploy-repo', '', '--health', 'https://dev.example.com/health'];
  const child = spawn('python3', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  collector.pid = child.pid;
  console.log(`collector: started pid ${child.pid}`);
  for (const st of [child.stdout, child.stderr]) {
    let buf = '';
    st.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { console.log('collector: ' + buf.slice(0, i).replaceAll(tok, '[redacted]').slice(0, 400)); buf = buf.slice(i + 1); } });
  }
  child.on('error', e => console.log('collector: spawn failed (' + e.code + ')'));
  child.on('exit', (code, sig) => {
    collector.pid = null; collector.lastExit = code ?? sig; collector.restarts++;
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
function readCollectorFeed() {   // every 2 s: ingest the collector's file when it changed (atomic rename by the writer)
  let st; try { st = fs.statSync(GH_FEED); } catch { return; }
  const sig = `${st.ino}:${st.size}:${st.mtimeMs}`;
  if (sig === collector.sig) return;
  let f; try { f = JSON.parse(fs.readFileSync(GH_FEED, 'utf8')); } catch { return; }   // mid-replace: next tick
  if (!validFeed(f)) { collector.sig = sig; console.log('collector: feed file invalid; ignored'); return; }
  collector.sig = sig; collector.lastWrite = Date.now();
  ingestSrc('github', f.events, headerOf(f));
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
const ACT_FIELDS = new Set(['t_ct', 'kind', 'action', 'to', 'agent', 'tag', 'seat']);   // seat: optional, must match the token
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
<meta name="robots" content="noindex,nofollow"><title>Example · live mesh</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f17;color:#dde3ee;font:15px system-ui,sans-serif}
form{background:#141b27;padding:28px 30px;border-radius:12px;min-width:260px;box-shadow:0 8px 30px #0006}
h1{font-size:17px;margin:0 0 18px;font-weight:600;letter-spacing:.02em}input{width:100%;box-sizing:border-box;padding:10px;border-radius:7px;border:1px solid #2c3850;background:#0b0f17;color:#dde3ee;font-size:15px}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:7px;background:#6e8cff;color:#fff;font-size:15px;cursor:pointer}.e{color:#ff8f8f;font-size:13px;margin:10px 0 0}</style></head>
<body><form method="post" action="/login"><h1>Example · live mesh</h1>
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

  if (p === '/healthz' && (m === 'GET' || m === 'HEAD')) return send(req, res, 200, 'text/plain; charset=utf-8', 'ok');
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
    for (const k of ['to', 'agent', 'tag']) if (d[k] != null) line[k] = d[k];
    activity.push(line); if (activity.length > ACT_KEEP) activity.splice(0, activity.length - ACT_KEEP);
    return json(req, res, 202, { ok: true });
  }

  if (p === '/emit') {   // write-only Assistant / emitter events from the Example MCP server; answers {ok} or an error, never data
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
    const d = since(url.searchParams.get('since'));
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
    return json(req, res, r.status, r.status === 200 ? { ok: true, added: r.added, rejected: r.rejected } : { error: r.error });
  }
  const inboxM = /^\/inbox\/([a-z0-9-]{2,16})$/.exec(p);
  if (inboxM && m === 'GET') {   // a seat reads its own inbox: GET /inbox/<seat>?since=<id>
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who) return json(req, res, 401, { error: 'unauthorized' });
    if (!SEAT_IDS.includes(inboxM[1]) || who !== inboxM[1]) return json(req, res, 403, { error: 'inbox is not exposed' });
    const since = url.searchParams.get('since'), all = url.searchParams.get('all') === '1';
    const base = since && seatInbox[who].some(l => l.id === since) ? linesAfter(seatInbox[who], since) : seatInbox[who];
    const keep = new Set(openLines(who, all).map(l => l.id));
    return json(req, res, 200, { seat: who, lines: base.filter(l => keep.has(l.id)).slice(0, 1000) });
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
    const n = ackLines(who, what);
    if (n < 0) return json(req, res, 404, { error: 'no such line' });
    return json(req, res, 200, { ok: true, acked: n, open: openLines(who, false).length });
  }
  if (p === '/cards') {   // GET /cards?seat=<seat>: that seat's key (Operator may read any seat); coord / operator see all
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who) return json(req, res, 401, { error: 'unauthorized' });
    const want = String(url.searchParams.get('seat') || who).toLowerCase();
    if (want !== who && who !== 'operator') return json(req, res, 403, { error: 'not your seat' });
    const all = want === 'coord' || want === 'operator';
    const cs = CARD_SEAT[want] || want;
    return json(req, res, 200, { seat: want, cards: cardsView(bfCards.filter(c => all || cardSeats(c).includes(cs))) });
  }
  if (p === '/nudges') {   // GET /nudges?since=<id>: Operator key only (the Operator routine delivers them)
    if (m !== 'GET') return json(req, res, 405, { error: 'method not allowed' }, { Allow: 'GET' });
    let who; try { who = await seatOf(req); } catch { return json(req, res, 503, { error: 'could not verify token, retry' }, { 'Retry-After': '30' }); }
    if (!who) return json(req, res, 401, { error: 'unauthorized' });
    if (who !== 'operator') return json(req, res, 403, { error: 'operator only' });
    evalNudges();
    return json(req, res, 200, { nudges: linesAfter(nudges, url.searchParams.get('since')).slice(0, 500) });
  }

  if (p === '/inbox/builder') {   // POST: box mirror (X-Live-Ingest = ingest secret); GET: Builder's installation token only
    if (m === 'POST') {
      const hs = req.headers['x-live-ingest'];
      if (typeof hs !== 'string' || !hs || !safeEq(hs, INGEST_SECRET)) { req.resume(); return json(req, res, 401, { error: 'unauthorized' }); }
      let parsed; try { parsed = JSON.parse((await readBody(req, 1 << 20)).toString('utf8')); } catch { return json(req, res, 400, { error: 'not json' }); }
      if (parsed && parsed.replace === true) seatInbox.builder.length = 0;
      const r = postSeatLines(parsed, 'builder');
      return json(req, res, r.status, r.status === 200 ? { ok: true, added: r.added, rejected: r.rejected } : { error: r.error });
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

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => { if (!res.headersSent) send(req, res, 500, 'text/plain', 'error'); else res.destroy(); });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(PORT, () => console.log(`live mesh listening on :${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
// started last: the feed validators above are initialized by now
if (process.env.COLLECTOR !== 'off') {
  readCollectorFeed();            // warm start from the volume before the first pass
  setInterval(readCollectorFeed, 2000).unref();
  startCollector();
}
