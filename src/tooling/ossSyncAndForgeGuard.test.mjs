import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildInvariantSteps,
  runOssInvariants,
} from '../../scripts/check-oss-invariants.mjs';
import {
  assertCleanPublicAncestry,
  assertSafePublicRemoteUrl,
  auditPublicSyncDiff,
  formatDiffAuditReport,
  loadOssExcludeList,
  syncPublicFork,
} from '../../scripts/sync-public-fork.mjs';
import {
  scanFiles,
  verifyGitCommitAuthors,
} from '../../scripts/check-public-hygiene.mjs';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('check-oss-invariants orders all gates and fails closed on first broken invariant', () => {
  const fullSteps = buildInvariantSteps({ cwd: '/repo', full: true });
  assert.deepEqual(
    fullSteps.map((s) => s.id),
    [
      'hygiene',
      'import-directions',
      'package-boundaries',
      'i18n',
      'contracts',
      'format',
      'unit-tests',
      'build',
    ],
  );

  const ran = [];
  const report = runOssInvariants({
    cwd: '/repo',
    quiet: true,
    runStepImpl: (step) => {
      ran.push(step.id);
      if (step.id === 'i18n') {
        return { status: 1, stdout: '', stderr: 'missing translation key' };
      }
      return { status: 0, stdout: 'ok', stderr: '' };
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.failedStep, 'i18n');
  assert.deepEqual(ran, [
    'hygiene',
    'import-directions',
    'package-boundaries',
    'i18n',
  ]);
});

test('sync-public-fork enforces remote push restrictions and exclusion path validation', () => {
  assert.throws(
    () =>
      assertSafePublicRemoteUrl(
        'https://github.com/bilawalsidhu/gods-eye-view.git',
        {
          remoteName: 'public',
        },
      ),
    /protected remote/,
  );
  assert.throws(
    () =>
      assertSafePublicRemoteUrl('https://github.com/example/private.git', {
        remoteName: 'origin',
      }),
    /protected remote name 'origin'/,
  );
  assert.throws(
    () =>
      assertSafePublicRemoteUrl('https://github.com/example/private.git', {
        remoteName: 'public',
        originUrl: 'https://github.com/example/private.git',
      }),
    /protected remote URL/,
  );
  assert.equal(
    assertSafePublicRemoteUrl(
      'https://github.com/jayinatlanta/gods-eye-view-earth-sim-engine.git',
      {
        remoteName: 'public',
        originUrl: 'https://github.com/example/private-fork.git',
        upstreamUrl: 'https://github.com/bilawalsidhu/gods-eye-view.git',
      },
    ),
    'https://github.com/jayinatlanta/gods-eye-view-earth-sim-engine.git',
  );
});

test('syncPublicFork exports verified clean commit atop upstream without leaking private history and strips excluded paths', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-oss-sync-'));
  try {
    git(tmpRepo, ['init', '-b', 'main']);
    git(tmpRepo, ['config', 'user.email', 'test@example.com']);
    git(tmpRepo, ['config', 'user.name', 'Test User']);

    fs.mkdirSync(path.join(tmpRepo, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo, 'README.md'), 'upstream base\n');
    fs.writeFileSync(path.join(tmpRepo, 'scripts', 'oss-exclude.json'), '[]\n');
    git(tmpRepo, ['add', '-A']);
    git(tmpRepo, ['commit', '-m', 'upstream base']);
    const upstreamSha = git(tmpRepo, ['rev-parse', 'HEAD']);
    git(tmpRepo, ['update-ref', 'refs/remotes/upstream/main', upstreamSha]);

    // Legacy private commit that must NEVER become an ancestor of public export
    fs.writeFileSync(path.join(tmpRepo, 'private-note.txt'), 'secret\n');
    git(tmpRepo, ['add', '-A']);
    git(tmpRepo, ['commit', '-m', 'legacy private commit']);
    const forbiddenPrivateSha = git(tmpRepo, ['rev-parse', 'HEAD']);

    // Sanitized feature + sovereign forkProfile + exclusion rule removing private-note.txt on export
    fs.writeFileSync(
      path.join(tmpRepo, 'scripts', 'oss-exclude.json'),
      JSON.stringify(['private-note.txt'], null, 2) + '\n',
    );
    fs.mkdirSync(path.join(tmpRepo, 'src', 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'config', 'forkProfile.js'),
      "export const DEFAULT_FORK_PROFILE = 'sovereign';\n",
    );
    fs.writeFileSync(path.join(tmpRepo, 'feature.js'), 'export const x = 1;\n');
    git(tmpRepo, ['add', '-A']);
    git(tmpRepo, ['commit', '-m', 'sanitized feature']);

    assert.deepEqual(
      loadOssExcludeList(path.join(tmpRepo, 'scripts', 'oss-exclude.json')),
      ['private-note.txt'],
    );

    // Passing main as baseRef MUST abort because forbiddenPrivateSha is in main ancestry
    assert.throws(
      () =>
        assertCleanPublicAncestry({
          cwd: tmpRepo,
          baseRef: 'main',
          forbiddenAncestors: [forbiddenPrivateSha],
        }),
      /private.*ancestor|IS forbidden private commit/,
    );

    // Refuses to commit to public branch when only a non-noreply email is configured
    assert.throws(
      () =>
        syncPublicFork({
          cwd: tmpRepo,
          sourceRef: 'main',
          explicitBaseRef: 'refs/remotes/upstream/main',
          targetBranch: 'oss/public-earth-sim',
          forbiddenAncestors: [forbiddenPrivateSha],
          runInvariantsImpl: () => ({ ok: true, results: [] }),
        }),
      /noreply email/i,
    );

    // Export cleanly onto upstream/main with GitHub noreply email
    const res = syncPublicFork({
      cwd: tmpRepo,
      sourceRef: 'main',
      explicitBaseRef: 'refs/remotes/upstream/main',
      targetBranch: 'oss/public-earth-sim',
      authorName: 'OSS Maintainer',
      authorEmail: '12345+oss-test@users.noreply.github.com',
      forbiddenAncestors: [forbiddenPrivateSha],
      runInvariantsImpl: () => ({ ok: true, results: [] }),
    });

    assert.equal(res.ok, true);
    assert.equal(res.changed, true);

    // Public commit must sit directly on upstreamSha with 0 private commits and noreply email
    const publicHistory = git(tmpRepo, [
      'log',
      '--oneline',
      `${upstreamSha}..${res.commitSha}`,
    ]).split(/\r?\n/);
    assert.equal(publicHistory.length, 1);

    const exportedAuthors = verifyGitCommitAuthors(tmpRepo, res.commitSha, {
      baseRef: upstreamSha,
    });
    assert.equal(exportedAuthors.violations.length, 0);

    const privateAuthors = verifyGitCommitAuthors(tmpRepo, 'main', {
      baseRef: upstreamSha,
    });
    assert.ok(privateAuthors.violations.length > 0);

    // Excluded private file must NOT exist in exported public tree
    const exportedFiles = git(tmpRepo, [
      'ls-tree',
      '--name-only',
      res.commitSha,
    ]).split(/\r?\n/);
    assert.ok(exportedFiles.includes('feature.js'));
    assert.equal(exportedFiles.includes('private-note.txt'), false);

    // Exported forkProfile.js must deterministically switch from 'sovereign' -> 'public' while main stays 'sovereign'
    assert.equal(
      git(tmpRepo, ['show', `${res.commitSha}:src/config/forkProfile.js`]),
      "export const DEFAULT_FORK_PROFILE = 'public';",
    );
    assert.equal(
      git(tmpRepo, ['show', 'main:src/config/forkProfile.js']),
      "export const DEFAULT_FORK_PROFILE = 'sovereign';",
    );

    // Re-running with identical tree is a clean no-op
    const resNoop = syncPublicFork({
      cwd: tmpRepo,
      sourceRef: 'main',
      explicitBaseRef: 'refs/heads/oss/public-earth-sim',
      targetBranch: 'oss/public-earth-sim',
      authorName: 'OSS Maintainer',
      authorEmail: '12345+oss-test@users.noreply.github.com',
      forbiddenAncestors: [forbiddenPrivateSha],
      runInvariantsImpl: () => ({ ok: true, results: [] }),
    });
    assert.equal(resNoop.changed, false);
    assert.equal(resNoop.commitSha, res.commitSha);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('check-public-hygiene enforces generic security/privacy rules, private rule overlays, filenames, and .glb JSON chunks', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-hygiene-'));
  try {
    git(tmpRepo, ['init', '-b', 'main']);
    git(tmpRepo, [
      'config',
      'user.email',
      '12345+oss-test@users.noreply.github.com',
    ]);
    git(tmpRepo, ['config', 'user.name', 'OSS Maintainer']);

    fs.mkdirSync(path.join(tmpRepo, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, 'server', 'providers'), {
      recursive: true,
    });

    // Synthetic overlay file verifying optional private-rule loading works without embedding real personal data
    fs.writeFileSync(
      path.join(tmpRepo, 'scripts', 'private-hygiene-rules.json'),
      JSON.stringify(
        [
          {
            id: 'synthetic-overlay-filename',
            message: 'Synthetic filename blocklist match',
            filenamePattern: 'forbiddenFixture',
            filenameFlags: 'i',
            pattern: 'NEVER_MATCH_CONTENT_TOKEN',
          },
          {
            id: 'synthetic-overlay-coords',
            message: 'Synthetic coordinate prefix match',
            pattern: '\\b12\\.3456\\b',
            allowlist: [
              {
                file: 'src/allowed.js',
                contextPattern: 'PUBLIC_LANDMARK_OK',
              },
            ],
          },
          {
            id: 'synthetic-overlay-glb',
            message: 'Synthetic binary generator marker match',
            pattern: 'example-private-builder',
            flags: 'i',
          },
        ],
        null,
        2,
      ) + '\n',
    );

    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'forbiddenFixture.js'),
      'export const ok = true;\n',
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'allowed.js'),
      'const publicLandmark = { lat: 12.3456, tag: "PUBLIC_LANDMARK_OK" };\n',
    );
    const syntheticTailscaleHost = [
      'https://private-box.example',
      'ts.net',
    ].join('.');
    const syntheticWebmail = ['maintainer', 'outlook.com'].join('@');
    const syntheticLocalPath = [
      'C:',
      'Users',
      'janedoe',
      'Documents',
      'development',
      'app',
    ].join('\\');
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'leaks.js'),
      [
        `const host = ${JSON.stringify(syntheticTailscaleHost)};`,
        `const contact = ${JSON.stringify(syntheticWebmail)};`,
        `const homePath = ${JSON.stringify(syntheticLocalPath)};`,
        'const coord = 12.3456;',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'server', 'providers', 'badCors.js'),
      "res.setHeader('Access-Control-Allow-Origin', '*');\n",
    );

    const glbJson = Buffer.from(
      JSON.stringify({
        asset: { version: '2.0', generator: 'example-private-builder' },
      }),
      'utf8',
    );
    const glbPad = (4 - (glbJson.length % 4)) % 4;
    const glbPadded = Buffer.concat([glbJson, Buffer.alloc(glbPad, 0x20)]);
    const glbHeader = Buffer.alloc(20);
    glbHeader.writeUInt32LE(0x46546c67, 0);
    glbHeader.writeUInt32LE(2, 4);
    glbHeader.writeUInt32LE(20 + glbPadded.length, 8);
    glbHeader.writeUInt32LE(glbPadded.length, 12);
    glbHeader.writeUInt32LE(0x4e4f534a, 16);
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'leaked-model.glb'),
      Buffer.concat([glbHeader, glbPadded]),
    );
    git(tmpRepo, ['add', '-A']);

    const { violations } = scanFiles(tmpRepo);
    const rulesHit = new Set(violations.map((v) => v.rule));
    assert.ok(rulesHit.has('tailscale-host'));
    assert.ok(rulesHit.has('personal-email'));
    assert.ok(rulesHit.has('local-workstation-paths'));
    assert.ok(rulesHit.has('provider-wildcard-cors'));
    assert.ok(rulesHit.has('synthetic-overlay-filename'));
    assert.ok(rulesHit.has('synthetic-overlay-coords'));
    assert.equal(
      violations.some((v) => v.file === 'src/allowed.js'),
      false,
      'Allowlisted context should not trigger violation',
    );
    assert.ok(
      violations.some(
        (v) =>
          v.file === 'src/leaked-model.glb' &&
          v.rule === 'synthetic-overlay-glb',
      ),
    );

    // Without the private overlay file, generic rules still run cleanly without throwing
    fs.rmSync(path.join(tmpRepo, 'scripts', 'private-hygiene-rules.json'));
    const genericOnly = scanFiles(tmpRepo);
    const genericRulesHit = new Set(genericOnly.violations.map((v) => v.rule));
    assert.ok(genericRulesHit.has('tailscale-host'));
    assert.ok(genericRulesHit.has('personal-email'));
    assert.equal(genericRulesHit.has('synthetic-overlay-coords'), false);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('check-public-hygiene scans image assets for EXIF/XMP/GPS/paths and blocks non-fixture secrets', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-media-secret-'));
  try {
    git(tmpRepo, ['init', '-b', 'main']);
    git(tmpRepo, [
      'config',
      'user.email',
      '12345+oss-test@users.noreply.github.com',
    ]);
    git(tmpRepo, ['config', 'user.name', 'OSS Maintainer']);

    fs.mkdirSync(path.join(tmpRepo, 'public'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, 'src'), { recursive: true });

    // Clean PNG passes
    const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    fs.writeFileSync(path.join(tmpRepo, 'public', 'clean.png'), pngMagic);

    // Dirty images carrying EXIF/GPS, XMP, and workstation path markers
    const dirtyExifJpg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
      Buffer.from('Exif\x00\x00GPSLatitude=33.7', 'latin1'),
    ]);
    fs.writeFileSync(
      path.join(tmpRepo, 'public', 'exif-gps.jpg'),
      dirtyExifJpg,
    );

    const dirtyXmpPng = Buffer.concat([
      pngMagic,
      Buffer.from(
        `<x:xmpmeta><exif:UserComment>C:${'\\'}Users${'\\'}janedoe${'\\'}shot.png</exif:UserComment></x:xmpmeta>`,
        'latin1',
      ),
    ]);
    fs.writeFileSync(path.join(tmpRepo, 'public', 'xmp-path.png'), dirtyXmpPng);

    // Synthetic secrets (constructed dynamically so this test file stays hygiene-clean)
    const fakeOpenAi = ['sk', 'proj', 'AbCdEfGhIjKlMnOpQrStUvWx012345'].join(
      '-',
    );
    const fakeGoogle = ['AIza', 'SyAbCdEfGhIjKlMnOpQrStUvWxYz0123456'].join('');
    const fakeGithub = ['ghp', '0123456789abcdefghijklmnopqrstuvwxyz'].join(
      '_',
    );
    const fakeSlack = ['xoxb', '123456789012', '1234567890123'].join('-');
    const fakePem = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
    const fakeJwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      'abc123signatureXYZ',
    ].join('.');

    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'secrets.js'),
      [
        `export const k1 = ${JSON.stringify(fakeOpenAi)};`,
        `export const k2 = ${JSON.stringify(fakeGoogle)};`,
        `export const k3 = ${JSON.stringify(fakeGithub)};`,
        `export const k4 = ${JSON.stringify(fakeSlack)};`,
        `export const k5 = ${JSON.stringify(fakePem)};`,
        `export const k6 = ${JSON.stringify(fakeJwt)};`,
      ].join('\n'),
    );

    // Allowlisted fixture placeholders must pass
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'fixtures.test.mjs'),
      [
        "export const f1 = 'sk-fixture-only-not-a-real-key-123456';",
        "export const f2 = 'AIzaSyFake01234567890123456789012345678';",
        "export const f3 = 'MLY|0|qa-fixture';",
      ].join('\n'),
    );

    git(tmpRepo, ['add', '-A']);

    const { violations } = scanFiles(tmpRepo, { includeOverlay: false });
    const rulesHit = new Set(violations.map((v) => v.rule));

    assert.equal(
      violations.some((v) => v.file === 'public/clean.png'),
      false,
      'Clean PNG must not be flagged',
    );
    assert.equal(
      violations.some((v) => v.file === 'src/fixtures.test.mjs'),
      false,
      'Explicit fixture tokens must pass',
    );
    assert.ok(rulesHit.has('image-exif-header'));
    assert.ok(rulesHit.has('image-gps-tag'));
    assert.ok(rulesHit.has('image-xmp-metadata'));
    assert.ok(rulesHit.has('image-workstation-path'));
    assert.ok(rulesHit.has('secret-openai-key'));
    assert.ok(rulesHit.has('secret-google-api-key'));
    assert.ok(rulesHit.has('secret-github-token'));
    assert.ok(rulesHit.has('secret-slack-token'));
    assert.ok(rulesHit.has('secret-pem-private-key'));
    assert.ok(rulesHit.has('secret-live-jwt'));
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('auditPublicSyncDiff flags new media assets and high-precision coordinates added in test files', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-diff-audit-'));
  try {
    git(tmpRepo, ['init', '-b', 'main']);
    git(tmpRepo, [
      'config',
      'user.email',
      '12345+oss-test@users.noreply.github.com',
    ]);
    git(tmpRepo, ['config', 'user.name', 'OSS Maintainer']);

    fs.mkdirSync(path.join(tmpRepo, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo, 'README.md'), 'base\n');
    fs.writeFileSync(path.join(tmpRepo, 'scripts', 'oss-exclude.json'), '[]\n');
    git(tmpRepo, ['add', '-A']);
    git(tmpRepo, ['commit', '-m', 'base commit']);
    const baseSha = git(tmpRepo, ['rev-parse', 'HEAD']);
    git(tmpRepo, ['update-ref', 'refs/remotes/upstream/main', baseSha]);

    fs.mkdirSync(path.join(tmpRepo, 'public'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRepo, 'public', 'preview.png'),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'sample.test.mjs'),
      "const austin = { lat: 30.2672, lon: -97.7431 };\nconst version = '2026.1121';\n",
    );
    git(tmpRepo, ['add', '-A']);
    git(tmpRepo, ['commit', '-m', 'add media and test coords']);

    const res = syncPublicFork({
      cwd: tmpRepo,
      sourceRef: 'main',
      explicitBaseRef: 'refs/remotes/upstream/main',
      targetBranch: 'oss/public-earth-sim',
      authorName: 'OSS Maintainer',
      authorEmail: '12345+oss-test@users.noreply.github.com',
      auditDiff: true,
      runInvariantsImpl: () => ({ ok: true, results: [] }),
    });

    assert.equal(res.ok, true);
    assert.ok(res.audit);
    assert.equal(res.audit.addedFileCount, 2);
    assert.deepEqual(res.audit.addedMediaAssets, ['public/preview.png']);
    assert.equal(res.audit.authorVerified, true);
    assert.equal(res.audit.novelTestCoordinates.length, 1);
    assert.equal(res.audit.novelTestCoordinates[0].file, 'src/sample.test.mjs');
    assert.equal(res.audit.novelTestCoordinates[0].line, 1);
    assert.deepEqual(res.audit.novelTestCoordinates[0].matches, [
      '30.2672',
      '-97.7431',
    ]);

    const directAudit = auditPublicSyncDiff({
      cwd: tmpRepo,
      baseSha,
      targetTreeOrSha: res.commitSha,
      excludesApplied: 3,
      authorResult: { checkedCount: 1, violations: [] },
    });
    assert.equal(directAudit.excludesApplied, 3);
    const report = formatDiffAuditReport(directAudit);
    assert.match(report, /public\/preview\.png/);
    assert.match(report, /30\.2672, -97\.7431/);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
