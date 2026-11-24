/**
 * Lower-Left Multi-Provider AI Assistant & Opt-In Dev Forge Panel.
 *
 * Features:
 * - Floating lower-left launcher icon (`bottom: 74px; left: 24px`) that pops out
 *   the assistant panel (`bottom: 128px; left: 24px`).
 * - Allowlisted Provider Router (`auto`, `agy`, `claude`, `codex`, `gemini`,
 *   `gemini-api`, `openai-api`) auto-discovered via `/api/assistant/capabilities`.
 * - Inline "Don't have AGY? Setup Guide" help sheet covering GEV API keys,
 *   alternative CLIs (Claude Code, Codex, Gemini CLI), and AGY CLI setup.
 * - Dual-Mode Operation (`auto` / `ask` / `forge`):
 *   - Ask Guide Mode: Answers World, City, Tour Landmark & Space/Universe questions
 *     using live camera coordinates and active Tour/City state via detected CLIs
 *     or `/api/gemini/chat` / `/api/openai/chat` API keys without touching code.
 *   - Dev Forge Mode (explicit opt-in via `GEV_ENABLE_LIVE_FORGE=1` on localhost):
 *     edits the local GEV repository via an allowlisted CLI, runs tests, and commits.
 */

import { findCamera } from '../render/rendererOf.js';
import { getGlobalDrawerCoordinator } from './worldSimDock.js';

export const DEFAULT_AGENT_CLI_BINARY = 'agy';
export const DEFAULT_AGENT_MODEL = 'inherit';
export const DEFAULT_AGENT_MODE = 'auto';
export const DEFAULT_AGENT_PROVIDER = 'auto';
export const DEFAULT_AGENT_CLI_PARAMS = '';
export const AGY_SELECTED_MODEL_STORAGE_KEY = 'gev.agyCompanion.selectedModel';
export const AGY_SELECTED_PROVIDER_STORAGE_KEY =
  'gev.agyCompanion.selectedProvider';

export const AGENT_PROVIDER_OPTIONS = Object.freeze([
  {
    value: 'auto',
    label: '✨ Auto · Best Available (CLI or API Key)',
    kind: 'auto',
  },
  {
    value: 'agy',
    label: '🤖 Antigravity CLI (agy)',
    kind: 'cli',
  },
  {
    value: 'claude',
    label: '🧠 Claude Code CLI (claude)',
    kind: 'cli',
  },
  {
    value: 'codex',
    label: '⚡ OpenAI Codex CLI (codex)',
    kind: 'cli',
  },
  {
    value: 'gemini',
    label: '💎 Gemini CLI (gemini)',
    kind: 'cli',
  },
  {
    value: 'gemini-api',
    label: '🔑 GEV Gemini API Key (/api/gemini/chat)',
    kind: 'api',
  },
  {
    value: 'openai-api',
    label: '🔑 GEV OpenAI API Key (/api/openai/chat)',
    kind: 'api',
  },
]);

export const AGENT_MODE_OPTIONS = Object.freeze([
  {
    value: 'auto',
    label: '✨ Auto · Ask World Guide or Forge Code',
  },
  {
    value: 'ask',
    label: '🌍 Ask Guide · World, City & Space Q&A',
  },
  {
    value: 'forge',
    label: '⚡ Dev Forge · Modify GEV & Commit',
  },
]);

export const AGENT_MODEL_OPTIONS = Object.freeze([
  {
    value: 'inherit',
    label: '⭐ AGY Active Default (Honors CLI/IDE Setting)',
  },
  {
    value: 'Gemini 4 Hydrogen (High)',
    label: 'Gemini 4 Hydrogen (High) · Fast / Light',
  },
  {
    value: 'Gemini 4 Hydrogen (XHigh)',
    label: 'Gemini 4 Hydrogen (XHigh)',
  },
  {
    value: 'Gemini 4 Hydrogen (Medium)',
    label: 'Gemini 4 Hydrogen (Medium)',
  },
  {
    value: 'Gemini 4 Hydrogen (Low)',
    label: 'Gemini 4 Hydrogen (Low)',
  },
  {
    value: 'Orchestrator (Argon)',
    label: 'Orchestrator (Argon) · Multi-Step Dev',
  },
  {
    value: 'Gemini 4 Argon (High)',
    label: 'Gemini 4 Argon (High)',
  },
  {
    value: 'Gemini 4 Argon (Medium)',
    label: 'Gemini 4 Argon (Medium)',
  },
  {
    value: 'Gemini 4 Argon (Low)',
    label: 'Gemini 4 Argon (Low)',
  },
  {
    value: 'Gemini 3.8 Flash (High)',
    label: 'Gemini 3.8 Flash (High)',
  },
  {
    value: 'Gemini 3.8 Flash (Medium)',
    label: 'Gemini 3.8 Flash (Medium)',
  },
  {
    value: 'Gemini 3.8 Flash (Low)',
    label: 'Gemini 3.8 Flash (Low)',
  },
  {
    value: 'Claude Opus 5.5 (Low)',
    label: 'Claude Opus 5.5 (Low)',
  },
  {
    value: 'Claude Opus 5.5 (Medium)',
    label: 'Claude Opus 5.5 (Medium)',
  },
  {
    value: 'Claude Opus 5.5 (High)',
    label: 'Claude Opus 5.5 (High)',
  },
  {
    value: 'Claude Sonnet 5.5 (Low)',
    label: 'Claude Sonnet 5.5 (Low)',
  },
  {
    value: 'Claude Sonnet 5.5 (Medium)',
    label: 'Claude Sonnet 5.5 (Medium)',
  },
  {
    value: 'Claude Sonnet 5.5 (High)',
    label: 'Claude Sonnet 5.5 (High)',
  },
  {
    value: 'GPT-OSS 120B (Medium)',
    label: 'GPT-OSS 120B (Medium)',
  },
]);

function inferPreviewButtonMode(promptText, selectedMode) {
  if (selectedMode === 'ask') return 'ask';
  if (selectedMode === 'forge') return 'forge';
  const text = String(promptText || '').trim();
  if (!text) return 'auto';
  const hasImperativeDev =
    /^\s*(?:please\s+|can you\s+|could you\s+)?(add|create|build|implement|fix|modify|update|change|refactor|remove|delete|wire|patch|commit|restyle|rename|edit|upgrade)\b/i.test(
      text,
    );
  const hasDevTarget =
    /\b(gev|repo|repository|code|codebase|file|module|component|panel|button|ui|css|style|shader|layer|tour stop|city tour|scooter tour|tour|catalog|landmark|endpoint|api|test|bug|feature|commit)\b/i.test(
      text,
    );
  if (hasImperativeDev && (!text.endsWith('?') || hasDevTarget)) {
    return 'forge';
  }
  return 'ask';
}

export function buildClientNeuroLayeredPreview({
  userPrompt,
  appName = "God's Eye View (GEV)",
  autoCommit = true,
} = {}) {
  const clean = String(userPrompt || '').trim();
  return [
    `[NEURO-LAYERED SELF-MODIFICATION DIRECTIVE — ${appName.toUpperCase()}]`,
    `Request: "${clean}"`,
    `Invariants: Modify active ${appName} codebase -> write/run unit tests & boundary checks -> ${autoCommit ? 'commit to main' : 'stage changes'}.`,
  ].join('\n');
}

