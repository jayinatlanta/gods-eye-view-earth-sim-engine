import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { readRequestBody } from '../common/request.js';
import { admitKeySetupRequest } from '../../../src/keySetupCore.mjs';

const BENIGN_TLS_HANDSHAKE_RE =
  /(?:^|\s)http:\s*TLS handshake error from 127\.0\.0\.1:\d+:\s*tls:\s*first record does not look like a TLS handshake/i;

const RETRYABLE_ASK_STDERR_RE =
  /timed out after|print timeout after|deadline_exceeded|resource_exhausted|quota|rate limit|429|503|unavailable|connection refused|eof/i;

const PINOKIO_ENV_KEYS_TO_STRIP = [
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'PIP_CERT',
  'NODE_EXTRA_CA_CERTS',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'GRADIO_TEMP_DIR',
  'HF_HOME',
  'TORCH_HOME',
  'MPLCONFIGDIR',
  'PIP_TMPDIR',
  'TMPDIR',
  'CONDA_DEFAULT_ENV',
  'CONDA_EXE',
  'CONDA_PREFIX',
  'CONDA_PROMPT_MODIFIER',
  'CONDA_PYTHON_EXE',
  'CONDA_SHLVL',
  '_CE_CONDA',
  '_CE_M',
];

/**
 * Sanitizes inherited process environment variables before spawning `agy.exe`.
 * Pinokio + Conda inject TLS cert overrides, cache/temp redirections, XDG dirs,
 * and miniconda PATH prefixes that can stall `agy.exe` or break MCP servers.
 */
export function buildSanitizedAgyEnv(baseEnv = process.env) {
  const env = { ...(baseEnv || {}) };

  for (const key of PINOKIO_ENV_KEYS_TO_STRIP) {
    delete env[key];
  }
  for (const key of Object.keys(env)) {
    if (/^(?:CONDA_|_CE_|__CONDA_)/i.test(key)) {
      delete env[key];
    }
  }

  const localAppData = String(env.LOCALAPPDATA || '').trim();
  const fallbackTempDir = localAppData
    ? localAppData.includes('\\')
      ? path.win32.join(localAppData, 'Temp')
      : path.join(localAppData, 'Temp')
    : os.tmpdir();
  for (const tempKey of ['TEMP', 'TMP']) {
    const currentTemp = String(env[tempKey] || '').trim();
    if (!currentTemp || /(?:pinokio|cache)/i.test(currentTemp)) {
      env[tempKey] = fallbackTempDir;
    }
  }

  const pathKey = Object.prototype.hasOwnProperty.call(env, 'PATH')
    ? 'PATH'
    : Object.prototype.hasOwnProperty.call(env, 'Path')
      ? 'Path'
      : 'PATH';
  const rawPath = String(env.PATH ?? env.Path ?? '').trim();
  if (rawPath) {
    const delimiter = rawPath.includes(';') ? ';' : path.delimiter;
    const entries = rawPath
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const nativeEntries = [];
    const pinokioEntries = [];
    for (const entry of entries) {
      if (/(?:pinokio|miniconda)/i.test(entry)) {
        pinokioEntries.push(entry);
      } else {
        nativeEntries.push(entry);
      }
    }
    const reorderedPath = [...nativeEntries, ...pinokioEntries].join(delimiter);
    env[pathKey] = reorderedPath;
    if (pathKey !== 'PATH') {
      env.PATH = reorderedPath;
    }
    if (Object.prototype.hasOwnProperty.call(env, 'Path')) {
      env.Path = reorderedPath;
    }
  }

  return env;
}

/**
 * Strips benign Go `net/http` TLS handshake warnings triggered when Pinokio's
 * background port scanner (`procs.js`) probes `agy.exe`'s localhost HTTPS gRPC port.
 */
export function stripBenignAgyStderrWarnings(stderr = '') {
  return String(stderr || '')
    .split(/\r?\n/)
    .filter((line) => !BENIGN_TLS_HANDSHAKE_RE.test(line))
    .join('\n')
    .trim();
}

export const DEFAULT_FORGE_CLI_BINARY = 'agy.exe';
export const DEFAULT_FORGE_MODEL = 'inherit';
export const DEFAULT_ORCHESTRATOR_MODEL = 'Orchestrator (Argon)';
export const DEFAULT_FALLBACK_MODEL = 'Gemini 4 Hydrogen (High)';
export const DEFAULT_FORGE_CLI_ARGS =
  '--dangerously-skip-permissions --output-format text';

export const ASSISTANT_PROVIDER_ADAPTERS = Object.freeze({
  agy: Object.freeze({
    id: 'agy',
    label: 'Antigravity CLI (agy)',
    binary: process.platform === 'win32' ? 'agy.exe' : 'agy',
    aliases: Object.freeze(['agy', 'agy.exe']),
    supportsModelList: true,
    buildArgs({ prompt, model = null, mode = 'ask' }) {
      const normalizedModel =
        model && model !== 'inherit' ? String(model).trim() : '';
      if (mode === 'forge') {
        const args = [
          '-p',
          prompt,
          '--dangerously-skip-permissions',
          '--output-format',
          'text',
        ];
        if (normalizedModel) args.push('--model', normalizedModel);
        return args;
      }
      const args = [
        '-p',
        prompt,
        '--disable-slash-commands',
        '--output-format',
        'text',
      ];
      if (normalizedModel) args.push('--model', normalizedModel);
      return args;
    },
  }),
  claude: Object.freeze({
    id: 'claude',
    label: 'Claude Code CLI (claude)',
    binary: process.platform === 'win32' ? 'claude.exe' : 'claude',
    aliases: Object.freeze(['claude', 'claude.exe']),
    supportsModelList: false,
    buildArgs({ prompt, model = null, mode = 'ask' }) {
      const normalizedModel =
        model && model !== 'inherit' ? String(model).trim() : '';
      const args = ['-p', prompt, '--output-format', 'text'];
      if (mode === 'forge') args.push('--dangerously-skip-permissions');
      if (normalizedModel) args.push('--model', normalizedModel);
      return args;
    },
  }),
  codex: Object.freeze({
    id: 'codex',
    label: 'OpenAI Codex CLI (codex)',
    binary: process.platform === 'win32' ? 'codex.exe' : 'codex',
    aliases: Object.freeze(['codex', 'codex.exe']),
    supportsModelList: false,
    buildArgs({ prompt, model = null, mode = 'ask' }) {
      const normalizedModel =
        model && model !== 'inherit' ? String(model).trim() : '';
      const args = [
        'exec',
        ...(mode === 'forge' ? ['--full-auto'] : ['--sandbox', 'read-only']),
      ];
      if (normalizedModel) args.push('--model', normalizedModel);
      args.push(prompt);
      return args;
    },
  }),
  gemini: Object.freeze({
    id: 'gemini',
    label: 'Gemini CLI (gemini)',
    binary: process.platform === 'win32' ? 'gemini.exe' : 'gemini',
    aliases: Object.freeze(['gemini', 'gemini.exe']),
    supportsModelList: false,
    buildArgs({ prompt, model = null, mode = 'ask' }) {
      const normalizedModel =
        model && model !== 'inherit' ? String(model).trim() : '';
      const args = ['-p', prompt, '--output-format', 'text'];
      if (mode === 'forge') args.push('--yolo');
      if (normalizedModel) args.push('--model', normalizedModel);
      return args;
    },
  }),
});

/**
 * Resolves a requested providerId or cliBinary strictly against allowlisted CLI adapters.
 * Rejects paths, shells, and arbitrary executables to prevent HTTP command injection.
 */
