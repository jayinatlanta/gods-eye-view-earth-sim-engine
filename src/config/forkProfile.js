/**
 * Fork Profile & Sovereign Overlay Configuration.
 *
 * Keeps the public Earth Sim Engine release strictly sanitized ('austin',
 * 'Companion', Dev Forge disabled by default) while allowing a private
 * sovereign checkout to configure overrides in `.env` or `pinokio/ENVIRONMENT`
 * without creating merge conflicts across forks.
 */

const VALID_PROFILES = new Set(['public', 'sovereign']);

// Default branch profile: 'sovereign' on private main; scripts/sync-public-fork.mjs sets 'public' for OSS sync.
export const DEFAULT_FORK_PROFILE = 'public';

function readRuntimeEnv(explicitEnv = null) {
  if (explicitEnv && typeof explicitEnv === 'object') return explicitEnv;
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env;
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env;
    }
  } catch {}
  return {};
}

/**
 * Resolve effective fork profile settings from an environment map.
 * Pure & deterministic so it runs identically in Vite, Node tests, and browser bundles.
 *
 * @param {Record<string, unknown> | null} [explicitEnv]
 * @returns {Readonly<{
 *   profile: 'public' | 'sovereign',
 *   defaultStartupCity: string,
 *   defaultCompanionName: string,
 *   enableLiveForge: boolean,
 * }>}
 */
export function resolveForkProfile(explicitEnv = null) {
  const env = readRuntimeEnv(explicitEnv);
  const rawProfile = String(env.GEV_FORK_PROFILE || '')
    .trim()
    .toLowerCase();
  const profile = VALID_PROFILES.has(rawProfile)
    ? rawProfile
    : DEFAULT_FORK_PROFILE;
  const isSovereign = profile === 'sovereign';

  const rawCity = String(env.DEFAULT_STARTUP_CITY || '').trim();
  const defaultStartupCity = (
    rawCity || (isSovereign ? 'atlanta' : 'austin')
  ).toLowerCase();

  const rawCompanion = String(env.GEV_COMPANION_NAME || '').trim();
  const defaultCompanionName = rawCompanion || 'Companion';

  const rawForge = String(env.GEV_ENABLE_LIVE_FORGE ?? '')
    .trim()
    .toLowerCase();
  const enableLiveForge =
    rawForge === '1' || rawForge === 'true'
      ? true
      : rawForge === '0' || rawForge === 'false'
        ? false
        : isSovereign;

  return Object.freeze({
    profile,
    defaultStartupCity,
    defaultCompanionName,
    enableLiveForge,
  });
}

/** Return the active fork profile for the current runtime environment. */
export function getForkProfile() {
  return resolveForkProfile();
}
