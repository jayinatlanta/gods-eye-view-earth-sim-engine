/**
 * Earth Sim Engine Welcome Pop-Over Overlay.
 *
 * Sits cleanly above `#first-run-launcher` on initial startup unless suppressed
 * by `?intro=0`, a share link, or the user's "Don't show this on startup" checkbox.
 * Dynamically renders the latest `EARTH_SIM_FEATURE_CATALOG` and can be recalled
 * anytime from the persistent lower-left "Earth Sim" pill beside "Hide Custom UI".
 */

import { msg, t } from '../i18n/index.js';
import {
  EARTH_SIM_CATALOG_VERSION,
  EARTH_SIM_FEATURE_CATEGORIES,
  getEarthSimFeaturesByCategory,
} from './earthSimFeatureCatalog.js';
import { getGlobalDrawerCoordinator } from './worldSimDock.js';

export const EARTH_SIM_INTRO_STORAGE_KEY = 'gev:earth-sim-intro:v1';
export const EARTH_SIM_INTRO_EVENT = 'gev:open-earth-sim-intro';

function readDismissedStorage() {
  try {
    return (
      globalThis?.localStorage?.getItem?.(EARTH_SIM_INTRO_STORAGE_KEY) ===
      'dismissed'
    );
  } catch {
    return false;
  }
}

function writeDismissedStorage(dismissed) {
  try {
    if (dismissed) {
      globalThis?.localStorage?.setItem?.(
        EARTH_SIM_INTRO_STORAGE_KEY,
        'dismissed',
      );
    } else {
      globalThis?.localStorage?.removeItem?.(EARTH_SIM_INTRO_STORAGE_KEY);
    }
  } catch {
    /* ignore in private browsing / headless tests */
  }
}

export function shouldAutoShowEarthSimIntro({
  search = typeof window !== 'undefined' ? window.location?.search || '' : '',
  dismissed = readDismissedStorage(),
  isAutomatedBrowser = Boolean(globalThis?.navigator?.webdriver),
} = {}) {
  const params = new URLSearchParams(String(search || ''));
  const introParam = params.get('intro');
  if (introParam === '0' || introParam === 'false') return false;
  if (introParam === '1' || introParam === 'true') return true;
  if (isAutomatedBrowser) return false;
  if (params.has('s') || params.has('share')) return false;
  return !dismissed;
}

