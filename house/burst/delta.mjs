// Feed cursor. epoch.seq identifies one process. A mismatched base is a 409
// (client refetches the full feed). ?since at the current seq is a 304.
import { createHash, randomBytes } from 'node:crypto';

export function createFeed(epoch = randomBytes(6).toString('base64url')) {
  let seq = 0;
  const evs = new Map();
  const removed = [];
  let header = {};
  const cursor = () => `${epoch}.${seq}`;
  const hash = (e) => createHash('sha1').update(JSON.stringify(e)).digest('base64url');

  function headerOf(feed) {
    const h = {};
    for (const k of Object.keys(feed || {})) {
      if (k !== 'events' && k !== 'cursor' && k !== 'upsert' && k !== 'remove' && k !== 'base') h[k] = feed[k];
    }
    return h;
  }

  function upsert(e) {
    const h = hash(e);
    const cur = evs.get(e.id);
    if (!cur || cur.h !== h) evs.set(e.id, { e, h, s: seq });
  }

  return {
    cursor,
    ingestFull(feed) {
      seq += 1;
      header = headerOf(feed);
      const ids = new Set((feed.events || []).map((e) => e.id));
      for (const id of [...evs.keys()]) {
        if (!ids.has(id)) {
          evs.delete(id);
          removed.push({ id, s: seq });
        }
      }
      for (const e of feed.events || []) upsert(e);
      return cursor();
    },
    ingestDelta(delta) {
      if (!delta || delta.base !== cursor()) {
        const err = new Error('cursor mismatch');
        err.status = 409;
        err.cursor = cursor();
        return err;
      }
      seq += 1;
      header = headerOf(delta.header || {});
      for (const id of delta.remove || []) {
        if (evs.has(id)) {
          evs.delete(id);
          removed.push({ id, s: seq });
        }
      }
      for (const e of delta.upsert || []) upsert(e);
      return null;
    },
    since(asked) {
      const m = /^([A-Za-z0-9_-]+)\.(\d+)$/.exec(String(asked || ''));
      if (!m || m[1] !== epoch) return { status: 409, cursor: cursor() };
      const s = Number(m[2]);
      if (s > seq) return { status: 409, cursor: cursor() };
      if (s === seq) return { status: 304, cursor: cursor() };
      const events = [];
      for (const v of evs.values()) if (v.s > s) events.push(v.e);
      return {
        status: 200,
        body: {
          ...header,
          delta: true,
          cursor: cursor(),
          events,
          removed: removed.filter((r) => r.s > s).map((r) => r.id),
        },
      };
    },
    full() {
      return { ...header, cursor: cursor(), events: [...evs.values()].map((v) => v.e) };
    },
  };
}
