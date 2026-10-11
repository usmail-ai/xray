// Upload new arch1 inbox lines. Other seats stay on the box.
// The ingest secret stays in the X-Burst-Ingest header.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HEADER = 'X-Burst-Ingest';
const MIRROR = 'arch1';

export function arch1Lines(text, sent) {
  const out = [];
  const seen = sent instanceof Set ? sent : new Set(sent || []);
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
    if (String(parsed.seat || '').toLowerCase() !== MIRROR) continue;
    if (typeof parsed.id !== 'string' || seen.has(parsed.id)) continue;
    out.push(parsed);
  }
  return out;
}

export async function pushInbox({ fetchFn, url, secret, lines }) {
  if (!secret) return { ok: false, status: 2, error: 'INGEST_SECRET is required' };
  if (!url) return { ok: false, status: 2, error: 'BURST_INBOX_URL is required' };
  if (String(url).includes(secret)) return { ok: false, status: 2, error: 'secret must stay in the header' };
  if (!lines.length) return { ok: true, status: 204, added: 0 };
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      [HEADER]: secret,
    },
    body: JSON.stringify({ lines }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.status === 200, status: res.status, added: data.added || 0 };
}

function readSent(path) {
  try {
    return new Set(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return new Set();
  }
}

async function main() {
  const secret = process.env.INGEST_SECRET || '';
  const url = process.env.BURST_INBOX_URL || '';
  const dir = process.env.BURST_INBOX || 'fleet/inbox';
  if (!url) return;
  const file = join(dir, MIRROR + '.jsonl');
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  const sentPath = join(dir, MIRROR + '.sent.json');
  const sent = readSent(sentPath);
  const lines = arch1Lines(text, sent);
  const result = await pushInbox({ fetchFn: globalThis.fetch, url, secret, lines });
  if (!result.ok) {
    process.stderr.write(`${result.error || 'inbox mirror failed'} (${result.status})\n`);
    process.exit(result.status === 2 ? 2 : 1);
  }
  if (lines.length) {
    for (const line of lines) sent.add(line.id);
    mkdirSync(dirname(sentPath), { recursive: true });
    writeFileSync(sentPath, JSON.stringify([...sent]));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : 'inbox mirror failed'}\n`);
    process.exit(1);
  });
}
