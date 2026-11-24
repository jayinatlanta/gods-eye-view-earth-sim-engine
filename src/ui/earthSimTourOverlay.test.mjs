import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import {
  EARTH_SIM_INTRO_STORAGE_KEY,
  createEarthSimTourOverlay,
  shouldAutoShowEarthSimIntro,
} from './earthSimTourOverlay.js';
import { EARTH_SIM_FEATURE_CATALOG } from './earthSimFeatureCatalog.js';
import { createWorldSimDockCoordinator } from './worldSimDock.js';

function setupDomEnv(search = '') {
  const win = new Window({ url: `http://localhost:4173/${search}` });
  const dom = { window: win };
  const storage = new Map();
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevCustomEvent = globalThis.CustomEvent;

  globalThis.document = win.document;
  globalThis.window = win;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  return {
    dom,
    storage,
    restore: () => {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
      if (prevStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = prevStorage;
      if (prevCustomEvent === undefined) delete globalThis.CustomEvent;
      else globalThis.CustomEvent = prevCustomEvent;
    },
  };
}

test('shouldAutoShowEarthSimIntro respects URL query overrides, share links, and storage suppression', () => {
  assert.equal(
    shouldAutoShowEarthSimIntro({ search: '', dismissed: false }),
    true,
  );
  assert.equal(
    shouldAutoShowEarthSimIntro({ search: '', dismissed: true }),
    false,
  );
  assert.equal(
    shouldAutoShowEarthSimIntro({ search: '?intro=0', dismissed: false }),
    false,
  );
  assert.equal(
    shouldAutoShowEarthSimIntro({ search: '?intro=1', dismissed: true }),
    true,
  );
  assert.equal(
    shouldAutoShowEarthSimIntro({ search: '?s=abc123', dismissed: false }),
    false,
  );
  assert.equal(
    shouldAutoShowEarthSimIntro({
      search: '',
      dismissed: false,
      isAutomatedBrowser: true,
    }),
    false,
  );
  assert.equal(
    shouldAutoShowEarthSimIntro({
      search: '?intro=1',
      dismissed: false,
      isAutomatedBrowser: true,
    }),
    true,
  );
});

test('createEarthSimTourOverlay routes intro & recall into Sovereign ExperiencesExplorer, launches features, and preserves catalog parity', () => {
  const env = setupDomEnv();
  try {
    const coordinator = createWorldSimDockCoordinator();
    const openedDrawers = [];
    for (const item of EARTH_SIM_FEATURE_CATALOG) {
      if (item.drawerId) {
        coordinator.registerDrawer(item.drawerId, {
          open: () => openedDrawers.push(item.drawerId),
          close: () => {},
        });
      }
    }

    let assistantOpened = 0;
    const toggleMount = coordinator.mountCustomUxToggle({
      container: env.dom.window.document.body,
      documentRef: env.dom.window.document,
    });
    assert.ok(toggleMount.recallElement);
    assert.equal(toggleMount.recallElement.id, 'gev-earth-sim-intro-recall');

    const overlay = createEarthSimTourOverlay({
      coordinator,
      agentPanel: { open: () => (assistantOpened += 1) },
      windowRef: env.dom.window,
    });

    assert.equal(overlay.isOpen(), true);
    assert.equal(
      overlay.getVisibleFeatureCount(),
      EARTH_SIM_FEATURE_CATALOG.length,
    );

    // Launching a feature un-collapses custom UI, closes overlay, and opens drawer
    coordinator.setCustomUxCollapsed(true);
    assert.equal(overlay.launchFeature('estate'), true);
    assert.equal(overlay.isOpen(), false);
    assert.equal(coordinator.isCustomUxCollapsed(), false);
    assert.deepEqual(openedDrawers, ['estate']);

    // Recall event re-opens overlay cleanly even after close
    toggleMount.recallElement.click();
    assert.equal(overlay.isOpen(), true);

    // Launching AI Assistant opens agentPanel
    assert.equal(overlay.launchFeature('ai-assistant'), true);
    assert.equal(assistantOpened, 1);

    overlay.destroy();
    toggleMount.destroy();
  } finally {
    env.restore();
  }
});
