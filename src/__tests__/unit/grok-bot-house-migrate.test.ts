import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const kit = path.join(root, 'grok-bot');
const bin = path.join(kit, 'bin', 'grok-bot.js');
const { diagnoseSeat, formatDoctor, initHouse, parseDoctorArgs, runDoctorCli } = requireCjs(
  path.join(kit, 'lib', 'seat-doctor.cjs'),
) as {
  diagnoseSeat: (opts: { cwd: string; home?: string; env?: Record<string, string> }) => {
    house: { status: string; scope?: { wallet: string } };
    next: string[];
  };
  formatDoctor: (report: { ok: boolean; next: string[] } & Record<string, unknown>) => string;
  initHouse: (opts: { dir: string; kitRoot: string; migrate?: boolean }) => {
    ok: boolean;
    code: number;
    message: string;
    files?: string[];
  };
  parseDoctorArgs: (argv: string[]) => { command: string | null; migrate: boolean };
  runDoctorCli: (
    argv: string[],
    io?: { stdout?: { write: (s: string) => void }; stderr?: { write: (s: string) => void }; kitRoot?: string },
  ) => number;
};

function scratch(): string {
  return mkdtempSync(path.join(tmpdir(), 'grok-bot-migrate-'));
}

function runBin(args: string[], cwd: string) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
}

function template(name: string): string {
  return readFileSync(path.join(kit, 'templates', 'house', name), 'utf8');
}