export function resolveAssistantProviderAdapter({
  providerId = null,
  cliBinary = null,
} = {}) {
  const idNorm = String(providerId || '')
    .trim()
    .toLowerCase();
  if (idNorm && idNorm !== 'auto') {
    return ASSISTANT_PROVIDER_ADAPTERS[idNorm] || null;
  }
  const binRaw = String(cliBinary || '')
    .trim()
    .toLowerCase();
  if (!binRaw) {
    return ASSISTANT_PROVIDER_ADAPTERS.agy;
  }
  if (/[\\/\s;|&`$<>]/.test(binRaw)) {
    return null;
  }
  for (const adapter of Object.values(ASSISTANT_PROVIDER_ADAPTERS)) {
    if (adapter.aliases.includes(binRaw)) {
      return adapter;
    }
  }
  return null;
}

/**
 * Checks whether live repository self-modification (`/api/agy/self-modify` in forge
 * mode and `/api/agy/self-modify/revert`) is explicitly opted into via env.
 */
export function isLiveForgeEnabled(env = process.env) {
  const raw = String(env?.GEV_ENABLE_LIVE_FORGE ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true';
}

/**
 * Enforces Provider Settings' strict local request gate (`admitKeySetupRequest`:
 * loopback socket + local Host + exact same Origin + application/json on POST +
 * no proxy/sharing headers) across assistant execution endpoints.
 * Returns true if refused and response already ended.
 */
export function admitLocalAssistantRequest(
  req,
  res,
  { env = process.env } = {},
) {
  const verdict = admitKeySetupRequest({
    method: req.method,
    remoteAddress: req.socket?.remoteAddress,
    hostHeader: req.headers?.host,
    protocol: req.socket?.encrypted ? 'https:' : 'http:',
    origin: req.headers?.origin,
    contentType: req.headers?.['content-type'],
    proxyHeaders: req.headers || {},
    env,
  });
  if (verdict.ok) return false;
  res.statusCode = verdict.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      ok: false,
      error: verdict.error,
      code: verdict.code,
    }),
  );
  return true;
}

export const AGY_MODEL_PRESETS = Object.freeze([
  {
    id: 'Gemini 4 Hydrogen (High)',
    slug: 'gemini-4-hydrogen-high',
    label: 'Gemini 4 Hydrogen (High)',
  },
  {
    id: 'Gemini 4 Hydrogen (XHigh)',
    slug: 'gemini-4-hydrogen-xhigh',
    label: 'Gemini 4 Hydrogen (XHigh)',
  },
  {
    id: 'Gemini 4 Hydrogen (Medium)',
    slug: 'gemini-4-hydrogen-medium',
    label: 'Gemini 4 Hydrogen (Medium)',
  },
  {
    id: 'Gemini 4 Hydrogen (Low)',
    slug: 'gemini-4-hydrogen-low',
    label: 'Gemini 4 Hydrogen (Low)',
  },
  {
    id: 'Orchestrator (Argon)',
    slug: 'gemini-pro-orchestrator-g1-pro',
    label: 'Orchestrator (Argon)',
  },
  {
    id: 'Gemini 4 Argon (High)',
    slug: 'gemini-4-argon-high',
    label: 'Gemini 4 Argon (High)',
  },
  {
    id: 'Gemini 4 Argon (Medium)',
    slug: 'gemini-4-argon-medium',
    label: 'Gemini 4 Argon (Medium)',
  },
  {
    id: 'Gemini 4 Argon (Low)',
    slug: 'gemini-4-argon-low',
    label: 'Gemini 4 Argon (Low)',
  },
  {
    id: 'Gemini 3.8 Flash (High)',
    slug: 'gemini-3.8-flash-high',
    label: 'Gemini 3.8 Flash (High)',
  },
  {
    id: 'Gemini 3.8 Flash (Medium)',
    slug: 'gemini-3.8-flash-medium',
    label: 'Gemini 3.8 Flash (Medium)',
  },
  {
    id: 'Gemini 3.8 Flash (Low)',
    slug: 'gemini-3.8-flash-low',
    label: 'Gemini 3.8 Flash (Low)',
  },
  {
    id: 'Claude Opus 5.5 (Low)',
    slug: 'claude-opus-5-5-low',
    label: 'Claude Opus 5.5 (Low)',
  },
  {
    id: 'Claude Opus 5.5 (Medium)',
    slug: 'claude-opus-5-5-medium',
    label: 'Claude Opus 5.5 (Medium)',
  },
  {
    id: 'Claude Opus 5.5 (High)',
    slug: 'claude-opus-5-5-high',
    label: 'Claude Opus 5.5 (High)',
  },
  {
    id: 'Claude Sonnet 5.5 (Low)',
    slug: 'claude-sonnet-5-5-low',
    label: 'Claude Sonnet 5.5 (Low)',
  },
  {
    id: 'Claude Sonnet 5.5 (Medium)',
    slug: 'claude-sonnet-5-5-medium',
    label: 'Claude Sonnet 5.5 (Medium)',
  },
  {
    id: 'Claude Sonnet 5.5 (High)',
    slug: 'claude-sonnet-5-5-high',
    label: 'Claude Sonnet 5.5 (High)',
  },
  {
    id: 'GPT-OSS 120B (Medium)',
    slug: 'gpt-oss-120b-medium',
    label: 'GPT-OSS 120B (Medium)',
  },
]);

export const GEV_DATA_STRUCTURE_REGISTRY = Object.freeze([
  {
    symbol: 'METRO_LANDMARK_CATALOG / METRO_TOUR_METADATA',
    file: 'src/layers/citylife/tourAndPlayEngine.js',
    purpose:
      'Curated multi-stop city scooter tours, landmark lore, companion notes, and continent/alias metadata.',
  },
  {
    symbol: 'LIVING_CITIES / CITY_QUERY_ALIASES',
    file: 'src/citylife/cityWaypoints.js',
    purpose:
      'Living world city spawn points, pedestrian transit waypoints, and fuzzy/diacritic alias resolution.',
  },
  {
    symbol: 'MAJOR_WORLD_METROS',
    file: 'src/ui/worldSimDock.js',
    purpose:
      'Offline global metro gazetteer powering instant camera teleport & metro search.',
  },
  {
    symbol: 'EXEMPLAR_LOCALES',
    file: 'src/layers/citylife/localeClassifier.js',
    purpose:
      'Signature biome, movie studio, theme park, and mall promenade presets — auto-rendered dynamically into Living World (cityDrawer.js) sections by typology with zero UI edits needed.',
  },
  {
    symbol: 'STADIUM_VENUES',
    file: 'src/layers/citylife/stadiumCatalog.js',
    purpose:
      '3D stadium & arena gameday venue catalog — auto-rendered dynamically into Living World Gameday Spectacles (cityDrawer.js) with auto-populated metro/region filters; adding new cities/teams here automatically exposes them in UI.',
  },
  {
    symbol: 'HELIPAD_WAYPOINTS',
    file: 'src/flight/helipadCatalog.js',
    purpose: 'Helipad & rotorcraft landing pad waypoints.',
  },
  {
    symbol: 'DRIVE_CORRIDORS / FREIGHT_CORRIDORS',
    file: 'src/drive/driveWaypoints.js & src/layers/freight/freightCorridors.js',
    purpose: 'Scenic drive routes and global freight/supply corridors.',
  },
  {
    symbol: 'CITY_POIS',
    file: 'src/cityPois.js',
    purpose: 'Named point-of-interest bookmarks across GEV cities.',
  },
  {
    symbol: 'EARTH_SIM_FEATURE_CATALOG / EARTH_SIM_FEATURE_CATEGORIES',
    file: 'src/ui/earthSimFeatureCatalog.js',
    purpose:
      'Dynamic feature catalog backing the Earth Sim intro pop-over; every registerDrawer(...) must have an entry here.',
  },
  {
    symbol: 'resolveForkProfile / getForkProfile',
    file: 'src/config/forkProfile.js',
    purpose:
      'Deterministic public (austin/Companion) vs sovereign runtime profile resolution without hardcoding private defaults.',
  },
]);

export function resolveCanonicalAgyModel(modelInput) {
  const raw = String(modelInput ?? '').trim();
  if (!raw) return DEFAULT_FORGE_MODEL;
  const lower = raw.toLowerCase();
  if (lower === 'inherit' || lower === 'default' || lower === 'auto') {
    return 'inherit';
  }
  if (
    lower === 'orchestrator' ||
    lower === 'argon orchestrator' ||
    lower === 'orchestrator (argon)' ||
    lower === 'gemini-pro-orchestrator-g1-pro'
  ) {
    return DEFAULT_ORCHESTRATOR_MODEL;
  }
  const match = AGY_MODEL_PRESETS.find(
    (m) =>
      m.id.toLowerCase() === lower ||
      m.label.toLowerCase() === lower ||
      (m.slug && m.slug.toLowerCase() === lower),
  );
  return match ? match.id : raw;
}

/**
 * Reads the user's configured PC-wide Antigravity CLI default model from
 * `~/.gemini/antigravity-cli/settings.json` so GEV can display and honor it.
 */
export function readAgyCliActiveDefaultModel({ settingsPath = null } = {}) {
  const candidatePaths = settingsPath
    ? [settingsPath]
    : [
        path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json'),
        process.env.USERPROFILE
          ? path.win32.join(
              process.env.USERPROFILE,
              '.gemini',
              'antigravity-cli',
              'settings.json',
            )
          : '',
      ].filter(Boolean);

  for (const filePath of [...new Set(candidatePaths)]) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const configured = String(parsed?.model ?? '').trim();
      if (configured && configured.toLowerCase() !== 'inherit') {
        const canonical = resolveCanonicalAgyModel(configured);
        return canonical === 'inherit' ? configured : canonical;
      }
    } catch {
      /* ignore unreadable settings */
    }
  }
  return DEFAULT_FALLBACK_MODEL;
}

export function buildAgyModelFallbackChain(
  requestedModel,
  { mode = 'forge' } = {},
) {
  const primary = resolveCanonicalAgyModel(requestedModel);
  const isAskMode =
    String(mode || '')
      .trim()
      .toLowerCase() === 'ask';
  const chain = [];
  const pushUnique = (val) => {
    if (!chain.includes(val)) chain.push(val);
  };

  if (primary === 'inherit') {
    pushUnique('');
    pushUnique(DEFAULT_FALLBACK_MODEL);
    pushUnique('gemini-4-hydrogen-high');
    if (isAskMode) {
      pushUnique('Gemini 3.8 Flash (High)');
      pushUnique('gemini-3.8-flash-high');
    }
    return chain;
  }

  pushUnique(primary);
  pushUnique(DEFAULT_FALLBACK_MODEL);
  pushUnique('gemini-4-hydrogen-high');
  if (isAskMode) {
    pushUnique('Gemini 3.8 Flash (High)');
    pushUnique('gemini-3.8-flash-high');
  }
  pushUnique('');
  return chain;
}

export function isInvalidModelSelectionOutput(stdout = '', stderr = '') {
  const combined = `${stdout || ''}\n${stderr || ''}`;
  return /invalid model selection|not recognized as a known model/i.test(
    combined,
  );
}

export function isRetryableAgyAttemptFailure(
  execResult,
  { mode = 'forge' } = {},
) {
  const stdout = String(execResult?.stdout || '');
  const stderr = String(execResult?.stderr || '');
  if (isInvalidModelSelectionOutput(stdout, stderr)) {
    return true;
  }
  if (
    String(mode || '')
      .trim()
      .toLowerCase() === 'ask' &&
    !execResult?.ok &&
    !stdout.trim()
  ) {
    return RETRYABLE_ASK_STDERR_RE.test(stderr) || execResult?.exitCode !== 0;
  }
  return false;
}

export function replaceOrRemoveModelArg(args = [], nextModel = '') {
  const tokens = Array.isArray(args) ? [...args] : parseCliArgsString(args);
  const cleaned = [];
  let skipNext = false;

  for (let i = 0; i < tokens.length; i += 1) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const token = String(tokens[i] ?? '').trim();
    if (!token) continue;
    if (token === '--model' || token === '-m') {
      skipNext = true;
      continue;
    }
    if (token.startsWith('--model=') || token.startsWith('-m=')) {
      continue;
    }
    cleaned.push(token);
  }

  const trimmedNext = String(nextModel || '').trim();
  if (trimmedNext && trimmedNext !== 'inherit') {
    cleaned.push('--model', trimmedNext);
  }
  return cleaned;
}

/**
 * Parses a shell-style argument string into an array of tokens.
 * Supports double-quoted and single-quoted arguments.
 */
export function parseCliArgsString(rawArgs = DEFAULT_FORGE_CLI_ARGS) {
  if (Array.isArray(rawArgs)) {
    return rawArgs.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof rawArgs !== 'string' || !rawArgs.trim()) {
    return [];
  }
  const tokens = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match = regex.exec(rawArgs);
  while (match !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
    match = regex.exec(rawArgs);
  }
  return tokens;
}

/**
 * Normalizes CLI flags for `agy.exe`:
 * - Translates invalid `--yolo` / `-yolo` to `--dangerously-skip-permissions`
 * - Ensures `--dangerously-skip-permissions` is present for non-interactive edits
 * - Applies explicit model selection or strips `--model` in `inherit` mode
 */
export function normalizeAgyCliArgs(
  rawArgs = DEFAULT_FORGE_CLI_ARGS,
  { cliBinary = DEFAULT_FORGE_CLI_BINARY, model = null, mode = null } = {},
) {
  const baseTokens = Array.isArray(rawArgs)
    ? [...rawArgs]
    : parseCliArgsString(rawArgs);
  const isAgyBinary = /(?:^|[\\/])agy(?:\.exe)?$/i.test(
    String(cliBinary || '').trim(),
  );

  const normalized = [];
  let skipNextValue = false;
  const hasExplicitModel =
    model !== undefined && model !== null && String(model).trim() !== '';
  const resolvedModel = hasExplicitModel
    ? resolveCanonicalAgyModel(model)
    : null;

  for (let i = 0; i < baseTokens.length; i += 1) {
    if (skipNextValue) {
      skipNextValue = false;
      continue;
    }
    const token = String(baseTokens[i] ?? '').trim();
    if (!token) continue;

    if (isAgyBinary && (token === '--yolo' || token === '-yolo')) {
      if (!normalized.includes('--dangerously-skip-permissions')) {
        normalized.push('--dangerously-skip-permissions');
      }
      continue;
    }

    if (hasExplicitModel && (token === '--model' || token === '-m')) {
      skipNextValue = true;
      continue;
    }
    if (
      hasExplicitModel &&
      (token.startsWith('--model=') || token.startsWith('-m='))
    ) {
      continue;
    }

    if (
      token === '--dangerously-skip-permissions' &&
      normalized.includes('--dangerously-skip-permissions')
    ) {
      continue;
    }

    normalized.push(token);
  }

  if (isAgyBinary && !normalized.includes('--dangerously-skip-permissions')) {
    normalized.unshift('--dangerously-skip-permissions');
  }

  if (
    isAgyBinary &&
    String(mode || '')
      .trim()
      .toLowerCase() === 'ask' &&
    !normalized.includes('--disable-slash-commands')
  ) {
    normalized.push('--disable-slash-commands');
  }

  if (hasExplicitModel && resolvedModel && resolvedModel !== 'inherit') {
    normalized.push('--model', resolvedModel);
  }

  return normalized;
}

const DEV_ACTION_VERB_RE =
  /\b(add|create|build|implement|fix|modify|update|change|refactor|remove|delete|wire|patch|commit|restyle|rename|edit|upgrade|install|integrate|expose|populate|write|make)\b/i;
const IMPERATIVE_DEV_OPENER_RE =
  /^\s*(?:please\s+|can you\s+|could you\s+)?(add|create|build|implement|fix|modify|update|change|refactor|remove|delete|wire|patch|commit|restyle|rename|edit|upgrade|install|integrate|expose|populate)\b/i;
const DEV_TARGET_NOUN_RE =
  /\b(gev|repo|repository|code|codebase|file|files|module|component|panel|button|ui|css|style|shader|layer|tour stop|city tour|scooter tour|tour|catalog|landmark|landmarks|metadata|endpoint|api|test|tests|unit test|bug|feature|widget|sidebar|drawer|menu|function|class|script|commit|main branch)\b/i;
const QUESTION_OPENER_RE =
  /^\s*(why|what|what's|whats|who|when|where|which|how|is|are|was|were|do|does|did|can you explain|could you explain|tell me|explain|describe|history of|meaning of|origin of|compare)\b/i;

/**
 * Classifies whether a user request is a World/Space Q&A inquiry ('ask')
 * or a live codebase modification directive ('forge').
 */
export function classifyAgentRequestMode(userPrompt, requestedMode = 'auto') {
  const modeNorm = String(requestedMode || 'auto')
    .trim()
    .toLowerCase();
  if (modeNorm === 'ask' || modeNorm === 'guide' || modeNorm === 'qa') {
    return 'ask';
  }
  if (modeNorm === 'forge' || modeNorm === 'dev' || modeNorm === 'code') {
    return 'forge';
  }

  const prompt = String(userPrompt || '').trim();
  if (!prompt) return 'ask';

  const hasDevVerb = DEV_ACTION_VERB_RE.test(prompt);
  const hasDevTarget = DEV_TARGET_NOUN_RE.test(prompt);
  const hasImperativeDevOpener = IMPERATIVE_DEV_OPENER_RE.test(prompt);
  const looksLikeQuestion =
    QUESTION_OPENER_RE.test(prompt) || prompt.endsWith('?');

  if (hasImperativeDevOpener && (!looksLikeQuestion || hasDevTarget)) {
    return 'forge';
  }
  if (hasDevVerb && hasDevTarget) {
    return 'forge';
  }
  if (looksLikeQuestion) {
    return 'ask';
  }
  if (
    hasDevVerb &&
    /\b(it|this|that|panel|button|app|map|globe)\b/i.test(prompt)
  ) {
    return 'forge';
  }
  return 'ask';
}

/**
 * Builds an engaging, context-grounded World, Earth & Space Guide prompt ('ask' mode)
 * that answers directly without touching files or running git commands.
 */
export function buildWorldGuidePrompt({
  userPrompt,
  appName = "God's Eye View (GEV)",
  context = null,
} = {}) {
  const cleanRequest = String(userPrompt || '').trim();
  const contextLines = [];
  if (context && typeof context === 'object') {
    if (Number.isFinite(context.lat) && Number.isFinite(context.lon)) {
      contextLines.push(
        `- Camera Coordinates: ${context.lat}, ${context.lon} (altitude ${context.altMeters ?? 0} m)`,
      );
    }
    if (context.cityName || context.cityId) {
      contextLines.push(`- Active City: ${context.cityName || context.cityId}`);
    }
    if (context.tourMode || context.tourState) {
      contextLines.push(
        `- Simulation Mode: ${context.tourMode || context.tourState}`,
      );
    }
    if (context.currentLandmark) {
      const lm = context.currentLandmark;
      if (typeof lm === 'string') {
        contextLines.push(`- Current Landmark: ${lm}`);
      } else if (lm?.name) {
        contextLines.push(
          `- Current Landmark: ${lm.name}${lm.category ? ` (${lm.category})` : ''}${lm.lore ? ` — ${lm.lore}` : ''}`,
        );
      }
    }
    if (context.activeLocale) {
      contextLines.push(`- Active Locale: ${context.activeLocale}`);
    }
  }

  const recentLines = [];
  if (Array.isArray(context?.recentConversation)) {
    const recentTurns = context.recentConversation
      .filter((turn) => turn && typeof turn === 'object')
      .slice(-3);
    recentTurns.forEach((turn, idx) => {
      const q = String(turn.question || '')
        .trim()
        .slice(0, 300);
      const a = String(turn.answer || '')
        .trim()
        .slice(0, 500);
      if (q || a) {
        recentLines.push(`- Turn ${idx + 1} User: ${q}`);
        if (a) {
          recentLines.push(`  Turn ${idx + 1} Assistant: ${a}`);
        }
      }
    });
  }

  return [
    `You are the built-in World, Earth & Space Guide companion inside ${appName}.`,
    contextLines.length > 0 ? 'LIVE SIMULATION CONTEXT:' : '',
    ...contextLines,
    recentLines.length > 0
      ? 'RECENT CONVERSATION (FOR FOLLOW-UP CONTINUITY):'
      : '',
    ...recentLines,
    '',
    'USER QUESTION:',
    cleanRequest,
    '',
    'INSTRUCTIONS:',
    '1. Answer the user directly, accurately, and engagingly using plain text or concise markdown.',
    '2. Connect your explanation to their live city, landmark, or camera location above when helpful.',
    '3. Do NOT edit, create, or delete any files, do NOT run tests, and do NOT execute any git commands. Just answer the question clearly.',
    '4. If you need web verification via search_web, run at most 1-2 quick parallel search rounds and immediately synthesize your final answer within 60 seconds.',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
    .trim();
}

/**
 * Builds the Neuro-Layered Self-Modification Instruction for AGY CLI.
 * Ensures the agent modifies the active codebase, writes/runs tests,
 * respects package boundaries, populates existing data structures, and commits to main.
 */
export function buildNeuroLayeredForgePrompt({
  userPrompt,
  appName = "God's Eye View (GEV)",
  repoRoot = process.cwd(),
  context = null,
  autoCommit = true,
} = {}) {
  const cleanRequest = String(userPrompt || '').trim();
  const contextLine = context
    ? `Active Runtime Context: ${JSON.stringify(context)}`
    : '';
  const registryLines = GEV_DATA_STRUCTURE_REGISTRY.map(
    (entry) => `  - ${entry.symbol} (${entry.file}): ${entry.purpose}`,
  );

  return [
    `[NEURO-LAYERED SELF-MODIFICATION DIRECTIVE — ${appName.toUpperCase()}]`,
    `Target Repository Root: ${repoRoot}`,
    contextLine,
    '',
    'USER REQUEST:',
    cleanRequest,
    '',
    'EXISTING GEV EXTENSIBLE DATA STRUCTURES (POPULATE BEFORE INVENTING NEW FILES):',
    ...registryLines,
    '',
    'MANDATORY EXECUTION INVARIANTS (SELF-MODIFYING LIVE FORGE):',
    `1. You are operating inside the live ${appName} codebase (${repoRoot}). Modify this very codebase to implement the user's request cleanly and completely.`,
    '2. When the user asks to add cities, landmarks, tours, venues, corridors, or POIs, populate the existing canonical structures listed above rather than inventing redundant silos.',
    '3. Produce production-quality, modular code with zero placeholders or broken imports.',
    '4. SOVEREIGN & OSS SAFETY: Never hardcode personal residences, Tailscale hostnames, private brand strings, or private companion overrides directly in source or tracked tests; read profile defaults via `resolveForkProfile()` (`src/config/forkProfile.js`) and env config. All tracked unit/regression tests (*.test.mjs) MUST use neutral civic landmarks or synthetic fixtures (e.g., Austin <-> Dallas, example.com, 12.3456), never real personal coordinates/residences/emails; keep personal repro scripts strictly in gitignored tests-private/ (or *.private.test.mjs).',
    '5. UI & CATALOG CONTRACT: If you add a new `registerDrawer(...)` panel, register its card in `EARTH_SIM_FEATURE_CATALOG` (`src/ui/earthSimFeatureCatalog.js`). Wrap all visible UI strings in `msg()`/`t()` and run `npm run i18n` (+ update all 13 `src/i18n/locales/*.json` catalogs).',
    '6. If you add any new client module under src/ imported by src/app/tools.js, register it in scripts/package-boundaries.json under "application-components" and add any new formatted files to scripts/format-scope.json.',
    '7. Write or update unit tests (*.test.mjs) covering the new capability and execute `node --test` on the relevant test files PLUS `npm run check:oss -- --skip-format` (hygiene, boundaries, i18n, catalog, icon subset) to guarantee zero regressions.',
    '8. NEVER merge private fork `main` history directly into any public remote (`upstream` or public fork); export clean updates strictly via `npm run oss:sync`.',
    autoCommit
      ? '9. Once tests and `npm run check:oss` pass, stage your changes and commit cleanly to the current working branch (`git add -A && git commit -m "feat(live-forge): <concise summary>"`).'
      : '9. Leave the verified changes staged/ready in the working tree without committing.',
    '10. Return a concise markdown summary listing: (a) files modified/created, (b) verification test & `check:oss` results, and (c) the git commit hash.',
  ]
    .filter(Boolean)
    .join('\n');
}

function slugifyTourCityId(raw = '', fallback = 'local_tour') {
  const clean = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return clean || fallback;
}

export function normalizeTourBuildDirective(rawTourBuild = {}) {
  if (!rawTourBuild || typeof rawTourBuild !== 'object') return null;
  const placeName = String(
    rawTourBuild.placeName || rawTourBuild.name || '',
  ).trim();
  const cityId = slugifyTourCityId(
    rawTourBuild.cityId || placeName,
    placeName ? 'local_tour' : '',
  );
  const rawScope = String(rawTourBuild.tourScope || '').trim();
  const tourScope =
    rawScope === 'venue' || rawScope === 'metro' || rawScope === 'city'
      ? rawScope
      : 'metro';
  const rawTransit = String(rawTourBuild.transitMode || '').trim();
  const transitMode =
    rawTransit === 'walk_midway' || rawTransit === 'scooter'
      ? rawTransit
      : tourScope === 'venue'
        ? 'walk_midway'
        : 'scooter';
  const radiusMeters = Number.isFinite(Number(rawTourBuild.radiusMeters))
    ? Math.max(1000, Math.round(Number(rawTourBuild.radiusMeters)))
    : tourScope === 'venue'
      ? 2500
      : 32000;
  const lat = Number.isFinite(Number(rawTourBuild.lat))
    ? Number(Number(rawTourBuild.lat).toFixed(6))
    : null;
  const lon = Number.isFinite(Number(rawTourBuild.lon))
    ? Number(Number(rawTourBuild.lon).toFixed(6))
    : null;
  const elev = Number.isFinite(Number(rawTourBuild.elev))
    ? Math.round(Number(rawTourBuild.elev))
    : 20;
  return {
    placeName,
    cityId,
    lat,
    lon,
    elev,
    country: String(rawTourBuild.country || '').trim(),
    region: String(rawTourBuild.region || '').trim(),
    tourScope,
    radiusMeters,
    transitMode,
  };
}

/**
 * Builds a structured Dev Forge prompt for Tour ANYWHERE (`tourBuild`) targeting
 * the Stage 1 Tour Framework v2 contract (`METRO_LANDMARK_CATALOG`, `METRO_TOUR_METADATA`,
 * `LIVING_CITIES` / `CITY_QUERY_ALIASES`, and `MAJOR_WORLD_METROS`).
 */
export function buildTourBuildForgePrompt({
  tourBuild,
  appName = "God's Eye View (GEV)",
  repoRoot = process.cwd(),
  autoCommit = true,
} = {}) {
  const spec = normalizeTourBuildDirective(tourBuild) || {
    placeName: 'Local Place',
    cityId: 'local_place',
    lat: 0,
    lon: 0,
    elev: 20,
    country: '',
    region: '',
    tourScope: 'metro',
    radiusMeters: 32000,
    transitMode: 'scooter',
  };
  const coordLine =
    Number.isFinite(spec.lat) && Number.isFinite(spec.lon)
      ? `${spec.lat}, ${spec.lon} (elev ~${spec.elev}m)`
      : 'Use verified civic coordinates';
  const regionLine = [spec.region, spec.country].filter(Boolean).join(', ');

  return [
    `[TOUR ANYWHERE JIT DEV-FORGE DIRECTIVE — ${appName.toUpperCase()}]`,
    `Target Repository Root: ${repoRoot}`,
    `Target Place: ${spec.placeName}${regionLine ? ` (${regionLine})` : ''}`,
    `Canonical cityId: ${spec.cityId}`,
    `Anchor Coordinates: ${coordLine}`,
    `Tour Framework v2 Scope: tourScope='${spec.tourScope}', radiusMeters=${spec.radiusMeters}, transitMode='${spec.transitMode}'`,
    '',
    'REQUIRED CONTRACT IMPLEMENTATION (TOUR FRAMEWORK v2):',
    `1. Add 4 to 6 real, geographically accurate, civic-safe landmark stops under \`METRO_LANDMARK_CATALOG.${spec.cityId}\` in \`src/layers/citylife/tourAndPlayEngine.js\`.`,
    '   Every stop MUST include: `id` (unique snake_case), `name`, `lat`, `lon`, `elev`, `category` (valid `TOUR_STOP_CATEGORIES`), `lore` (>= 20 chars), `companionNote`, `streetBearingDeg` (0..359), `icon`, `wikiTitle` (exact Wikipedia page title for Wikimedia photo cards), and `youtubeSearchQuery` (evergreen POV search string). Include `youtubeVideoId` ONLY if it is a verified 11-char ID (`^[A-Za-z0-9_-]{11}$`); otherwise omit it.',
    `2. Register \`METRO_TOUR_METADATA.${spec.cityId}\` in \`src/layers/citylife/tourAndPlayEngine.js\` with: \`id: '${spec.cityId}'\`, \`name: '${spec.placeName}'\`, \`continent\`, \`country\`, \`populationNote\`, \`centerLat\`, \`centerLon\`, \`tourScope: '${spec.tourScope}'\`, \`radiusMeters: ${spec.radiusMeters}\`, \`transitMode: '${spec.transitMode}'\`, and \`aliases\` (plus add key aliases to \`METRO_TOUR_CITY_ALIASES\` if helpful).`,
    spec.tourScope !== 'venue'
      ? `3. Register \`LIVING_CITIES.${spec.cityId}\` and \`CITY_QUERY_ALIASES\` in \`src/citylife/cityWaypoints.js\` (with realistic pedestrian corridors & viewpoints), and ensure \`MAJOR_WORLD_METROS\` in \`src/ui/worldSimDock.js\` includes '${spec.placeName}' if absent.`
      : `3. Keep \`${spec.cityId}\` scoped as a tight-radius \`venue\` tour without altering unrelated \`LIVING_CITIES\` entries.`,
    '4. SOVEREIGN & OSS SAFETY: Public civic landmarks ONLY — never hardcode personal coordinates, residences, emails, or private identifiers in source or tracked tests. Ensure the pre-commit hygiene hook passes cleanly.',
    '5. VERIFICATION: Run `node --test src/citylife/tourAndPlayAndAgentForge.test.mjs` and `npm run check:oss -- --skip-format` (including boundaries, i18n, and hygiene) until all checks pass.',
    autoCommit
      ? `6. Once tests and \`check:oss\` pass, commit cleanly to the active branch: \`git add -A && git commit -m "feat(tour-anywhere): add ${spec.placeName} Tour v2"\`.`
      : '6. Leave verified changes in the working tree without committing.',
    '7. IMPORTANT OUTPUT CONTRACT: At the very end of your response, emit a fenced JSON block labeled ```gev-tour-contract-json containing the exact registered Tour v2 payload (`schemaVersion: 2`, `cityId`, `metadata`, `landmarks`) so the running browser session can hot-register it immediately without a page reload.',
  ].join('\n');
}

const VALID_YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts and validates `{ schemaVersion: 2, cityId, metadata, landmarks }` from
 * Dev Forge stdout (`gev-tour-contract-json` fence or trailing JSON fence).
 */
export function extractBuiltTourContractFromOutput(outputText = '') {
  const raw = String(outputText || '');
  if (!raw.trim()) return null;

  const candidates = [];
  const taggedRe = /```gev-tour-contract-json\s*([\s\S]*?)```/gi;
  let match = taggedRe.exec(raw);
  while (match !== null) {
    candidates.push(match[1]);
    match = taggedRe.exec(raw);
  }
  if (candidates.length === 0) {
    const genericRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    const allGeneric = [];
    let gMatch = genericRe.exec(raw);
    while (gMatch !== null) {
      allGeneric.push(gMatch[1]);
      gMatch = genericRe.exec(raw);
    }
    for (let i = allGeneric.length - 1; i >= 0; i -= 1) {
      candidates.push(allGeneric[i]);
    }
  }

  for (const block of candidates) {
    try {
      const parsed = JSON.parse(String(block || '').trim());
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.landmarks) ||
        parsed.landmarks.length === 0
      ) {
        continue;
      }
      const cityId = slugifyTourCityId(
        parsed.cityId || parsed.metadata?.id || parsed.metadata?.name || '',
        '',
      );
      if (!cityId) continue;

      const metaIn =
        parsed.metadata && typeof parsed.metadata === 'object'
          ? parsed.metadata
          : {};
      const displayName = String(metaIn.name || cityId).trim() || cityId;
      const normalizedStops = [];
      let invalidStop = false;

      for (let i = 0; i < parsed.landmarks.length; i += 1) {
        const lm = parsed.landmarks[i];
        const stopName = String(lm?.name || '').trim();
        const lat = Number(lm?.lat);
        const lon = Number(lm?.lon);
        const lore = String(lm?.lore || '').trim();
        const ytId = String(lm?.youtubeVideoId || '').trim();
        if (
          stopName.length < 2 ||
          !Number.isFinite(lat) ||
          lat < -90 ||
          lat > 90 ||
          !Number.isFinite(lon) ||
          lon < -180 ||
          lon > 180 ||
          lore.length < 6 ||
          (ytId && !VALID_YT_ID_RE.test(ytId))
        ) {
          invalidStop = true;
          break;
        }
        const elev = Number.isFinite(Number(lm?.elev))
          ? Math.round(Number(lm.elev))
          : 50;
        const rawBearing = Number(lm?.streetBearingDeg);
        const streetBearingDeg = Number.isFinite(rawBearing)
          ? Math.round(((rawBearing % 360) + 360) % 360)
          : 90;
        normalizedStops.push({
          id: String(lm?.id || '').trim() || `${cityId}_stop_${i + 1}`,
          name: stopName,
          lat: Number(lat.toFixed(6)),
          lon: Number(lon.toFixed(6)),
          elev,
          category:
            String(lm?.category || 'Historic Landmark').trim() ||
            'Historic Landmark',
          lore,
          companionNote:
            String(lm?.companionNote || '').trim() ||
            `Exploring ${stopName} in ${displayName}!`,
          streetBearingDeg,
          icon: String(lm?.icon || '📍').trim() || '📍',
          wikiTitle: String(lm?.wikiTitle || '').trim() || stopName,
          ...(ytId ? { youtubeVideoId: ytId } : {}),
          youtubeSearchQuery:
            String(lm?.youtubeSearchQuery || '').trim() ||
            `${stopName} ${displayName} 4K walking tour`,
          ...(lm?.land ? { land: String(lm.land).trim() } : {}),
          ...(Number.isFinite(Number(lm?.estimatedWaitMin ?? lm?.waitTimeMin))
            ? {
                estimatedWaitMin: Math.round(
                  Number(lm.estimatedWaitMin ?? lm.waitTimeMin),
                ),
              }
            : {}),
          ...(lm?.snackNote || lm?.snackTag
            ? { snackNote: String(lm.snackNote || lm.snackTag).trim() }
            : {}),
          ...(lm?.showcaseZone || lm?.dayChapter
            ? {
                showcaseZone: String(lm.showcaseZone || lm.dayChapter).trim(),
              }
            : {}),
        });
      }

      if (invalidStop || normalizedStops.length === 0) continue;

      const rawScope = String(metaIn.tourScope || '').trim();
      const tourScope =
        rawScope === 'venue' || rawScope === 'city' || rawScope === 'metro'
          ? rawScope
          : 'metro';
      const rawTransit = String(metaIn.transitMode || '').trim();
      const transitMode =
        rawTransit === 'walk_midway' || rawTransit === 'scooter'
          ? rawTransit
          : tourScope === 'venue'
            ? 'walk_midway'
            : 'scooter';
      const radiusMeters = Number.isFinite(Number(metaIn.radiusMeters))
        ? Math.max(1000, Math.round(Number(metaIn.radiusMeters)))
        : tourScope === 'venue'
          ? 2500
          : 32000;
      const centerLat = Number.isFinite(Number(metaIn.centerLat))
        ? Number(metaIn.centerLat)
        : normalizedStops[0].lat;
      const centerLon = Number.isFinite(Number(metaIn.centerLon))
        ? Number(metaIn.centerLon)
        : normalizedStops[0].lon;

      return {
        schemaVersion: 2,
        cityId,
        metadata: {
          ...metaIn,
          id: cityId,
          name: displayName,
          tourScope,
          radiusMeters,
          transitMode,
          centerLat: Number(centerLat.toFixed(6)),
          centerLon: Number(centerLon.toFixed(6)),
        },
        landmarks: normalizedStops,
      };
    } catch {
      /* try next candidate block */
    }
  }
  return null;
}