export function isTourForgeAvailable(capabilities) {
  return Boolean(
    capabilities &&
    capabilities.liveForgeEnabled === true &&
    Array.isArray(capabilities.availableClis) &&
    capabilities.availableClis.filter(Boolean).length > 0,
  );
}

export function createSelfModifyingAgentPanel(options = {}) {
  const {
    viewer = null,
    appName = "God's Eye View (GEV)",
    endpoint = '/api/agy/self-modify',
    revertEndpoint = '/api/agy/self-modify/revert',
    modelsEndpoint = '/api/agy/models',
    capabilitiesEndpoint = '/api/assistant/capabilities',
    container = null,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
    modelsFetchImpl = null,
    capabilitiesFetchImpl = null,
    autoLoadModels = null,
    autoLoadCapabilities = null,
    clipboardWrite = null,
    mountLauncher = true,
  } = options || {};
  const hasCustomFetchWithoutModels =
    Object.prototype.hasOwnProperty.call(options || {}, 'fetchImpl') &&
    !modelsFetchImpl;
  const hasCustomFetchWithoutCaps =
    Object.prototype.hasOwnProperty.call(options || {}, 'fetchImpl') &&
    !capabilitiesFetchImpl;
  const shouldAutoLoadModels =
    typeof autoLoadModels === 'boolean'
      ? autoLoadModels
      : !hasCustomFetchWithoutModels;
  const shouldAutoLoadCapabilities =
    typeof autoLoadCapabilities === 'boolean'
      ? autoLoadCapabilities
      : !hasCustomFetchWithoutCaps || Boolean(capabilitiesFetchImpl);
  const host =
    container || (typeof document !== 'undefined' ? document.body : null);
  let isOpen = false;
  let isRunning = false;
  let launcherBtn = null;
  let panelEl = null;
  let lastResult = null;
  let copyFeedbackTimer = null;
  let activeCliDefaultModel = null;
  let modelsLoadedOnce = false;
  let modelsPromise = null;
  let capabilitiesData = null;
  let capabilitiesLoadedOnce = false;
  let capabilitiesPromise = null;
  const capabilitiesListeners = new Set();
  const recentConversation = [];

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('gev-agent-forge-styles')) return;

    const style = document.createElement('style');
    style.id = 'gev-agent-forge-styles';
    style.textContent = `
      .gev-agent-forge-launcher {
        position: fixed;
        bottom: 52px;
        left: 14px;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, rgba(168, 85, 247, 0.35), rgba(10, 16, 28, 0.92));
        border: 1.5px solid rgba(168, 85, 247, 0.65);
        color: #e9d5ff;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10003;
        backdrop-filter: blur(12px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px rgba(168, 85, 247, 0.35);
        transition: all 0.2s ease;
      }
      @media (max-width: 720px) {
        .gev-agent-forge-launcher {
          bottom: 104px;
          left: 10px;
        }
      }
      .gev-agent-forge-launcher:hover,
      .gev-agent-forge-launcher.open {
        transform: scale(1.08);
        border-color: #22d3ee;
        box-shadow: 0 0 20px rgba(34, 211, 238, 0.55), 0 0 14px rgba(168, 85, 247, 0.45);
      }
      .gev-agent-forge-launcher.running {
        border-color: #f59e0b;
        animation: gevForgePulse 1.4s infinite ease-in-out;
      }
      @keyframes gevForgePulse {
        0%, 100% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.4); }
        50% { box-shadow: 0 0 24px rgba(245, 158, 11, 0.85); }
      }

      .gev-agent-forge-panel {
        position: fixed;
        bottom: 112px;
        left: 16px;
        width: 380px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 140px);
        overflow-y: auto;
        background: rgba(9, 13, 24, 0.95);
        border: 1px solid rgba(168, 85, 247, 0.5);
        border-radius: 14px;
        padding: 15px;
        color: #e2e8f0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        z-index: 10004;
        backdrop-filter: blur(16px);
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.78);
        display: none;
        flex-direction: column;
        gap: 10px;
      }
      .gev-agent-forge-panel.open {
        display: flex;
      }

      .gev-agent-forge-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        padding-bottom: 8px;
      }
      .gev-agent-forge-title {
        font-size: 12.5px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #c084fc;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .gev-agent-forge-sub {
        font-size: 10px;
        color: #94a3b8;
        margin-top: 2px;
      }
      .gev-agent-forge-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .gev-agent-forge-copy,
      .gev-agent-forge-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .gev-agent-forge-copy:hover,
      .gev-agent-forge-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
      .gev-agent-forge-copy.copied {
        color: #34d399;
        background: rgba(16, 185, 129, 0.16);
      }

      .gev-agent-forge-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .gev-agent-forge-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
      }
      .gev-agent-forge-input,
      .gev-agent-forge-textarea {
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 7px;
        padding: 7px 9px;
        color: #f8fafc;
        font-size: 11.5px;
        font-family: 'JetBrains Mono', monospace;
        outline: none;
      }
      .gev-agent-forge-textarea {
        font-family: 'Inter', -apple-system, sans-serif;
        min-height: 76px;
        resize: vertical;
        line-height: 1.4;
      }
      .gev-agent-forge-input:focus,
      .gev-agent-forge-textarea:focus {
        border-color: #a855f7;
        box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
      }
      .gev-forge-model-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .gev-forge-model-select {
        flex: 1;
        min-width: 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .gev-forge-model-refresh {
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 7px;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1;
        padding: 7px 9px;
        cursor: pointer;
        flex-shrink: 0;
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .gev-forge-model-refresh:hover:not(:disabled) {
        border-color: #a855f7;
        color: #ffffff;
      }
      .gev-forge-model-refresh:disabled {
        opacity: 0.55;
        cursor: wait;
      }

      .gev-agent-forge-neuro-box {
        background: rgba(88, 28, 135, 0.18);
        border: 1px dashed rgba(168, 85, 247, 0.45);
        border-radius: 7px;
        padding: 7px 9px;
        font-size: 10px;
        color: #d8b4fe;
        line-height: 1.35;
      }

      .gev-agent-forge-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .gev-agent-forge-submit {
        flex: 2;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid rgba(56, 189, 248, 0.65);
        background: linear-gradient(135deg, #0284c7, #7c3aed);
        color: #ffffff;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gev-agent-forge-submit:hover:not(:disabled) {
        filter: brightness(1.12);
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.45);
      }
      .gev-agent-forge-submit:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .gev-agent-forge-revert {
        flex: 1;
        padding: 7px 8px;
        border-radius: 8px;
        border: 1px solid rgba(239, 68, 68, 0.4);
        background: rgba(30, 41, 59, 0.75);
        color: #fca5a5;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .gev-agent-forge-revert:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.22);
      }

      .gev-forge-context-pill {
        background: rgba(14, 116, 144, 0.22);
        border: 1px solid rgba(34, 211, 238, 0.35);
        border-radius: 7px;
        padding: 5px 8px;
        font-size: 10.5px;
        color: #a5f3fc;
        line-height: 1.35;
      }

      .gev-forge-dev-details {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 6px 8px;
        background: rgba(15, 23, 42, 0.48);
      }
      .gev-forge-dev-summary {
        cursor: pointer;
        font-size: 10.5px;
        font-weight: 700;
        color: #cbd5e1;
        user-select: none;
        list-style: none;
      }
      .gev-forge-dev-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }

      .gev-agent-forge-output {
        background: rgba(2, 6, 23, 0.88);
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 8px;
        padding: 9px 11px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #bae6fd;
        max-height: 260px;
        overflow-y: auto;
        white-space: pre-wrap;
        line-height: 1.45;
      }
      .gev-agent-forge-output.answer-mode {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px;
        color: #e2e8f0;
        border-color: rgba(34, 211, 238, 0.45);
      }

      .gev-forge-setup-toggle {
        background: transparent;
        border: none;
        padding: 0;
        color: #38bdf8;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        text-align: left;
      }
      .gev-forge-setup-toggle:hover {
        color: #7dd3fc;
      }
      .gev-forge-setup-guide {
        display: none;
        flex-direction: column;
        gap: 6px;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 8px;
        padding: 9px 10px;
        font-size: 10.5px;
        line-height: 1.4;
        color: #cbd5e1;
      }
      .gev-forge-setup-guide.open {
        display: flex;
      }
      .gev-forge-setup-guide code {
        background: rgba(2, 6, 23, 0.75);
        padding: 1px 4px;
        border-radius: 4px;
        color: #7dd3fc;
        font-size: 10px;
      }
      .gev-forge-open-keys-btn {
        align-self: flex-start;
        background: rgba(56, 189, 248, 0.14);
        border: 1px solid rgba(56, 189, 248, 0.45);
        color: #7dd3fc;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .gev-forge-open-keys-btn:hover {
        background: rgba(56, 189, 248, 0.24);
      }
      .gev-forge-provider-caps {
        font-size: 10px;
        color: #94a3b8;
        line-height: 1.35;
      }
      .gev-forge-disabled-notice {
        margin-top: 6px;
        font-size: 10px;
        color: #fbbf24;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 6px;
        padding: 6px 8px;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(style);
  }

  function getActiveRuntimeContext() {
    const context = {};
    try {
      const pose = findCamera(viewer)?.pose?.();
      if (pose && Number.isFinite(pose.lat) && Number.isFinite(pose.lon)) {
        context.lat = Number(pose.lat.toFixed(5));
        context.lon = Number(pose.lon.toFixed(5));
        context.altMeters = Math.round(pose.height || 0);
      }
    } catch {
      /* ignore */
    }

    const win =
      typeof window !== 'undefined' ? window : globalThis.window || null;
    try {
      const tourStatus = win?.__gevTourAndPlayEngine?.getStatus?.();
      if (tourStatus) {
        if (tourStatus.cityId) context.cityId = tourStatus.cityId;
        if (tourStatus.cityName) context.cityName = tourStatus.cityName;
        if (tourStatus.state) context.tourState = tourStatus.state;
        if (tourStatus.mode) context.tourMode = tourStatus.mode;
        if (tourStatus.currentLandmark) {
          context.currentLandmark = {
            id: tourStatus.currentLandmark.id,
            name: tourStatus.currentLandmark.name,
            category: tourStatus.currentLandmark.category,
            lore: tourStatus.currentLandmark.lore,
          };
        }
        if (tourStatus.nextLandmark?.name) {
          context.nextLandmark = tourStatus.nextLandmark.name;
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const cityEngine = win?.__gevCityEngine;
      const activeCity = cityEngine?.getActiveCity?.();
      if (activeCity) {
        if (!context.cityId && activeCity.id) context.cityId = activeCity.id;
        if (!context.cityName && activeCity.name) {
          context.cityName = activeCity.name;
        }
        if (activeCity.country) context.country = activeCity.country;
      }
      const activeLocale = cityEngine?.getActiveLocale?.();
      if (activeLocale?.name) {
        context.activeLocale = activeLocale.name;
      }
    } catch {
      /* ignore */
    }

    if (recentConversation.length > 0) {
      context.recentConversation = recentConversation.slice(-3);
    }

    return Object.keys(context).length > 0 ? context : null;
  }

  function formatContextLabel(ctx) {
    if (!ctx) {
      return '🌍 Ready — Ask about any place, landmark, history, or space!';
    }
    const parts = [];
    if (ctx.cityName) parts.push(ctx.cityName);
    if (ctx.currentLandmark?.name) parts.push(ctx.currentLandmark.name);
    else if (ctx.activeLocale) parts.push(ctx.activeLocale);
    if (parts.length > 0) {
      return `📍 Active Location: ${parts.join(' · ')}`;
    }
    if (Number.isFinite(ctx.lat) && Number.isFinite(ctx.lon)) {
      return `📍 Camera: ${ctx.lat.toFixed(3)}, ${ctx.lon.toFixed(3)} · Alt ${ctx.altMeters ?? 0}m`;
    }
    return '🌍 Ready — Ask about any place, landmark, history, or space!';
  }

  function readSavedModelSelection() {
    try {
      const saved = globalThis?.localStorage?.getItem?.(
        AGY_SELECTED_MODEL_STORAGE_KEY,
      );
      return saved && String(saved).trim() ? String(saved).trim() : null;
    } catch {
      return null;
    }
  }

  function saveModelSelection(modelValue) {
    try {
      const val = String(modelValue || '').trim() || DEFAULT_AGENT_MODEL;
      globalThis?.localStorage?.setItem?.(AGY_SELECTED_MODEL_STORAGE_KEY, val);
    } catch {
      /* ignore */
    }
  }

  function readSavedProviderSelection() {
    try {
      const saved = globalThis?.localStorage?.getItem?.(
        AGY_SELECTED_PROVIDER_STORAGE_KEY,
      );
      return saved && String(saved).trim()
        ? String(saved).trim()
        : DEFAULT_AGENT_PROVIDER;
    } catch {
      return DEFAULT_AGENT_PROVIDER;
    }
  }

  function saveProviderSelection(providerValue) {
    try {
      const val = String(providerValue || '').trim() || DEFAULT_AGENT_PROVIDER;
      globalThis?.localStorage?.setItem?.(
        AGY_SELECTED_PROVIDER_STORAGE_KEY,
        val,
      );
    } catch {
      /* ignore */
    }
  }

  function resolveEffectiveAskRoute(selectedProvider) {
    const provider =
      String(selectedProvider || DEFAULT_AGENT_PROVIDER)
        .trim()
        .toLowerCase() || DEFAULT_AGENT_PROVIDER;
    if (provider === 'gemini-api' || provider === 'openai-api') {
      return { kind: 'api', providerId: provider };
    }
    if (provider === 'auto' && capabilitiesData) {
      const availableClis = Array.isArray(capabilitiesData.availableClis)
        ? capabilitiesData.availableClis
        : [];
      if (availableClis.length > 0) {
        return { kind: 'cli', providerId: availableClis[0] };
      }
      if (capabilitiesData.apiKeys?.gemini) {
        return { kind: 'api', providerId: 'gemini-api' };
      }
      if (capabilitiesData.apiKeys?.openai) {
        return { kind: 'api', providerId: 'openai-api' };
      }
    }
    return { kind: 'cli', providerId: provider };
  }

  function buildDirectApiAskPrompt(userPrompt, runtimeContext) {
    const lines = [
      `You are the ${appName} Earth & Space Explorer Guide.`,
      'Answer concisely, accurately, and engagingly based on live context if relevant.',
    ];
    if (runtimeContext) {
      lines.push(`Active context: ${JSON.stringify(runtimeContext)}`);
    }
    lines.push(`Question: ${userPrompt}`);
    return lines.join('\n\n');
  }

  function applyCapabilitiesToUI() {
    if (!panelEl) return;
    const capsEl = panelEl.querySelector('.gev-forge-provider-caps');
    const forgeNoticeEl = panelEl.querySelector('.gev-forge-disabled-notice');
    const autoCommitRow = panelEl.querySelector(
      '.gev-forge-autocommit-container',
    );
    const revertBtn = panelEl.querySelector('.gev-agent-forge-revert');
    const modeSelect = panelEl.querySelector('.gev-forge-mode-select');
    const forgeOption = modeSelect?.querySelector?.('option[value="forge"]');

    const liveForgeAllowed =
      capabilitiesData?.liveForgeEnabled !== undefined
        ? Boolean(capabilitiesData.liveForgeEnabled)
        : true;

    if (forgeOption) {
      forgeOption.disabled = !liveForgeAllowed;
      forgeOption.textContent = liveForgeAllowed
        ? '⚡ Dev Forge · Modify GEV & Commit'
        : '🔒 Dev Forge · Opt-In (Set GEV_ENABLE_LIVE_FORGE=1)';
      if (!liveForgeAllowed && modeSelect.value === 'forge') {
        modeSelect.value = 'ask';
      }
    }
    if (autoCommitRow) {
      autoCommitRow.style.display = liveForgeAllowed ? 'block' : 'none';
    }
    if (revertBtn) {
      revertBtn.style.display = liveForgeAllowed ? '' : 'none';
    }
    if (forgeNoticeEl) {
      forgeNoticeEl.style.display = liveForgeAllowed ? 'none' : 'block';
    }
    if (capsEl && capabilitiesData) {
      const cliSummary = Object.entries(capabilitiesData.clis || {})
        .map(([k, info]) => {
          const isAvail =
            info && typeof info === 'object'
              ? Boolean(info.available)
              : Boolean(info);
          return `${isAvail ? '✓' : '✗'} ${k}`;
        })
        .join(' · ');
      const keySummary = [
        `Gemini Key: ${capabilitiesData.apiKeys?.gemini ? '✓' : '—'}`,
        `OpenAI Key: ${capabilitiesData.apiKeys?.openai ? '✓' : '—'}`,
      ].join(' · ');
      capsEl.textContent = `Detected: ${cliSummary || '—'} | ${keySummary}`;
    }
    syncModePresentation();
  }

  function notifyCapabilitiesListeners() {
    const snapshot = capabilitiesData ? { ...capabilitiesData } : null;
    for (const cb of capabilitiesListeners) {
      try {
        cb(snapshot);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  async function refreshCapabilities({ force = false } = {}) {
    if (!capabilitiesEndpoint) return null;
    if (capabilitiesPromise && !force) return capabilitiesPromise;
    const fn =
      capabilitiesFetchImpl ||
      modelsFetchImpl ||
      fetchImpl ||
      (typeof fetch !== 'undefined' ? fetch : null);
    if (!fn) return null;

    capabilitiesPromise = (async () => {
      try {
        const res = await fn(capabilitiesEndpoint, { method: 'GET' });
        const data = await res?.json?.();
        if (
          data &&
          data.ok &&
          ('liveForgeEnabled' in data ||
            'availableClis' in data ||
            'clis' in data)
        ) {
          capabilitiesLoadedOnce = true;
          capabilitiesData = data;
          applyCapabilitiesToUI();
          notifyCapabilitiesListeners();
        }
        return data || null;
      } catch {
        return null;
      } finally {
        capabilitiesPromise = null;
      }
    })();

    return capabilitiesPromise;
  }

  function resolveForgeCliProviderId() {
    const allowedCliIds = ['agy', 'claude', 'codex', 'gemini'];
    const available = Array.isArray(capabilitiesData?.availableClis)
      ? capabilitiesData.availableClis.filter((id) =>
          allowedCliIds.includes(id),
        )
      : [];
    const selected = String(
      panelEl?.querySelector?.('.gev-forge-provider-select')?.value ||
        readSavedProviderSelection() ||
        DEFAULT_AGENT_PROVIDER,
    )
      .trim()
      .toLowerCase();
    if (allowedCliIds.includes(selected)) {
      if (available.length === 0 || available.includes(selected)) {
        return selected;
      }
    }
    return available[0] || null;
  }

  async function runTourBuildForge(
    tourBuildPayload,
    { fetchImpl: overrideFetch = null } = {},
  ) {
    if (!isTourForgeAvailable(capabilitiesData)) {
      return {
        ok: false,
        code: 'forge-disabled',
        error:
          'Dev Forge tour building requires GEV_ENABLE_LIVE_FORGE=1 and an installed CLI (agy, claude, codex, or gemini).',
      };
    }
    if (isRunning) {
      return {
        ok: false,
        code: 'forge-busy',
        error: 'A Dev Forge operation is already in progress.',
      };
    }
    const providerId = resolveForgeCliProviderId();
    if (!providerId) {
      return {
        ok: false,
        code: 'no-cli',
        error: 'No code-capable CLI detected for Dev Forge.',
      };
    }
    const fn =
      overrideFetch ||
      fetchImpl ||
      (typeof fetch !== 'undefined' ? fetch : null);
    if (!fn) {
      return {
        ok: false,
        code: 'no-fetch',
        error: 'Fetch API unavailable in this environment.',
      };
    }

    const placeName = String(
      tourBuildPayload?.placeName || tourBuildPayload?.name || 'Local Place',
    ).trim();
    const model = String(
      panelEl?.querySelector?.('.gev-forge-model-select')?.value ||
        readSavedModelSelection() ||
        DEFAULT_AGENT_MODEL,
    ).trim();
    const autoCommit = Boolean(
      panelEl?.querySelector?.('.gev-forge-autocommit')?.checked ?? true,
    );
    const outputEl = panelEl?.querySelector?.('.gev-agent-forge-output');
    const submitBtn = panelEl?.querySelector?.('.gev-agent-forge-submit');

    isRunning = true;
    launcherBtn?.classList?.add?.('running');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⚙️ Forging Tour...';
    }
    if (outputEl) {
      outputEl.classList?.remove?.('answer-mode');
      outputEl.textContent = `🛠️ Tour ANYWHERE: Forging "${placeName}" Tour v2 via ${providerId} (${getSelectedModelDisplay(model)})...`;
    }

    try {
      const res = await fn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Build a Tour v2 landmark tour for ${placeName}`,
          mode: 'forge',
          providerId,
          model,
          autoCommit,
          appName,
          tourBuild: tourBuildPayload,
        }),
      });
      const data = await res?.json?.();
      const normalizedResult =
        data && typeof data === 'object'
          ? data
          : { ok: false, error: `Unexpected server status (${res?.status})` };
      if (!res?.ok && normalizedResult.ok !== false) {
        normalizedResult.ok = false;
      }
      lastResult = normalizedResult;
      if (outputEl) {
        outputEl.textContent = normalizedResult.ok
          ? `✅ Tour ANYWHERE Complete (${placeName}):\n${normalizedResult.output || 'Built and verified.'}`
          : `⚠️ Tour Forge Notice (${placeName}):\n${normalizedResult.error || normalizedResult.output || 'Failed.'}`;
      }
      return normalizedResult;
    } catch (err) {
      const failResult = {
        ok: false,
        error: err?.message || 'Tour Forge request failed.',
      };
      if (outputEl) {
        outputEl.textContent = `❌ Tour Forge Error: ${failResult.error}`;
      }
      return failResult;
    } finally {
      isRunning = false;
      launcherBtn?.classList?.remove?.('running');
      if (submitBtn) {
        submitBtn.disabled = false;
      }
      syncModePresentation();
    }
  }

  function formatInheritLabel(activeDefault = activeCliDefaultModel) {
    return activeDefault
      ? `⭐ AGY Active Default (${activeDefault})`
      : '⭐ AGY Active Default (Honors CLI/IDE Setting)';
  }

  function getSelectedModelDisplay(selectedVal) {
    const val = String(selectedVal || DEFAULT_AGENT_MODEL).trim();
    if (!val || val === 'inherit') {
      return activeCliDefaultModel
        ? `AGY Default (${activeCliDefaultModel})`
        : 'AGY Active Default';
    }
    return val;
  }

  function applyAvailableModels({
    models = [],
    activeDefaultModel = null,
  } = {}) {
    if (activeDefaultModel && String(activeDefaultModel).trim()) {
      activeCliDefaultModel = String(activeDefaultModel).trim();
    }
    const modelSelect = panelEl?.querySelector?.('.gev-forge-model-select');
    if (!modelSelect) {
      syncModePresentation();
      return;
    }

    const prevSelection =
      String(modelSelect.value || '').trim() ||
      readSavedModelSelection() ||
      DEFAULT_AGENT_MODEL;

    const entries = [
      {
        value: 'inherit',
        label: formatInheritLabel(activeCliDefaultModel),
      },
    ];
    const seen = new Set(['inherit']);

    const pushModelEntry = (value, label) => {
      const v = String(value || '').trim();
      const lbl = String(label || v).trim();
      if (!v || seen.has(v.toLowerCase())) return;
      seen.add(v.toLowerCase());
      entries.push({ value: v, label: lbl });
    };

    for (const item of Array.isArray(models) ? models : []) {
      const label = String(item?.label || item?.id || '').trim();
      const val = label || String(item?.id || '').trim();
      pushModelEntry(val, label || val);
    }

    for (const preset of AGENT_MODEL_OPTIONS) {
      if (preset.value !== 'inherit') {
        pushModelEntry(preset.value, preset.label);
      }
    }

    if (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      typeof modelSelect.appendChild === 'function'
    ) {
      modelSelect.textContent = '';
      if (Array.isArray(modelSelect.children)) {
        modelSelect.children.length = 0;
      }
      for (const entry of entries) {
        const optEl = document.createElement('option');
        optEl.value = entry.value;
        optEl.textContent = entry.label;
        if (entry.value === prevSelection) {
          optEl.selected = true;
        }
        modelSelect.appendChild(optEl);
      }
    }

    const chosen = entries.some((e) => e.value === prevSelection)
      ? prevSelection
      : DEFAULT_AGENT_MODEL;
    modelSelect.value = chosen;
    syncModePresentation();
  }

  async function refreshModels({ force = false } = {}) {
    if (!modelsEndpoint) return null;
    if (modelsPromise && !force) return modelsPromise;
    const fn =
      modelsFetchImpl ||
      fetchImpl ||
      (typeof fetch !== 'undefined' ? fetch : null);
    if (!fn) return null;

    const refreshBtn = panelEl?.querySelector?.('.gev-forge-model-refresh');
    if (refreshBtn) {
      refreshBtn.disabled = true;
    }

    modelsPromise = (async () => {
      try {
        const res = await fn(modelsEndpoint, { method: 'GET' });
        const data = await res?.json?.();
        if (data && data.ok) {
          modelsLoadedOnce = true;
          applyAvailableModels({
            models: Array.isArray(data.models) ? data.models : [],
            activeDefaultModel: data.activeDefaultModel || null,
          });
        }
        return data || null;
      } catch {
        return null;
      } finally {
        modelsPromise = null;
        if (refreshBtn) {
          refreshBtn.disabled = false;
        }
      }
    })();

    return modelsPromise;
  }

  function syncModePresentation() {
    if (!panelEl) return;
    const modeSelect = panelEl.querySelector('.gev-forge-mode-select');
    const providerSelect = panelEl.querySelector('.gev-forge-provider-select');
    const modelSelect = panelEl.querySelector('.gev-forge-model-select');
    const modelBadge = panelEl.querySelector('.gev-forge-active-model-badge');
    const promptInput = panelEl.querySelector('.gev-forge-prompt');
    const submitBtn = panelEl.querySelector('.gev-agent-forge-submit');
    const devDetails = panelEl.querySelector('.gev-forge-dev-details');
    const contextPill = panelEl.querySelector('.gev-forge-context-pill');

    const selectedMode = String(modeSelect?.value || DEFAULT_AGENT_MODE);
    const selectedProvider = String(
      providerSelect?.value || DEFAULT_AGENT_PROVIDER,
    );
    const selectedModel = String(modelSelect?.value || DEFAULT_AGENT_MODEL);
    const liveForgeAllowed =
      capabilitiesData?.liveForgeEnabled !== undefined
        ? Boolean(capabilitiesData.liveForgeEnabled)
        : true;
    const previewMode = liveForgeAllowed
      ? inferPreviewButtonMode(promptInput?.value || '', selectedMode)
      : 'ask';

    if (contextPill) {
      contextPill.textContent = formatContextLabel(getActiveRuntimeContext());
    }
    if (modelBadge) {
      const route = resolveEffectiveAskRoute(selectedProvider);
      const routeTag =
        route.kind === 'api'
          ? route.providerId === 'openai-api'
            ? 'OpenAI API'
            : 'Gemini API'
          : getSelectedModelDisplay(selectedModel);
      modelBadge.textContent = `Route: ${routeTag}`;
    }

    if (devDetails && selectedMode === 'forge' && liveForgeAllowed) {
      devDetails.open = true;
    }

    if (submitBtn && !isRunning) {
      if (
        liveForgeAllowed &&
        (selectedMode === 'forge' || previewMode === 'forge')
      ) {
        submitBtn.textContent = '⚡ Forge & Commit to Main';
      } else if (selectedMode === 'ask' || !liveForgeAllowed) {
        submitBtn.textContent = '🌍 Ask AI Guide';
      } else {
        submitBtn.textContent = '✨ Ask / Forge';
      }
    }
  }

  async function executeSelfModify() {
    if (!panelEl || isRunning) return;
    const providerSelect = panelEl.querySelector('.gev-forge-provider-select');
    const modelSelect = panelEl.querySelector('.gev-forge-model-select');
    const modeSelect = panelEl.querySelector('.gev-forge-mode-select');
    const promptInput = panelEl.querySelector('.gev-forge-prompt');
    const autoCommitCheckbox = panelEl.querySelector('.gev-forge-autocommit');
    const outputEl = panelEl.querySelector('.gev-agent-forge-output');
    const submitBtn = panelEl.querySelector('.gev-agent-forge-submit');

    const prompt = String(promptInput?.value || '').trim();
    if (!prompt) {
      if (outputEl) {
        outputEl.textContent =
          '⚠️ Ask a question about Earth, a tour landmark, space — or request a feature to build.';
      }
      return;
    }

    const providerId =
      String(providerSelect?.value || DEFAULT_AGENT_PROVIDER).trim() ||
      DEFAULT_AGENT_PROVIDER;
    const model =
      String(modelSelect?.value ?? DEFAULT_AGENT_MODEL).trim() ||
      DEFAULT_AGENT_MODEL;
    const liveForgeAllowed =
      capabilitiesData?.liveForgeEnabled !== undefined
        ? Boolean(capabilitiesData.liveForgeEnabled)
        : true;
    const rawMode = String(modeSelect?.value || DEFAULT_AGENT_MODE).trim();
    const mode =
      !liveForgeAllowed && rawMode === 'forge' ? 'ask' : rawMode || 'auto';
    const autoCommit = Boolean(autoCommitCheckbox?.checked ?? true);
    const previewIntent = liveForgeAllowed
      ? inferPreviewButtonMode(prompt, mode)
      : 'ask';
    const runtimeContext = getActiveRuntimeContext();
    const askRoute = resolveEffectiveAskRoute(providerId);
    const useDirectApiKey =
      askRoute.kind === 'api' && previewIntent !== 'forge';

    isRunning = true;
    launcherBtn?.classList.add('running');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent =
        previewIntent === 'forge'
          ? '⚙️ Forging & Testing...'
          : '🌍 Asking AI Guide...';
    }
    if (outputEl) {
      outputEl.classList?.remove?.('answer-mode');
      const targetDisplay = useDirectApiKey
        ? askRoute.providerId === 'openai-api'
          ? 'OpenAI API Key'
          : 'Gemini API Key'
        : `${providerId} (${getSelectedModelDisplay(model)})`;
      outputEl.textContent =
        previewIntent === 'forge'
          ? `🚀 Running ${targetDisplay}\nExecuting Live Dev Forge pipeline...`
          : `✨ Asking ${targetDisplay}${runtimeContext?.cityName ? ` (${runtimeContext.cityName})` : ''}...`;
    }

    try {
      const fn = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
      if (!fn) {
        throw new Error('Fetch API unavailable in this environment.');
      }

      let data;
      if (useDirectApiKey) {
        const directPrompt = buildDirectApiAskPrompt(prompt, runtimeContext);
        const isOpenAi = askRoute.providerId === 'openai-api';
        const chatUrl = isOpenAi ? '/api/openai/chat' : '/api/gemini/chat';
        const chatBody = isOpenAi
          ? { messages: [{ role: 'user', content: directPrompt }] }
          : { contents: [{ role: 'user', parts: [{ text: directPrompt }] }] };
        const res = await fn(chatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatBody),
        });
        const chatJson = await res.json();
        const answerText = isOpenAi
          ? String(chatJson?.content?.content || chatJson?.error || '').trim()
          : String(
              (Array.isArray(chatJson?.content?.parts)
                ? chatJson.content.parts
                    .filter((p) => typeof p?.text === 'string' && !p.thought)
                    .map((p) => p.text)
                    .join('')
                : '') ||
                chatJson?.error ||
                '',
            ).trim();
        data = {
          ok: !chatJson?.error && Boolean(answerText),
          mode: 'ask',
          providerId: askRoute.providerId,
          resolvedModelUsed: isOpenAi
            ? 'GEV OpenAI API Key'
            : 'GEV Gemini API Key',
          answer: answerText,
          error: chatJson?.error || null,
        };
      } else {
        const res = await fn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            mode,
            providerId: askRoute.providerId,
            model,
            autoCommit,
            appName,
            context: runtimeContext,
          }),
        });
        data = await res.json();
      }
      lastResult = data;

      const cleanAnswer = String(data.answer || data.output || '').trim();
      if (
        data.ok &&
        data.mode === 'ask' &&
        data.fallbackSource !== 'local-world-guide' &&
        cleanAnswer
      ) {
        recentConversation.push({
          question: String(prompt || '')
            .trim()
            .slice(0, 300),
          answer: cleanAnswer.slice(0, 500),
        });
        while (recentConversation.length > 3) {
          recentConversation.shift();
        }
      }
      if (outputEl) {
        if (data.ok && data.mode === 'ask') {
          outputEl.classList?.add?.('answer-mode');
          const modelNote = data.resolvedModelUsed
            ? ` (${data.resolvedModelUsed}${data.modelFallbackTriggered ? ' · fallback' : ''})`
            : '';
          outputEl.textContent = `🌍 AI Companion${modelNote}:\n\n${cleanAnswer || 'Done.'}`;
        } else {
          outputEl.classList?.remove?.('answer-mode');
          const gitBadge = data?.git?.commitSha
            ? `\n\n✅ HEAD: ${data.git.branch || 'main'} @ ${data.git.commitSha} (${data.git.lastCommitSubject || ''})`
            : '';
          const fallbackNote = data?.modelFallbackTriggered
            ? `\n(Resolved via fallback model: ${data.resolvedModelUsed})`
            : '';
          outputEl.textContent = `${data.ok ? '✅ Forge Complete:' : '⚠️ Assistant Notice:'}\n${data.output || data.error || 'Done.'}${fallbackNote}${gitBadge}`;
        }
      }
    } catch (err) {
      if (outputEl) {
        outputEl.classList?.remove?.('answer-mode');
        outputEl.textContent = `❌ Agent Error: ${err?.message || 'Failed to reach assistant endpoint'}`;
      }
    } finally {
      isRunning = false;
      launcherBtn?.classList.remove('running');
      if (submitBtn) {
        submitBtn.disabled = false;
      }
      syncModePresentation();
    }
  }

  async function executeRevert() {
    if (!panelEl || isRunning) return;
    const outputEl = panelEl.querySelector('.gev-agent-forge-output');
    isRunning = true;
    if (outputEl) {
      outputEl.textContent = '⏪ Reverting latest commit on main...';
    }
    try {
      const fn = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
      if (!fn) throw new Error('Fetch API unavailable.');
      const res = await fn(revertEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (outputEl) {
        outputEl.textContent = `${data.ok ? '⏪ Revert Succeeded:' : '⚠️ Revert Notice:'}\n${data.output || data.error || ''}`;
      }
    } catch (err) {
      if (outputEl) {
        outputEl.textContent = `❌ Revert Error: ${err?.message || 'Failed'}`;
      }
    } finally {
      isRunning = false;
    }
  }

  function buildDOM() {
    if (!host || typeof document === 'undefined') return;
    ensureStyles();

    if (mountLauncher !== false) {
      launcherBtn = document.createElement('button');
      launcherBtn.id = 'gev-agent-forge-launcher';
      launcherBtn.className = 'gev-agent-forge-launcher';
      launcherBtn.title =
        'AI Assistant & Guide — World/Space Q&A or Opt-In Dev Forge';
      launcherBtn.setAttribute(
        'aria-label',
        'AI Assistant and World Guide Panel',
      );
      launcherBtn.textContent = '🤖';
      launcherBtn.addEventListener('click', () => toggle());
      host.appendChild(launcherBtn);
    }

    panelEl = document.createElement('div');
    panelEl.id = 'gev-agent-forge-panel';
    panelEl.className = 'gev-agent-forge-panel';
    const copyIconSvg =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const initialModel = readSavedModelSelection() || DEFAULT_AGENT_MODEL;
    const initialProvider = readSavedProviderSelection();
    panelEl.innerHTML = `
      <div class="gev-agent-forge-header">
        <div>
          <div class="gev-agent-forge-title">🤖 AI ASSISTANT & WORLD GUIDE</div>
          <div class="gev-agent-forge-sub">Ask About Earth, Cities & Space using your CLI or GEV API Keys</div>
        </div>
        <div class="gev-agent-forge-header-actions">
          <button type="button" class="gev-agent-forge-copy" title="Copy agent response or error output" aria-label="Copy agent response">${copyIconSvg}</button>
          <button type="button" class="gev-agent-forge-close" title="Close" aria-label="Close">✕</button>
        </div>
      </div>

      <div class="gev-forge-context-pill">🌍 Ready — Ask about any place, landmark, history, or space!</div>

      <div class="gev-agent-forge-field">
        <div class="gev-agent-forge-label">
          <span>Assistant Mode</span>
          <span style="color:#38bdf8;">World Q&A + Opt-In Forge</span>
        </div>
        <select class="gev-agent-forge-input gev-forge-mode-select" title="Select Assistant Mode">
          ${AGENT_MODE_OPTIONS.map(
            (opt) =>
              `<option value="${opt.value}"${opt.value === DEFAULT_AGENT_MODE ? ' selected' : ''}>${opt.label}</option>`,
          ).join('')}
        </select>
        <div class="gev-forge-disabled-notice" style="display:none;">
          🔒 <b>Dev Forge is opt-in</b> for safe public use (Ask Guide works out of the box). To unlock live code modification on localhost, add <code>GEV_ENABLE_LIVE_FORGE=1</code> to <code>.env</code> and restart.
        </div>
      </div>

      <div class="gev-agent-forge-field">
        <div class="gev-agent-forge-label">
          <span>AI Provider (CLI or API Key)</span>
          <button type="button" class="gev-forge-setup-toggle">Don't have AGY? Setup Guide</button>
        </div>
        <select class="gev-agent-forge-input gev-forge-provider-select" title="Choose an allowlisted local CLI (AGY, Claude Code, Codex, Gemini CLI) or GEV API Key">
          ${AGENT_PROVIDER_OPTIONS.map(
            (opt) =>
              `<option value="${opt.value}"${opt.value === initialProvider ? ' selected' : ''}>${opt.label}</option>`,
          ).join('')}
        </select>
        <div class="gev-forge-provider-caps">Checking local CLIs &amp; configured API keys...</div>
        <div class="gev-forge-setup-guide" aria-live="polite">
          <div><b>Use what you already have:</b></div>
          <div>1. <b>Already have an OpenAI or Gemini API key?</b> Open GEV Provider Settings (key icon) and save <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code>, then choose <b>GEV Gemini/OpenAI API Key</b> or keep <b>Auto</b>.</div>
          <div>2. <b>Already use Claude Code, Codex CLI, or Gemini CLI?</b> Ensure <code>claude</code>, <code>codex</code>, or <code>gemini</code> is on your <code>PATH</code> and pick it above — GEV detects it automatically.</div>
          <div>3. <b>Want the Antigravity (AGY) CLI?</b> Install <code>agy</code> from Antigravity, sign in once on your workstation, and optionally set <code>GEV_ENABLE_LIVE_FORGE=1</code> in <code>.env</code> on localhost if you want Dev Forge source editing.</div>
          <button type="button" class="gev-forge-open-keys-btn">🔑 Open Provider Settings</button>
        </div>
      </div>

      <div class="gev-agent-forge-field">
        <div class="gev-agent-forge-label">
          <span>Model Selection (CLI Provider)</span>
          <span style="color:#a855f7;">Default: Honors CLI Setting</span>
        </div>
        <div class="gev-forge-model-row">
          <select class="gev-agent-forge-input gev-forge-model-select" title="Select CLI model or inherit your local default">
            ${AGENT_MODEL_OPTIONS.map(
              (opt) =>
                `<option value="${opt.value}"${opt.value === initialModel ? ' selected' : ''}>${opt.label}</option>`,
            ).join('')}
          </select>
          <button type="button" class="gev-forge-model-refresh" title="Refresh detected providers &amp; models" aria-label="Refresh detected providers and models">↻</button>
        </div>
      </div>

      <div class="gev-agent-forge-field">
        <div class="gev-agent-forge-label">
          <span>Ask or Build Anything</span>
          <span class="gev-forge-active-model-badge" style="color:#a855f7;">Route: ${getSelectedModelDisplay(initialModel)}</span>
        </div>
        <textarea class="gev-agent-forge-textarea gev-forge-prompt" placeholder="Ask about a city or landmark (e.g. &quot;Why is this neighborhood famous?&quot;, &quot;How did this transit hub develop?&quot;) or explore space!"></textarea>
      </div>

      <div class="gev-agent-forge-actions">
        <button class="gev-agent-forge-submit">🌍 Ask AI Guide</button>
      </div>

      <details class="gev-forge-dev-details">
        <summary class="gev-forge-dev-summary">⚙️ Provider Capabilities &amp; Dev Forge</summary>
        <div class="gev-forge-dev-body">
          <div class="gev-agent-forge-field gev-forge-autocommit-container">
            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; color:#34d399; font-size:10.5px; font-weight:700;">
              <span>Dev Forge: Commit verified changes to main</span>
              <input type="checkbox" class="gev-forge-autocommit" checked />
            </label>
          </div>

          <div class="gev-agent-forge-neuro-box">
            🧠 <b>Safe Provider Routing:</b> All CLI requests execute only allowlisted providers (<code>agy</code>, <code>claude</code>, <code>codex</code>, <code>gemini</code>) on loopback with strict Origin validation. Ask Guide mode answers questions cleanly via CLI or configured GEV API keys without modifying source files.
          </div>

          <button class="gev-agent-forge-revert" title="Revert the latest commit on main">⏪ Revert Last Forge Commit</button>
        </div>
      </details>

      <div class="gev-agent-forge-output">Ready. Ask about the world around you on any tour—via local CLI or GEV API keys.</div>
    `;

    const providerSelectEl = panelEl.querySelector(
      '.gev-forge-provider-select',
    );
    if (providerSelectEl) {
      providerSelectEl.value = initialProvider;
      providerSelectEl.addEventListener('change', () => {
        saveProviderSelection(providerSelectEl.value);
        syncModePresentation();
      });
    }

    panelEl
      .querySelector('.gev-forge-setup-toggle')
      ?.addEventListener('click', () => {
        panelEl
          ?.querySelector?.('.gev-forge-setup-guide')
          ?.classList?.toggle?.('open');
      });

    panelEl
      .querySelector('.gev-forge-open-keys-btn')
      ?.addEventListener('click', () => {
        const trigger =
          typeof document !== 'undefined'
            ? document.querySelector?.(
                '[data-key-setup-trigger], #settings-toggle, .gev-settings-btn',
              )
            : null;
        trigger?.click?.();
      });

    const modelSelectEl = panelEl.querySelector('.gev-forge-model-select');
    if (modelSelectEl) {
      modelSelectEl.value = initialModel;
      modelSelectEl.addEventListener('change', () => {
        saveModelSelection(modelSelectEl.value);
        syncModePresentation();
      });
    }

    panelEl
      .querySelector('.gev-forge-model-refresh')
      ?.addEventListener('click', () => {
        void refreshCapabilities({ force: true });
        void refreshModels({ force: true });
      });

    panelEl
      .querySelector('.gev-agent-forge-copy')
      ?.addEventListener('click', () => copyOutput());

    panelEl
      .querySelector('.gev-agent-forge-close')
      ?.addEventListener('click', () => close());

    panelEl
      .querySelector('.gev-agent-forge-submit')
      ?.addEventListener('click', () => executeSelfModify());

    panelEl
      .querySelector('.gev-agent-forge-revert')
      ?.addEventListener('click', () => executeRevert());

    panelEl
      .querySelector('.gev-forge-mode-select')
      ?.addEventListener('change', () => syncModePresentation());

    panelEl
      .querySelector('.gev-forge-prompt')
      ?.addEventListener('input', () => syncModePresentation());

    host.appendChild(panelEl);

    getGlobalDrawerCoordinator().registerOverlayGroup('agent-forge', {
      elements: [launcherBtn, panelEl].filter(Boolean),
      hide: () => close(),
    });
  }

  function open() {
    if (!panelEl) return;
    isOpen = true;
    panelEl.classList.add('open');
    launcherBtn?.classList.add('open');
    syncModePresentation();
    if (shouldAutoLoadModels) {
      if (!capabilitiesLoadedOnce) {
        void refreshCapabilities();
      }
      if (!modelsLoadedOnce) {
        void refreshModels();
      }
    }
  }

  function close() {
    if (!panelEl) return;
    isOpen = false;
    panelEl.classList.remove('open');
    launcherBtn?.classList.remove('open');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  async function writeTextToClipboard(text) {
    if (typeof clipboardWrite === 'function') {
      await clipboardWrite(text);
      return true;
    }
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (typeof nav?.clipboard?.writeText === 'function') {
      try {
        await nav.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through to legacy textarea copy on non-HTTPS origins */
      }
    }
    if (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      document.body
    ) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select?.();
      const copied =
        typeof document.execCommand === 'function'
          ? Boolean(document.execCommand('copy'))
          : false;
      ta.remove();
      return copied;
    }
    return false;
  }

  async function copyOutput() {
    if (!panelEl) return { ok: false, text: '' };
    const outputEl = panelEl.querySelector('.gev-agent-forge-output');
    const copyBtn = panelEl.querySelector('.gev-agent-forge-copy');
    const rawFromDom = String(outputEl?.textContent || '').trim();
    const fallbackFromResult = String(
      lastResult?.answer || lastResult?.output || lastResult?.error || '',
    ).trim();
    const textToCopy = rawFromDom || fallbackFromResult;
    if (!textToCopy) {
      return { ok: false, text: '' };
    }

    const ok = await writeTextToClipboard(textToCopy);
    if (ok && copyBtn) {
      if (typeof copyBtn.getAttribute === 'function') {
        const stored = copyBtn.getAttribute('data-orig-html');
        if (!stored) {
          copyBtn.setAttribute?.('data-orig-html', copyBtn.innerHTML || '');
        }
      }
      copyBtn._origHtml ??= copyBtn.innerHTML || '';
      copyBtn.classList?.add?.('copied');
      copyBtn.setAttribute?.('data-copied', 'true');
      copyBtn.textContent = '✓';
      copyBtn.title = 'Copied!';
      if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = setTimeout(() => {
        copyFeedbackTimer = null;
        if (!copyBtn) return;
        copyBtn.classList?.remove?.('copied');
        copyBtn.removeAttribute?.('data-copied');
        const restoreHtml =
          (typeof copyBtn.getAttribute === 'function'
            ? copyBtn.getAttribute('data-orig-html')
            : null) ?? copyBtn._origHtml;
        if (typeof restoreHtml === 'string' && restoreHtml) {
          copyBtn.innerHTML = restoreHtml;
        } else {
          copyBtn.textContent = '';
        }
        copyBtn.title = 'Copy agent response or error output';
      }, 1600);
    }
    return { ok, text: textToCopy };
  }

  function destroy() {
    if (copyFeedbackTimer) {
      clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = null;
    }
    capabilitiesListeners.clear();
    close();
    getGlobalDrawerCoordinator().unregisterOverlayGroup('agent-forge');
    launcherBtn?.remove();
    panelEl?.remove();
  }

  buildDOM();
  if (shouldAutoLoadCapabilities) {
    void refreshCapabilities();
  }

  return {
    open,
    close,
    toggle,
    destroy,
    executeSelfModify,
    executeRevert,
    copyOutput,
    refreshModels,
    refreshCapabilities,
    runTourBuildForge,
    resolveForgeCliProviderId,
    canBuildTourWithForge: () => isTourForgeAvailable(capabilitiesData),
    onCapabilitiesChange: (cb) => {
      if (typeof cb !== 'function') return () => {};
      capabilitiesListeners.add(cb);
      return () => capabilitiesListeners.delete(cb);
    },
    isOpen: () => isOpen,
    isRunning: () => isRunning,
    getCapabilities: () => (capabilitiesData ? { ...capabilitiesData } : null),
    getSelectedProvider: () =>
      String(
        panelEl?.querySelector?.('.gev-forge-provider-select')?.value ||
          readSavedProviderSelection(),
      ),
    getSelectedModel: () =>
      String(
        panelEl?.querySelector?.('.gev-forge-model-select')?.value ||
          readSavedModelSelection() ||
          DEFAULT_AGENT_MODEL,
      ),
    getActiveDefaultModel: () => activeCliDefaultModel,
    getLastResult: () => lastResult,
    getRecentConversation: () =>
      recentConversation.map((item) => ({ ...item })),
    getElement: () => panelEl,
    getLauncherButton: () => launcherBtn,
  };
}
