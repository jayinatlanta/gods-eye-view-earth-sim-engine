import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FORK_PROFILE,
  getForkProfile,
  resolveForkProfile,
} from './forkProfile.js';

test('forkProfile resolves public and sovereign profiles deterministically', () => {
  const pub = resolveForkProfile({ GEV_FORK_PROFILE: 'public' });
  assert.deepEqual(pub, {
    profile: 'public',
    defaultStartupCity: 'austin',
    defaultCompanionName: 'Companion',
    enableLiveForge: false,
  });

  const sov = resolveForkProfile({ GEV_FORK_PROFILE: 'sovereign' });
  assert.deepEqual(sov, {
    profile: 'sovereign',
    defaultStartupCity: 'atlanta',
    defaultCompanionName: 'Companion',
    enableLiveForge: true,
  });

  const overridden = resolveForkProfile({
    GEV_FORK_PROFILE: 'public',
    DEFAULT_STARTUP_CITY: 'Tokyo',
    GEV_COMPANION_NAME: 'Scout',
    GEV_ENABLE_LIVE_FORGE: '1',
  });
  assert.deepEqual(overridden, {
    profile: 'public',
    defaultStartupCity: 'tokyo',
    defaultCompanionName: 'Scout',
    enableLiveForge: true,
  });

  const emptyDefault = resolveForkProfile({});
  assert.equal(emptyDefault.profile, DEFAULT_FORK_PROFILE);
  assert.equal(
    emptyDefault.defaultStartupCity,
    DEFAULT_FORK_PROFILE === 'sovereign' ? 'atlanta' : 'austin',
  );
  assert.equal(emptyDefault.defaultCompanionName, 'Companion');
  assert.equal(typeof getForkProfile().defaultStartupCity, 'string');
});