/**
 * Loads the persisted Tour v2 contract from `tourAndPlayEngine.js` in a child Node
 * process so server modules never statically import browser modules.
 */
export async function loadBuiltTourContractFromRepo({
  repoRoot = process.cwd(),
  cityId = '',
  runProcessImpl = runProcess,
} = {}) {
  const cleanCityId = slugifyTourCityId(cityId, '');
  const tourModulePath = path.join(
    repoRoot,
    'src',
    'layers',
    'citylife',
    'tourAndPlayEngine.js',
  );
  if (!cleanCityId || !fs.existsSync(tourModulePath)) {
    return null;
  }

  const probeScript = [
    'const mod = await import(process.argv[1]);',
    'const cid = process.argv[2];',
    'if (!mod.METRO_LANDMARK_CATALOG?.[cid]) process.exit(2);',
    'const json = mod.exportTourAsContractJson(cid);',
    'if (!json) process.exit(3);',
    'process.stdout.write(json);',
  ].join(' ');

  const res = await runProcessImpl(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      probeScript,
      pathToFileURL(tourModulePath).href,
      cleanCityId,
    ],
    { cwd: repoRoot, timeoutMs: 15000 },
  );
  if (!res?.ok || !res.stdout) {
    return null;
  }
  try {
    const parsed = JSON.parse(res.stdout);
    if (
      parsed &&
      parsed.cityId === cleanCityId &&
      Array.isArray(parsed.landmarks) &&
      parsed.landmarks.length > 0
    ) {
      return {
        schemaVersion: 2,
        cityId: parsed.cityId,
        metadata: parsed.metadata,
        landmarks: parsed.landmarks,
      };
    }
  } catch {
    /* ignore malformed JSON */
  }
  return null;
}

