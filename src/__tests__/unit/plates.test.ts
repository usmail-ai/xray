import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listPackedPathsDryRun } from '../../../scripts/foundry/assert-packed-dist-cli.mjs';
import {
  PLATE_IDS,
  loadPlate,
  plateStockLine,
  recallPlate,
  stampPlateIfMissing,
  type PlateId,
} from '../../memory-routing/plates.js';

const BOX = /[┌┐└┘│─]/;

describe('pipeline plates', () => {
  it('resolves every plate as a box schematic', () => {
    expect(PLATE_IDS).toEqual([
      'routing',
      'governance',
      'boot',
      'orchestration',
      'processor',
      'reporting',
      'memory-recall',
      'stamp-plate',
      'house',
      'review',
      'goggles',
      'suit',
      'kits',
      'host-pack',
      'glossary',
      'record-map',
      'write-home',
      'activity-log',
      'session-capture',
      'suit-wear',
      'suit-organs',
      'station-card',
      'notes-page',
      'reflection-page',
      'site-manual',
      'package-face',
      'suit-settings',
      'trail-state',
      'inference-files',
      'grok-compact',
      'payload-heat',
      'station-heat',
      'pickup-stamp',
      'cursor-compact',
      'work-fresh',
      'kept-line',
      'lens-gate',
      'pre-tool',
      'lens-page',
      'centrifuge',
    ]);
    for (const id of PLATE_IDS) {
      const plate = loadPlate(id);
      expect(plate.id).toBe(id);
      expect(plate.body).toMatch(BOX);
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(readFileSync(plate.sourcePath, 'utf8'))?.[1] ?? '';
      const plateType = /^plate_type:\s*(.+?)\s*$/m.exec(frontmatter)?.[1] ?? '';
      if (plateType !== 'state flow' && plateType !== 'domain model') {
        expect(plate.body).toContain('INPUT');
        expect(plate.body).toContain('OUTPUT');
      }
    }
  });

  it('recalls the processor plate from pre-processor speech and nothing from unrelated text', () => {
    expect(recallPlate('execute pre processors')?.id).toBe('processor');
    expect(recallPlate('grok-bot house init')?.id).toBe('house');
    expect(recallPlate('survive the cut')).toBeNull();
    expect(recallPlate('unrelated bakery order')).toBeNull();
    expect(recallPlate('')).toBeNull();
    expect(recallPlate(null)).toBeNull();
    expect(recallPlate('routing orchestration')).toBeNull();
    expect(plateStockLine('execute pre processors')).toBe(
      'Plate: processor — .xray/state/plates/processor.md',
    );
    expect(plateStockLine('open the boot plane')).toBe(
      'Plate: boot — .xray/state/plates/boot.md File: src/core/boot-orchestrator.ts',
    );
    expect(plateStockLine('survive the cut')).toBeNull();
  });

  it('does not recall house from a bare house word or when other plates tie', () => {
    expect(recallPlate('in-house tooling review')).toBeNull();
    expect(recallPlate('review plate')?.id).toBe('review');
    expect(recallPlate('critic FAIL on the head')?.id).toBe('review');
    expect(recallPlate('re-review that head')?.id).toBe('review');
    expect(recallPlate('house processor boot')?.id).not.toBe('house');
  });

  it('stamps a missing worn plate and leaves an edited copy in place', () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-plates-'));
    try {
      const id: PlateId = 'memory-recall';
      const first = stampPlateIfMissing(root, id);
      expect(first.written).toBe(true);
      expect(first.path).toBe(join(root, '.xray', 'state', 'plates', 'memory-recall.md'));
      const stamped = readFileSync(first.path, 'utf8');
      expect(stamped).toMatch(BOX);
      expect(stamped).toContain('INPUT');
      expect(stamped).toContain('stampPlateIfMissing');
      writeFileSync(first.path, 'worn edit stays\n');
      const second = stampPlateIfMissing(root, id);
      expect(second.written).toBe(false);
      expect(second.path).toBe(first.path);
      expect(readFileSync(first.path, 'utf8')).toBe('worn edit stays\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves memory-recall and processor from the installed package layout', () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-worn-plates-'));
    try {
      const hookDir = join(root, 'dist', 'integrations', 'hooks');
      mkdirSync(hookDir, { recursive: true });
      cpSync(join(process.cwd(), 'src/integrations/hooks/plates.cjs'), join(hookDir, 'plates.cjs'));
      cpSync(join(process.cwd(), 'docs-site/docs/plates'), join(root, 'docs-site', 'docs', 'plates'), {
        recursive: true,
      });
      const require = createRequire(join(hookDir, 'plates.cjs'));
      const runtime = require('./plates.cjs') as {
        loadPlate: (id: string) => { id: string; body: string };
        plateStockLine: (intent: string) => string | null;
      };
      const memory = runtime.loadPlate('memory-recall');
      const processor = runtime.loadPlate('processor');
      expect(memory.id).toBe('memory-recall');
      expect(memory.body).toContain('INPUT');
      expect(memory.body).toContain('stampPlateIfMissing');
      expect(processor.id).toBe('processor');
      expect(processor.body).toContain('INPUT');
      expect(runtime.plateStockLine('execute pre processors')).toBe(
        'Plate: processor — .xray/state/plates/processor.md',
      );
      expect(runtime.plateStockLine('recall a plate')).toBe(
        'Plate: memory-recall — .xray/state/plates/memory-recall.md',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('packs memory-recall and processor where the worn reader walks', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      files?: string[];
    };
    expect(pkg.files).toContain('docs-site/docs/plates/');
    const paths = listPackedPathsDryRun(process.cwd());
    expect(paths).toContain('docs-site/docs/plates/memory-recall.md');
    expect(paths).toContain('docs-site/docs/plates/processor.md');
    expect(paths).toContain('docs-site/docs/plates/index.md');
    expect(paths).toContain('docs-site/docs/plates/goggles.md');
    expect(paths).toContain('docs-site/docs/plates/suit.md');
    expect(paths).toContain('docs-site/docs/plates/kits.md');
    expect(paths).toContain('docs-site/docs/plates/host-pack.md');
    expect(paths).toContain('docs-site/docs/plates/glossary.md');
  }, 120000);

  it('recalls a plate by its name and does not recall kind names', () => {
    expect(recallPlate('open the goggles')?.id).toBe('goggles');
    expect(recallPlate('suit plate')?.id).toBe('suit');
    expect(recallPlate('kits')?.id).toBe('kits');
    expect(recallPlate('host pack')?.id).toBe('host-pack');
    expect(recallPlate('open the glossary')?.id).toBe('glossary');

    expect(recallPlate('record map')?.id).toBe('record-map');
    expect(recallPlate('write home')?.id).toBe('write-home');
    expect(recallPlate('activity log pipeline')?.id).toBe('activity-log');
    expect(recallPlate('session capture')?.id).toBe('session-capture');
    expect(recallPlate('suit wear')?.id).toBe('suit-wear');
    expect(recallPlate('suit organs')?.id).toBe('suit-organs');
    expect(recallPlate('station card')?.id).toBe('station-card');
    expect(recallPlate('notes page')?.id).toBe('notes-page');
    expect(recallPlate('reflection page')?.id).toBe('reflection-page');
    expect(recallPlate('site manual')?.id).toBe('site-manual');
    expect(recallPlate('package face')?.id).toBe('package-face');
    expect(recallPlate('suit settings')?.id).toBe('suit-settings');
    expect(recallPlate('trail state')?.id).toBe('trail-state');
    expect(recallPlate('inference files')?.id).toBe('inference-files');
    expect(recallPlate('grok compact')?.id).toBe('grok-compact');
    expect(recallPlate('payload heat')?.id).toBe('payload-heat');
    expect(recallPlate('station heat')?.id).toBe('station-heat');
    expect(recallPlate('pickup stamp')?.id).toBe('pickup-stamp');
    expect(recallPlate('cursor compact')?.id).toBe('cursor-compact');
    expect(recallPlate('work fresh')?.id).toBe('work-fresh');
    expect(recallPlate('kept line')?.id).toBe('kept-line');
    expect(recallPlate('lens gate')?.id).toBe('lens-gate');
    expect(recallPlate('pre tool')?.id).toBe('pre-tool');
    expect(recallPlate('lens page')?.id).toBe('lens-page');
    expect(recallPlate('centrifuge plate')?.id).toBe('centrifuge');
    expect(recallPlate('in-house tooling review')).toBeNull();
    expect(recallPlate('house init')?.id).toBe('house');
    expect(recallPlate('what is actuality')).toBeNull();
    expect(recallPlate('outer plane')).toBeNull();
    expect(recallPlate('kind 0')).toBeNull();
    expect(recallPlate('wear the suit')).toBeNull();
    expect(recallPlate('stamp plate')?.id).toBe('stamp-plate');
    expect(recallPlate('in-house tooling review')).toBeNull();
    const goggles = loadPlate('goggles');
    expect(goggles.body).toContain('it views one plane');
    expect(goggles.body).not.toMatch(/ACTUALITY|DICHOTOMY|SYNCOPATE|OUTER PLANES/);
    expect(goggles.body).not.toMatch(/kind\s*[01]|Kind\s*[01]/);
    expect(goggles.body).not.toContain('one of four powers');
    const grokbot = readFileSync(join(process.cwd(), 'docs-site/docs/plates/grokbot.md'), 'utf8');
    expect(grokbot).not.toContain('Grok-Bot Kit');
    const lexicon = readFileSync(join(process.cwd(), 'grok-bot/ops/dist/brand/LEXICON.md'), 'utf8');
    expect(lexicon).not.toMatch(/Kind 0|Kind 1/);
    expect(lexicon).not.toContain('## Goggles (2026-09-29)');
    const stamps = readFileSync(join(process.cwd(), 'grok-bot/ops/dist/brand/STAMPS.md'), 'utf8');
    expect(stamps).not.toMatch(/Kind 0|Kind 1/);
    expect(stamps).not.toContain('**Host Pack**');
    const op = readFileSync(join(process.cwd(), 'grok-bot/OP-PROC.md'), 'utf8').split('\n');
    const opLines = op.at(-1) === '' ? op.length - 1 : op.length;
    expect(opLines).toBeLessThanOrEqual(50);
    const npmRow = op.find((line) => line.startsWith('| npm |')) ?? '';
    const opBody = op.filter((line) => !line.startsWith('| npm |')).join('\n');
    expect(npmRow).toMatch(/gate jargon \(Kind 0,/);
    expect(opBody).not.toMatch(/Kind 0|outer plane/i);
    expect(op.join('\n')).not.toMatch(/outer plane/i);
  });
});
