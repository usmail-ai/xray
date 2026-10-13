import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatPresence, presentSeat } from '../app/presence.mjs';

test('seatPresence keeps a string and accepts an array of dest seats', () => {
  assert.deepEqual(seatPresence(''), {});
  assert.deepEqual(seatPresence('{"builder-cloud":"builder"}'), { 'builder-cloud': ['builder'] });
  assert.deepEqual(seatPresence('{"builder-cloud":["builder","coord"]}'), { 'builder-cloud': ['builder', 'coord'] });
  assert.deepEqual(seatPresence('[["builder-cloud","builder"]]'), { 'builder-cloud': ['builder'] });
  assert.deepEqual(seatPresence('{'), { 'builder-cloud': ['builder'] });
});

test('presentSeat folds every dest in an array', () => {
  const seats = {
    'builder-cloud': { last_ct: '2026-10-12T12:00:00Z', working: true },
    builder: { last_ct: '2026-10-12T10:00:00Z', working: false },
  };
  const presence = { 'builder-cloud': ['builder', 'coord'] };
  const builder = presentSeat(seats, 'Builder', presence);
  assert.equal(builder.working, true);
  assert.equal(builder.last, Date.parse('2026-10-12T12:00:00Z'));
  const coord = presentSeat(seats, 'coord', presence);
  assert.equal(coord.working, true);
});