function runProcess(command, args, { cwd, timeoutMs = 420000, env } = {}) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        cwd: cwd || process.cwd(),
        env: env || buildSanitizedAgyEnv(process.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        if (process.platform === 'win32' && child.pid) {
          try {
            const killer = spawn(
              'taskkill',
              ['/PID', String(child.pid), '/T', '/F'],
              {
                windowsHide: true,
                stdio: 'ignore',
              },
            );
            killer.on('error', () => {});
          } catch {
            /* ignore */
          }
        }
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        const cleanedStderr = stripBenignAgyStderrWarnings(stderr);
        resolve({
          ok: false,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr:
            `${cleanedStderr}\n[Timed out after ${Math.round(timeoutMs / 1000)}s]`.trim(),
        });
      }, timeoutMs);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr:
            stripBenignAgyStderrWarnings(stderr) ||
            err?.message ||
            'Failed to spawn process',
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          exitCode: code ?? -1,
          stdout: stdout.trim(),
          stderr: stripBenignAgyStderrWarnings(stderr),
        });
      });
    } catch (err) {
      resolve({
        ok: false,
        exitCode: -1,
        stdout: '',
        stderr: err?.message || 'Process execution error',
      });
    }
  });
}

async function getGitHeadStatus(cwd) {
  const shaRes = await runProcess('git', ['rev-parse', '--short', 'HEAD'], {
    cwd,
    timeoutMs: 8000,
  });
  const branchRes = await runProcess(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd, timeoutMs: 8000 },
  );
  const logRes = await runProcess('git', ['log', '-1', '--pretty=%s'], {
    cwd,
    timeoutMs: 8000,
  });
  return {
    commitSha: shaRes.ok ? shaRes.stdout : null,
    branch: branchRes.ok ? branchRes.stdout : 'main',
    lastCommitSubject: logRes.ok ? logRes.stdout : null,
  };
}

