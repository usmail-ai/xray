import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bin = path.join(root, 'grok-bot', 'bin', 'grok-bot.js');
const {
  diagnoseSeat,
  formatDoctor,
  parseDoctorArgs,
  runDoctorCli,
  PLANT_URLS,
} = requireCjs(path.join(root, 'grok-bot', 'lib', 'seat-doctor.cjs')) as {
  diagnoseSeat: (opts?: { cwd?: string; home?: string; env?: Record<string, string> }) => {
    ok: boolean;
    cwd: string;
    seat: { name: string | null; version: string | null } | null;
    plant: {
      ok: boolean;
      installed: boolean;
      deadHooks: Array<{ file: string; path: string }>;
      mill: boolean;
      inspect: boolean;
      millFile: string | null;
      inspectFile: string | null;
      costume: boolean;
      inventoryPresent: boolean;
      suit: string | null;
    };
    repertoire: { status: string; detail?: string; name?: string; version?: string; signals?: number | null };
    ows: { present: boolean; path: string };
    house: {
      status: string;
      detail: string;
      file: string | null;
      via: string | null;
      missing?: string;
      warnings?: string[];
    };
    next: string[];
    urls: { clearing: string };
  };
  formatDoctor: (report: { ok: boolean; next: string[] } & Record<string, unknown>) => string;
  parseDoctorArgs: (argv: string[]) => {
    command: string | null;
    cwd: string | null;
    home: string | null;
    json: boolean;
  };
  runDoctorCli: (
    argv: string[],
    io?: { stdout?: { write: (s: string) => void }; stderr?: { write: (s: string) => void }; kitRoot?: string },
  ) => number;
  PLANT_URLS: { clearing: string; clearingRail: string; suitUi: string };
};

function scratch(): string {
  return mkdtempSync(path.join(tmpdir(), 'grok-bot-doctor-'));
}

function writeSeat(dir: string, name = 'forge-suit'): void {
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name, version: '1.0.0', private: true }, null, 2)}\n`,
  );
}

function installXrayPkg(dir: string): void {
  const dest = path.join(dir, 'node_modules', '0xray');
  mkdirSync(dest, { recursive: true });
  writeFileSync(
    path.join(dest, 'package.json'),
    `${JSON.stringify({ name: '0xray', version: '4.0.36' })}\n`,
  );
}

function plantMillInspect(dir: string): void {
  installXrayPkg(dir);
  for (const skill of ['mill', 'inspect']) {
    const dest = path.join(dir, '.opencode', 'skills', skill);
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, 'SKILL.md'), `# ${skill}\n`);
  }
}

function writeHook(dir: string, name: string, command: string): string {
  const dest = path.join(dir, '.grok', 'hooks');
  mkdirSync(dest, { recursive: true });
  const file = path.join(dest, name);
  writeFileSync(
    file,
    `${JSON.stringify({
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command }] }] },
    })}\n`,
  );
  return file;
}

function writeInventory(dir: string): void {
  mkdirSync(path.join(dir, '.xray'), { recursive: true });
  writeFileSync(
    path.join(dir, '.xray', 'foundry-inventory.json'),
    `${JSON.stringify({
      suit: 'fastened',
      dna: 'abc',
      millPlant: { skills: ['mill', 'inspect'] },
    })}\n`,
  );
}

function runBin(args: string[], cwd: string, env?: Record<string, string>) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
}

describe('grok-bot seat doctor — parse', () => {
  it('treats doctor and ready as the same command', () => {
    expect(parseDoctorArgs(['doctor', '--json']).command).toBe('doctor');
    expect(parseDoctorArgs(['ready', '--cwd', '/tmp/seat']).command).toBe('ready');
    expect(parseDoctorArgs(['ready', '--cwd', '/tmp/seat']).cwd).toBe('/tmp/seat');
  });

  it('rejects unknown flags', () => {
    expect(() => parseDoctorArgs(['doctor', '--go'])).toThrow(/unknown flag/);
  });
});

