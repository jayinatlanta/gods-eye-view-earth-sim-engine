#!/usr/bin/env node
/**
 * Deterministic 3-Repo Public Fork Sync Tool (`npm run oss:sync`).
 *
 * Prevents accidental `git merge origin/main` history leakage when exporting
 * features from a private fork (`main`) to a public release branch
 * (`oss/public-earth-sim` -> `public:main`).
 *
 * Guarantees:
 *   1. Refuses to base a public commit on any ref whose history contains
 *      pre-sanitization private baseline commits.
 *   2. Refuses `--push` to `bilawalsidhu/gods-eye-view`, `upstream`, or `origin`.
 *   3. Runs `check-oss-invariants` (plus `--full` unit/build gate if requested)
 *      before advancing the public branch or pushing.
 *   4. Strips any paths listed in `scripts/oss-exclude.json` via an isolated
 *      temporary index file without touching your working tree.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runOssInvariants } from './check-oss-invariants.mjs';

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const FORBIDDEN_PRIVATE_ANCESTORS = Object.freeze([
  // Last pre-sanitization private baseline commits whose ancestry must never reach the public fork.
  'f4219ccc476a3dac4d4930b296f3bbff51208ce1',
  'efbf77c2fc5ab375c4ab1876f7adf519015d5fb4',
  '7d1f7c2d2381b7498cde2e9fe1a4e4bb47505509',
  'e6a5040bcb9eead6748f51737546a8885b53d77b',
  '2222658682805f082db1f819549c67fa5c9cadcb',
]);

export const FORBIDDEN_PUSH_URL_PATTERNS = Object.freeze([
  /bilawalsidhu\/gods-eye-view/i,
]);

export const DEFAULT_TARGET_BRANCH = 'oss/public-earth-sim';
export const DEFAULT_PUBLIC_REMOTE = 'public';

function runGit(
  cwd,
  args,
  { env = process.env, allowFail = false, input } = {},
) {
  try {
    return execFileSync('git', args, {
      cwd,
      env,
      input,
      encoding: 'utf8',
      stdio: [input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (allowFail) return null;
    const detail = String(error?.stderr || error?.message || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

export function loadOssExcludeList(
  excludeFile = path.join(DEFAULT_ROOT, 'scripts', 'oss-exclude.json'),
) {
  if (!fs.existsSync(excludeFile)) return [];
  const parsed = JSON.parse(fs.readFileSync(excludeFile, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('scripts/oss-exclude.json must be a JSON array of paths');
  }
  return parsed.map((entry) => {
    const clean = String(entry || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (!clean || clean.includes('..') || path.isAbsolute(clean)) {
      throw new Error(`Invalid oss-exclude entry: ${entry}`);
    }
    return clean;
  });
}

export function assertSafePublicRemoteUrl(
  url,
  { remoteName = DEFAULT_PUBLIC_REMOTE, originUrl = '', upstreamUrl = '' } = {},
) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) {
    throw new Error('Public remote URL is empty.');
  }
  if (remoteName === 'origin' || remoteName === 'upstream') {
    throw new Error(
      `Refusing to push public export branch to protected remote name '${remoteName}'. Use a dedicated 'public' remote.`,
    );
  }
  const normalizedTarget = cleanUrl.replace(/\.git$/i, '').toLowerCase();
  for (const reserved of [originUrl, upstreamUrl]) {
    const cleanReserved = String(reserved || '')
      .trim()
      .replace(/\.git$/i, '')
      .toLowerCase();
    if (cleanReserved && normalizedTarget === cleanReserved) {
      throw new Error(
        `Refusing to push public export branch to protected remote URL (${cleanUrl}).`,
      );
    }
  }
  for (const pattern of FORBIDDEN_PUSH_URL_PATTERNS) {
    if (pattern.test(cleanUrl)) {
      throw new Error(
        `Refusing to push public export branch to protected remote (${cleanUrl}). Configure dedicated 'public' remote first.`,
      );
    }
  }
  return cleanUrl;
}

export function resolvePublicBaseRef({
  cwd = DEFAULT_ROOT,
  explicitBaseRef = null,
  targetBranch = DEFAULT_TARGET_BRANCH,
  publicRemote = DEFAULT_PUBLIC_REMOTE,
  gitRunner = runGit,
} = {}) {
  const candidates = explicitBaseRef
    ? [explicitBaseRef]
    : [
        `refs/remotes/${publicRemote}/main`,
        `refs/heads/${targetBranch}`,
        'refs/remotes/upstream/main',
        'upstream/main',
      ];

  for (const ref of candidates) {
    const sha = gitRunner(cwd, ['rev-parse', '--verify', `${ref}^{commit}`], {
      allowFail: true,
    });
    if (sha) return { ref, sha };
  }

  throw new Error(
    `Could not resolve clean public base ref (tried: ${candidates.join(', ')}).`,
  );
}

export function assertCleanPublicAncestry({
  cwd = DEFAULT_ROOT,
  baseRef,
  forbiddenAncestors = FORBIDDEN_PRIVATE_ANCESTORS,
  gitRunner = runGit,
} = {}) {
  const baseSha = gitRunner(cwd, [
    'rev-parse',
    '--verify',
    `${baseRef}^{commit}`,
  ]);

  for (const candidateSha of forbiddenAncestors) {
    if (!candidateSha) continue;
    const exists = gitRunner(
      cwd,
      ['cat-file', '-e', `${candidateSha}^{commit}`],
      { allowFail: true },
    );
    if (exists === null) continue;

    if (baseSha === candidateSha) {
      throw new Error(
        `Aborting: base ref '${baseRef}' IS forbidden private commit ${candidateSha.slice(0, 9)}. Never merge private fork history directly into the public fork.`,
      );
    }

    const isAncestor = gitRunner(
      cwd,
      ['merge-base', '--is-ancestor', candidateSha, baseSha],
      { allowFail: true },
    );
    if (isAncestor !== null) {
      throw new Error(
        `Aborting: base ref '${baseRef}' contains private sovereign ancestor ${candidateSha.slice(0, 9)}. Refusing to contaminate public fork history.`,
      );
    }
  }
  return baseSha;
}

const FORK_PROFILE_PATH = 'src/config/forkProfile.js';
const DEFAULT_PROFILE_PATTERN =
  /(export\s+const\s+DEFAULT_FORK_PROFILE\s*=\s*['"])(?:sovereign|public)(['"]\s*;)/;

/** Normalize `src/config/forkProfile.js` so exported public trees always default to `'public'` (`austin` / `'Companion'`). */
export function transformPublicForkProfileSource(source) {
  if (!DEFAULT_PROFILE_PATTERN.test(source)) {
    throw new Error(
      `Aborting: ${FORK_PROFILE_PATH} is missing the expected DEFAULT_FORK_PROFILE declaration.`,
    );
  }
  return source.replace(DEFAULT_PROFILE_PATTERN, '$1public$2');
}

