#!/usr/bin/env node
/**
 * Public-Fork Security & Privacy Hygiene Gate (`npm run check:hygiene`).
 *
 * Scans tracked and non-ignored source/config/doc/test/glb files before any
 * commit or public push to prevent private Tailscale hostnames, personal
 * webmail addresses, local workstation paths, wildcard CORS, or raw binary
 * execution from leaking.
 *
 * Maintainer-specific blocklists can be provided via an optional excluded
 * overlay file (`scripts/private-hygiene-rules.json` or the path in
 * `GEV_PRIVATE_HYGIENE_RULES`), keeping personal patterns out of public trees.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const NOREPLY_EMAIL_RE = /^[^@\s]+@users\.noreply\.github\.com$/i;

export const DEFAULT_OVERLAY_REL_PATH = 'scripts/private-hygiene-rules.json';

const SELF_SKIP_FILES = new Set([
  'scripts/check-public-hygiene.mjs',
  DEFAULT_OVERLAY_REL_PATH,
  'src/tooling/privateHygieneRules.test.mjs',
]);

const SCAN_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.vue',
  '.css',
  '.html',
  '.md',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.glb',
]);

const EXACT_BASENAMES = new Set([
  '.env.example',
  '_ENVIRONMENT',
  'install.js',
  'start.js',
]);

export const RULES = [
  {
    id: 'tailscale-host',
    message: 'Private Tailscale MagicDNS hostname must never be committed',
    regex: /\.ts\.net\b/i,
  },
  {
    id: 'personal-email',
    message: 'Personal webmail address must never be committed',
    regex: /\b[A-Za-z0-9._%+-]+@(?:msn|hotmail|live|outlook)\.(?:com|net)\b/i,
  },
  {
    id: 'local-workstation-paths',
    message: 'Local workstation user-profile path leaked',
    regex:
      /(?:[A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)(?!(?:runner|docker|ubuntu|user|example|alice|bob|test)\b)[A-Za-z0-9._-]+[\\/]+(?:\.gemini|Documents[\\/]+development)\b/i,
  },
  {
    id: 'provider-wildcard-cors',
    message:
      'Wildcard Access-Control-Allow-Origin is forbidden in server/providers/',
    regex: /['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]/,
    onlyPrefix: 'server/providers/',
  },
  {
    id: 'raw-cli-textbox',
    message:
      'Raw CLI binary / flags textbox is removed for command-execution safety',
    regex: /gev-forge-cli-bin|gev-forge-cli-args/,
    onlyPrefix: 'src/ui/',
  },
  {
    id: 'unvalidated-spawn-binary',
    message: 'Never pass req/body.cliBinary directly into spawn()',
    regex: /\bspawn\s*\(\s*(?:body|req)\./,
    onlyPrefix: 'server/',
  },
];

function compileAllowlistMatcher(allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return null;
  const compiled = allowlist.map((entry) => ({
    file: entry.file || null,
    filePrefix: entry.filePrefix || null,
    contextRe: new RegExp(entry.contextPattern, entry.contextFlags || ''),
  }));
  return (relPath, lines, idx) => {
    const windowText = lines
      .slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 3))
      .join(' ');
    return compiled.some((entry) => {
      const fileMatch = entry.file
        ? relPath === entry.file
        : Boolean(entry.filePrefix && relPath.startsWith(entry.filePrefix));
      return fileMatch && entry.contextRe.test(windowText);
    });
  };
}

export function compileRuleDefinition(rawRule) {
  if (!rawRule || typeof rawRule !== 'object' || !rawRule.id) {
    throw new Error('Invalid hygiene rule definition: missing id');
  }
  const regex =
    rawRule.regex instanceof RegExp
      ? rawRule.regex
      : new RegExp(rawRule.pattern, rawRule.flags || '');
  const filenameRegex =
    rawRule.filenameRegex instanceof RegExp
      ? rawRule.filenameRegex
      : rawRule.filenamePattern
        ? new RegExp(rawRule.filenamePattern, rawRule.filenameFlags || '')
        : undefined;
  const ignoreLine =
    typeof rawRule.ignoreLine === 'function'
      ? rawRule.ignoreLine
      : compileAllowlistMatcher(rawRule.allowlist);

  return {
    id: String(rawRule.id),
    message: String(rawRule.message || `Hygiene rule '${rawRule.id}' failed`),
    regex,
    ...(filenameRegex ? { filenameRegex } : {}),
    ...(rawRule.onlyPrefix ? { onlyPrefix: String(rawRule.onlyPrefix) } : {}),
    ...(Array.isArray(rawRule.excludePrefixes)
      ? { excludePrefixes: rawRule.excludePrefixes.map(String) }
      : {}),
    ...(rawRule.allowFiles ? { allowFiles: new Set(rawRule.allowFiles) } : {}),
    ...(ignoreLine ? { ignoreLine } : {}),
  };
}

export function loadOverlayRules(
  root = ROOT,
  { overlayPath = process.env.GEV_PRIVATE_HYGIENE_RULES || '' } = {},
) {
  const candidatePath = overlayPath
    ? path.resolve(overlayPath)
    : path.join(root, DEFAULT_OVERLAY_REL_PATH);
  if (!fs.existsSync(candidatePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Hygiene overlay file must export a JSON array: ${candidatePath}`,
    );
  }
  return parsed.map(compileRuleDefinition);
}

export function collectCandidateFiles(root = ROOT) {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  );
  return out
    .split('\0')
    .map((f) => f.replace(/\\/g, '/').trim())
    .filter((f) => {
      if (!f) return false;
      if (SELF_SKIP_FILES.has(f)) return false;
      const ext = path.extname(f).toLowerCase();
      const base = path.basename(f);
      return SCAN_EXTENSIONS.has(ext) || EXACT_BASENAMES.has(base);
    });
}

function readHygieneText(absPath, relPath) {
  if (!relPath.toLowerCase().endsWith('.glb')) {
    return fs.readFileSync(absPath, 'utf8');
  }
  const buf = fs.readFileSync(absPath);
  if (
    buf.length < 20 ||
    buf.readUInt32LE(0) !== 0x46546c67 ||
    buf.readUInt32LE(16) !== 0x4e4f534a
  ) {
    return '';
  }
  const jsonLen = buf.readUInt32LE(12);
  if (20 + jsonLen > buf.length) return '';
  return buf.subarray(20, 20 + jsonLen).toString('utf8');
}

export function scanFiles(
  root = ROOT,
  { extraRules = [], includeOverlay = true, overlayPath = '' } = {},
) {
  const files = collectCandidateFiles(root);
  const activeRules = [
    ...RULES,
    ...(includeOverlay ? loadOverlayRules(root, { overlayPath }) : []),
    ...extraRules.map(compileRuleDefinition),
  ];
  const violations = [];

  for (const relPath of files) {
    for (const rule of activeRules) {
      if (rule.onlyPrefix && !relPath.startsWith(rule.onlyPrefix)) continue;
      if (rule.excludePrefixes?.some((prefix) => relPath.startsWith(prefix))) {
        continue;
      }
      if (rule.allowFiles?.has(relPath)) continue;
      if (rule.filenameRegex && rule.filenameRegex.test(relPath)) {
        violations.push({
          rule: rule.id,
          file: relPath,
          line: 0,
          message: rule.message,
          snippet: `[filename] ${relPath}`,
        });
      }
    }

    const absPath = path.join(root, relPath);
    let content;
    try {
      content = readHygieneText(absPath, relPath);
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (const rule of activeRules) {
      if (rule.onlyPrefix && !relPath.startsWith(rule.onlyPrefix)) continue;
      if (rule.excludePrefixes?.some((prefix) => relPath.startsWith(prefix))) {
        continue;
      }
      if (rule.allowFiles?.has(relPath)) continue;

      for (let idx = 0; idx < lines.length; idx++) {
        if (rule.regex.test(lines[idx])) {
          if (rule.ignoreLine?.(relPath, lines, idx)) continue;
          violations.push({
            rule: rule.id,
            file: relPath,
            line: idx + 1,
            message: rule.message,
            snippet: lines[idx].trim().slice(0, 140),
          });
        }
      }
    }
  }

  return {
    scannedCount: files.length,
    activeRuleCount: activeRules.length,
    violations,
  };
}

/**
 * Verifies every commit in `commitRange` (or targetRef when baseRef is given)
 * uses a GitHub noreply email for both author and committer.
 */