export function buildLocalWorldGuideFallbackAnswer({
  userPrompt,
  context = null,
} = {}) {
  const cleanQuestion = String(userPrompt || '').trim();
  const cityName = context?.cityName || context?.cityId || '';
  const landmarkName =
    typeof context?.currentLandmark === 'string'
      ? context.currentLandmark
      : context?.currentLandmark?.name || '';
  const landmarkCategory =
    typeof context?.currentLandmark === 'object'
      ? context?.currentLandmark?.category || ''
      : '';
  const landmarkLore =
    typeof context?.currentLandmark === 'object'
      ? context?.currentLandmark?.lore || ''
      : '';
  const combinedQuery = `${cleanQuestion} ${cityName} ${landmarkName} ${landmarkLore}`;

  if (/ladies\s*['’]?\s*market|tung\s*choi|mong\s*kok/i.test(combinedQuery)) {
    const sections = [
      "Why it's called the **Ladies' Market** (女人街, *Nui Yan Gai*):",
      '- **1970s Hawker Zone Origins:** In 1975, the Hong Kong government legalized fixed-pitch open-air hawker stalls along **Tung Choi Street** (between Argyle Street and Dundas Street in Mong Kok, Kowloon) to organize street trading.',
      "- **Women's Fashion Dominance:** Those original stalls overwhelmingly sold women's apparel, handbags, cosmetics, hosiery, and accessories at bargain prices — earning the strip its colloquial Cantonese nickname *Nui Yan Gai* (\"Ladies' Street\"), translated into English as the **Ladies' Market**. Even after later expanding to luggage, souvenirs, gadgets, and street snacks, the name stuck.",
      '- **The Skyscraper Canyon Overhead:** Mong Kok is one of the highest-density urban neighborhoods on Earth — narrow pre-war/mid-century *tong lau* tenements wrapped in layered signage sitting directly beneath modern vertical towers like Langham Place and Kowloon\'s slim "pencil skyscrapers."',
    ];
    if (landmarkLore) {
      sections.push(`\n**Active Scene Context:** ${landmarkLore}`);
    }
    sections.push(
      "\n_(Served from GEV's offline World Guide because live AGY CLI models did not return a response in time.)_",
    );
    return sections.join('\n');
  }

  const locationLabel = [cityName, landmarkName].filter(Boolean).join(' — ');
  const parts = [];
  if (locationLabel) {
    parts.push(`**${locationLabel}**`);
  }
  if (landmarkCategory) {
    parts.push(`*Category:* ${landmarkCategory}`);
  }
  if (landmarkLore) {
    parts.push(landmarkLore);
  }
  if (Number.isFinite(context?.lat) && Number.isFinite(context?.lon)) {
    parts.push(
      `Camera Coordinates: ${context.lat.toFixed(4)}, ${context.lon.toFixed(4)} (${Math.round(context.altMeters ?? 0)} m altitude).`,
    );
  }
  if (parts.length === 0) {
    parts.push(
      cleanQuestion
        ? `Received question: "${cleanQuestion}".`
        : "Connected to God's Eye View World Guide.",
    );
  }
  parts.push(
    '\n_(Offline World Guide fallback — live AGY CLI did not return a response in time.)_',
  );
  return parts.join('\n\n');
}

export async function runAgyWithModelFallback({
  cliBinary = DEFAULT_FORGE_CLI_BINARY,
  prompt,
  baseArgs = [],
  requestedModel = DEFAULT_FORGE_MODEL,
  cwd = process.cwd(),
  timeoutMs = 420000,
  mode = 'forge',
  runProcessImpl = runProcess,
} = {}) {
  const candidates = buildAgyModelFallbackChain(requestedModel, { mode });
  const startedAt = Date.now();
  const attempts = [];
  const failedNonSelectionCanonicals = new Set();
  let finalResult = null;
  let resolvedModelUsed = candidates[0] || 'cli-default';
  let finalArgs = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidateModel = candidates[i];
    if (mode === 'ask' && candidateModel) {
      const canonicalCandidate = resolveCanonicalAgyModel(candidateModel);
      if (failedNonSelectionCanonicals.has(canonicalCandidate)) {
        continue;
      }
    }
    if (
      mode === 'ask' &&
      attempts.length > 0 &&
      Date.now() - startedAt >= timeoutMs
    ) {
      break;
    }

    const attemptTimeoutMs =
      mode === 'ask' && timeoutMs >= 90000
        ? Math.min(timeoutMs, i === 0 ? 135000 : 90000)
        : timeoutMs;
    const argsForAttempt = replaceOrRemoveModelArg(baseArgs, candidateModel);
    const fullArgs = ['-p', prompt, ...argsForAttempt];
    const rawExecResult = await runProcessImpl(cliBinary, fullArgs, {
      cwd,
      timeoutMs: attemptTimeoutMs,
    });
    const execResult = {
      ...rawExecResult,
      stderr: stripBenignAgyStderrWarnings(rawExecResult?.stderr || ''),
    };
    attempts.push({
      model: candidateModel || 'cli-default',
      exitCode: execResult.exitCode,
      ok: execResult.ok,
    });
    finalResult = execResult;
    resolvedModelUsed = candidateModel || 'cli-default';
    finalArgs = argsForAttempt;

    if (
      execResult.ok ||
      execResult.exitCode === 0 ||
      !isRetryableAgyAttemptFailure(execResult, { mode })
    ) {
      break;
    }

    if (
      candidateModel &&
      !isInvalidModelSelectionOutput(execResult.stdout, execResult.stderr)
    ) {
      failedNonSelectionCanonicals.add(
        resolveCanonicalAgyModel(candidateModel),
      );
    }
  }

  return {
    execResult: finalResult,
    resolvedModelUsed,
    modelFallbackTriggered: attempts.length > 1,
    attempts,
    finalArgs,
  };
}

