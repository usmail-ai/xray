// One activity line. The object carries the seat stamp.
// The caller is the authority: acceptLine keeps the line only when the stamp matches.
import { createHash } from 'node:crypto';

export const ACT_KINDS = {
  prompt: ['start', 'end', 'received', 'sent'],
  turn: ['start', 'end', 'tick'],
  subagent: ['start', 'end', 'tick'],
  watcher: ['start', 'end', 'tick'],
  cloud_agent: ['launch', 'reply', 'finished', 'cancel'],
  lab_run: ['start', 'end', 'pass', 'fail'],
  review: ['start', 'end', 'pass', 'fail'],
  retest: ['start', 'end', 'pass', 'fail'],
  deploy: ['start', 'end', 'pass', 'fail', 'cancel'],
};
const ACT_FIELDS = new Set(['t_ct', 'kind', 'action', 'to', 'agent', 'tag', 'seat']);
const ACT_BANNED = /body|text|message/i;
const ACT_VALUE = /^[A-Za-z0-9 ._:@#+\/-]{1,80}$/;
const ACT_AGENT = /^[A-Za-z0-9][A-Za-z0-9_-]{2,40}$/;
const ACT_SEAT = /^[A-Za-z0-9][A-Za-z0-9_-]{1,40}$/;

export function validActivity(d, now = Date.now()) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'not an object';
  for (const k of Object.keys(d)) {
    if (ACT_BANNED.test(k)) return 'free-text fields are not accepted';
    if (!ACT_FIELDS.has(k)) return 'unknown field';
  }
  for (const k of Object.keys(d)) {
    const v = d[k];
    if (typeof v !== 'string') return 'fields must be short plain strings';
    if (k === 'tag' && v.length > 80) return 'tag too long';
    if (k === 'to' && v.length > 40) return 'to too long';
    if (!ACT_VALUE.test(v)) return 'fields must be short plain strings';
    if (ACT_BANNED.test(v)) return 'free text is not accepted';
  }
  if (!ACT_KINDS[d.kind]) return 'bad kind';
  if (!ACT_KINDS[d.kind].includes(d.action)) return 'bad action for kind';
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,6})?)?([+-]\d\d:\d\d|Z)$/.test(d.t_ct || '')) return 'bad t_ct';
  const t = Date.parse(d.t_ct);
  if (Number.isNaN(t) || t > now + 5 * 60000 || t < now - 24 * 3600000) return 't_ct out of range';
  if (d.seat != null && !ACT_SEAT.test(d.seat)) return 'bad seat';
  if (d.kind === 'cloud_agent' && !ACT_AGENT.test(d.agent || '')) return 'cloud_agent needs agent id';
  if (d.agent != null && !ACT_AGENT.test(d.agent)) return 'bad agent id';
  return null;
}

export function acceptLine(lines, d, seat, now = Date.now()) {
  const why = validActivity(d, now);
  if (why) return { ok: false, error: why };
  if (d.seat != null && d.seat.toLowerCase() !== String(seat).toLowerCase()) {
    return { ok: false, status: 403, error: 'seat mismatch' };
  }
  const line = { ...d, seat, by: seat, seq: lines.length + 1 };
  lines.push(line);
  return { ok: true, seq: line.seq };
}

// Installation tokens are ~380 chars and may contain '.' and '_'.
// A stricter [A-Za-z0-9]{20,255} check rejected real tokens before GitHub saw them.
export const INSTALL_TOKEN_RE = /^ghs_[A-Za-z0-9._-]{20,1024}$/;

export function installTokenShape(token) {
  return typeof token === 'string' && INSTALL_TOKEN_RE.test(token);
}

const GH_CACHE_MS = 10 * 60 * 1000;
const GH_CACHE_MAX = 2000;
const ghCache = new Map();

function remember(key, verdict, now) {
  ghCache.set(key, { exp: now + GH_CACHE_MS, verdict });
  if (ghCache.size > GH_CACHE_MAX) ghCache.delete(ghCache.keys().next().value);
}

export function clearTokenCache() {
  ghCache.clear();
}

export function tokenCacheKeys() {
  return [...ghCache.keys()];
}

export async function verifyInstallationToken(token, seats, fetchFn, now = Date.now(), api = 'https://api.github.com') {
  if (!installTokenShape(token)) return { ok: false, status: 401, error: 'bad token shape' };
  const key = createHash('sha256').update(token).digest('hex');
  const hit = ghCache.get(key);
  if (hit && hit.exp > now) return { ...hit.verdict };
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'burst-activity',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  let viewerRes;
  try {
    viewerRes = await fetchFn(api + '/graphql', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { login databaseId } }' }),
    });
  } catch {
    return { ok: false, status: 503, error: 'github unreachable' };
  }
  if (viewerRes.status >= 500) return { ok: false, status: 503, error: 'github ' + viewerRes.status };
  const body = viewerRes.ok ? await viewerRes.json().catch(() => ({})) : {};
  const viewer = body && body.data && body.data.viewer;
  const match = viewer && (seats || []).find((s) => s.bot === viewer.login && s.botId === viewer.databaseId);
  if (!match) {
    const verdict = { ok: false, status: 401, error: 'not a seat installation' };
    remember(key, verdict, now);
    return { ...verdict };
  }
  let repoRes;
  try {
    repoRes = await fetchFn(api + '/installation/repositories?per_page=100', { headers });
  } catch {
    return { ok: false, status: 503, error: 'github unreachable' };
  }
  if (repoRes.status >= 500) return { ok: false, status: 503, error: 'github ' + repoRes.status };
  if (!repoRes.ok) {
    const verdict = { ok: false, status: 401, error: 'not an installation token' };
    remember(key, verdict, now);
    return { ...verdict };
  }
  const repos = ((await repoRes.json().catch(() => ({}))).repositories) || [];
  const good = repos.length > 0 && repos.every((r) => r && r.owner && r.owner.login === match.org);
  const verdict = good
    ? { ok: true, status: 200, seat: match.seat }
    : { ok: false, status: 401, error: 'installation is outside the seat org' };
  remember(key, verdict, now);
  return { ...verdict };
}

const rateHits = new Map();

export function rateOk(seat, now, store = rateHits) {
  const arr = (store.get(seat) || []).filter((t) => now - t < 60000);
  if (arr.length >= 60) {
    store.set(seat, arr);
    return false;
  }
  arr.push(now);
  store.set(seat, arr);
  return true;
}

export async function postActivity({ body, token, seats, lines, fetchFn, now = Date.now(), api }) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > 1024) return { status: 400, error: 'body too large' };
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, error: 'not json' };
  }
  const who = await verifyInstallationToken(token, seats, fetchFn, now, api);
  if (!who.ok) return { status: who.status, error: who.error };
  if (!rateOk(who.seat, now)) return { status: 429, error: 'rate limit' };
  const out = acceptLine(lines, parsed, who.seat, now);
  if (!out.ok) return { status: out.status || 400, error: out.error };
  return { status: 204, seq: out.seq };
}
