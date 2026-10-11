// The waveboard panel reads the feed object the page already polled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const liveDir = path.join(here, '..', '..', 'docs-site', 'static', 'live');
const sandbox = {};
vm.runInNewContext(readFileSync(path.join(liveDir, 'live.js'), 'utf8'), sandbox);
vm.runInNewContext(readFileSync(path.join(liveDir, 'waveboard.js'), 'utf8'), sandbox);
const L = sandbox.LiveMesh;
const W = sandbox.Waveboard;
const html = readFileSync(path.join(liveDir, 'index.html'), 'utf8');
const page = readFileSync(path.join(liveDir, 'waveboard.js'), 'utf8');

const card = (id, stage, beat) => ({
  id, title: id, url: 'https://github.com/org/repo/pull/1', owner: 'builder',
  stage, state: 'live', amber: stage === 'open', badge: stage === 'open' ? 'no packet' : 'packet',
  stall: false, pinned: false, age_s: 90,
  packet: { goal: '', constraints: '', path: '', acceptance: '', evidence: '', next_owner: '', escalate: '' },
  beats: beat ? [{ id: beat, t_ct: '2026-10-09T09:00:00-05:00', type: 'opened', label: 'opened' }] : []
});

test('cards group by stage and a new beat glows once', () => {
  const cards = [card('org/repo#1', 'open', 'b1'), card('org/repo#2', 'review', 'b2')];
  const groups = W.groupCards(cards);
  assert.equal(groups.open.length, 1);
  assert.equal(groups.review[0].id, 'org/repo#2');
  assert.deepEqual(Object.keys(W.glowIds(cards, null)), []);
  const seen = W.noteBeats(cards, null);
  const next = [card('org/repo#1', 'open', 'b1'), card('org/repo#2', 'review', 'b3')];
  const glow = W.glowIds(next, seen);
  assert.equal(glow['org/repo#2'], true);
  assert.equal(Object.keys(glow).length, 1);
  assert.equal(W.view({ cards: next }, 'org/repo#2', seen).selected.beats.length, 1);
  assert.equal(W.ageText(90), '1 min');
});

test('narrow layout is a toggle and the page does not poll a second source', () => {
  assert.equal(W.layout(720), 'toggle');
  assert.equal(W.layout(721), 'split');
  assert.match(html, /grid-template-columns:\s*2fr 1fr/);
  assert.match(html, /max-width:\s*720px/);
  assert.match(html, /id="waveToggle"/);
  assert.match(html, /waveboard\.js/);
  assert.equal(page.includes('fetch('), false);
  assert.equal(page.includes('api.github.com'), false);
  assert.equal(html.includes('/inbox/'), false);
});

test('applyFeed keeps the waveboard on the feed the page already loaded', () => {
  const start = { events: [], live: true, t: 0, generatedAt: null };
  const board = { cards: [card('org/repo#4', 'fix', 'b4')] };
  const applied = L.applyFeed(start, { events: [], generated_at: '2026-10-09T12:00:00-05:00', waveboard: board }, 1);
  assert.equal(applied.state.waveboard.cards[0].stage, 'fix');
  const kept = L.applyFeed(applied.state, { events: [], generated_at: '2026-10-09T12:00:01-05:00' }, 2);
  assert.equal(kept.state.waveboard.cards[0].id, 'org/repo#4');
});
