import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EARTH_SIM_FEATURE_CATALOG,
  EARTH_SIM_FEATURE_CATEGORIES,
  getEarthSimFeaturesByCategory,
  validateFeatureCatalogAgainstDrawers,
} from './earthSimFeatureCatalog.js';

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function collectRegisteredDrawersInSource(dir) {
  const found = new Set();
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'testSupport') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }
      if (
        !entry.name.endsWith('.js') ||
        entry.name.endsWith('.test.mjs') ||
        fullPath.endsWith(`${path.sep}worldSimDock.js`)
      ) {
        continue;
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.matchAll(
        /\.registerDrawer\(\s*['"]([a-zA-Z0-9_-]+)['"]/g,
      );
      for (const m of matches) {
        found.add(m[1]);
      }
    }
  }
  return [...found].sort();
}

test('Earth Sim Feature Catalog covers every registered drawer in src/ (dynamic contract)', () => {
  const registeredDrawers = collectRegisteredDrawersInSource(SRC_DIR);
  assert.ok(
    registeredDrawers.length >= 10,
    `Expected >= 10 registered drawers in src/, found ${registeredDrawers.length}`,
  );

  const report = validateFeatureCatalogAgainstDrawers(registeredDrawers);
  assert.equal(
    report.ok,
    true,
    `Every registerDrawer(id) must be listed in EARTH_SIM_FEATURE_CATALOG. Missing: ${report.missing.join(', ')}`,
  );

  const validCategoryIds = new Set(
    EARTH_SIM_FEATURE_CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.id),
  );
  const seenIds = new Set();
  for (const item of EARTH_SIM_FEATURE_CATALOG) {
    assert.ok(item.id && !seenIds.has(item.id), `Duplicate id: ${item.id}`);
    seenIds.add(item.id);
    assert.ok(
      validCategoryIds.has(item.category),
      `Invalid category on ${item.id}: ${item.category}`,
    );
    assert.ok(
      typeof item.title === 'string' && item.title.length > 0,
      `Missing title on ${item.id}`,
    );
    assert.ok(
      typeof item.summary === 'string' && item.summary.length > 15,
      `Missing summary on ${item.id}`,
    );
  }

  assert.ok(
    getEarthSimFeaturesByCategory('overlays-ai').some(
      (f) => f.id === 'custom-ux-toggle',
    ),
  );
  assert.ok(
    getEarthSimFeaturesByCategory('overlays-ai').some(
      (f) => f.id === 'ai-assistant',
    ),
  );
});