function cadenceBlock(): string {
  const match = template('HOUSE.md').match(/^## Cadence\r?\n[\s\S]*?(?=^## )/m);
  if (!match) throw new Error('template HOUSE.md has no Cadence block');
  return `${match[0].replace(/\s+$/, '')}\n`;
}

describe('grok-bot house init --migrate', () => {
  it('moves ops/WAVEBOARD.md and starts ATTENTION_STATE.md', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'ops'), { recursive: true });
      writeFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'old cards\n');
      const result = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(result.ok).toBe(true);
      expect(result.code).toBe(0);
      expect(result.message).toMatch(/moved .+\/ops\/WAVEBOARD\.md to .+\/house\/WAVEBOARD\.md/);
      expect(result.message).toMatch(/started .+\/house\/ATTENTION_STATE\.md/);
      expect(existsSync(path.join(dir, 'ops', 'WAVEBOARD.md'))).toBe(false);
      expect(readFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'utf8')).toBe('old cards\n');
      expect(readFileSync(path.join(dir, 'house', 'ATTENTION_STATE.md'), 'utf8')).toBe(template('ATTENTION_STATE.md'));
      expect(existsSync(path.join(dir, 'house', 'HOUSE.md'))).toBe(true);
      expect(existsSync(path.join(dir, 'house', 'EXAMPLE.md'))).toBe(false);
      const again = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(again.ok).toBe(true);
      expect(again.message).toMatch(/no ops\/WAVEBOARD\.md to move/);
      expect(readFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'utf8')).toBe('old cards\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plain house init leaves the old board in place', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'ops'), { recursive: true });
      writeFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'old cards\n');
      const result = initHouse({ dir, kitRoot: kit });
      expect(result.ok).toBe(true);
      expect(readFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'utf8')).toBe('old cards\n');
      expect(readFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'utf8')).toBe(template('WAVEBOARD.md'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses when both boards exist and the house board was edited', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'ops'), { recursive: true });
      mkdirSync(path.join(dir, 'house'), { recursive: true });
      writeFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'old cards\n');
      writeFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'edited board\n');
      const result = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(result.ok).toBe(false);
      expect(result.code).toBe(1);
      expect(result.message).toMatch(/refusing to overwrite .+\/house\/WAVEBOARD\.md with .+\/ops\/WAVEBOARD\.md/);
      expect(readFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'utf8')).toBe('old cards\n');
      expect(readFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'utf8')).toBe('edited board\n');
      expect(existsSync(path.join(dir, 'house', 'HOUSE.md'))).toBe(false);
      expect(existsSync(path.join(dir, 'house', 'ATTENTION_STATE.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('replaces an untouched template board and leaves a changed HOUSE.md', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'ops'), { recursive: true });
      mkdirSync(path.join(dir, 'house'), { recursive: true });
      writeFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), template('WAVEBOARD.md'));
      writeFileSync(path.join(dir, 'house', 'HOUSE.md'), 'custom house\n');
      writeFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'old cards\n');
      const result = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(result.ok).toBe(true);
      expect(existsSync(path.join(dir, 'ops', 'WAVEBOARD.md'))).toBe(false);
      expect(readFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'utf8')).toBe('old cards\n');
      const house = readFileSync(path.join(dir, 'house', 'HOUSE.md'), 'utf8');
      expect(house.startsWith('custom house\n')).toBe(true);
      expect(house.match(/^## Cadence$/gm)).toHaveLength(1);
      expect(readFileSync(path.join(dir, 'house', 'ATTENTION_STATE.md'), 'utf8')).toBe(template('ATTENTION_STATE.md'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses when ops/WAVEBOARD.md is a directory', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'ops', 'WAVEBOARD.md'), { recursive: true });
      const result = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not a file/);
      expect(existsSync(path.join(dir, 'house', 'HOUSE.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('appends the Cadence block once and does not overwrite a ledger', () => {
    const dir = scratch();
    const ledger = 'custom ledger\n- [x] org/app #1 abc fixes #2 — kept\n';
    try {
      mkdirSync(path.join(dir, 'house', 'watchers'), { recursive: true });
      writeFileSync(path.join(dir, 'house', 'HOUSE.md'), '# House\n\n## Owner\nAda.\n');
      writeFileSync(path.join(dir, 'house', 'watchers', 'merge-queue.md'), ledger);
      const result = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(result.ok).toBe(true);
      expect(result.code).toBe(0);
      expect(result.message).toMatch(/added Cadence section/);
      expect(result.message).toMatch(/started watchers\//);
      const house = readFileSync(path.join(dir, 'house', 'HOUSE.md'), 'utf8');
      expect(house.startsWith('# House\n\n## Owner\nAda.\n')).toBe(true);
      expect(house.match(/^## Cadence$/gm)).toHaveLength(1);
      expect(house).toContain(cadenceBlock());
      expect(readFileSync(path.join(dir, 'house', 'watchers', 'merge-queue.md'), 'utf8')).toBe(ledger);
      expect(existsSync(path.join(dir, 'house', 'watchers', 'stall-sweep.log'))).toBe(true);
      expect(existsSync(path.join(dir, 'house', 'watchers', 'review-sent.log'))).toBe(true);
      expect(existsSync(path.join(dir, 'house', 'watchers', 'issue-sweep-last.txt'))).toBe(true);
      expect(existsSync(path.join(dir, 'house', 'watchers', 'waveboard-static.md'))).toBe(true);
      expect(existsSync(path.join(dir, 'house', 'fleet', 'activity.jsonl'))).toBe(true);
      expect(existsSync(path.join(dir, 'house', 'fleet', 'prompts.jsonl'))).toBe(true);
      const again = initHouse({ dir, kitRoot: kit, migrate: true });
      expect(again.ok).toBe(true);
      expect(again.message).not.toMatch(/added Cadence section/);
      expect(readFileSync(path.join(dir, 'house', 'HOUSE.md'), 'utf8')).toBe(house);
      expect(readFileSync(path.join(dir, 'house', 'watchers', 'merge-queue.md'), 'utf8')).toBe(ledger);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs from the CLI and rejects --migrate on doctor', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'ops'), { recursive: true });
      writeFileSync(path.join(dir, 'ops', 'WAVEBOARD.md'), 'old cards\n');
      expect(parseDoctorArgs(['house', 'init', '--migrate']).migrate).toBe(true);
      expect(parseDoctorArgs(['house', 'init']).migrate).toBe(false);
      const migrated = runBin(['house', 'init', '--migrate', '--dir', dir], dir);
      expect(migrated.status).toBe(0);
      expect(migrated.stdout).toMatch(/moved /);
      expect(readFileSync(path.join(dir, 'house', 'WAVEBOARD.md'), 'utf8')).toBe('old cards\n');
      const chunks: string[] = [];
      const code = runDoctorCli(['doctor', '--migrate'], {
        stdout: { write: (s) => chunks.push(s) },
        stderr: { write: (s) => chunks.push(s) },
        kitRoot: kit,
      });
      expect(code).toBe(2);
      expect(chunks.join('')).toMatch(/--migrate is only valid with house init/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('grok-bot doctor Scope wallet opt-out', () => {
  function writeHouse(dir: string, body: string): void {
    mkdirSync(path.join(dir, 'house'), { recursive: true });
    writeFileSync(path.join(dir, 'house', 'HOUSE.md'), body);
  }

  it('still nags when HOUSE.md has no wallet line', () => {
    const dir = scratch();
    try {
      writeHouse(dir, '# House\n\n## Owner\nAda.\n');
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('pass');
      expect(report.house.scope?.wallet).toBe('on');
      const text = formatDoctor(report as { ok: boolean; next: string[] });
      expect(text).toMatch(/OWS pay: miss/);
      expect(text).toMatch(/OWS missing/);
      expect(text).toMatch(/npx groover-hangar/);
      expect(text).toMatch(/Clearing:/);
      expect(text).toMatch(/ZigZag/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips wallet steps when the line is wallet off', () => {
    const dir = scratch();
    try {
      writeHouse(dir, '# House\n\n## Owner\nAda.\n\nwallet off\n');
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.scope?.wallet).toBe('off');
      const text = formatDoctor(report as { ok: boolean; next: string[] });
      expect(text).toMatch(/OWS pay: skipped — house Scope wallet off/);
      expect(text).not.toMatch(/OWS pay: miss/);
      expect(text).not.toMatch(/OWS missing/);
      expect(text).not.toMatch(/groover-hangar/);
      expect(text).not.toMatch(/Clearing:/);
      expect(text).not.toMatch(/ZigZag/);
      expect(text).toMatch(/Fasten mill\+inspect/);
      expect(text).toMatch(/Groover register/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts Scope: wallet off and ignores a mid-line mention', () => {
    const dir = scratch();
    try {
      writeHouse(dir, '# House\n\n## Owner\nAda.\n\nScope: wallet off\n');
      const off = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(off.house.scope?.wallet).toBe('off');
      expect(formatDoctor(off as { ok: boolean; next: string[] })).not.toMatch(/groover-hangar/);
      writeHouse(dir, '# House\n\n## Owner\nAda keeps wallet off the table.\n');
      const on = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(on.house.scope?.wallet).toBe('on');
      expect(formatDoctor(on as { ok: boolean; next: string[] })).toMatch(/OWS pay: miss/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips wallet steps even while example lines still fail the house check', () => {
    const dir = scratch();
    try {
      writeHouse(dir, '# House\n\n## Owner\n(example) Ada.\n\nwallet off\n');
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('fail');
      expect(report.house.scope?.wallet).toBe('off');
      const text = formatDoctor(report as { ok: boolean; next: string[] });
      expect(text).toMatch(/unfilled example lines/);
      expect(text).not.toMatch(/groover-hangar/);
      expect(text).toMatch(/OWS pay: skipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
