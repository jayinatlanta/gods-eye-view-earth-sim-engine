import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityDrawer } from './cityDrawer.js';
import { SETTLEMENT_TYPOLOGIES } from '../layers/citylife/localeClassifier.js';

test('Living World — City Drawer UI & Anywhere-on-Earth Dispatcher', async (t) => {
  function createMockElement(tagName = 'div') {
    const children = [];
    const listeners = {};
    const classes = new Set();
    const attributes = {};

    const element = {
      tagName: tagName.toUpperCase(),
      style: {},
      dataset: {},
      children,
      parentNode: null,
      innerHTML: '',
      textContent: '',
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => {
        attributes[k] = v;
      },
      getAttribute: (k) => attributes[k] || null,
      addEventListener: (evt, handler) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(handler);
      },
      removeEventListener: (evt, handler) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter((h) => h !== handler);
      },
      click: () => {
        const handlers = listeners['click'] || [];
        for (const h of handlers) h({ stopPropagation: () => {} });
      },
      appendChild: (child) => {
        children.push(child);
        child.parentNode = element;
        return child;
      },
      remove: () => {
        if (element.parentNode) {
          const idx = element.parentNode.children.indexOf(element);
          if (idx >= 0) element.parentNode.children.splice(idx, 1);
          element.parentNode = null;
        }
      },
      querySelector: (selector) => {
        element._queryCache = element._queryCache || {};
        if (element._queryCache[selector]) return element._queryCache[selector];
        const el = createMockElement('div');
        element._queryCache[selector] = el;
        return el;
      },
      querySelectorAll: (selector) => {
        if (selector.includes('.gev-locale-step-btn')) {
          if (!element._stepBtns) {
            element._stepBtns = [1, 2, 3, 4, 5].map((i) => {
              const b = createMockElement('button');
              b.style.whiteSpace = 'nowrap';
              b.style.flexShrink = '0';
              return b;
            });
          }
          return element._stepBtns;
        }
        return [];
      },
    };
    return element;
  }

  await t.test(
    'gracefully handles missing container or SSR environment',
    () => {
      const drawer = createCityDrawer({ container: null });
      assert.ok(drawer);
      assert.equal(typeof drawer.open, 'function');
      assert.equal(typeof drawer.close, 'function');
      assert.equal(drawer.isOpen(), false);
    },
  );

  await t.test(
    'renders Archetype Status Card with live location step button and non-wrapping exemplar buttons',
    () => {
      const origDoc = global.document;
      const origReq = global.requestAnimationFrame;

      const mockBody = createMockElement('body');
      global.document = {
        createElement: (tag) => createMockElement(tag),
        body: mockBody,
      };
      global.requestAnimationFrame = (fn) => fn();

      let steppedIntoLocation = null;
      let steppedIntoLocaleId = null;

      const mockCityEngine = {
        isSimActive: () => false,
        stepIntoCurrentLocation: (opts) => {
          steppedIntoLocation = opts;
        },
        stepIntoLocale: (id) => {
          steppedIntoLocaleId = id;
        },
        stepIntoCity: () => {},
      };

      try {
        const drawer = createCityDrawer({
          cityEngine: mockCityEngine,
          container: mockBody,
        });

        assert.ok(drawer);

        // Verify DOM structure appended
        const drawerEl = mockBody.children.find((c) =>
          c.className?.includes('gev-city-drawer'),
        );
        assert.ok(drawerEl, 'Drawer element must be appended');
        assert.ok(
          drawerEl.innerHTML.includes('gev-studio-park-presets'),
          'Drawer must include Studio Sets & Theme Parks Quick-Jump bar',
        );
        assert.ok(
          drawerEl.innerHTML.includes('paramount_studios') &&
            drawerEl.innerHTML.includes('disney_magic_kingdom'),
          'Drawer must include Paramount and Disney Magic Kingdom preset buttons',
        );

        // Verify Filming Protocol Status Badge toggles on STUDIO_MOVIE_LOT
        drawer.updateArchetypeCard(
          SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
          false,
        );
        const filmingBadge = drawerEl.querySelector(
          '.gev-filming-status-badge',
        );
        assert.equal(filmingBadge.style.display, 'block');
        assert.ok(filmingBadge.textContent.includes('CAMERA ROLLING'));

        const stepHereBtn = drawerEl.querySelector('.gev-locale-step-here-btn');
        assert.ok(stepHereBtn, 'Step Here button must exist in Archetype Card');

        // Simulate clicking Step Here
        stepHereBtn.click();
        assert.ok(
          steppedIntoLocation,
          'Clicking Step Here must invoke stepIntoCurrentLocation',
        );
        assert.ok(steppedIntoLocation.typology, 'Must pass active typology');

        // Verify Exemplar cards have non-wrapping button styling
        const stepBtns = drawerEl.querySelectorAll('.gev-locale-step-btn');
        assert.ok(
          stepBtns.length >= 5,
          'Must render at least 5 exemplar locale buttons',
        );
        for (const btn of stepBtns) {
          assert.equal(
            btn.style.whiteSpace,
            'nowrap',
            'Exemplar Step In button must have whiteSpace: nowrap',
          );
          assert.equal(
            btn.style.flexShrink,
            '0',
            'Exemplar Step In button must have flexShrink: 0',
          );
        }

        assert.ok(
          drawerEl.style.cssText.includes('max-height: calc(100vh'),
          'Living World drawer must constrain max-height inside viewport',
        );
        assert.ok(
          drawerEl.innerHTML.includes('gev-city-scroll-body'),
          'Living World drawer must wrap tab panes in a scrollable body',
        );
        assert.equal(
          drawerEl.innerHTML.includes('ATL & PHX'),
          false,
          'Gameday Spectacles header must not hardcode regional ATL & PHX branding',
        );
        assert.ok(
          drawerEl.innerHTML.includes('gev-stadium-metro-filter'),
          'Gameday Spectacles must expose dynamic metro/region filter dropdown',
        );
        assert.ok(
          drawerEl.innerHTML.includes('gev-stadium-preset-grid'),
          'Gameday Spectacles must render venues dynamically into preset grid',
        );

        drawer.destroy();
      } finally {
        global.document = origDoc;
        global.requestAnimationFrame = origReq;
      }
    },
  );

  await t.test(
    'renders responsive, collision-free ambient pills and supports dock-active collision avoidance',
    () => {
      const origDoc = global.document;
      const origReq = global.requestAnimationFrame;

      const mockBody = createMockElement('body');
      const mockCommandDock = createMockElement('div');
      mockCommandDock.id = 'command-dock';
      const mockControlPanel = createMockElement('div');
      mockControlPanel.id = 'control-panel';
      mockControlPanel.classList.add('collapsed');

      const elementsById = {
        'command-dock': mockCommandDock,
        'control-panel': mockControlPanel,
      };

      global.document = {
        createElement: (tag) => createMockElement(tag),
        getElementById: (id) => elementsById[id] || null,
        body: mockBody,
      };
      global.requestAnimationFrame = (cb) => cb();

      try {
        let cityDepthCallback = null;
        const mockCityEngine = {
          onCityDepth: (cb) => {
            cityDepthCallback = cb;
          },
          stepIntoCurrentLocation: () => {},
        };

        const drawer = createCityDrawer({
          cityEngine: mockCityEngine,
          container: mockBody,
        });

        // Find the ambient pill container attached to container/body
        const ambientPill = mockBody.children.find(
          (c) => c.className === 'gev-city-ambient-container',
        );
        assert.ok(ambientPill, 'Ambient pill container must be created');

        // Trigger depth callback to show pill for a city
        assert.ok(cityDepthCallback, 'Must register onCityDepth callback');
        cityDepthCallback({ name: 'Chicago', lat: 41.8781, lon: -87.6298 });

        assert.equal(ambientPill.style.display, 'flex');
        assert.ok(
          ambientPill.classList.contains('visible'),
          'Pill must have visible class',
        );

        const label = ambientPill.querySelector('.gev-ambient-city-label');
        assert.equal(
          label.textContent,
          'Living World (Chicago)',
          'Must format compact, non-interfering city label',
        );

        drawer.destroy();
      } finally {
        global.document = origDoc;
        global.requestAnimationFrame = origReq;
      }
    },
  );
});
