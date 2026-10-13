// Push local activity lines as one Burst delta.
// The ingest secret stays in the X-Burst-Ingest header. It is never placed in a URL.
import { pathToFileURL } from 'node:url';

const HEADER = 'X-Burst-Ingest';

export function eventsFromActivity(text) {
  const events = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const seat = parsed.seat;
    if (typeof seat !== 'string' || typeof parsed.t_ct !== 'string') continue;
    if (typeof parsed.kind !== 'string' || typeof parsed.action !== 'string') continue;
    events.push({
      id: `box:${seat}:${parsed.kind}:${parsed.action}:${parsed.t_ct}`,
      t_ct: parsed.t_ct,
      from: seat,
      to: typeof parsed.to === 'string' && parsed.to ? parsed.to : 'Burst',
      kind: parsed.kind,
      direction: 'internal',
      label: `${parsed.kind} ${parsed.action}`.slice(0, 54),
      source: 'burst-box',
      src_file: 'box-events.jsonl',
      repo: 'local',
    });
  }
  return events;
}

async function readFeed(fetchFn, feedUrl) {
  const res = await fetchFn(feedUrl, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) return { ok: false, status: res.status, error: 'feed fetch failed' };
  const feed = await res.json();
  return { ok: true, feed: feed || {} };
}

function freshEvents(feed, events) {
  const known = new Set((feed.events || []).map((event) => event && event.id).filter(Boolean));
  return events.filter((event) => event && event.id && !known.has(event.id));
}

async function postDelta(fetchFn, ingestUrl, secret, base, upsert) {
  const res = await fetchFn(ingestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      [HEADER]: secret,
    },
    body: JSON.stringify({ base, upsert, remove: [] }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

export async function pushDelta({ fetchFn, feedUrl, ingestUrl, secret, events }) {
  if (!secret) return { ok: false, status: 2, error: 'INGEST_SECRET is required' };
  if (!feedUrl || !ingestUrl) {
    return { ok: false, status: 2, error: 'BURST_FEED_URL and BURST_INGEST_URL are required' };
  }
  if (String(feedUrl).includes(secret) || String(ingestUrl).includes(secret)) {
    return { ok: false, status: 2, error: 'secret must stay in the header' };
  }
  const loaded = await readFeed(fetchFn, feedUrl);
  if (!loaded.ok) return loaded;
  let fresh = freshEvents(loaded.feed, events);
  if (!fresh.length) return { ok: true, status: 304 };
  let result = await postDelta(fetchFn, ingestUrl, secret, loaded.feed.cursor || '', fresh);
  if (result.status === 409) {
    const again = await readFeed(fetchFn, feedUrl);
    if (!again.ok) return again;
    fresh = freshEvents(again.feed, events);
    if (!fresh.length) return { ok: true, status: 304 };
    result = await postDelta(fetchFn, ingestUrl, secret, again.feed.cursor || '', fresh);
  }
  const ok = result.status === 204 || result.status === 200;
  return { ok, status: result.status };
}

async function main() {
  const secret = process.env.INGEST_SECRET || '';
  const feedUrl = process.env.BURST_FEED_URL || '';
  const ingestUrl = process.env.BURST_INGEST_URL || '';
  const activityPath = process.env.BURST_ACTIVITY || '';
  let text = '';
  if (activityPath) {
    try {
      const { readFileSync } = await import('node:fs');
      text = readFileSync(activityPath, 'utf8');
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }
  const result = await pushDelta({
    fetchFn: globalThis.fetch,
    feedUrl,
    ingestUrl,
    secret,
    events: eventsFromActivity(text),
  });
  if (!result.ok) {
    process.stderr.write(`${result.error || 'delta push failed'} (${result.status})\n`);
    process.exit(result.status === 401 ? 75 : result.status === 2 ? 2 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : 'delta push failed'}\n`);
    process.exit(1);
  });
}
