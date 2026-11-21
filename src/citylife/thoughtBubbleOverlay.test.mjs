import test from 'node:test';
import assert from 'node:assert/strict';
import { createThoughtBubbleOverlay } from './thoughtBubbleOverlay.js';

test('Living World — Thought Bubble Overlay & Interactive Camera Controls', async (t) => {
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
        const queue = [...children];
        while (queue.length > 0) {
          const curr = queue.shift();
          if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) {
            return curr;
          }
          if (curr.children) queue.push(...curr.children);
        }
        return null;
      },
      querySelectorAll: (selector) => {
        if (selector === '.gev-bubble-cam-btn') {
          if (!element._camBtns) {
            element._camBtns = ['companion', 'flaneur', 'balcony', 'free'].map((mode) => {
              const b = createMockElement('button');
              b.classList.add('gev-bubble-cam-btn');
              b.setAttribute('data-mode', mode);
              return b;
            });
          }
          return element._camBtns;
        }
        return [];
      },
    };
    return element;
  }

  await t.test('gracefully handles missing container or SSR environment', () => {
    const bubble = createThoughtBubbleOverlay({ container: null });
    assert.ok(bubble);
    assert.equal(typeof bubble.show, 'function');
    assert.equal(typeof bubble.hide, 'function');
    assert.equal(bubble.isVisible(), false);
  });

  await t.test('supports polymorphic show and prevents literal undefined output', () => {
    const origDoc = global.document;
    const origReq = global.requestAnimationFrame;

    const mockBody = createMockElement('body');
    global.document = {
      createElement: (tag) => createMockElement(tag),
      body: mockBody,
    };
    global.requestAnimationFrame = (cb) => {
      cb();
      return 1;
    };

    try {
      const bubble = createThoughtBubbleOverlay({
        viewer: null,
        container: mockBody,
      });

      // 1. Inverted argument order: show(persona, pos)
      const mockPos = { lat: 30.267, lon: -97.743, elev: 150 };
      const incompletePersona = {
        name: 'Dwight Hagedorn',
        occupation: 'Grain Farmer',
      };

      bubble.show(incompletePersona, mockPos);
      assert.equal(bubble.isVisible(), true);

      // Verify that missing thought / age / city / speed are sanitized and NOT literal "undefined"
      const bubbleEl = mockBody.children[0];
      assert.ok(bubbleEl);
      assert.ok(!bubbleEl.innerHTML.includes('undefined'), 'Must not render literal "undefined"');
      assert.ok(bubbleEl.innerHTML.includes('Dwight Hagedorn'));
      assert.ok(bubbleEl.innerHTML.includes('Grain Farmer'));

      // 2. Camera perspective buttons
      let selectedCamMode = null;
      bubble.onCameraMode((mode) => {
        selectedCamMode = mode;
      });

      const camBtns = bubbleEl.querySelectorAll('.gev-bubble-cam-btn');
      assert.equal(camBtns.length, 4, 'Must render 4 quick camera perspective buttons');
      
      // Click Front camera button
      const frontBtn = camBtns.find((b) => b.getAttribute('data-mode') === 'flaneur');
      assert.ok(frontBtn);
      frontBtn.click();
      assert.equal(selectedCamMode, 'flaneur', 'Clicking camera pill must trigger onCameraMode');

      bubble.destroy();
    } finally {
      global.document = origDoc;
      global.requestAnimationFrame = origReq;
    }
  });
});