export async function handleAgySelfModify(
  req,
  res,
  {
    runProcessImpl = runProcess,
    postForgeCheckImpl = null,
    resetCommitImpl = null,
    repoRoot = process.cwd(),
    settingsPath = null,
    env = process.env,
  } = {},
) {
  if (admitLocalAssistantRequest(req, res, { env })) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  try {
    const rawBody = await readRequestBody(req, 128 * 1024);
    const body = JSON.parse(rawBody || '{}');
    const rawTourBuild =
      body.tourBuild && typeof body.tourBuild === 'object'
        ? body.tourBuild
        : null;
    const normalizedTourBuild = rawTourBuild
      ? normalizeTourBuildDirective(rawTourBuild)
      : null;

    if (rawTourBuild && !normalizedTourBuild?.placeName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          ok: false,
          error: 'tourBuild.placeName is required.',
        }),
      );
      return;
    }

    const userPrompt =
      String(body.prompt || '').trim() ||
      (normalizedTourBuild
        ? `Build a Tour v2 landmark tour for ${normalizedTourBuild.placeName}`
        : '');
    if (!userPrompt) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Prompt is required.',
        }),
      );
      return;
    }

    const adapter = resolveAssistantProviderAdapter({
      providerId: body.providerId,
      cliBinary: body.cliBinary,
    });
    if (!adapter) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: false,
          code: 'unsupported-provider',
          error:
            'Unsupported CLI provider. Allowed providers: agy, claude, codex, gemini.',
        }),
      );
      return;
    }

    const resolvedMode = normalizedTourBuild
      ? 'forge'
      : classifyAgentRequestMode(userPrompt, body.mode);
    const isAskMode = resolvedMode === 'ask';

    if (!isAskMode && !isLiveForgeEnabled(env)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: false,
          code: 'forge-disabled',
          error:
            'Live Dev Forge code modification is disabled by default. Set GEV_ENABLE_LIVE_FORGE=1 on localhost to opt in, or use Ask Guide Q&A mode.',
        }),
      );
      return;
    }

    const cliBinary = adapter.binary;
    const rawModel = String(body.model ?? '').trim();
    const safeModelSelection =
      adapter.id === 'agy'
        ? rawModel
          ? rawModel
          : DEFAULT_FORGE_MODEL
        : rawModel && rawModel !== 'inherit'
          ? rawModel
          : '';
    const resolvedModel = safeModelSelection
      ? resolveCanonicalAgyModel(safeModelSelection)
      : null;

    // Build fixed non-injectable base args for dryRun/fallback inspection.
    const parsedArgs =
      adapter.id === 'agy'
        ? normalizeAgyCliArgs(['--output-format', 'text'], {
            cliBinary,
            model: safeModelSelection,
            mode: resolvedMode,
          })
        : adapter
            .buildArgs({
              prompt: '',
              model: safeModelSelection,
              mode: resolvedMode,
            })
            .filter((token) => token !== '');

    const autoCommit = isAskMode ? false : body.autoCommit !== false;
    const appName = String(body.appName || "God's Eye View (GEV)").slice(0, 80);

    const compiledPrompt = isAskMode
      ? buildWorldGuidePrompt({
          userPrompt,
          appName,
          context: body.context || null,
        })
      : normalizedTourBuild
        ? buildTourBuildForgePrompt({
            tourBuild: normalizedTourBuild,
            appName,
            repoRoot,
            autoCommit,
          })
        : buildNeuroLayeredForgePrompt({
            userPrompt,
            appName,
            repoRoot,
            context: body.context || null,
            autoCommit,
          });

    const gitBefore = isAskMode ? null : await getGitHeadStatus(repoRoot);

    // Dry-run / preview support for unit testing or inspection
    if (body.dryRun === true) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          ok: true,
          dryRun: true,
          providerId: adapter.id,
          mode: resolvedMode,
          autoCommit,
          cliBinary,
          model: resolvedModel,
          cliArgs: adapter.buildArgs({
            prompt: compiledPrompt,
            model: resolvedModel,
            mode: resolvedMode,
          }),
          tourBuild: normalizedTourBuild || undefined,
          neuroPrompt: isAskMode ? null : compiledPrompt,
          worldGuidePrompt: isAskMode ? compiledPrompt : null,
          git: gitBefore,
        }),
      );
      return;
    }

    let fallbackRun;
    if (adapter.id === 'agy') {
      fallbackRun = await runAgyWithModelFallback({
        cliBinary,
        prompt: compiledPrompt,
        baseArgs: parsedArgs,
        requestedModel: resolvedModel || DEFAULT_FORGE_MODEL,
        cwd: repoRoot,
        timeoutMs: Number(body.timeoutMs) || (isAskMode ? 240000 : 420000),
        mode: resolvedMode,
        runProcessImpl,
      });
    } else {
      const adapterArgs = adapter.buildArgs({
        prompt: compiledPrompt,
        model: resolvedModel,
        mode: resolvedMode,
      });
      const rawExecResult = await runProcessImpl(cliBinary, adapterArgs, {
        cwd: repoRoot,
        timeoutMs: Number(body.timeoutMs) || (isAskMode ? 180000 : 420000),
      });
      fallbackRun = {
        execResult: {
          ...rawExecResult,
          stderr: stripBenignAgyStderrWarnings(rawExecResult?.stderr || ''),
        },
        resolvedModelUsed: `${adapter.label}`,
        modelFallbackTriggered: false,
        attempts: [
          {
            model: adapter.id,
            exitCode: rawExecResult?.exitCode ?? -1,
            ok: Boolean(rawExecResult?.ok),
          },
        ],
        finalArgs: adapterArgs,
      };
    }

    const execResult = fallbackRun.execResult || {
      ok: false,
      exitCode: -1,
      stdout: '',
      stderr: 'Execution failed',
    };
    const cleanedStderr = stripBenignAgyStderrWarnings(execResult.stderr || '');
    let gitAfter = isAskMode ? null : await getGitHeadStatus(repoRoot);
    const answerText = (execResult.stdout || '').trim();

    if (isAskMode && (!execResult.ok || !answerText)) {
      const fallbackAnswer = buildLocalWorldGuideFallbackAnswer({
        userPrompt,
        context: body.context || null,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          exitCode: execResult.exitCode,
          mode: resolvedMode,
          cliBinary,
          model: resolvedModel,
          resolvedModelUsed: 'local-world-guide',
          fallbackSource: 'local-world-guide',
          modelFallbackTriggered: true,
          attempts: fallbackRun.attempts,
          cliArgs: fallbackRun.finalArgs,
          answer: fallbackAnswer,
          summary: fallbackAnswer.slice(0, 280),
          output: fallbackAnswer,
          stderr: cleanedStderr,
          git: null,
        }),
      );
      return;
    }

    let forgeVerification = null;
    if (!isAskMode && execResult.ok) {
      const checkScript = path.join(
        repoRoot,
        'scripts',
        'check-oss-invariants.mjs',
      );
      const verifierFn =
        typeof postForgeCheckImpl === 'function'
          ? postForgeCheckImpl
          : runProcessImpl === runProcess && fs.existsSync(checkScript)
            ? async ({ cwd }) =>
                runProcess(process.execPath, [checkScript, '--skip-format'], {
                  cwd,
                  timeoutMs: 120000,
                })
            : null;

      if (verifierFn) {
        const checkRes = await verifierFn({
          cwd: repoRoot,
          gitBefore,
          gitAfter,
        });
        const checkOk = Boolean(checkRes?.ok ?? checkRes?.exitCode === 0);
        const checkDetail = String(
          checkRes?.output || checkRes?.stderr || checkRes?.stdout || '',
        ).trim();
        forgeVerification = {
          ok: checkOk,
          failedStep: checkOk ? null : checkRes?.failedStep || 'check:oss',
          output: checkDetail,
        };

        if (!checkOk) {
          let commitHeld = false;
          if (
            gitBefore?.commitSha &&
            gitAfter?.commitSha &&
            gitAfter.commitSha !== gitBefore.commitSha
          ) {
            const doReset =
              typeof resetCommitImpl === 'function'
                ? resetCommitImpl
                : async ({ targetSha, cwd }) =>
                    runProcess('git', ['reset', '--mixed', targetSha], {
                      cwd,
                      timeoutMs: 15000,
                    });
            const resetRes = await doReset({
              targetSha: gitBefore.commitSha,
              cwd: repoRoot,
            });
            if (resetRes?.ok !== false) {
              commitHeld = true;
              gitAfter = await getGitHeadStatus(repoRoot);
            }
          }

          const guardMsg = [
            `Deterministic post-forge invariant gate failed (${forgeVerification.failedStep}).`,
            commitHeld
              ? `Auto-commit was held back (git reset --mixed ${gitBefore.commitSha}) so invalid changes remain in the working tree rather than on ${gitAfter?.branch || 'main'}.`
              : 'Changes remain unverified in the working tree.',
            checkDetail ? `\n\n${checkDetail.slice(0, 1200)}` : '',
          ]
            .filter(Boolean)
            .join(' ');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              ok: false,
              code: 'forge-invariant-failed',
              exitCode: 1,
              mode: resolvedMode,
              cliBinary,
              model: resolvedModel,
              resolvedModelUsed: fallbackRun.resolvedModelUsed,
              modelFallbackTriggered: fallbackRun.modelFallbackTriggered,
              attempts: fallbackRun.attempts,
              cliArgs: fallbackRun.finalArgs,
              error: guardMsg,
              output: guardMsg,
              stderr: cleanedStderr || checkDetail,
              verification: { ...forgeVerification, commitHeld },
              git: gitAfter,
            }),
          );
          return;
        }
      }
    }

    let builtTour = null;
    if (normalizedTourBuild && execResult.ok) {
      if (runProcessImpl === runProcess) {
        builtTour = await loadBuiltTourContractFromRepo({
          repoRoot,
          cityId: normalizedTourBuild.cityId,
          runProcessImpl,
        });
      }
      if (!builtTour) {
        builtTour = extractBuiltTourContractFromOutput(answerText);
      }
    }

    const combinedOutput = answerText || cleanedStderr || 'Completed.';
    const activeDefaultModel = readAgyCliActiveDefaultModel({ settingsPath });
    const displayModelUsed =
      fallbackRun.resolvedModelUsed === 'cli-default'
        ? `AGY Default · ${activeDefaultModel}`
        : fallbackRun.resolvedModelUsed;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: execResult.ok,
        exitCode: execResult.exitCode,
        mode: resolvedMode,
        cliBinary,
        model: resolvedModel,
        activeDefaultModel,
        resolvedModelUsed: displayModelUsed,
        modelFallbackTriggered: fallbackRun.modelFallbackTriggered,
        attempts: fallbackRun.attempts,
        cliArgs: fallbackRun.finalArgs,
        tourBuild: normalizedTourBuild || undefined,
        builtTour: builtTour || undefined,
        answer: isAskMode ? answerText : undefined,
        summary: isAskMode ? answerText.slice(0, 280) : undefined,
        output: combinedOutput,
        stderr: cleanedStderr,
        verification: forgeVerification,
        git: gitAfter,
      }),
    );
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Agent request failed',
      }),
    );
  }
}