export function createEarthSimTourOverlay({
  coordinator = getGlobalDrawerCoordinator(),
  agentPanel = null,
  container = typeof document !== 'undefined' ? document.body : null,
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  autoShowOnMount = true,
  search,
} = {}) {
  let rootEl = null;
  let isOpen = false;
  let activeCategory = 'all';
  let openTimer = null;
  let destroyed = false;

  const translatedCategoryLabel = (catId) => {
    switch (catId) {
      case 'living-world':
        return t(msg('Living World'));
      case 'travel-mobility':
        return t(msg('Travel & Fleet'));
      case 'charms-places':
        return t(msg('Places & Sandbox'));
      case 'overlays-ai':
        return t(msg('AI & Controls'));
      default:
        return t(msg('All Features'));
    }
  };

  function handleFeatureLaunch(feature) {
    if (!feature) return;
    close();
    if (feature.drawerId) {
      if (coordinator?.isCustomUxCollapsed?.()) {
        coordinator.setCustomUxCollapsed(false);
      }
      coordinator?.openDrawer?.(feature.drawerId);
      return;
    }
    if (feature.id === 'ai-assistant') {
      if (coordinator?.isCustomUxCollapsed?.()) {
        coordinator.setCustomUxCollapsed(false);
      }
      agentPanel?.open?.();
      return;
    }
    if (feature.id === 'custom-ux-toggle') {
      coordinator?.toggleCustomUxCollapsed?.();
    }
  }

  function renderCatalogCards() {
    if (!rootEl || !documentRef) return;
    const listEl = rootEl.querySelector('.gev-earth-sim-catalog-list');
    if (!listEl) return;
    listEl.textContent = '';

    const features = getEarthSimFeaturesByCategory(activeCategory);
    for (const item of features) {
      const card = documentRef.createElement('div');
      card.className = 'gev-earth-sim-feature-card';
      card.setAttribute?.('data-feature-id', item.id);

      const topRow = documentRef.createElement('div');
      topRow.className = 'gev-earth-sim-card-top';

      const titleEl = documentRef.createElement('div');
      titleEl.className = 'gev-earth-sim-card-title';
      titleEl.textContent = `${item.icon} ${t(item.title)}`;
      topRow.appendChild(titleEl);

      if (item.hotkey) {
        const keyBadge = documentRef.createElement('span');
        keyBadge.className = 'gev-earth-sim-hotkey';
        keyBadge.textContent = item.hotkey;
        topRow.appendChild(keyBadge);
      }

      const summaryEl = documentRef.createElement('p');
      summaryEl.className = 'gev-earth-sim-card-summary';
      summaryEl.textContent = t(item.summary);

      const actionsEl = documentRef.createElement('div');
      actionsEl.className = 'gev-earth-sim-card-actions';

      const tryBtn = documentRef.createElement('button');
      tryBtn.type = 'button';
      tryBtn.className = 'gev-earth-sim-try-btn';
      tryBtn.textContent =
        item.id === 'custom-ux-toggle' ? t(msg('Toggle')) : t(msg('Try'));
      tryBtn.addEventListener('click', () => handleFeatureLaunch(item));
      actionsEl.appendChild(tryBtn);

      card.appendChild(topRow);
      card.appendChild(summaryEl);
      card.appendChild(actionsEl);
      listEl.appendChild(card);
    }
  }

  function renderFilterPills() {
    if (!rootEl || !documentRef) return;
    const filterRow = rootEl.querySelector('.gev-earth-sim-filter-row');
    if (!filterRow) return;
    filterRow.textContent = '';

    for (const cat of EARTH_SIM_FEATURE_CATEGORIES) {
      const btn = documentRef.createElement('button');
      btn.type = 'button';
      btn.className = `gev-earth-sim-filter-pill${activeCategory === cat.id ? ' active' : ''}`;
      btn.setAttribute?.('data-category', cat.id);
      btn.textContent = translatedCategoryLabel(cat.id);
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        renderFilterPills();
        renderCatalogCards();
      });
      filterRow.appendChild(btn);
    }
  }

  function buildDOM() {
    if (!container || !documentRef) return;
    const existing = documentRef.getElementById?.(
      'gev-earth-sim-intro-overlay',
    );
    if (existing) {
      rootEl = existing;
      return;
    }

    rootEl = documentRef.createElement('div');
    rootEl.id = 'gev-earth-sim-intro-overlay';
    rootEl.className = 'gev-earth-sim-intro-overlay';
    rootEl.setAttribute?.('role', 'dialog');
    rootEl.setAttribute?.('aria-modal', 'true');
    rootEl.setAttribute?.(
      'aria-label',
      t(msg('Earth Sim Engine Feature Tour')),
    );
    rootEl.hidden = true;

    const card = documentRef.createElement('div');
    card.className = 'gev-earth-sim-intro-card';

    const header = documentRef.createElement('div');
    header.className = 'gev-earth-sim-intro-header';

    const headerText = documentRef.createElement('div');
    const eyebrow = documentRef.createElement('div');
    eyebrow.className = 'gev-earth-sim-intro-eyebrow';
    eyebrow.textContent = t(msg('EARTH SIM ENGINE FORK'));

    const heading = documentRef.createElement('h2');
    heading.className = 'gev-earth-sim-intro-title';
    heading.textContent = t(
      msg("What's Inside God's Eye View (Earth Sim Engine Edition)"),
    );

    const sub = documentRef.createElement('p');
    sub.className = 'gev-earth-sim-intro-subtitle';
    const subText = t(
      msg(
        'Living world cities and locales, multi-modal vehicles, personal domiciles, hideable UI, and multi-provider agentic self-modification or Q&A. All built on top of the GEV open-source globe owned by bilawalsidhu.',
      ),
    );
    const creditToken = 'bilawalsidhu';
    const tokenIndex = subText.indexOf(creditToken);
    if (tokenIndex !== -1) {
      sub.textContent = '';
      if (tokenIndex > 0) {
        sub.appendChild(
          documentRef.createTextNode(subText.slice(0, tokenIndex)),
        );
      }
      const creditLink = documentRef.createElement('a');
      creditLink.className = 'gev-earth-sim-credit-link';
      creditLink.href = 'https://github.com/bilawalsidhu/gods-eye-view';
      creditLink.target = '_blank';
      creditLink.rel = 'noopener noreferrer';
      creditLink.textContent = creditToken;
      sub.appendChild(creditLink);
      const afterToken = subText.slice(tokenIndex + creditToken.length);
      if (afterToken) {
        sub.appendChild(documentRef.createTextNode(afterToken));
      }
    } else {
      sub.textContent = subText;
    }

    const easterEgg = documentRef.createElement('p');
    easterEgg.className = 'gev-earth-sim-easter-egg';
    easterEgg.style.cssText =
      'margin:8px 0 0;padding:6px 10px;border-radius:8px;background:rgba(16,185,129,0.12);border:1px solid rgba(52,211,153,0.35);color:#a7f3d0;font-size:11.5px;line-height:1.45;';
    easterEgg.textContent = t(
      msg(
        "🥚 Easter Egg: Look down in the Florida Keys for a starter coastal house nodding to the world's most popular game launching this same month — click it to explore on foot, scooter, car, boat, or chopper (or ask the AI Agent to invent new activities).",
      ),
    );

    headerText.appendChild(eyebrow);
    headerText.appendChild(heading);
    headerText.appendChild(sub);
    headerText.appendChild(easterEgg);

    const closeBtn = documentRef.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gev-earth-sim-intro-close';
    closeBtn.textContent = '✕';
    closeBtn.title = t(msg('Close'));
    closeBtn.setAttribute?.('aria-label', t(msg('Close')));
    closeBtn.addEventListener('click', () => close());

    header.appendChild(headerText);
    header.appendChild(closeBtn);

    const filterRow = documentRef.createElement('div');
    filterRow.className = 'gev-earth-sim-filter-row';

    const catalogList = documentRef.createElement('div');
    catalogList.className = 'gev-earth-sim-catalog-list';

    const footer = documentRef.createElement('div');
    footer.className = 'gev-earth-sim-intro-footer';

    const suppressLabel = documentRef.createElement('label');
    suppressLabel.className = 'gev-earth-sim-suppress-label';
    const suppressCheckbox = documentRef.createElement('input');
    suppressCheckbox.type = 'checkbox';
    suppressCheckbox.className = 'gev-earth-sim-suppress-checkbox';
    suppressCheckbox.checked = readDismissedStorage();
    suppressCheckbox.addEventListener('change', () => {
      writeDismissedStorage(Boolean(suppressCheckbox.checked));
    });
    const suppressSpan = documentRef.createElement('span');
    suppressSpan.textContent = t(msg("Don't show this on startup"));
    suppressLabel.appendChild(suppressCheckbox);
    suppressLabel.appendChild(suppressSpan);

    const footerRight = documentRef.createElement('div');
    footerRight.className = 'gev-earth-sim-footer-right';
    const verSpan = documentRef.createElement('span');
    verSpan.className = 'gev-earth-sim-version-tag';
    verSpan.textContent = `v${EARTH_SIM_CATALOG_VERSION}`;
    const exploreBtn = documentRef.createElement('button');
    exploreBtn.type = 'button';
    exploreBtn.className = 'gev-earth-sim-explore-btn';
    exploreBtn.textContent = t(msg('Explore Earth'));
    exploreBtn.addEventListener('click', () => close());
    footerRight.appendChild(verSpan);
    footerRight.appendChild(exploreBtn);

    footer.appendChild(suppressLabel);
    footer.appendChild(footerRight);

    card.appendChild(header);
    card.appendChild(filterRow);
    card.appendChild(catalogList);
    card.appendChild(footer);
    rootEl.appendChild(card);

    rootEl.addEventListener('click', (e) => {
      if (e?.target === rootEl) close();
    });

    container.appendChild(rootEl);
    renderFilterPills();
    renderCatalogCards();
  }

  function open() {
    if (destroyed) return;
    if (!rootEl) buildDOM();
    if (!rootEl) return;
    const checkbox = rootEl.querySelector('.gev-earth-sim-suppress-checkbox');
    if (checkbox) {
      checkbox.checked = readDismissedStorage();
    }
    rootEl.hidden = false;
    rootEl.classList?.add?.('open');
    isOpen = true;
  }

  function close() {
    if (!rootEl) return;
    rootEl.classList?.remove?.('open');
    rootEl.hidden = true;
    isOpen = false;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  const onRecallEvent = () => open();
  const onKeyDown = (e) => {
    if (isOpen && e?.key === 'Escape') {
      close();
    }
  };

  windowRef?.addEventListener?.(EARTH_SIM_INTRO_EVENT, onRecallEvent);
  windowRef?.addEventListener?.('keydown', onKeyDown);

  buildDOM();

  const shouldShow =
    autoShowOnMount &&
    shouldAutoShowEarthSimIntro({
      search: search !== undefined ? search : windowRef?.location?.search || '',
      dismissed: readDismissedStorage(),
    });

  if (shouldShow) {
    open();
  }

  function destroy() {
    destroyed = true;
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    windowRef?.removeEventListener?.(EARTH_SIM_INTRO_EVENT, onRecallEvent);
    windowRef?.removeEventListener?.('keydown', onKeyDown);
    rootEl?.remove?.();
    rootEl = null;
    isOpen = false;
  }

  return {
    open,
    close,
    toggle,
    destroy,
    isOpen: () => isOpen,
    getElement: () => rootEl,
    setCategory: (cat) => {
      activeCategory = String(cat || 'all');
      renderFilterPills();
      renderCatalogCards();
    },
    getVisibleFeatureCount: () =>
      getEarthSimFeaturesByCategory(activeCategory).length,
  };
}
