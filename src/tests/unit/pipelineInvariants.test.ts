/**
 * Phase 8 step 8 — pipeline invariant pin.
 *
 * Fails the build if any of the forbidden patterns reappear in src/.
 * These patterns represent batch pre/post-processing, dead guards, or
 * bypasses of the single-ingress contract that Phase 8 eliminated.
 *
 * If you see this test failing, your change has reintroduced a Phase 8
 * anti-pattern. Don't suppress the test — either remove the offending
 * code or, if the pattern is legitimately needed again, lift the ban
 * with an explicit plan change documented in docs/notes/phase-8-*.md.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../..');
const SELF_FILE = path.resolve(__filename);

interface ForbiddenPattern {
  name: string;
  /** Regex to match against file content. */
  pattern: RegExp;
  /** Files that are allowed to match this pattern. */
  allowedFiles?: string[];
  /** Optional reason shown on failure. */
  reason: string;
}

const FORBIDDEN: ForbiddenPattern[] = [
  {
    name: 'DEC.registerEvents (batch ingress)',
    pattern: /\bregisterEvents\s*\(/,
    reason: 'createSkillEvent is the sole ingress path. Do not reintroduce the batch registerEvents method.',
    allowedFiles: [],
  },
  {
    name: 'DEC.seedControlledOperator',
    pattern: /\bseedControlledOperator\b/,
    reason: 'Controlled-operator seed goes through parser/buildControlSeed + createSkillEvent at the call site.',
    allowedFiles: [],
  },
  {
    name: 'extendedIds / markExtended',
    pattern: /\b(extendedIds|markExtended)\b/,
    reason: 'extendSingleEvent is idempotent via rawSegmentDurations; no double-extension guard needed.',
    allowedFiles: [],
  },
  {
    name: 'cloneAndSplitEvents as external API',
    pattern: /\bcloneAndSplitEvents\b/,
    reason: 'cloneAndSplitEvents is parser-internal. External callers should go through the parser barrel.',
    allowedFiles: [
      'controller/timeline/parser/index.ts',
      'controller/timeline/parser/cloneAndSplit.ts',
      'controller/timeline/eventQueueController.ts',
      'controller/timeline/inputEventController.ts',
    ],
  },
  {
    name: 'deriveComboActivationWindows',
    pattern: /\bderiveComboActivationWindows\b/,
    reason: 'Combo window derivation is reactive via DEC.openComboWindow. The batch derive was removed in 6e.',
    allowedFiles: [],
  },
  {
    name: 'resolveComboTriggerColumns (orphan)',
    pattern: /\bresolveComboTriggerColumns\b/,
    reason: 'Orphan pure function superseded by DEC.resolveComboTriggersInline + openComboWindow reactive path.',
    allowedFiles: [],
  },
  {
    name: '_statusConfigCache / clearStatusDefCache',
    pattern: /\b_statusConfigCache|clearStatusDefCache\b/,
    reason: 'Status def caches should be consolidated into a single build-time cache.',
    allowedFiles: [],
  },
];

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, out);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

describe('Phase 8 pipeline invariants', () => {
  const allFiles: string[] = [];
  walk(SRC_DIR, allFiles);

  for (const { name, pattern, allowedFiles = [], reason } of FORBIDDEN) {
    test(`no matches for: ${name}`, () => {
      const offenders: { file: string; line: number; text: string }[] = [];
      for (const file of allFiles) {
        // Skip this test file itself
        if (file === SELF_FILE) continue;
        // Skip allowed files
        const rel = path.relative(SRC_DIR, file).replace(/\\/g, '/');
        if (allowedFiles.some(af => rel === af || rel.endsWith('/' + af))) continue;
        // Skip test files — they may mention forbidden names in comments or
        // legacy assertions that validate deletions.
        if (rel.includes('/tests/') || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;

        // Strip block comments (/* ... */ and /** ... */) globally first,
        // then strip line comments per line. This avoids false positives
        // from stale JSDoc references to deleted methods.
        const raw = fs.readFileSync(file, 'utf8');
        const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, match =>
          match.replace(/[^\n]/g, ' '),
        );
        const lines = stripped.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const codeOnly = lines[i].replace(/\/\/.*$/, '');
          if (pattern.test(codeOnly)) {
            offenders.push({ file: rel, line: i + 1, text: lines[i].trim() });
          }
        }
      }
      if (offenders.length > 0) {
        const detail = offenders.map(o => `  ${o.file}:${o.line}  ${o.text}`).join('\n');
        throw new Error(`Forbidden pattern "${name}" reappeared:\n${detail}\n\n${reason}`);
      }
    });
  }
});
