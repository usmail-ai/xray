/* Example overlay for the upstream live page (live.js is served unmodified apart from the feed URL).
   Feed = this server's own live-events.json only. */
(function (L) {
  'use strict';
  function reset(obj, next) { Object.keys(obj).forEach(function (k) { delete obj[k]; }); for (var k in next) obj[k] = next[k]; }
  var FEED = (window.LIVE_FEED_URL || 'live-events.json');
  L.SOURCES.splice(0, L.SOURCES.length, { name: 'feed', api: true, url: FEED }, { name: 'feed', url: FEED });
  // Poll every 10 s: the pusher uploads right after each feed write, and an unchanged feed is a 304 with an empty body
  // (If-None-Match against this server's ETag), so the page's 'Updated' age stays under ~75 s.
  L.POLL_MS = 10000;
  // Delta polls: the full feed once (first load, or after the server reports a reset), then ?since=<cursor> returns
  // only events new or changed since then plus the header fields (304 when nothing changed). applyFeed already
  // unions incoming events into the page state by id, so handing it the delta keeps Replay (first load) and
  // play-each-new-id-once exactly as with full feeds.
  L.fetchFeed = function (fetchFn, nowMs, mem) {
    function full() {
      return fetchFn(FEED, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('feed HTTP ' + res.status);
        return res.json();
      }).then(function (f) { mem.cursor = (f && f.cursor) || null; return { source: 'feed', feed: f }; });
    }
    if (!mem.cursor) return full();
    var url = FEED + (FEED.indexOf('?') < 0 ? '?' : '&') + 'since=' + encodeURIComponent(mem.cursor);
    return fetchFn(url, { cache: 'no-store' }).then(function (res) {
      if (res.status === 304) return { source: 'feed', feed: null };
      if (!res.ok) throw new Error('feed HTTP ' + res.status);
      return res.json().then(function (d) {
        if (d && d.delta) {
          mem.cursor = d.cursor || null;
          var f = {}; for (var k in d) if (k !== 'delta' && k !== 'removed') f[k] = d[k];
          return { source: 'feed', feed: f };
        }
        if (d && !d.reset && Array.isArray(d.events)) { mem.cursor = d.cursor || null; return { source: 'feed', feed: d }; }  // pre-delta server
        mem.cursor = null;
        return full();   // server restarted / cursor too old
      });
    });
  };
  // Bots (the "a of b bots active" count; the feed's fleet state marks seats active from file mtimes too).
  // Coord uses the upstream 'blinky' key. QA = QaOne + QA two + QA (one seat, one stream).
  L.AGENTS.splice(0, L.AGENTS.length, ['Builder', 'builder'], ['Builder-cloud', 'cloud builder'], ['Reviewer', 'gate'], ['Tester', 'lab tester'],
    ['QA', 'lab testers'], ['Operator', 'infra'], ['blinky', 'Coordinator'], ['CloudAgents', 'cloud agents'], ['Assistant', 'emitter']);
  // Cloud agents is a header seat (ACTIVE/IDLE) but not one of the bots counted in 'N of M bots active'.
  L.SEAT_NAMES.splice(0, L.SEAT_NAMES.length, 'Builder', 'Builder-cloud', 'Reviewer', 'Tester', 'QA', 'Operator', 'blinky');
  // Nodes (920 x 400 canvas, hub at 500,200). One Example node (product + dev / labtest / prod instances; the
  // instance is a tag on the event label). 'mymuse.house' / 'blinky' / 'X' are upstream's fixed keys,
  // shown as Example / Coord / Others.
  // Lead = lead-login and lead-alt (his renamed login): one node. CI is folded into GitHub.
  reset(L.SATS, { Builder: [90, 50], 'Builder-cloud': [190, 125], Reviewer: [280, 50], X: [470, 50], GitHub: [680, 55], Railway: [850, 55],
    Lead: [110, 200], Operator: [300, 200], blinky: [690, 200], 'mymuse.house': [850, 200],
    CloudAgents: [150, 330], Tester: [400, 330], QA: [640, 330], Assistant: [860, 330] });
  reset(L.COLOR, { Builder: [110, 170, 255], 'Builder-cloud': [150, 200, 255], Reviewer: [255, 150, 90], Tester: [240, 120, 190], QA: [140, 230, 200],
    Operator: [88, 210, 180], CloudAgents: [130, 190, 255], Lead: [255, 120, 100], X: [150, 160, 180],
    GitHub: [200, 210, 230], Railway: [170, 130, 255], Assistant: [116, 170, 156],
    'mymuse.house': [255, 200, 90], blinky: [88, 210, 180] });
  reset(L.LABEL, { CloudAgents: 'Cloud agents', Builder: 'Builder', 'Builder-cloud': 'Builder-cloud', Reviewer: 'Reviewer', Tester: 'Tester', QA: 'QA', Operator: 'Operator',
    Lead: 'Lead', X: 'Others', GitHub: 'GitHub', Railway: 'Railway',
    'mymuse.house': 'Example', blinky: 'Coord', Assistant: 'Assistant / emitter' });
  reset(L.SUB, { CloudAgents: 'cursor agents', Builder: 'builder', 'Builder-cloud': 'builder (cloud)', Reviewer: 'gate', Tester: 'lab tester', QA: 'qa-one · qa two',
    Operator: 'infra', Lead: 'Architect', X: 'other actors',
    GitHub: 'PRs · commits · checks', Railway: 'deploys', 'mymuse.house': 'dev · labtest · prod', blinky: 'Coordinator', Assistant: 'MCP tool calls' });
  reset(L.GLYPH, {});
  reset(L.SQUARE, { GitHub: 1, Railway: 1 });
  L.EDGES.splice(0, L.EDGES.length, ['Builder', 'GitHub'], ['Builder-cloud', 'GitHub'], ['Lead', 'GitHub'],
    ['Reviewer', 'GitHub'], ['Tester', 'GitHub'], ['X', 'GitHub'], ['Operator', 'Railway'], ['CloudAgents', 'GitHub'], ['Operator', 'CloudAgents'], ['Lead', 'Operator'],
    ['GitHub', 'Railway'], ['Railway', 'mymuse.house'], ['Tester', 'mymuse.house'], ['QA', 'mymuse.house'],
    ['blinky', 'mymuse.house'], ['Assistant', 'mymuse.house'], ['Operator', 'blinky'], ['Operator', 'GitHub']);
  // Avatars: avatars/<file>.png when present; a missing file falls back to the normal drawing (onerror).
  // builder-app[bot] -> builder, reviewer-app(/[bot]) -> reviewer, ops-app[bot] -> operator, Tester app -> tester,
  // The Example node -> live (mailbox mark). lead-login and lead-alt (Lead's renamed login) -> the Lead node.
  // lead-login (Lead, the Architect) uses lead.png; the merged QA seat uses qa.
  var AVATAR = { Lead: 'lead', Builder: 'builder', Reviewer: 'reviewer', Tester: 'tester', QA: 'qa',
    Operator: 'operator', blinky: 'coord', 'mymuse.house': 'live' };
  L.BOT_IMAGES.splice(0, L.BOT_IMAGES.length);
  Object.keys(AVATAR).forEach(function (k) { L.BOT_IMAGES.push(k); });
  L.botImage = function (key) { return AVATAR[key] ? 'avatars/' + AVATAR[key] + '.png' : null; };
  var W = { lab_bug: 'lab bug', lab_bug_update: 'lab bug', lab_issue: 'lab issue', lab_run: 'lab test run',
    lab_calls: 'lab calls', board_card: 'board card', board_status: 'board', lab_retest_pass: 'lab retest PASS', lab_retest_fail: 'lab retest FAIL', critic_pass: 'reviewer PASS',
    critic_fail: 'reviewer FAIL', critic_hold: 'reviewer HOLD', critic_recheck: 'reviewer re-check', pr_commit: 'PR push',
    review: 'review', pr_comment: 'PR comment', issue_comment: 'issue comment', review_comment: 'review comment',
    commit: 'commit', check_run: 'check run', check_suite: 'check suite', workflow_run: 'workflow run',
    commit_status: 'status', deploy_pending: 'deploy pending', tag: 'tag', release: 'release' };
  for (var k in W) L.KIND_WORD[k] = W[k];
  // Responsiveness: keep the most recent N events in the page (live-events.json holds everything).
  // ?n=5000 changes N; ?kinds=pr_,merged,reviewer filters by kind prefix.
  var q = new URLSearchParams(location.search);
  var MAX = Math.max(100, Number(q.get('n')) || 3000);
  var KINDS = (q.get('kinds') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  // Every feed from/to maps onto a drawn node key (L.SATS). Feed names -> node keys; anything else -> fallback.
  var NODE_KEY = { CI: 'GitHub', forge: 'GitHub', Others: 'X', 'Example': 'mymuse.house', Coord: 'blinky', reviewer: 'Reviewer',
    'dev.example.com': 'mymuse.house', 'app.example.com': 'mymuse.house', labtest: 'mymuse.house',
    'QA': 'QA', QaOne: 'QA', QaTwo: 'QA', 'QA two': 'QA',
    lead-alt: 'Lead', lead-alt: 'Lead', lead-login: 'Lead', 'Cloud agents': 'CloudAgents', cursoragent: 'CloudAgents' };
  function nodeKey(v, fallback) {
    if (/^(lead-alt|lead-login)$/i.test(String(v))) v = 'Lead';   // any alias of Lead's logins
    var k = Object.prototype.hasOwnProperty.call(NODE_KEY, v) ? NODE_KEY[v] : v;
    if (!Object.prototype.hasOwnProperty.call(L.SATS, k) && /(^|\.)live\.ai$/.test(String(k))) k = 'mymuse.house';
    return Object.prototype.hasOwnProperty.call(L.SATS, k) ? k : fallback;
  }
  // Hop list (feed names) -> drawn node keys; a hop that cannot be drawn is skipped, never crashes the page.
  function hopKeys(h) {
    if (!Array.isArray(h)) return null;
    var out = [];
    h.forEach(function (v) { var k = nodeKey(v, null); if (k && out[out.length - 1] !== k) out.push(k); });
    return out.length >= 2 ? out : null;
  }
  // Checks / runs / statuses (CI folded into GitHub): green on success, red on failure, neutral otherwise.
  var CHECK_KINDS = { check_run: 1, check_suite: 1, workflow_run: 1, commit_status: 1 };
  L.liveColor = function (e) {
    if (!e || !CHECK_KINDS[e.kind]) return null;
    var c = String(e.conclusion || e.state || '').toLowerCase();
    if (c === 'success') return [90, 220, 120];
    if (c === 'failure' || c === 'error' || c === 'timed_out' || c === 'startup_failure') return [240, 90, 80];
    return [165, 175, 190];
  };
  L.liveNodeKey = nodeKey;
  L.liveHopKeys = hopKeys;
  var applyFeed = L.applyFeed;
  L.applyFeed = function (state, feed, nowMs) {
    if (feed && Array.isArray(feed.events)) {
      window.LIVE_FEED_TOTAL = typeof feed.event_count === 'number' ? feed.event_count : feed.events.length;
      var ev = feed.events;
      if (KINDS.length) ev = ev.filter(function (e) { return KINDS.some(function (p) { return String(e.kind).indexOf(p) === 0; }); });
      ev = ev.slice().sort(function (a, b) { return Date.parse(a.t_ct) - Date.parse(b.t_ct); }).slice(-MAX);
      ev = ev.map(function (e) {
        var f = nodeKey(e.from, 'X'), t = nodeKey(e.to, 'GitHub');
        if (f === t && t === 'mymuse.house') f = 'Railway';   // no Example -> Example self-hop
        return Object.assign({}, e, { from: f, to: t, hops: hopKeys(e.hops) });
      });
      if (feed.fleet && typeof feed.fleet === 'object') window.LIVE_FLEET = feed.fleet;
      feed = Object.assign({}, feed, { events: ev });
    }
    var out = applyFeed(state, feed, nowMs);
    if (out.state.events.length > MAX) out.state.events = out.state.events.slice(-MAX);
    return out;
  };
  L.blackoutLine = function () { return ''; };
  // ONE derived seat state, used by the header chip text, its dot and the canvas node alike:
  //   working (in-flight spinner) > live (a ping on the board right now) > active (fleet, last 15 min) > idle
  L.seatState = function (working, live, active) {
    return working ? 'working' : live ? 'live' : active ? 'active' : 'idle';
  };
  var SEAT_WORD = { working: 'WORKING', live: 'LIVE', active: 'ACTIVE', idle: 'IDLE' };
  L.seatView = function (st) {   // everything the chip and the node show, from that one state
    return { word: SEAT_WORD[st] || 'IDLE', lit: st !== 'idle', blink: st === 'working', nodeWorking: st === 'working' };
  };
})(window.LiveMesh);
