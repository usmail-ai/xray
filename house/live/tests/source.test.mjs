import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noNudgePatterns, workItemNewer, cardNoNudge } from '../app/source.mjs';

test('NO_NUDGE_REPOS unset excludes nothing', () => {
  const prev = process.env.NO_NUDGE_REPOS;
  delete process.env.NO_NUDGE_REPOS;
  try {
    assert.deepEqual(noNudgePatterns(), []);
    assert.equal(cardNoNudge({ repo: 'example-org/app' }), false);
  } finally {
    if (prev === undefined) delete process.env.NO_NUDGE_REPOS;
    else process.env.NO_NUDGE_REPOS = prev;
  }
});

test('workItemNewer compares parsed times and prefers closed on a tie', () => {
  const open = { updated: '2026-10-12T12:00:00Z', status: 'open', status_category: 'indeterminate' };
  const later = { updated: '2026-10-12T13:00:00Z', status: 'open', status_category: 'indeterminate' };
  const closed = { updated: '2026-10-12T12:00:00Z', status: 'closed', status_category: 'done' };
  assert.equal(workItemNewer(open, later), true);
  assert.equal(workItemNewer(later, open), false);
  assert.equal(workItemNewer(open, closed), true);
  assert.equal(workItemNewer(closed, open), false);
});