export function buildFilteredTree({
  cwd = DEFAULT_ROOT,
  sourceRef = 'main',
  excludes = [],
  gitRunner = runGit,
} = {}) {
  const sourceCommit = gitRunner(cwd, [
    'rev-parse',
    '--verify',
    `${sourceRef}^{commit}`,
  ]);
  const cleanExcludes = excludes.filter(Boolean);
  const existingProfile = gitRunner(
    cwd,
    ['cat-file', '-e', `${sourceCommit}:${FORK_PROFILE_PATH}`],
    { allowFail: true },
  );
  const needsProfileRewrite = existingProfile !== null;

  if (cleanExcludes.length === 0 && !needsProfileRewrite) {
    const tree = gitRunner(cwd, ['rev-parse', `${sourceCommit}^{tree}`]);
    return { sourceCommit, tree };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-oss-index-'));
  const tmpIndex = path.join(tmpDir, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
  try {
    gitRunner(cwd, ['read-tree', sourceCommit], { env });
    if (cleanExcludes.length > 0) {
      gitRunner(
        cwd,
        ['rm', '--cached', '-r', '--ignore-unmatch', '--', ...cleanExcludes],
        { env },
      );
    }
    if (needsProfileRewrite) {
      const rawSource = gitRunner(cwd, [
        'show',
        `${sourceCommit}:${FORK_PROFILE_PATH}`,
      ]);
      const publicSource = transformPublicForkProfileSource(`${rawSource}\n`);
      const blobSha = gitRunner(cwd, ['hash-object', '-w', '--stdin'], {
        env,
        input: publicSource,
      });
      gitRunner(
        cwd,
        [
          'update-index',
          '--cacheinfo',
          `100644,${blobSha},${FORK_PROFILE_PATH}`,
        ],
        { env },
      );
    }
    const tree = gitRunner(cwd, ['write-tree'], { env });
    return { sourceCommit, tree };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const NOREPLY_EMAIL_RE = /^[^@\s]+@users\.noreply\.github\.com$/i;

function safeGitConfig(cwd, key, gitRunner) {
  try {
    return String(gitRunner(cwd, ['config', '--get', key]) || '').trim();
  } catch {
    return '';
  }
}

export function resolveOssAuthorIdentity({
  cwd = DEFAULT_ROOT,
  authorName = '',
  authorEmail = '',
  env = process.env,
  gitRunner = runGit,
} = {}) {
  const email = String(
    authorEmail ||
      env?.GEV_OSS_AUTHOR_EMAIL ||
      safeGitConfig(cwd, 'user.email', gitRunner) ||
      '',
  ).trim();
  if (!NOREPLY_EMAIL_RE.test(email)) {
    throw new Error(
      `Refusing to write public fork commit without a GitHub noreply email (got '${email || '(unset)'}'). Pass --author-email <id+user@users.noreply.github.com> or set GEV_OSS_AUTHOR_EMAIL.`,
    );
  }
  const name = String(
    authorName ||
      env?.GEV_OSS_AUTHOR_NAME ||
      safeGitConfig(cwd, 'user.name', gitRunner) ||
      'Earth Sim Maintainers',
  ).trim();
  return { name, email };
}

export function syncPublicFork({
  cwd = DEFAULT_ROOT,
  sourceRef = 'main',
  targetBranch = DEFAULT_TARGET_BRANCH,
  publicRemote = DEFAULT_PUBLIC_REMOTE,
  explicitBaseRef = null,
  mergeUpstreamRef = null,
  authorName = '',
  authorEmail = '',
  message = 'feat: sync verified Earth Sim Engine updates to open-source fork',
  dryRun = false,
  push = false,
  allowDirty = false,
  skipChecks = false,
  fullChecks = false,
  forbiddenAncestors = FORBIDDEN_PRIVATE_ANCESTORS,
  runInvariantsImpl = runOssInvariants,
  gitRunner = runGit,
} = {}) {
  if (!allowDirty) {
    const dirty = gitRunner(cwd, ['status', '--porcelain']);
    if (dirty) {
      throw new Error(
        'Working tree is not clean. Commit or stash local edits before running oss:sync (or pass --allow-dirty only to export committed state).',
      );
    }
  }

  const excludes = loadOssExcludeList(
    path.join(cwd, 'scripts', 'oss-exclude.json'),
  );
  const { ref: baseRef, sha: baseSha } = resolvePublicBaseRef({
    cwd,
    explicitBaseRef,
    targetBranch,
    publicRemote,
    gitRunner,
  });

  assertCleanPublicAncestry({
    cwd,
    baseRef,
    forbiddenAncestors,
    gitRunner,
  });

  if (push) {
    const remoteUrl = gitRunner(cwd, ['remote', 'get-url', publicRemote], {
      allowFail: true,
    });
    if (!remoteUrl) {
      throw new Error(
        `Git remote '${publicRemote}' is not configured. Add the public fork remote first.`,
      );
    }
    const originUrl =
      gitRunner(cwd, ['remote', 'get-url', 'origin'], { allowFail: true }) ||
      '';
    const upstreamUrl =
      gitRunner(cwd, ['remote', 'get-url', 'upstream'], { allowFail: true }) ||
      '';
    assertSafePublicRemoteUrl(remoteUrl, {
      remoteName: publicRemote,
      originUrl,
      upstreamUrl,
    });
  }

  if (!skipChecks) {
    const verification = runInvariantsImpl({
      cwd,
      full: fullChecks,
    });
    if (!verification.ok) {
      throw new Error(
        `Verification gate '${verification.failedStep}' failed; aborting public fork sync.`,
      );
    }
  }

  const { sourceCommit, tree } = buildFilteredTree({
    cwd,
    sourceRef,
    excludes,
    gitRunner,
  });

  const baseTree = gitRunner(cwd, ['rev-parse', `${baseSha}^{tree}`]);
  const parentShas = [baseSha];

  if (mergeUpstreamRef) {
    const upstreamSha = gitRunner(cwd, [
      'rev-parse',
      '--verify',
      `${mergeUpstreamRef}^{commit}`,
    ]);
    assertCleanPublicAncestry({
      cwd,
      baseRef: upstreamSha,
      forbiddenAncestors,
      gitRunner,
    });
    const alreadyMerged = gitRunner(
      cwd,
      ['merge-base', '--is-ancestor', upstreamSha, baseSha],
      { allowFail: true },
    );
    if (alreadyMerged === null && upstreamSha !== baseSha) {
      parentShas.push(upstreamSha);
    }
  }

  if (tree === baseTree && parentShas.length === 1) {
    return {
      ok: true,
      changed: false,
      dryRun,
      pushed: false,
      sourceCommit,
      baseRef,
      baseSha,
      targetBranch,
      commitSha: baseSha,
      tree,
      excludesApplied: excludes.length,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      changed: true,
      dryRun: true,
      pushed: false,
      sourceCommit,
      baseRef,
      baseSha,
      parentShas,
      targetBranch,
      commitSha: null,
      tree,
      excludesApplied: excludes.length,
    };
  }

  const resolvedAuthor = resolveOssAuthorIdentity({
    cwd,
    authorName,
    authorEmail,
    gitRunner,
  });

  const commitArgs = [
    '-c',
    `user.name=${resolvedAuthor.name}`,
    '-c',
    `user.email=${resolvedAuthor.email}`,
    'commit-tree',
    tree,
  ];
  for (const p of parentShas) {
    commitArgs.push('-p', p);
  }
  commitArgs.push('-m', message);

  const commitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: resolvedAuthor.name,
    GIT_AUTHOR_EMAIL: resolvedAuthor.email,
    GIT_COMMITTER_NAME: resolvedAuthor.name,
    GIT_COMMITTER_EMAIL: resolvedAuthor.email,
  };
  const commitSha = gitRunner(cwd, commitArgs, { env: commitEnv });
  gitRunner(cwd, ['branch', '-f', targetBranch, commitSha]);

  if (push) {
    gitRunner(cwd, ['push', publicRemote, `${targetBranch}:main`]);
  }

  return {
    ok: true,
    changed: true,
    dryRun: false,
    pushed: push,
    sourceCommit,
    baseRef,
    baseSha,
    parentShas,
    targetBranch,
    commitSha,
    tree,
    excludesApplied: excludes.length,
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    sourceRef: 'main',
    targetBranch: DEFAULT_TARGET_BRANCH,
    publicRemote: DEFAULT_PUBLIC_REMOTE,
    explicitBaseRef: null,
    mergeUpstreamRef: null,
    authorName: '',
    authorEmail: '',
    message: 'feat: sync verified Earth Sim Engine updates to open-source fork',
    dryRun: false,
    push: false,
    allowDirty: false,
    fullChecks: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') opts.dryRun = true;
    else if (token === '--push') opts.push = true;
    else if (token === '--allow-dirty') opts.allowDirty = true;
    else if (token === '--full') opts.fullChecks = true;
    else if (token === '--source' && argv[i + 1]) opts.sourceRef = argv[++i];
    else if (token === '--target' && argv[i + 1]) opts.targetBranch = argv[++i];
    else if (token === '--remote' && argv[i + 1]) opts.publicRemote = argv[++i];
    else if (token === '--base' && argv[i + 1])
      opts.explicitBaseRef = argv[++i];
    else if (token === '--merge-upstream' && argv[i + 1])
      opts.mergeUpstreamRef = argv[++i];
    else if (token === '--author-name' && argv[i + 1])
      opts.authorName = argv[++i];
    else if (token === '--author-email' && argv[i + 1])
      opts.authorEmail = argv[++i];
    else if ((token === '--message' || token === '-m') && argv[i + 1])
      opts.message = argv[++i];
  }
  return opts;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const opts = parseCliArgs();
    const result = syncPublicFork({
      cwd: DEFAULT_ROOT,
      ...opts,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[oss:sync] ERROR: ${error?.message || error}`);
    process.exit(1);
  }
}