describe('grok-bot seat doctor — diagnose', () => {
  it('fails a directory with no package.json', () => {
    const dir = scratch();
    try {
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.ok).toBe(false);
      expect(report.seat).toBeNull();
      expect(report.plant.mill).toBe(false);
      expect(report.next.join('\n')).toMatch(/npx groover-hangar/);
      expect(report.next.join('\n')).toMatch(/clearing — never xray-clearing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails a seat without mill+inspect and still prints hangar/Clearing next steps', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.ok).toBe(false);
      expect(report.seat?.name).toBe('forge-suit');
      expect(report.plant.ok).toBe(false);
      const text = formatDoctor(report);
      expect(text).toMatch(/Plant: FAIL/);
      expect(text).toContain(PLANT_URLS.clearing);
      expect(text).toMatch(/npx groover-hangar/);
      expect(text).toMatch(/Do not mill-plant Clearing/);
      expect(text).toMatch(/never xray-clearing/);
      expect(text).toMatch(/OWS pay: miss/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when mill+inspect SKILL.md are fastened', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      mkdirSync(path.join(dir, '.ows'));
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.ok).toBe(true);
      expect(report.plant.mill).toBe(true);
      expect(report.plant.inspect).toBe(true);
      expect(report.ows.present).toBe(true);
      expect(report.repertoire.status).toBe('miss');
      expect(formatDoctor(report)).toMatch(/Plant: PASS/);
      expect(formatDoctor(report)).toMatch(/Repertoire: miss/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes from foundry-inventory millPlant even without skill files', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      installXrayPkg(dir);
      writeInventory(dir);
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.ok).toBe(true);
      expect(report.plant.installed).toBe(true);
      expect(report.plant.suit).toBe('fastened');
      expect(report.plant.inventoryPresent).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when inventory has mill+inspect but 0xray is not installed', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      writeInventory(dir);
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.plant.mill).toBe(true);
      expect(report.plant.inspect).toBe(true);
      expect(report.plant.installed).toBe(false);
      expect(report.plant.deadHooks).toEqual([]);
      expect(report.plant.ok).toBe(false);
      expect(report.ok).toBe(false);
      const text = formatDoctor(report);
      expect(text).toMatch(/Plant: FAIL/);
      expect(text).toContain('missing node_modules/0xray/package.json');
      expect(report.next).toContain('npm i 0xray && npx @0xray/foundry inspect --skip-live');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a hook points at a missing file', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      const live = path.join(dir, 'tools', 'live.js');
      mkdirSync(path.dirname(live), { recursive: true });
      writeFileSync(live, '\n');
      const file = writeHook(dir, '0xray.json', `npx node ${live} tools/missing.js`);
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.plant.installed).toBe(true);
      expect(report.plant.ok).toBe(false);
      expect(report.plant.deadHooks).toEqual([{ file, path: path.join(dir, 'tools', 'missing.js') }]);
      const text = formatDoctor(report);
      expect(text).toMatch(/Plant: FAIL/);
      expect(text).toContain(file);
      expect(text).toContain(path.join(dir, 'tools', 'missing.js'));
      const missing = path.join(dir, 'tools', 'missing.js');
      expect(report.next.some((step) => step.includes(file) && step.includes(missing))).toBe(true);
      expect(report.next.some((step) => step.startsWith('npm i 0xray'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not treat an npm scope as a hook file', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      writeHook(dir, '0xray.json', 'npx @0xray/foundry inspect --skip-live');
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.plant.installed).toBe(true);
      expect(report.plant.deadHooks).toEqual([]);
      expect(report.plant.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when 0xray is installed and hook targets exist', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      const live = path.join(dir, 'tools', 'live.js');
      mkdirSync(path.dirname(live), { recursive: true });
      writeFileSync(live, '\n');
      const pkg = path.join(dir, 'node_modules', '0xray');
      writeHook(
        dir,
        '0xray.json',
        `XRAY_AI_PATH=${JSON.stringify(pkg)} npx node ${JSON.stringify(live)} tools/live.js`,
      );
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.plant.installed).toBe(true);
      expect(report.plant.deadHooks).toEqual([]);
      expect(report.plant.ok).toBe(true);
      expect(formatDoctor(report)).toMatch(/Plant: PASS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports repertoire on when the package and signals exist', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      const rep = path.join(dir, 'node_modules', '@0xray', 'repertoire');
      mkdirSync(path.join(rep, 'data'), { recursive: true });
      writeFileSync(
        path.join(rep, 'package.json'),
        `${JSON.stringify({ name: '@0xray/repertoire', version: '0.2.0' })}\n`,
      );
      writeFileSync(
        path.join(rep, 'data', 'curated_signals.json'),
        `${JSON.stringify({ signals: [{ name: 'a' }, { name: 'b' }] })}\n`,
      );
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.repertoire.status).toBe('on');
      expect(report.repertoire.version).toBe('0.2.0');
      expect(report.repertoire.signals).toBe(2);
      expect(formatDoctor(report)).toMatch(/Repertoire: on — @0xray\/repertoire@0.2.0 — 2 signals/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags costume true without treating it as mill plant', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      writeFileSync(path.join(dir, 'foundry.json'), `${JSON.stringify({ costume: true })}\n`);
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.ok).toBe(true);
      expect(report.plant.costume).toBe(true);
      expect(formatDoctor(report)).toMatch(/costume: true/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('grok-bot seat doctor — CLI', () => {
  it('prints usage with no args (exit 0)', () => {
    const r = runBin([], root);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/doctor \| ready/);
    expect(r.stdout).toMatch(/fasten suit/);
  });

  it('ready on a fastened seat exits 0 and prints next steps', () => {
    const dir = scratch();
    try {
      writeSeat(dir, 'critic-suit');
      plantMillInspect(dir);
      const r = runBin(['ready', '--cwd', dir, '--home', dir], dir);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/Plant: PASS/);
      expect(r.stdout).toContain(PLANT_URLS.clearing);
      expect(r.stdout).toMatch(/npx groover-hangar/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('doctor --json on an unfastened seat exits 1', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      const r = runBin(['doctor', '--cwd', dir, '--home', dir, '--json'], dir);
      expect(r.status).toBe(1);
      const report = JSON.parse(r.stdout) as { ok: boolean; next: string[]; urls: { clearing: string } };
      expect(report.ok).toBe(false);
      expect(report.urls.clearing).toBe(PLANT_URLS.clearing);
      expect(report.next.some((s) => s.includes('never xray-clearing'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when house/HOUSE.md is missing and does not fail the plant', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('warn');
      expect(report.house.detail).toBe('house is not enabled here');
      expect(report.ok).toBe(true);
      expect(formatDoctor(report)).toMatch(/House: WARN — house is not enabled here/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails the house check when house/EXAMPLE.md is still present', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      mkdirSync(path.join(dir, 'house'));
      writeFileSync(path.join(dir, 'house', 'HOUSE.md'), '# House\n\n## Owner\nAda.\n');
      writeFileSync(path.join(dir, 'house', 'EXAMPLE.md'), 'Example house (names are illustrative)\n');
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('fail');
      expect(report.ok).toBe(false);
      expect(report.house.detail).toMatch(/house\/EXAMPLE\.md exists — delete it/);
      expect(formatDoctor(report)).toMatch(/House: FAIL — .+ — house\/EXAMPLE\.md exists — delete it/);
      const r = runBin(['doctor', '--cwd', dir, '--home', dir], dir);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/delete it/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when HOUSE.md still has unfilled example lines', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      mkdirSync(path.join(dir, 'house'));
      writeFileSync(
        path.join(dir, 'house', 'HOUSE.md'),
        '# House\n\n## Owner\n(example) Ada — the human.\n',
      );
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.house.status).toBe('fail');
      expect(report.ok).toBe(false);
      expect(formatDoctor(report)).toMatch(/House: FAIL — .+\/house\/HOUSE\.md \(via walk-up\) — HOUSE.md still has unfilled example lines/);
      const r = runBin(['doctor', '--cwd', dir, '--home', dir], dir);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/no house\/HOUSE\.md, run setup-house|unfilled example lines/);
      expect(r.stdout).toMatch(/House: FAIL/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when seats are renamed and example lines are gone', () => {
    const dir = scratch();
    try {
      writeSeat(dir, 'anvil-seat');
      plantMillInspect(dir);
      mkdirSync(path.join(dir, 'house'));
      writeFileSync(
        path.join(dir, 'house', 'HOUSE.md'),
        [
          '# House',
          '',
          '## Owner',
          'Ada.',
          '',
          '## Seats',
          '- Coordinator: north. Never deploys, publishes, or spends.',
          '- Implementer and publisher: anvil.',
          '- Reviewer: lens. Never merges.',
          '- Public-posts specialist: quill. Never invents the words.',
          '- Listings: peg.',
          '- Audio: reed.',
          '',
          '## Public voice',
          '@example',
          '',
          '## Allowed',
          'git push to org/app',
          '',
          '## Ask first',
          'Package publish.',
          '',
          '## Board',
          'house/WAVEBOARD.md and house/ATTENTION_STATE.md',
          '',
        ].join('\n'),
      );
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.house.status).toBe('pass');
      expect(report.ok).toBe(true);
      expect(formatDoctor(report)).toMatch(/House: PASS — .+\/house\/HOUSE\.md \(via walk-up\)/);
      expect(formatDoctor(report)).toMatch(/Seat: anvil-seat@1\.0\.0/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes the house check when example lines are filled in', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      mkdirSync(path.join(dir, 'house'));
      writeFileSync(path.join(dir, 'house', 'HOUSE.md'), '# House\n\n## Owner\nAda.\n');
      const report = diagnoseSeat({ cwd: dir, home: dir });
      expect(report.house.status).toBe('pass');
      expect(report.ok).toBe(true);
      expect(formatDoctor(report)).toMatch(/House: PASS — .+\/house\/HOUSE\.md \(via walk-up\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not fail on a mid-line (example)', () => {
    const dir = scratch();
    try {
      writeSeat(dir);
      plantMillInspect(dir);
      mkdirSync(path.join(dir, 'house'));
      writeFileSync(
        path.join(dir, 'house', 'HOUSE.md'),
        '# House\n\nNames are not an (example) of a seat.\n',
      );
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('pass');
      expect(report.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('house init copies templates into an empty directory', () => {
    const dir = scratch();
    try {
      const r = runBin(['house', 'init', '--dir', dir], dir);
      expect(r.status).toBe(0);
      const house = path.join(dir, 'house');
      const names = readdirSync(house).sort();
      expect(names).toEqual(
        readdirSync(path.join(root, 'grok-bot', 'templates', 'house')).filter((name) => name !== 'EXAMPLE.md').sort(),
      );
      expect(existsSync(path.join(house, 'EXAMPLE.md'))).toBe(false);
      expect(readFileSync(path.join(house, 'HOUSE.md'), 'utf8')).toBe(
        readFileSync(path.join(root, 'grok-bot', 'templates', 'house', 'HOUSE.md'), 'utf8'),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a second house init refuses and leaves files unchanged', () => {
    const dir = scratch();
    try {
      expect(runBin(['house', 'init'], dir).status).toBe(0);
      const houseFile = path.join(dir, 'house', 'HOUSE.md');
      writeFileSync(houseFile, 'filled by owner\n');
      const before = readFileSync(houseFile, 'utf8');
      const again = runBin(['house', 'init'], dir);
      expect(again.status).not.toBe(0);
      expect(again.stdout).toMatch(/refusing to overwrite/);
      expect(readFileSync(houseFile, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('doctor from a nested folder finds the house by walking up', () => {
    const dir = scratch();
    try {
      mkdirSync(path.join(dir, 'house'), { recursive: true });
      writeFileSync(path.join(dir, 'house', 'HOUSE.md'), '# House\n\n## Owner\nAda.\n');
      const nested = path.join(dir, 'a', 'b');
      mkdirSync(nested, { recursive: true });
      const report = diagnoseSeat({ cwd: nested, env: {} });
      expect(report.house.status).toBe('pass');
      expect(report.house.via).toBe('walk-up');
      expect(report.house.file).toBe(path.join(dir, 'house', 'HOUSE.md'));
      expect(formatDoctor(report)).toMatch(/House: PASS — .+ \(via walk-up\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('GROK_BOT_HOUSE finds the house and beats walk-up', () => {
    const walked = scratch();
    const pointed = scratch();
    try {
      mkdirSync(path.join(walked, 'house'), { recursive: true });
      writeFileSync(path.join(walked, 'house', 'HOUSE.md'), '# House\n\nwalked\n');
      mkdirSync(pointed, { recursive: true });
      writeFileSync(path.join(pointed, 'HOUSE.md'), '# House\n\npointed\n');
      const report = diagnoseSeat({
        cwd: walked,
        env: { GROK_BOT_HOUSE: pointed },
      });
      expect(report.house.status).toBe('pass');
      expect(report.house.via).toBe('GROK_BOT_HOUSE');
      expect(report.house.file).toBe(path.join(pointed, 'HOUSE.md'));
      expect(formatDoctor(report)).toContain(
        `House: PASS — house on — ${path.join(pointed, 'HOUSE.md')} (via GROK_BOT_HOUSE)`,
      );
      const missingPath = path.join(pointed, 'nope');
      const missing = diagnoseSeat({
        cwd: walked,
        env: { GROK_BOT_HOUSE: missingPath },
      });
      expect(missing.house.status).toBe('warn');
      expect(missing.house.file).toBeNull();
      expect(missing.house.detail).toBe('house is not enabled here');
      expect(missing.house.missing).toBe(path.resolve(missingPath));
    } finally {
      rmSync(walked, { recursive: true, force: true });
      rmSync(pointed, { recursive: true, force: true });
    }
  });

  it('init from the packed tarball then doctor finds that house', () => {
    const packDir = scratch();
    const app = scratch();
    try {
      const packed = spawnSync('npm', ['pack', '--pack-destination', packDir], {
        cwd: path.join(root, 'grok-bot'),
        encoding: 'utf8',
      });
      expect(packed.status).toBe(0);
      const tgz = readdirSync(packDir).find((name) => name.endsWith('.tgz'));
      expect(tgz).toBeTruthy();
      writeFileSync(path.join(app, 'package.json'), `${JSON.stringify({ name: 'seat-doctor-pack', version: '0.0.0', private: true })}\n`);
      const installEnv: NodeJS.ProcessEnv = {
        ...process.env,
        npm_config_cache: path.join(app, '.npm-cache'),
        npm_config_fund: 'false',
        npm_config_audit: 'false',
        npm_config_update_notifier: 'false',
      };
      for (const key of Object.keys(installEnv)) {
        if (/^npm_/i.test(key) && !['npm_config_cache', 'npm_config_fund', 'npm_config_audit', 'npm_config_update_notifier'].includes(key)) {
          delete installEnv[key];
        }
      }
      const installed = spawnSync('npm', ['install', path.join(packDir, tgz as string), '--no-fund', '--no-audit'], {
        cwd: app,
        encoding: 'utf8',
        env: installEnv,
      });
      expect(installed.status).toBe(0);
      const packedBin = path.join(app, 'node_modules', '@0xray', 'grok-bot', 'bin', 'grok-bot.js');
      expect(existsSync(packedBin)).toBe(true);
      const init = spawnSync(process.execPath, [packedBin, 'house', 'init'], {
        cwd: app,
        encoding: 'utf8',
        env: { ...process.env, GROK_BOT_HOUSE: '' },
      });
      expect(init.status).toBe(0);
      expect(init.stdout).toMatch(/copied templates\/house/);
      expect(existsSync(path.join(app, 'house', 'HOUSE.md'))).toBe(true);
      const nested = path.join(app, 'nested', 'seat');
      mkdirSync(nested, { recursive: true });
      const doctor = spawnSync(process.execPath, [packedBin, 'doctor'], {
        cwd: nested,
        encoding: 'utf8',
        env: { ...process.env, GROK_BOT_HOUSE: '' },
      });
      expect(doctor.stdout).toContain(path.join(app, 'house', 'HOUSE.md'));
      expect(doctor.stdout).toMatch(/\(via walk-up\)/);
    } finally {
      rmSync(packDir, { recursive: true, force: true });
      rmSync(app, { recursive: true, force: true });
    }
  }, 60000);

  it('unknown flag exits 2', () => {
    const chunks: string[] = [];
    const code = runDoctorCli(['doctor', '--mill-go'], {
      stdout: { write: (s: string) => { chunks.push(s); } },
      stderr: { write: (s: string) => { chunks.push(s); } },
      kitRoot: path.join(root, 'grok-bot'),
    });
    expect(code).toBe(2);
    expect(chunks.join('')).toMatch(/unknown flag/);
  });
});

describe('grok-bot seat doctor — cadence warnings', () => {
  function writeHouse(dir: string, body: string): void {
    mkdirSync(path.join(dir, 'house'), { recursive: true });
    writeFileSync(path.join(dir, 'house', 'HOUSE.md'), body);
  }

  function cadenceHouse(dir: string): void {
    writeHouse(
      dir,
      '# House\n\n## Owner\nAda.\n\n## Cadence\nOptional. Delete this section if your house has no code loop.\n',
    );
  }

  function writeLog(dir: string, name: string, body: string): string {
    const file = path.join(dir, 'house', 'watchers', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    return file;
  }

  function freshStamp(): string {
    return new Date().toISOString();
  }

  function freshLogs(dir: string): void {
    const line = `${freshStamp()} quiet\n`;
    writeLog(dir, 'review-sent.log', line);
    writeLog(dir, 'stall-sweep.log', line);
  }

  function writeActivity(dir: string, body: string): string {
    const file = path.join(dir, 'house', 'fleet', 'activity.jsonl');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    return file;
  }

  function goodActivity(dir: string): void {
    writeActivity(
      dir,
      `${JSON.stringify({
        t_ct: freshStamp(),
        seat: 'reviewer',
        kind: 'watcher',
        action: 'end',
        tag: 'pr',
      })}\n`,
    );
  }

  function codexText(count: number, lastUpdated: string): string {
    const terms: Record<string, { number: number }> = {};
    for (let i = 1; i <= count; i += 1) terms[String(i)] = { number: i };
    return `${JSON.stringify({ version: '3.1.0', lastUpdated, terms })}\n`;
  }

  function writeSuitCodex(dir: string, count: number, lastUpdated: string): void {
    mkdirSync(path.join(dir, '.xray'), { recursive: true });
    writeFileSync(path.join(dir, '.xray', 'codex.json'), codexText(count, lastUpdated));
  }

  function writeInstalledCodex(dir: string, count: number, lastUpdated: string): void {
    const dest = path.join(dir, 'node_modules', '0xray', '.xray');
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, 'codex.json'), codexText(count, lastUpdated));
  }

  function planted(dir: string): void {
    writeSeat(dir);
    plantMillInspect(dir);
  }

  function warningsOf(dir: string, env: Record<string, string> = {}): string[] {
    return diagnoseSeat({ cwd: dir, home: dir, env }).house.warnings ?? [];
  }

  it('warns when stall-sweep.log is older than 2h and does not fail the plant', () => {
    const dir = scratch();
    try {
      planted(dir);
      cadenceHouse(dir);
      writeLog(dir, 'review-sent.log', `${freshStamp()} org/app#1 sha=abc action=first-review to=reviewer\n`);
      writeLog(dir, 'stall-sweep.log', '2020-01-01T00:00:00Z quiet\n');
      goodActivity(dir);
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('pass');
      expect(report.ok).toBe(true);
      const warnings = report.house.warnings ?? [];
      expect(warnings.some((line) => line.includes('stall-sweep.log is older than 2h'))).toBe(true);
      expect(warnings.some((line) => line.includes('review-sent.log'))).toBe(false);
      expect(formatDoctor(report)).toMatch(/House: PASS/);
      expect(formatDoctor(report)).toMatch(/House: WARN — stall-sweep\.log is older than 2h/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when a watcher log is missing or its mtime is older than 2h', () => {
    const dir = scratch();
    try {
      cadenceHouse(dir);
      writeLog(dir, 'stall-sweep.log', `${freshStamp()} quiet\n`);
      goodActivity(dir);
      expect(warningsOf(dir).some((line) => line.includes('review-sent.log is missing'))).toBe(true);
      const review = writeLog(dir, 'review-sent.log', '# header only\n');
      const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
      utimesSync(review, old, old);
      expect(warningsOf(dir).some((line) => line.includes('review-sent.log is older than 2h'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('checks the activity log last line and honors BURST_ACTIVITY', () => {
    const dir = scratch();
    try {
      cadenceHouse(dir);
      freshLogs(dir);
      writeActivity(dir, 'free text is not a line\n');
      expect(warningsOf(dir).some((line) => line.includes('activity log last line is not JSON'))).toBe(true);
      writeActivity(dir, `${JSON.stringify({ t_ct: freshStamp(), kind: 'turn', action: 'start' })}\n`);
      expect(warningsOf(dir).some((line) => line.includes('needs t_ct, kind, action, and seat'))).toBe(true);
      const elsewhere = path.join(dir, 'pulses.jsonl');
      writeFileSync(
        elsewhere,
        `${JSON.stringify({ t_ct: freshStamp(), seat: 'reviewer', kind: 'turn', action: 'end', tag: 'note' })}\n`,
      );
      const overridden = warningsOf(dir, { BURST_ACTIVITY: elsewhere });
      expect(overridden.some((line) => line.includes('activity log'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hints migrate when watchers exist and skips cadence checks without a Cadence section', () => {
    const dir = scratch();
    try {
      planted(dir);
      writeHouse(dir, '# House\n\n## Owner\nAda.\n');
      writeLog(dir, 'stall-sweep.log', '2020-01-01T00:00:00Z quiet\n');
      writeSuitCodex(dir, 69, '2026-08-24');
      writeInstalledCodex(dir, 70, '2026-10-01');
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.house.status).toBe('pass');
      expect(report.ok).toBe(true);
      const warnings = report.house.warnings ?? [];
      expect(warnings).toEqual(['HOUSE.md has no Cadence section; grok-bot house init --migrate']);
      expect(formatDoctor(report)).toMatch(/grok-bot house init --migrate/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not hint migrate when the house has no watchers directory', () => {
    const dir = scratch();
    try {
      writeHouse(dir, '# House\n\n## Owner\nAda.\n');
      expect(warningsOf(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when the suit codex term count or lastUpdated differs from node_modules/0xray', () => {
    const dir = scratch();
    try {
      planted(dir);
      cadenceHouse(dir);
      freshLogs(dir);
      goodActivity(dir);
      writeSuitCodex(dir, 69, '2026-08-24');
      writeInstalledCodex(dir, 70, '2026-10-01');
      const report = diagnoseSeat({ cwd: dir, home: dir, env: {} });
      expect(report.ok).toBe(true);
      expect(report.house.status).toBe('pass');
      const warnings = report.house.warnings ?? [];
      expect(warnings.some((line) => line.includes('69 terms') && line.includes('70 terms'))).toBe(true);
      writeSuitCodex(dir, 70, '2026-08-24');
      const dated = warningsOf(dir);
      expect(dated.some((line) => line.includes('2026-08-24') && line.includes('2026-10-01'))).toBe(true);
      writeSuitCodex(dir, 70, '2026-10-01');
      expect(warningsOf(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not warn about codex when node_modules/0xray has no codex', () => {
    const dir = scratch();
    try {
      cadenceHouse(dir);
      freshLogs(dir);
      goodActivity(dir);
      writeSuitCodex(dir, 69, '2026-08-24');
      expect(warningsOf(dir).some((line) => line.includes('codex'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
