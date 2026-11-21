#!/usr/bin/env node
/**
 * Deterministic OSS & Sovereign Invariant Gate (`npm run check:oss`).
 *
 * Single verification entry point for both local Dev Forge self-modification
 * and public-fork synchronization. Fails closed on the first broken invariant:
 *   1. Public privacy & security hygiene (`check-public-hygiene.mjs`)
 *   2. Import directions & package boundaries
 *   3. i18n catalog completeness across all locales (`i18n.mjs`)
 *   4. Earth Sim Feature Catalog, overlay & Material Symbols contracts
 *   5. Code formatting (`format.mjs --check`, unless `--skip-format`)
 *   6. Optional `--full`: entire unit test suite + Vite production build
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function buildInvariantSteps({
  cwd = DEFAULT_ROOT,
  skipFormat = false,
  full = false,
} = {}) {
  const rel = (...parts) => path.join(cwd, ...parts);
  const steps = [
    {
      id: 'hygiene',
      label: 'Public fork security & privacy hygiene',
      command: process.execPath,
      args: [rel('scripts', 'check-public-hygiene.mjs')],
    },
    {
      id: 'import-directions',
      label: 'Import direction rules',
      command: process.execPath,
      args: [rel('scripts', 'check-import-directions.mjs')],
    },
    {
      id: 'package-boundaries',
      label: 'Package boundary ownership',
      command: process.execPath,
      args: [rel('scripts', 'check-package-boundaries.mjs')],
    },
    {
      id: 'i18n',
      label: 'i18n catalog completeness',
      command: process.execPath,
      args: [rel('scripts', 'i18n.mjs')],
    },
    {
      id: 'contracts',
      label: 'Earth Sim catalog, overlay & Material Symbols contracts',
      command: process.execPath,
      args: [
        '--test',
        rel('src', 'ui', 'earthSimFeatureCatalog.test.mjs'),
        rel('src', 'ui', 'earthSimTourOverlay.test.mjs'),
        rel('src', 'materialSymbolsSubset.test.mjs'),
      ],
    },
  ];

  if (!skipFormat) {
    steps.push({
      id: 'format',
      label: 'Adopted Prettier formatting check',
      command: process.execPath,
      args: [rel('scripts', 'format.mjs'), '--check'],
    });
  }

  if (full) {
    steps.push({
      id: 'unit-tests',
      label: 'Full unit test suite',
      command: process.execPath,
      args: [rel('scripts', 'run-unit-tests.mjs')],
    });
    steps.push({
      id: 'build',
      label: 'Production Vite build',
      command: process.execPath,
      args: [rel('node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    });
  }

  return steps;
}

export function runOssInvariants({
  cwd = DEFAULT_ROOT,
  skipFormat = false,
  full = false,
  quiet = false,
  runStepImpl = null,
} = {}) {
  const steps = buildInvariantSteps({ cwd, skipFormat, full });
  const results = [];

  for (const step of steps) {
    if (!quiet) {
      console.log(`[check:oss] -> ${step.label}`);
    }
    const execResult = runStepImpl
      ? runStepImpl(step, { cwd })
      : spawnSync(step.command, step.args, {
          cwd,
          encoding: 'utf8',
          stdio: quiet ? 'pipe' : 'inherit',
          windowsHide: true,
        });

    const status = execResult?.status ?? execResult?.exitCode ?? 1;
    const ok = status === 0;
    const output = [execResult?.stdout, execResult?.stderr]
      .filter(Boolean)
      .join('\n')
      .trim();

    results.push({ id: step.id, label: step.label, ok, status, output });
    if (!ok) {
      return {
        ok: false,
        failedStep: step.id,
        failedLabel: step.label,
        output,
        results,
      };
    }
  }

  return { ok: true, failedStep: null, failedLabel: null, output: '', results };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    cwd: DEFAULT_ROOT,
    skipFormat: false,
    full: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--skip-format') opts.skipFormat = true;
    else if (token === '--full') opts.full = true;
    else if (token === '--json') opts.json = true;
    else if (token === '--cwd' && argv[i + 1]) {
      opts.cwd = path.resolve(argv[++i]);
    }
  }
  return opts;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const opts = parseCliArgs();
  const report = runOssInvariants({
    cwd: opts.cwd,
    skipFormat: opts.skipFormat,
    full: opts.full,
    quiet: opts.json,
  });

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(
      `[check:oss] OK — ${report.results.length} invariant checks passed.`,
    );
  } else {
    console.error(
      `[check:oss] FAILED at '${report.failedStep}' (${report.failedLabel}).`,
    );
  }

  process.exit(report.ok ? 0 : 1);
}
