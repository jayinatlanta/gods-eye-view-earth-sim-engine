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
    'Phase 1 compatibility shim tracks open/close, typology state, and stadium engine cleanly without legacy vanilla DOM',
    () => {
      const mockCityEngine = {
        isSimActive: () => false,
        stepIntoCurrentLocation: () => {},
        stepIntoLocale: () => {},
        stepIntoCity: () => {},
      };

      const drawer = createCityDrawer({
        cityEngine: mockCityEngine,
        container: {},
      });

      assert.ok(drawer);
      assert.equal(drawer.isOpen(), false);
      drawer.open();
      assert.equal(drawer.isOpen(), true);
      drawer.updateArchetypeCard(SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT);
      assert.equal(
        drawer.getLastTypology(),
        SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
      );
      drawer.close();
      assert.equal(drawer.isOpen(), false);
      drawer.destroy();
    },
  );
});
