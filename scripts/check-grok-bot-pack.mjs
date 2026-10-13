#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repo = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const root = path.join(repo, 'grok-bot');
const raw = execSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8' });
const packed = JSON.parse(raw.slice(raw.indexOf('[')))[0].files.map((file) => file.path);
const packedSet = new Set(packed);
const bad = [];
if (existsSync(path.join(root, 'house'))) bad.push('grok-bot/house exists; fleet SSOT belongs at repo-root house/');
for (const file of packed) {
  if (file === 'house' || file.startsWith('house/')) bad.push(`packed house path: ${file}`);
  if (file === 'POSTED.md' || file.endsWith('/POSTED.md')) bad.push(`packed POSTED.md: ${file}`);
  if (file === 'OP-PROC.md' || file.endsWith('/OP-PROC.md')) {
    const body = readFileSync(path.join(root, file), 'utf8');
    if (body.includes('House: 0xRay Grok Bot fleet')) bad.push(`${file}: fleet OP-PROC leaked into the kit`);
  }
}
const op = readFileSync(path.join(root, 'OP-PROC.md'), 'utf8').split('\n');
const opLines = op.at(-1) === '' ? op.length - 1 : op.length;
if (opLines > 50) bad.push(`grok-bot/OP-PROC.md is ${opLines} lines (max 50)`);
const linkRe = /!?\[[^\]]*\]\(([^)]+)\)/g;
for (const file of packed) {
  if (!file.endsWith('.md')) continue;
  const text = readFileSync(path.join(root, file), 'utf8');
  for (const match of text.matchAll(linkRe)) {
    let href = match[1].trim();
    if (href.startsWith('<') && href.includes('>')) href = href.slice(1, href.indexOf('>'));
    href = href.split(/\s+/)[0];
    if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    href = decodeURI(href.split('#')[0].split('?')[0]);
    if (!href) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), href)).replace(/\/+$/, '');
    const ok = packedSet.has(resolved) || packed.some((entry) => entry.startsWith(`${resolved}/`));
    if (!ok) bad.push(`${file}: relative link ${match[1]} is not a packed file (${resolved})`);
  }
}
if (bad.length) {
  process.stderr.write(`grok-bot pack check failed\n${bad.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`grok-bot pack check passed\nfiles: ${packed.length}\nOP-PROC.md: ${opLines} lines\nhouse/: absent\nPOSTED.md: absent\nrelative links: ok\n`);
