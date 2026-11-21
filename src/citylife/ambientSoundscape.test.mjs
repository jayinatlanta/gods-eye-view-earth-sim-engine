import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUNDSCAPE_PROFILES,
  ALTITUDE_SOUND_CEILING_M,
  ALTITUDE_SOUND_FULL_M,
  createAmbientSoundscape,
} from '../layers/citylife/ambientSoundscape.js';

test('Living World — Ambient Environmental Audio Micro-Soundscapes', async (t) => {
  function createMockAudioContext() {
    const createdNodes = [];
    return {
      currentTime: 10.0,
      sampleRate: 44100,
      state: 'running',
      destination: { _type: 'destination' },
      createGain: () => {
        const node = {
          _type: 'gain',
          gain: {
            value: 1.0,
            setValueAtTime: (v) => {
              node.gain.value = v;
            },
            setTargetAtTime: (v) => {
              node.gain.value = v;
            },
          },
          connect: () => {},
          disconnect: () => {},
        };
        createdNodes.push(node);
        return node;
      },
      createOscillator: () => {
        const node = {
          _type: 'oscillator',
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          disconnect: () => {},
          start: () => {},
          stop: () => {},
        };
        createdNodes.push(node);
        return node;
      },
      createBiquadFilter: () => {
        const node = {
          _type: 'filter',
          frequency: { setValueAtTime: () => {} },
          Q: { setValueAtTime: () => {} },
          connect: () => {},
          disconnect: () => {},
        };
        createdNodes.push(node);
        return node;
      },
      createBufferSource: () => {
        const node = {
          _type: 'bufferSource',
          connect: () => {},
          disconnect: () => {},
          start: () => {},
          stop: () => {},
        };
        createdNodes.push(node);
        return node;
      },
      createBuffer: (channels, length, rate) => ({
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: () => new Float32Array(length),
      }),
      resume: async () => {},
      close: async () => {},
      _nodes: createdNodes,
    };
  }

  await t.test('engine initializes safely and exposes controls', () => {
    const mockCtx = createMockAudioContext();
    const soundscape = createAmbientSoundscape({ audioContext: mockCtx });

    assert.equal(soundscape.getActiveProfile(), null);
    assert.equal(soundscape.isAudioActive(), false);
    assert.equal(soundscape.isMuted(), false);
    assert.equal(soundscape.getVolume(), 0.35);

    soundscape.destroy();
  });

  await t.test('starts and switches soundscape profiles seamlessly', () => {
    const mockCtx = createMockAudioContext();
    const soundscape = createAmbientSoundscape({ audioContext: mockCtx });

    // 1. Coastal profile
    soundscape.startSoundscape(SOUNDSCAPE_PROFILES.COASTAL);
    assert.equal(soundscape.getActiveProfile(), SOUNDSCAPE_PROFILES.COASTAL);
    assert.equal(soundscape.isAudioActive(), true);

    // 2. Farmland profile
    soundscape.startSoundscape(SOUNDSCAPE_PROFILES.FARMLAND);
    assert.equal(soundscape.getActiveProfile(), SOUNDSCAPE_PROFILES.FARMLAND);

    // 3. Theme Park profile
    soundscape.startSoundscape(SOUNDSCAPE_PROFILES.THEME_PARK);
    assert.equal(soundscape.getActiveProfile(), SOUNDSCAPE_PROFILES.THEME_PARK);

    // 4. Studio Backlot profile (both direct profile and typology key)
    soundscape.startSoundscape('STUDIO_MOVIE_LOT');
    assert.equal(soundscape.getActiveProfile(), SOUNDSCAPE_PROFILES.STUDIO_LOT);
    assert.equal(soundscape.isAudioActive(), true);

    soundscape.stopSoundscape();
    assert.equal(soundscape.getActiveProfile(), null);
    assert.equal(soundscape.isAudioActive(), false);

    soundscape.destroy();
  });

  await t.test('calculates altitude attenuation curve accurately', () => {
    const mockCtx = createMockAudioContext();
    const soundscape = createAmbientSoundscape({ audioContext: mockCtx });

    // Below full threshold (e.g. 30m AGL) -> 1.0 (100% volume)
    const volGround = soundscape.updateAltitude(30);
    assert.equal(volGround, 1.0);

    // At ceiling threshold (e.g. 1500m AGL) -> 0.0 (silent)
    const volCeiling = soundscape.updateAltitude(1500);
    assert.equal(volCeiling, 0.0);

    // Above ceiling (e.g. 2500m AGL) -> 0.0
    const volSpace = soundscape.updateAltitude(2500);
    assert.equal(volSpace, 0.0);

    // Mid altitude (~780m AGL) -> ~0.5
    const volMid = soundscape.updateAltitude(780);
    assert.ok(volMid > 0.45 && volMid < 0.55);

    soundscape.destroy();
  });

  await t.test('volume and mute toggling updates master gain level', () => {
    const mockCtx = createMockAudioContext();
    const soundscape = createAmbientSoundscape({
      audioContext: mockCtx,
      initialVolume: 0.5,
    });

    soundscape.startSoundscape(SOUNDSCAPE_PROFILES.FARMLAND);
    assert.equal(soundscape.getVolume(), 0.5);

    soundscape.setVolume(0.8);
    assert.equal(soundscape.getVolume(), 0.8);

    const muted = soundscape.toggleMute();
    assert.equal(muted, true);
    assert.equal(soundscape.isMuted(), true);

    soundscape.toggleMute();
    assert.equal(soundscape.isMuted(), false);

    soundscape.destroy();
  });
});
