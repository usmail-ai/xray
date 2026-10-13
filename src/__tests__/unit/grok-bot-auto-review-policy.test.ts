import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readKit(rel: string): string {
  return readFileSync(path.join(root, 'grok-bot', rel), 'utf8');
}

describe('grok-bot Auto Review ops pack', () => {
  it('pins the kit version to 0.1.10', () => {
    const pkg = JSON.parse(readKit('package.json')) as { name: string; version: string };
    expect(pkg.name).toBe('@0xray/grok-bot');
    expect(pkg.version).toBe('0.1.10');
  });

  it('locks Ask-first capital rules and Dist/git Allow', () => {
    const policy = readKit('ops/AUTO-REVIEW-POLICY.md');
    expect(policy).toContain('A friend would hear:');
    expect(policy).toMatch(/Publish any package to the npm registry/);
    expect(policy).toMatch(/Railway CLI/);
    expect(policy).toMatch(/USDC/);
    expect(policy).toMatch(/eip3009/);
    expect(policy).toMatch(/registration secrets/);
    expect(policy).toMatch(/A2A/);
    expect(policy).toMatch(/npm view/);
    expect(policy).toMatch(/0xRayAI\/xray/);
    expect(policy).toMatch(/@0xRayAI/);
    expect(policy).not.toMatch(/Always-allow npm publish/);
  });

  it('wires the policy through fleet spec, seats, and catalog', () => {
    expect(readKit('ops/OPS-SPEC.md')).toContain('Capital vs Auto Review');
    expect(readKit('ops/OPS-SPEC.md')).toContain('AUTO-REVIEW-POLICY.md');
    expect(readKit('ops/OPS-SPEC.md')).toContain('Wake hygiene');
    expect(readKit('ops/SEATS.md')).toContain('AUTO-REVIEW-POLICY.md');
    expect(readKit('ops/OPS-CATALOG.md')).toContain('ops/AUTO-REVIEW-POLICY.md');
    expect(readKit('ops/CLOUD-CONTINUITY.md')).toContain('CLOUD-REPO-ACCESS.md');
    expect(readKit('ops/SYNAPTICAL-LANES.md')).toContain('forge 🔥');
    expect(readKit('ops/SYNAPTICAL-LANES.md')).not.toContain('forge 🔨');
  });
});
