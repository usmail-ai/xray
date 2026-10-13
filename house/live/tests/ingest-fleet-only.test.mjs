// /ingest runs the same fleet-only rule as the collector: GitHub-sourced events showing an unmapped login are not served.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
const APP = process.env.MESH_APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function start(extra = {}) {
  const port = 20000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
  const ingest = crypto.randomBytes(32).toString('hex'), pw = crypto.randomBytes(8).toString('hex');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-ingest-'));
  const srv = spawn(process.execPath, [path.join(APP, 'server.mjs')], { env: { PORT: String(port), MESH_PASSWORD: pw,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), INGEST_SECRET: ingest, PATH: process.env.PATH, MESH_DATA_DIR: data, ...extra }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await sleep(100); }
  const r = await fetch(base + '/login', { method: 'POST', body: 'password=' + pw, redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { base, ingest, cookie, stop: () => { srv.kill(); fs.rmSync(data, { recursive: true, force: true }); } };
}
const t = new Date().toISOString();
const E = (id, x) => ({ id, t_ct: t, kind: 'pr_comment', label: 'l', to: 'GitHub', ...x });
const EVENTS = [
  E('gh', { from: 'Others', src_file: 'github-api', actor: 'some-stranger', label: 'some-stranger comment SECRET' }),
  E('author', { from: 'Others', author: 'some-stranger', label: 'SECRET commit' }),
  E('deploy', { from: 'GitHub', to: 'Others', src_file: 'github-deployments' }),
  E('hop', { from: 'Builder', src_file: 'github-api', hops: ['Builder', 'Others', 'GitHub'] }),
  E('local', { from: 'Others', to: 'Builder', kind: 'prompt_message', label: 'message', src_file: 'fleet/prompts' }),
  E('fleet', { from: 'Builder', src_file: 'github-api', actor: 'builder-app[bot]' }),
];
async function served(s) {
  const r = await fetch(s.base + '/ingest', { method: 'POST', headers: { Authorization: 'Bearer ' + s.ingest, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 't', generated_at: t, events: EVENTS }) });
  assert.equal(r.status, 200);
  const f = await (await fetch(s.base + '/live-events.json', { headers: { Cookie: s.cookie } })).json();
  return { ids: f.events.map(e => e.id).sort(), blob: JSON.stringify(f) };
}
test('ingest: unmapped GitHub-sourced events are not served; local and fleet events are', async () => {
  const s = await start();
  try {
    const { ids, blob } = await served(s);
    assert.deepEqual(ids, ['fleet', 'local']);
    assert.ok(!blob.includes('some-stranger') && !blob.includes('SECRET'));
  } finally { s.stop(); }
});
test('ingest: LIVE_SHOW_UNMAPPED=1 serves them', async () => {
  const s = await start({ LIVE_SHOW_UNMAPPED: '1' });
  try { assert.deepEqual((await served(s)).ids, ['author', 'deploy', 'fleet', 'gh', 'hop', 'local']); } finally { s.stop(); }
});
