import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validActivity } from './activity.mjs';

const now = Date.parse('2026-10-09T14:00:00Z');

function load(name) {
  return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
}

const activity = load('./activity.schema.json');
const prompts = load('./prompts.schema.json');
const cloud = load('./cloud-agent.schema.json');
const plate = load('./plate.schema.json');
const seats = load('./seats.example.json');

test('each activity example is a line the server accepts', () => {
  assert.ok(activity.examples.length >= 9);
  for (const line of activity.examples) {
    assert.equal(validActivity(line, now), null, JSON.stringify(line));
  }
});

test('prompt and cloud-agent lines match their schemas kinds', () => {
  for (const line of prompts.examples) {
    assert.equal(line.kind, 'prompt');
    assert.equal(validActivity(line, now), null);
  }
  for (const line of cloud.examples) {
    assert.equal(line.kind, 'cloud_agent');
    assert.equal(validActivity(line, now), null);
  }
  assert.equal(activity.properties.tag.maxLength, 80);
  assert.equal(typeof activity.properties.seat, 'object');
  assert.equal(activity.required.includes('seat'), false);
  assert.deepEqual(activity.properties.kind.enum, [
    'prompt', 'turn', 'subagent', 'watcher', 'cloud_agent', 'lab_run', 'review', 'retest', 'deploy',
  ]);
});

test('a fleet activity line is the same object POST /activity accepts', () => {
  const lines = activity.$defs.seatActivity.examples;
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.equal(validActivity(line, now), null, JSON.stringify(line));
    assert.ok(['subagent', 'turn', 'watcher'].includes(line.kind));
    assert.ok(['start', 'end'].includes(line.action));
    assert.ok(line.tag.length <= 80);
  }
});

test('each sample plate has the stamp fields', () => {
  const bot = new RegExp(plate.properties.bot.pattern);
  const color = new RegExp(plate.properties.color.pattern);
  assert.deepEqual(plate.required, ['seat', 'bot', 'role', 'color', 'emoji']);
  for (const seat of seats.seats) {
    const stamp = seat.plate;
    for (const key of plate.required) assert.equal(typeof stamp[key], 'string', seat.id);
    assert.match(stamp.bot, bot);
    assert.match(stamp.color, color);
    assert.ok(plate.properties.role.enum.includes(stamp.role));
    assert.equal(stamp.seat, seat.id);
  }
});