export function parseAgyModelsOutput(stdout = '') {
  const models = [];
  const seen = new Set();
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^fetching\b/i.test(line)) continue;
    const match = line.match(/^([^\s\t]+)(?:\t+|\s{2,})(.+)$/);
    if (match) {
      const slug = match[1].trim();
      const label = match[2].trim();
      const dedupKey = label.toLowerCase();
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        models.push({ id: label, slug, label });
      }
    }
  }
  return models;
}

export async function probeCliAvailability(
  binary,
  {
    env = process.env,
    runProcessImpl = runProcess,
    existsSyncImpl = fs.existsSync,
  } = {},
) {
  if (process.platform === 'win32' && /^agy(?:\.exe)?$/i.test(binary)) {
    const localAgy = path.win32.join(
      String(env?.LOCALAPPDATA || ''),
      'agy',
      'bin',
      'agy.exe',
    );
    if (env?.LOCALAPPDATA && existsSyncImpl(localAgy)) {
      return { available: true, path: localAgy };
    }
  }
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const res = await runProcessImpl(locator, [binary], {
      cwd: process.cwd(),
      timeoutMs: 2500,
    });
    if (res?.ok && res.stdout) {
      const firstMatch = String(res.stdout).split(/\r?\n/)[0]?.trim() || binary;
      return { available: true, path: firstMatch };
    }
  } catch {
    /* not found */
  }
  return { available: false, path: null };
}

