/**
 * Sightseeing Context Drawer / Detail Modal for God's Eye View.
 * Displays discovered high-resolution photography, narrative extract,
 * and Wikimedia Commons attribution when a 3D billboard is selected.
 */

export function createSightseeingDrawer({
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container) {
    return {
      show: () => {},
      hide: () => {},
      destroy: () => {},
      isVisible: () => false,
    };
  }

  const overlay = document.createElement('div');
  overlay.id = 'gev-sightseeing-drawer';
  overlay.className = 'gev-sightseeing-drawer hidden';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Sightseeing Landmark Details');

  overlay.innerHTML = `
    <div class="gev-sightseeing-backdrop"></div>
    <div class="gev-sightseeing-card">
      <div class="gev-sightseeing-header">
        <div class="gev-sightseeing-badge">
          <span class="gev-sightseeing-badge-dot"></span>
          <span>DISCOVERED SIGHTSEEING</span>
        </div>
        <button class="gev-sightseeing-close" aria-label="Close dialog" title="Close (Esc)">✕</button>
      </div>
      <div class="gev-sightseeing-image-wrap">
        <img class="gev-sightseeing-img" src="" alt="" loading="lazy" />
      </div>
      <div class="gev-sightseeing-body">
        <h2 class="gev-sightseeing-title"></h2>
        <div class="gev-sightseeing-coords"></div>
        <p class="gev-sightseeing-extract"></p>
        <div class="gev-sightseeing-footer">
          <span class="gev-sightseeing-source">Source: Wikimedia Commons / Wikipedia</span>
          <a class="gev-sightseeing-link" href="#" target="_blank" rel="noopener noreferrer">View Full Image ↗</a>
        </div>
      </div>
    </div>
  `;

  // Inject styles if not present
  if (!document.getElementById('gev-sightseeing-styles')) {
    const style = document.createElement('style');
    style.id = 'gev-sightseeing-styles';
    style.textContent = `
      .gev-sightseeing-drawer {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        transition: opacity 0.2s ease, visibility 0.2s ease;
      }
      .gev-sightseeing-drawer.hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
      .gev-sightseeing-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(8px);
      }
      .gev-sightseeing-card {
        position: relative;
        z-index: 1;
        width: 90%;
        max-width: 580px;
        max-height: 85vh;
        overflow-y: auto;
        background: rgba(13, 17, 23, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 12px;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.7), 0 0 24px rgba(0, 230, 118, 0.12);
        color: #e6edf3;
        display: flex;
        flex-direction: column;
      }
      .gev-sightseeing-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .gev-sightseeing-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: #00e676;
      }
      .gev-sightseeing-badge-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #00e676;
        box-shadow: 0 0 8px #00e676;
      }
      .gev-sightseeing-close {
        background: transparent;
        border: none;
        color: #8b949e;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        line-height: 1;
      }
      .gev-sightseeing-close:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .gev-sightseeing-image-wrap {
        width: 100%;
        height: 280px;
        background: #000;
        overflow: hidden;
        position: relative;
      }
      .gev-sightseeing-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .gev-sightseeing-body {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .gev-sightseeing-title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #ffffff;
      }
      .gev-sightseeing-coords {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: #7ee787;
      }
      .gev-sightseeing-extract {
        margin: 8px 0 0 0;
        font-size: 14px;
        line-height: 1.6;
        color: #c9d1d9;
      }
      .gev-sightseeing-footer {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
      }
      .gev-sightseeing-source {
        color: #8b949e;
      }
      .gev-sightseeing-link {
        color: #58a6ff;
        text-decoration: none;
      }
      .gev-sightseeing-link:hover {
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  container.appendChild(overlay);

  const backdrop = overlay.querySelector('.gev-sightseeing-backdrop');
  const closeBtn = overlay.querySelector('.gev-sightseeing-close');
  const imgEl = overlay.querySelector('.gev-sightseeing-img');
  const titleEl = overlay.querySelector('.gev-sightseeing-title');
  const coordsEl = overlay.querySelector('.gev-sightseeing-coords');
  const extractEl = overlay.querySelector('.gev-sightseeing-extract');
  const linkEl = overlay.querySelector('.gev-sightseeing-link');

  let active = false;

  function hide() {
    active = false;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    imgEl.src = '';
  }

  function show(billboard) {
    if (!billboard) return;
    active = true;
    titleEl.textContent = billboard.title || 'Discovered Landmark';
    const latStr =
      typeof billboard.lat === 'number' ? billboard.lat.toFixed(4) : '';
    const lonStr =
      typeof billboard.lon === 'number' ? billboard.lon.toFixed(4) : '';
    coordsEl.textContent = latStr && lonStr ? `${latStr}° N, ${lonStr}° W` : '';
    extractEl.textContent =
      billboard.summary ||
      'Authentic regional sightseeing photo discovered via Wikimedia Commons.';

    const imgSrc = billboard.original_url || billboard.image_url;
    imgEl.src = imgSrc;
    imgEl.alt = billboard.title || 'Sightseeing';
    linkEl.href = imgSrc || '#';

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function onKeyDown(e) {
    if (active && e.key === 'Escape') {
      hide();
    }
  }

  backdrop.addEventListener('click', hide);
  closeBtn.addEventListener('click', hide);
  document.addEventListener('keydown', onKeyDown);

  return {
    show,
    hide,
    isVisible: () => active,
    destroy: () => {
      hide();
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    },
  };
}
