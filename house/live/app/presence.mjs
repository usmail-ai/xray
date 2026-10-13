// Seat presence folding (pure; imported by server.mjs and tests).
const tsOf = s => { const t = Date.parse(s || ''); return Number.isFinite(t) ? t : 0; };

function addDest(out, src, dst) {
  const s = String(src || '').trim();
  const d = String(dst || '').trim();
  if (!s || !d || s === d) return;
  if (!out[s]) out[s] = [];
  if (!out[s].includes(d)) out[s].push(d);
}

function addValue(out, src, value) {
  if (typeof value === 'string') addDest(out, src, value);
  else if (Array.isArray(value)) for (const dst of value) if (typeof dst === 'string') addDest(out, src, dst);
}

// SEAT_PRESENCE (JSON). A seat whose activity also counts as another seat's presence.
// Values are a seat name or an array of seat names. A top-level array of pairs is accepted too.
// Default: builder-cloud activity counts as builder. Unset uses that default. Blank or {} maps nothing.
// Invalid JSON keeps the default.
export function seatPresence(raw = process.env.SEAT_PRESENCE) {
  let data = { 'builder-cloud': 'builder' };
  if (raw != null) { try { data = String(raw).trim() ? JSON.parse(raw) : {}; } catch { /* keep default */ } }
  const out = {};
  if (Array.isArray(data)) {
    for (const row of data) {
      if (Array.isArray(row) && row.length >= 2) addDest(out, row[0], row[1]);
      else if (row && typeof row === 'object') for (const [k, v] of Object.entries(row)) addValue(out, k, v);
    }
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) addValue(out, k, v);
  }
  return out;
}

export function presentSeat(seats, name, presence = seatPresence()) {
  let last = tsOf(seats?.[name]?.last_ct), working = !!seats?.[name]?.working;
  const want = String(name).toLowerCase();
  for (const [src, dst] of Object.entries(presence)) {
    const dests = Array.isArray(dst) ? dst : [dst];
    if (!dests.some(d => String(d).toLowerCase() === want) || !seats?.[src]) continue;
    last = Math.max(last, tsOf(seats[src].last_ct));
    working = working || !!seats[src].working;
  }
  return { last, working };
}