export function verifyGitCommitAuthors(
  root = ROOT,
  commitRange = 'HEAD',
  { baseRef = '' } = {},
) {
  const revRange = baseRef ? `${baseRef}..${commitRange}` : commitRange;
  const raw = execFileSync(
    'git',
    ['--no-pager', 'log', '--format=%H%x09%ae%x09%ce%x09%s', revRange],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  const commits = raw
    ? raw.split(/\r?\n/).map((line) => {
        const [sha, authorEmail, committerEmail, ...subjectParts] =
          line.split('\t');
        return {
          sha,
          authorEmail,
          committerEmail,
          subject: subjectParts.join('\t'),
        };
      })
    : [];
  const violations = [];
  for (const commit of commits) {
    if (!NOREPLY_EMAIL_RE.test(commit.authorEmail || '')) {
      violations.push({
        sha: commit.sha,
        field: 'authorEmail',
        email: commit.authorEmail,
        subject: commit.subject,
      });
    }
    if (!NOREPLY_EMAIL_RE.test(commit.committerEmail || '')) {
      violations.push({
        sha: commit.sha,
        field: 'committerEmail',
        email: commit.committerEmail,
        subject: commit.subject,
      });
    }
  }
  return { checkedCount: commits.length, violations };
}

function parseCliArgs(argv) {
  const opts = { verifyAuthorRange: '', baseRef: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--verify-authors' && argv[i + 1]) {
      opts.verifyAuthorRange = argv[++i];
    } else if (arg === '--base' && argv[i + 1]) {
      opts.baseRef = argv[++i];
    }
  }
  return opts;
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const cli = parseCliArgs(process.argv.slice(2));
  const { scannedCount, activeRuleCount, violations } = scanFiles(ROOT);
  if (violations.length > 0) {
    console.error(
      `[check:hygiene] FAILED (${violations.length} violation(s) across ${scannedCount} files, ${activeRuleCount} rules):`,
    );
    for (const v of violations) {
      console.error(
        `  - ${v.file}:${v.line} [${v.rule}] ${v.message}\n      ${v.snippet}`,
      );
    }
    process.exit(1);
  }

  if (cli.verifyAuthorRange) {
    const authorResult = verifyGitCommitAuthors(ROOT, cli.verifyAuthorRange, {
      baseRef: cli.baseRef,
    });
    if (authorResult.violations.length > 0) {
      console.error(
        `[check:hygiene] FAILED (${authorResult.violations.length} non-noreply commit email(s) in ${cli.baseRef ? `${cli.baseRef}..` : ''}${cli.verifyAuthorRange}):`,
      );
      for (const v of authorResult.violations) {
        console.error(
          `  - ${v.sha.slice(0, 9)} ${v.field}=${v.email} (${v.subject})`,
        );
      }
      process.exit(1);
    }
    console.log(
      `[check:hygiene] OK — ${scannedCount} files (${activeRuleCount} rules) + ${authorResult.checkedCount} commit(s) passed public fork hygiene checks.`,
    );
  } else {
    console.log(
      `[check:hygiene] OK — ${scannedCount} tracked/staged files (${activeRuleCount} rules) passed public fork hygiene checks.`,
    );
  }
}