export async function detectAssistantCapabilities({
  env = process.env,
  probeCliImpl = (binary) => probeCliAvailability(binary, { env }),
} = {}) {
  const entries = Object.values(ASSISTANT_PROVIDER_ADAPTERS);
  const probeResults = await Promise.all(
    entries.map(async (adapter) => {
      const probe = await probeCliImpl(adapter.binary, adapter);
      return [
        adapter.id,
        {
          id: adapter.id,
          label: adapter.label,
          binary: adapter.binary,
          available: Boolean(probe?.available),
        },
      ];
    }),
  );

  const clis = Object.fromEntries(probeResults);
  const availableClis = Object.values(clis)
    .filter((entry) => entry.available)
    .map((entry) => entry.id);

  const apiKeys = {
    openai: Boolean(String(env?.OPENAI_API_KEY || '').trim()),
    gemini: Boolean(String(env?.GEMINI_API_KEY || '').trim()),
  };

  const liveForgeEnabled = isLiveForgeEnabled(env);
  const recommendedAskProvider =
    availableClis[0] ||
    (apiKeys.gemini ? 'gemini-api' : apiKeys.openai ? 'openai-api' : 'offline');

  return {
    ok: true,
    clis,
    availableClis,
    apiKeys,
    liveForgeEnabled,
    recommendedAskProvider,
  };
}

export async function handleAssistantCapabilities(
  req,
  res,
  { env = process.env, probeCliImpl } = {},
) {
  if (admitLocalAssistantRequest(req, res, { env })) return;
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }
  const caps = await detectAssistantCapabilities({ env, probeCliImpl });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(caps));
}

export async function handleAgyModels(
  req,
  res,
  { runProcessImpl = runProcess, settingsPath = null, env = process.env } = {},
) {
  if (admitLocalAssistantRequest(req, res, { env })) return;
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const activeDefaultModel = readAgyCliActiveDefaultModel({ settingsPath });

  try {
    const modelsRes = await runProcessImpl(
      DEFAULT_FORGE_CLI_BINARY,
      ['models'],
      {
        cwd: process.cwd(),
        timeoutMs: 8000,
      },
    );
    const parsed = modelsRes.ok ? parseAgyModelsOutput(modelsRes.stdout) : [];
    const models = parsed.length > 0 ? parsed : AGY_MODEL_PRESETS;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: true,
        source: parsed.length > 0 ? 'cli' : 'presets',
        defaultModel: DEFAULT_FORGE_MODEL,
        activeDefaultModel,
        models,
      }),
    );
  } catch (error) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: true,
        source: 'presets',
        defaultModel: DEFAULT_FORGE_MODEL,
        activeDefaultModel,
        models: AGY_MODEL_PRESETS,
        warning: error?.message || 'Fell back to preset model list',
      }),
    );
  }
}

export async function handleAgySelfModifyRevert(
  req,
  res,
  { env = process.env } = {},
) {
  if (admitLocalAssistantRequest(req, res, { env })) return;
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }
  if (!isLiveForgeEnabled(env)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        code: 'forge-disabled',
        error:
          'Live Dev Forge revert is disabled unless GEV_ENABLE_LIVE_FORGE=1 is set on localhost.',
      }),
    );
    return;
  }

  try {
    const repoRoot = process.cwd();
    const revertRes = await runProcess('git', ['revert', '--no-edit', 'HEAD'], {
      cwd: repoRoot,
      timeoutMs: 30000,
    });
    const gitAfter = await getGitHeadStatus(repoRoot);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: revertRes.ok,
        output:
          revertRes.stdout ||
          revertRes.stderr ||
          'Reverted latest commit on main.',
        git: gitAfter,
      }),
    );
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Revert failed',
      }),
    );
  }
}
