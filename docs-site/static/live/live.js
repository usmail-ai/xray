/* Live wire: pure feed logic for index.html (no DOM). Loaded as a plain script; exposes
   globalThis.LiveMesh. Layout, colors, labels and the ping mapping follow
   house/live-mesh/render_mesh.py so the page tells the same story as the mp4.
   Tests: node --test house/live-mesh/test_live_page.mjs */
(function (root) {
  'use strict';

  /* Feed sources, tried in order. The contents API reads the live-wire branch with a ~60 s
     cache (60 unauthenticated calls/hour per viewer IP; a 304 on If-None-Match does not
     count). raw.githubusercontent caches ~5 min and the same-origin copy waits for a Pages
     build, so those are fallbacks only. */
  var SOURCES = [
    { name: 'GitHub API', api: true,
      url: 'https://api.github.com/repos/0xRayAI/xray/contents/docs-site/static/live/live-events.json?ref=live-wire' },
    { name: 'raw (cached ~5 min)',
      url: 'https://raw.githubusercontent.com/0xRayAI/xray/live-wire/docs-site/static/live/live-events.json' },
    { name: 'Pages copy', url: 'live-events.json' }
  ];
  var POLL_MS = 60000;
  var BURST_POLL_MS = 10000;
  var FRESH_MS = 90000;
  var PING_MS = 1100;

  var AGENTS = [
    ['blinky', 'CoS'], ['mill', 'Eng Dev'], ['forge', 'merge'],
    ['critic', 'gate'], ['herald', 'voice'], ['minime0x', 'muse'], ['nibbler', 'feed scout']
  ];
  var SEAT_NAMES = AGENTS.map(function (a) { return a[0]; });
  var COLOR = {
    blinky: [88, 210, 180], mill: [120, 220, 140], forge: [110, 170, 255],
    critic: [255, 150, 90], herald: [200, 140, 255], minime0x: [255, 180, 100], nibbler: [240, 120, 190],
    GitHub: [200, 210, 230], X: [140, 180, 255], 'mymuse.house': [255, 200, 90],
    Blaze0x1: [255, 120, 100], grok: [180, 190, 200]
  };
  var LABEL = { blinky: 'blinky', mill: 'mill', forge: 'forge', critic: 'critic', herald: 'herald',
    minime0x: 'minime0x', nibbler: 'nibbler', GitHub: '', X: '', 'mymuse.house': '' };
  /* Nodes drawn as a glyph instead of a box (the glyph is the name, so the label drops it). */
  var GLYPH = { X: '\uD835\uDD4F', 'mymuse.house': '\uD83C\uDFE0', mill: '\u2699\uFE0F', nibbler: '\uD83E\uDEB1' };
  /* Nodes drawn as a vector mark (viewBox 0 0 16 16): GitHub = Octicons mark-github-16 (primer/octicons). */
  var MARK_PATH = { GitHub: 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656' };
  var SUB = { blinky: 'CoS seat', mill: 'Eng Dev', forge: 'continuity', critic: 'gate',
    herald: 'replies', minime0x: 'muse bot', nibbler: 'feed scout', GitHub: 'PRs', X: '@0xRayAI', 'mymuse.house': 'live site' };
  var SQUARE = { GitHub: 1, X: 1, 'mymuse.house': 1 };
  var WHO_LOG = { 'mymuse.house': 'MYMUSE', Blaze0x1: 'BLAZE', minime0x: 'MINIME', GitHub: 'GITHUB',
    grok: 'GROK', blinky: 'BLINKY', mill: 'MILL', forge: 'FORGE', critic: 'CRITIC', herald: 'HERALD', nibbler: 'NIBBLER', X: 'X' };
  // render_mesh.py SATS, shifted by (-140, -110) to drop the mp4's header rows.
  var HUB = [500, 200];
  var SATS = { blinky: [80, 90], mill: [220, 50], forge: [380, 50], critic: [540, 50],
    herald: [80, 270], minime0x: [220, 330], nibbler: [540, 330], GitHub: [840, 90], X: [840, 210], 'mymuse.house': [840, 330] };
  var EDGES = [
    ['blinky', 'forge'], ['blinky', 'critic'], ['blinky', 'herald'], ['blinky', 'mill'],
    ['mill', 'forge'], ['forge', 'critic'], ['minime0x', 'GitHub'], ['forge', 'GitHub'],
    ['mill', 'GitHub'], ['critic', 'GitHub'], ['herald', 'X'], ['blinky', 'X'],
    ['GitHub', 'mymuse.house'], ['mymuse.house', 'blinky'], ['minime0x', 'critic'],
    ['forge', 'mymuse.house'], ['critic', 'mill'], ['critic', 'forge'],
    ['nibbler', 'X'], ['blinky', 'nibbler']
  ];
  var ALIAS = { Blaze0x1: 'X', grok: 'X' };
  var GIT_KINDS = toSet(['pr_open', 'pr_update', 'pr_close', 'merged', 'fix', 'supersede', 'review', 'comment',
    'critic_fail', 'critic_pass', 'ci_pass', 'ci_fail', 'issue_open', 'issue_close',
    'deploy', 'deploy_fail', 'health_ok', 'health_fail', 'probe', 'push', 'feed_push']);
  var KIND_WORD = { pr_open: 'open', pr_update: 'fix / update', merged: 'merge', pr_close: 'close',
    supersede: 'supersede', critic_pass: 'Light PASS', critic_fail: 'Light FAIL',
    ci_pass: 'CI pass', ci_fail: 'CI fail', review: 'review', comment: 'comment',
    issue_open: 'issue open', issue_close: 'issue close', fix: 'fix',
    deploy: 'deploy', deploy_fail: 'deploy FAIL', health_ok: '/health ok',
    health_fail: '/health FAIL', x_in_mention: 'IN mention', x_in_reply: 'IN reply',
    x_out_reply: 'OUT reply', x_out_root: 'OUT root', x_like: 'LIKE',
    x_root: 'OUT root', x_reply: 'X reply', push: 'push', feed_push: 'live-wire push' };
  var LEGACY_KIND = { fix: 'pr_update', probe: 'health_ok', x_root: 'x_out_root' };
  var BANNED = ['Dist', 'emergence', 'compaction'];

  function toSet(list) { var s = {}; list.forEach(function (k) { s[k] = 1; }); return s; }
  /* Own-key lookup so a feed name like "constructor" never hits Object.prototype. */
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined; }

  /* Seat images: bots/<seat>.png for seats in this manifest only (no 404s for the rest).
     Add a seat here when its file lands; any other seat draws a lettered badge. */
  var BOT_IMAGES = ['blinky', 'forge', 'critic', 'herald', 'minime0x'];
  function botImage(key) { return BOT_IMAGES.indexOf(key) >= 0 ? 'bots/' + key + '.png' : null; }

  /* Blackout countdown (one constant). */
  var BLACKOUT_UNTIL = '2026-10-11T09:08:00-05:00';
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function countdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 86400) + 'd ' + pad2(Math.floor(s / 3600) % 24) + 'h ' + pad2(Math.floor(s / 60) % 60) + 'm ' + pad2(s % 60) + 's';
  }
  function blackoutLine(nowMs) {
    var left = Date.parse(BLACKOUT_UNTIL) - nowMs;
    return left > 0 ? 'BLACKOUT until Sun Oct 11, 9:08 AM CT \u00b7 ' + countdown(left) : 'Blackout lifted';
  }
  /* Fleet line from the same seat status as the strip (activeSeats). */
  function fleetLine(hot) {
    // Working lights are not seats in this count. Callers must not pass them as hot.
    var live = SEAT_NAMES.filter(function (k) { return own(hot, k); }).length;
    return 'Fleet: ' + live + ' live / ' + (SEAT_NAMES.length - live) + ' idle';
  }
  /* generated_at age. ≤ 90s is LIVE; otherwise "behind N min". */
  function freshnessLabel(generatedAt, nowMs) {
    if (generatedAt == null || isNaN(generatedAt)) return 'behind 1 min';
    var age = nowMs - generatedAt;
    if (age <= FRESH_MS) return 'LIVE';
    return 'behind ' + Math.max(1, Math.round(age / 60000)) + ' min';
  }
  /* feed.working is { seat: until-iso }. One time per seat. True while now < until. */
  function seatWorking(working, nowMs) {
    var on = {};
    if (!working) return on;
    Object.keys(working).forEach(function (seat) {
      var until = parseT(working[seat]);
      if (!isNaN(until) && nowMs < until) on[seat] = 1;
    });
    return on;
  }
  /* One state for the chip, the blinking dot, and the node label. */
  function seatState(active, working) {
    if (working) return 'working';
    if (active) return 'active';
    return 'idle';
  }
  function burstSinceUrl(base, cursor) {
    return base + (base.indexOf('?') < 0 ? '?' : '&') + 'since=' + encodeURIComponent(cursor);
  }
  /* Wires: solid line with a soft 'current' glow travelling along it, even idle (not packets).
     Returns the glow position 0..1 for an edge with offset off; null under reduced motion. */
  function wireGlow(tMs, off, reduced) { return reduced ? null : (tMs / 1000 * 0.12 + (off || 0)) % 1; }
  function badgeLetter(key) { return String(own(LABEL, key) || key || '?').charAt(0).toUpperCase(); }

  /* Subtle motion: each seat bobs a few px on its own phase; a fired event pulses 0..1..0.
     Reduced motion returns zero offset / no pulse. */
  var ENTRY_MS = 1500, PULSE_MS = 900;
  function phaseOf(key) {
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
    return h / 997 * Math.PI * 2;
  }
  function bob(key, tMs, reduced) {
    if (reduced) return [0, 0];
    var ph = phaseOf(String(key)), t = tMs / 1000;
    return [Math.sin(t * 0.7 + ph * 1.3) * 1.5, Math.sin(t * (0.9 + ph / 20) + ph) * 3];
  }
  function pulse(ageMs, reduced) {
    if (reduced || !(ageMs >= 0) || ageMs > PULSE_MS) return 0;
    return Math.sin(Math.PI * ageMs / PULSE_MS);
  }
  /* Entry: 0..1 ease-out over ENTRY_MS from page start; seats stagger in by index. */
  function entry(elapsedMs, index, reduced) {
    if (reduced) return 1;
    var p = Math.min(1, Math.max(0, (elapsedMs - (index || 0) * 90) / ENTRY_MS));
    return 1 - Math.pow(1 - p, 3);
  }

  /* Transport. Live counts as playing (the view runs at real time), so the button shows Pause.
     A slider click/drag plays from that point; at the right end it goes Live. */
  function isPlaying(live, playing) { return !!(live || playing); }
  function sliderAction(v, b) { return v >= b[1] - 1000 ? 'live' : 'play'; }
  /* Edge traffic: dots run only on an edge with a ping in flight (a real event in the recent
     window); a quiet edge is a still line. */
  function edgeTraffic(burst) { return burst ? { count: 8, speed: 0.9, size: 3, alpha: 0.95 } : null; }
  /* Hub orbit turns only while something is in flight, and never under reduced motion. */
  function orbitStep(dtMs, pings, reduced) { return pings && pings.length && !reduced ? dtMs / 1000 * 0.25 : 0; }

  /* 0xRay wordmark, drawn from the house recipe (dist-media logo_glyphs word_ink/orange crops,
     measured from the final stamp) resampled to a W x H cell grid: rows split by '/', runs of
     <value><base36 count>, value 0 void, 1 stencil white #EBEBEB, 2 orange #DC5812. */
  var MARK = { w: 112, h: 44, rle: '061401140v1701170z0g/041601160t1701190z0e/031701170s17011b0z0c/021801180r17011c0z0b/011901190q17011c0z0b/011901190q17041a0z0a/1805170q1706180z0a/1707170p1707170z0a/1707170p1707170b110x/170716032312220617031708160815011407160816/17071703221123110516041708170517011605160717/170717041222120417041708160518011704170617/170713021105112313031605170717051801180317061601/1707120212062214021705170717041901180416061601/170a14052116011606170618041704170416061601/170816061602150617011c051606160417041602/170717061702130717011c051606160417041602/170717071602130717011b0i170416041602/170717071702110817011a0j160516041602/17071708170a1701190f1302160516031603/17071709160a1703170c1602160616021603/1707170917091703170a1802160616021603/1707170a1609170417081a01160616021504/1707170712011708170417071a02160715021504/1707170712021608170417061805160716011504/221507170614011707170517051706160716011504/221507170614021607170517051607160716021305/1707170516011706170617041607160816011305/1707170516021606170617041607160816011305/011705170517021705170617041706160816021106/01190119032216041704170717031b02170815021106/01190119032117041704170717031b02160916011106/02180118032216061703170718031a0217081608/03170117032217061703170817041a0117081608/04160116032201172304170217081705180217091508/061401140z0z0d1707/0z0z0s1707/0z0z0s1608/0z0z0q1808/0z0z0n1a09/0z0z0n1a09/0z0z0n190a/0z0z0n180b/0z0z0n170c' };
  function markCells() {
    return MARK.rle.split('/').map(function (row) {
      var out = [];
      for (var i = 0; i < row.length; i += 2) {
        var v = +row[i], n = parseInt(row[i + 1], 36);
        while (n--) out.push(v);
      }
      return out;
    });
  }

  /* Same mapping as render_mesh.resolve_nodes: which two nodes a ping travels between. */
  function resolveNodes(e) {
    var kind = LEGACY_KIND[e.kind] || e.kind;
    if (kind === 'x_reply') kind = (e.from === 'herald' || e.from === '0xRayAI') ? 'x_out_reply' : 'x_in_reply';
    if (kind === 'x_in_mention' || kind === 'x_in_reply') return ['X', 'herald'];
    if (kind === 'x_out_reply' || kind === 'x_out_root' || kind === 'x_like') return ['herald', 'X'];
    if (kind === 'deploy' || kind === 'deploy_fail') return ['GitHub', 'mymuse.house'];
    if (kind === 'health_ok' || kind === 'health_fail' || kind === 'probe') return ['mymuse.house', 'blinky'];
    var src = own(ALIAS, e.from) ? 'GitHub' : e.from;
    var dst = own(ALIAS, e.to) ? 'GitHub' : e.to;
    if (!own(SATS, src)) src = own(GIT_KINDS, kind) ? 'GitHub' : 'X';
    if (!own(SATS, dst)) dst = 'GitHub';
    if (kind === 'critic_fail' || kind === 'critic_pass') {
      src = 'critic';
      if (dst === 'critic') dst = 'GitHub';
    }
    if (kind === 'ci_pass' || kind === 'ci_fail') src = 'GitHub';
    if (src === dst) dst = src !== 'GitHub' ? 'GitHub' : 'forge';
    return [src, dst];
  }

  function eventColor(e) {
    var k = e.kind;
    if (k === 'critic_fail' || k === 'ci_fail' || k === 'deploy_fail' || k === 'health_fail') return [255, 110, 90];
    if (k === 'critic_pass' || k === 'ci_pass' || k === 'health_ok' || k === 'deploy') return [120, 230, 150];
    if (k.indexOf('x_out') === 0 || k.indexOf('x_like') === 0 || k === 'x_root') return COLOR.herald;
    if (k.indexOf('x_') === 0) return COLOR.X;
    if (k === 'feed_push') return [88, 210, 180];   // live-wire push: teal, like the Live control
    return own(COLOR, e.from) || [180, 190, 210];
  }

  function cleanLabel(s) {
    var out = String(s || '');
    BANNED.forEach(function (b) { out = out.split(b).join('\u2026'); });
    return out;
  }

  function whoTag(e) {
    var who = e.kind.indexOf('critic_') === 0 ? 'critic' : e.from;
    return own(WHO_LOG, who) || String(who).replace(/^@/, '').toUpperCase().slice(0, 8);
  }

  function headline(e) {
    var repo = (e.repo || '').split('/').pop();
    var head = repo + (e.number == null ? '' : ' #' + e.number) + ' \u00b7 ' + (KIND_WORD[e.kind] || e.kind);
    return head.replace(/^[ \u00b7#]+|[ \u00b7#]+$/g, '');
  }

  function parseT(t) { return Date.parse(t); }

  function byTime(a, b) {
    return (a._t - b._t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  /* Merge incoming feed events into the known list by id. A re-sent id replaces the old copy.
     Returns a new array sorted by time (then id); inputs are not modified. */
  function mergeEvents(known, incoming) {
    var byId = {};
    var order = [];
    [known || [], incoming || []].forEach(function (list) {
      list.forEach(function (e) {
        if (!e || !e.id || !e.t_ct) return;
        var t = parseT(e.t_ct);
        if (isNaN(t)) return;
        if (!(e.id in byId)) order.push(e.id);
        var copy = {};
        for (var k in e) copy[k] = e[k];
        copy._t = t;
        byId[e.id] = copy;
      });
    });
    return order.map(function (id) { return byId[id]; }).sort(byTime);
  }

  /* Number of events with time <= tMs (events sorted). Replay shows events.slice(0, n). */
  function countUpTo(events, tMs) {
    var lo = 0, hi = events.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (events[mid]._t <= tMs) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function eventsUpTo(events, tMs) { return events.slice(0, countUpTo(events, tMs)); }

  /* Pings in flight at tMs: events whose time is in [tMs - spanMs, tMs]. p is 0..1 along the edge. */
  function pingsAt(events, tMs, spanMs) {
    var out = [];
    for (var i = countUpTo(events, tMs) - 1; i >= 0; i--) {
      var e = events[i];
      var age = tMs - e._t;
      if (age > spanMs) break;
      var nodes = resolveNodes(e);
      out.push({ e: e, src: nodes[0], dst: nodes[1], p: spanMs > 0 ? age / spanMs : 1, col: eventColor(e) });
    }
    return out;
  }

  /* Nodes and seats touched by a set of pings (the "LIVE" glow). */
  function hotNodes(pings) {
    var hot = {};
    pings.forEach(function (pk) {
      [pk.src, pk.dst, pk.e.from, pk.e.to].forEach(function (n) { if (own(SATS, n)) hot[n] = 1; });
    });
    return hot;
  }

  /* Seat status from the same events that drive the dots. items: [{ e, start }] (start in the
     view's clock). A seat is LIVE while a dot is in flight to/from it and for one more flight
     window after the dot lands; pending (queued live flashes) counts too. Same rule at now and
     on a rewound view. */
  function activeSeats(items, nowMs, flightMs, pending) {
    var hot = {};
    items.forEach(function (it) {
      var age = nowMs - it.start;
      if ((age < 0 && !pending) || age >= 2 * flightMs) return;
      var n = resolveNodes(it.e);
      [n[0], n[1], it.e.from, it.e.to].forEach(function (k) { if (own(SATS, k)) hot[k] = 1; });
    });
    return hot;
  }
  /* Replay items for activeSeats: events in (tMs - backMs, tMs], start = event time. */
  function recentItems(events, tMs, backMs) {
    var out = [];
    for (var i = countUpTo(events, tMs) - 1; i >= 0 && tMs - events[i]._t < backMs; i--) out.push({ e: events[i], start: events[i]._t });
    return out;
  }

  /* Fold a fetched feed into page state. Live mode follows the newest event; a rewound
     view keeps its time. Returns { state, added } where added lists new event ids. */
  function applyFeed(state, feed, nowMs) {
    var before = {};
    state.events.forEach(function (e) { before[e.id] = 1; });
    var events = mergeEvents(state.events, (feed && feed.events) || []);
    if (feed && Array.isArray(feed.removed)) {
      var drop = {};
      feed.removed.forEach(function (id) { drop[id] = 1; });
      events = events.filter(function (e) { return !drop[e.id]; });
    }
    var added = events.filter(function (e) { return !before[e.id]; }).map(function (e) { return e.id; });
    var gen = feed && feed.generated_at ? parseT(feed.generated_at) : NaN;
    var next = {
      events: events,
      live: state.live,
      t: state.live ? nowMs : state.t,
      generatedAt: !isNaN(gen) && !(gen < (state.generatedAt || 0)) ? gen : state.generatedAt,
      working: feed && own(feed, 'working') !== undefined ? feed.working : (state.working || null),
      cursor: (feed && feed.cursor) || state.cursor || null
    };
    return { state: next, added: added };
  }

  function bounds(events, nowMs) {
    if (!events.length) return [nowMs - 3600e3, nowMs];
    return [events[0]._t, Math.max(nowMs, events[events.length - 1]._t)];
  }

  var CT = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }) : null;

  function fmtCt(ms) {
    if (!CT) return new Date(ms).toISOString();
    return CT.format(new Date(ms)).replace(',', '') + ' CT';
  }

  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm ago';
  }

  function feedUrl(base, nowMs) {
    return base + (base.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(nowMs / 1000);
  }

  /* One poll. mem carries { etag, apiBlockedUntil } between polls. Resolves to
     { source, feed } (feed null on a 304) or rejects when every source fails. */
  /* Same-origin cursor poll. 304 keeps the page. 409 drops the cursor and refetches once. */
  function burstPoll(fetchFn, nowMs, mem, resync) {
    var url = (!resync && mem.cursor) ? burstSinceUrl('live-events.json', mem.cursor) : feedUrl('live-events.json', nowMs);
    return fetchFn(url, { cache: 'no-store', headers: { Accept: 'application/json' } }).then(function (res) {
      if (res.status === 304) return { source: 'burst', feed: null, status: 304 };
      if (res.status === 409 && !resync) {
        mem.cursor = null;
        return burstPoll(fetchFn, nowMs, mem, true);
      }
      if (!res.ok) return Promise.reject(new Error('burst HTTP ' + res.status));
      return res.json().then(function (feed) {
        if (feed && feed.cursor) mem.cursor = feed.cursor;
        return { source: 'burst', feed: feed, status: res.status };
      });
    });
  }

  function fetchFeed(fetchFn, nowMs, mem) {
    var api = SOURCES[0];
    function fallback(i) {
      if (i >= SOURCES.length) return Promise.reject(new Error('no feed source reachable'));
      var src = SOURCES[i];
      return fetchFn(feedUrl(src.url, nowMs), { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error(src.name + ' HTTP ' + res.status);
        return res.json().then(function (feed) { return { source: src.name, feed: feed }; });
      }).catch(function () { return fallback(i + 1); });
    }
    if (nowMs < (mem.apiBlockedUntil || 0)) return fallback(1);
    var headers = { Accept: 'application/vnd.github.raw' };
    if (mem.etag) headers['If-None-Match'] = mem.etag;
    return fetchFn(api.url, { cache: 'no-store', headers: headers }).then(function (res) {
      if (res.status === 304) return { source: api.name, feed: null };
      if (res.status === 403 || res.status === 429) {
        var reset = Number(res.headers.get('X-RateLimit-Reset')) * 1000;
        var retry = Number(res.headers.get('Retry-After')) * 1000;
        mem.apiBlockedUntil = reset > nowMs ? reset : nowMs + (retry > 0 ? retry : 600000);
        return fallback(1);
      }
      if (!res.ok) return fallback(1);
      return res.json().then(function (feed) {
        mem.etag = res.headers.get('ETag') || null;
        return { source: api.name, feed: feed };
      });
    }, function () { return fallback(1); });
  }

  root.LiveMesh = {
    HUB_LABEL: 'Burst', SOURCES: SOURCES, POLL_MS: POLL_MS, BURST_POLL_MS: BURST_POLL_MS, FRESH_MS: FRESH_MS, PING_MS: PING_MS, AGENTS: AGENTS, SEAT_NAMES: SEAT_NAMES, COLOR: COLOR,
    LABEL: LABEL, SUB: SUB, SQUARE: SQUARE, HUB: HUB, SATS: SATS, EDGES: EDGES, KIND_WORD: KIND_WORD,
    resolveNodes: resolveNodes, eventColor: eventColor, cleanLabel: cleanLabel, whoTag: whoTag,
    headline: headline, parseT: parseT, mergeEvents: mergeEvents, countUpTo: countUpTo,
    eventsUpTo: eventsUpTo, pingsAt: pingsAt, hotNodes: hotNodes, applyFeed: applyFeed,
    bounds: bounds, fmtCt: fmtCt, ago: ago, feedUrl: feedUrl, fetchFeed: fetchFeed,
    own: own, botImage: botImage, badgeLetter: badgeLetter, bob: bob, pulse: pulse, entry: entry,
    ENTRY_MS: ENTRY_MS, PULSE_MS: PULSE_MS, MARK: MARK, markCells: markCells,
    isPlaying: isPlaying, sliderAction: sliderAction, edgeTraffic: edgeTraffic, orbitStep: orbitStep,
    GLYPH: GLYPH, MARK_PATH: MARK_PATH, activeSeats: activeSeats, recentItems: recentItems, BOT_IMAGES: BOT_IMAGES, BLACKOUT_UNTIL: BLACKOUT_UNTIL,
    countdown: countdown, blackoutLine: blackoutLine, fleetLine: fleetLine, wireGlow: wireGlow,
    freshnessLabel: freshnessLabel, seatWorking: seatWorking, seatState: seatState, burstSinceUrl: burstSinceUrl, burstPoll: burstPoll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
