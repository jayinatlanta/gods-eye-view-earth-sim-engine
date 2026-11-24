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

  const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

  overlay.innerHTML = `
    <div class="gev-sightseeing-backdrop"></div>
    <div class="gev-sightseeing-card">
      <div class="gev-sightseeing-header">
        <div class="gev-sightseeing-badge">
          <span class="gev-sightseeing-badge-dot"></span>
          <span class="gev-sightseeing-badge-text">DISCOVERED SIGHTSEEING</span>
        </div>
        <button class="gev-sightseeing-close" aria-label="Close dialog" title="Close (Esc)">✕</button>
      </div>
      <div class="gev-sightseeing-image-wrap">
        <img class="gev-sightseeing-img" src="" alt="" loading="lazy" />
        <div class="gev-sightseeing-fallback hidden">
          <div class="gev-sightseeing-fallback-icon">📍</div>
          <div class="gev-sightseeing-fallback-title"></div>
          <div class="gev-sightseeing-fallback-sub"></div>
        </div>
      </div>
      <div class="gev-sightseeing-body">
        <h2 class="gev-sightseeing-title"></h2>
        <div class="gev-sightseeing-coords"></div>
        <div class="gev-sightseeing-meta-pills hidden"></div>
        <p class="gev-sightseeing-extract"></p>
        <p class="gev-sightseeing-companion hidden"></p>
        <div class="gev-sightseeing-media hidden">
          <div class="gev-sightseeing-yt-embed-wrap hidden"></div>
          <div class="gev-sightseeing-yt-actions">
            <a class="gev-sightseeing-yt-search" href="#" target="_blank" rel="noopener noreferrer">🎬 Watch 4K POV on YouTube ↗</a>
          </div>
        </div>
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
      .gev-sightseeing-img.hidden {
        display: none;
      }
      .gev-sightseeing-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 16px;
        box-sizing: border-box;
        text-align: center;
        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #0c4a6e 100%);
        color: #f8fafc;
      }
      .gev-sightseeing-fallback.hidden {
        display: none;
      }
      .gev-sightseeing-fallback-icon {
        font-size: 36px;
        line-height: 1;
      }
      .gev-sightseeing-fallback-title {
        font-size: 16px;
        font-weight: 700;
        color: #f1f5f9;
      }
      .gev-sightseeing-fallback-sub {
        font-size: 12px;
        color: #93c5fd;
      }
      .gev-sightseeing-card {
        max-height: 88vh;
        overflow-y: auto;
      }
      .gev-sightseeing-meta-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 10px;
      }
      .gev-sightseeing-meta-pills.hidden,
      .gev-sightseeing-companion.hidden,
      .gev-sightseeing-media.hidden,
      .gev-sightseeing-yt-embed-wrap.hidden {
        display: none;
      }
      .gev-sightseeing-pill {
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(56, 189, 248, 0.14);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #bae6fd;
      }
      .gev-sightseeing-pill-snack {
        background: rgba(244, 114, 182, 0.14);
        border-color: rgba(244, 114, 182, 0.35);
        color: #fbcfe8;
      }
      .gev-sightseeing-companion {
        margin: 0 0 12px;
        padding: 8px 10px;
        border-left: 3px solid #ec4899;
        background: rgba(236, 72, 153, 0.08);
        border-radius: 4px;
        font-size: 13px;
        color: #f5d0fe;
        line-height: 1.45;
      }
      .gev-sightseeing-media {
        margin: 12px 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .gev-sightseeing-yt-embed-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        overflow: hidden;
        background: #020617;
        border: 1px solid rgba(148, 163, 184, 0.25);
      }
      .gev-sightseeing-yt-iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }
      .gev-sightseeing-yt-actions {
        display: flex;
        align-items: center;
        justify-content: flex-start;
      }
      .gev-sightseeing-yt-search {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 6px;
        background: rgba(239, 68, 68, 0.18);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #fecaca;
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
      }
      .gev-sightseeing-yt-search:hover {
        background: rgba(239, 68, 68, 0.3);
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
  const badgeTextEl = overlay.querySelector('.gev-sightseeing-badge-text');
  const imgEl = overlay.querySelector('.gev-sightseeing-img');
  const fallbackEl = overlay.querySelector('.gev-sightseeing-fallback');
  const fallbackIconEl = overlay.querySelector(
    '.gev-sightseeing-fallback-icon',
  );
  const fallbackTitleEl = overlay.querySelector(
    '.gev-sightseeing-fallback-title',
  );
  const fallbackSubEl = overlay.querySelector('.gev-sightseeing-fallback-sub');
  const titleEl = overlay.querySelector('.gev-sightseeing-title');
  const coordsEl = overlay.querySelector('.gev-sightseeing-coords');
  const pillsEl = overlay.querySelector('.gev-sightseeing-meta-pills');
  const extractEl = overlay.querySelector('.gev-sightseeing-extract');
  const companionEl = overlay.querySelector('.gev-sightseeing-companion');
  const mediaEl = overlay.querySelector('.gev-sightseeing-media');
  const ytEmbedWrapEl = overlay.querySelector('.gev-sightseeing-yt-embed-wrap');
  const ytSearchEl = overlay.querySelector('.gev-sightseeing-yt-search');
  const sourceEl = overlay.querySelector('.gev-sightseeing-source');
  const linkEl = overlay.querySelector('.gev-sightseeing-link');

  let active = false;
  let activeOnClose = null;
  let activeMediaSignature = null;
  let activeDirectFallbackUrl = '';

  function teardownYouTubeIframes() {
    if (!ytEmbedWrapEl) return;
    const iframes = ytEmbedWrapEl.querySelectorAll('iframe');
    for (const frame of iframes) {
      try {
        frame.src = 'about:blank';
        frame.removeAttribute?.('src');
      } catch {}
      frame.remove();
    }
    ytEmbedWrapEl.classList.add('hidden');
    activeMediaSignature = null;
  }

  function showImageFallback() {
    imgEl.classList.add('hidden');
    fallbackEl?.classList.remove('hidden');
  }

  imgEl.addEventListener?.('error', () => {
    if (!active) return;
    if (activeDirectFallbackUrl) {
      const nextUrl = activeDirectFallbackUrl;
      activeDirectFallbackUrl = '';
      imgEl.src = nextUrl;
      return;
    }
    showImageFallback();
  });

  function hide() {
    const wasActive = active;
    active = false;
    activeDirectFallbackUrl = '';
    teardownYouTubeIframes();
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    imgEl.src = '';
    const cb = activeOnClose;
    activeOnClose = null;
    if (wasActive && typeof cb === 'function') {
      try {
        cb();
      } catch {}
    }
  }

  function appendMetaPill(text, extraClass = '') {
    if (!pillsEl || !text) return;
    const pill = document.createElement('span');
    pill.className = extraClass
      ? `gev-sightseeing-pill ${extraClass}`
      : 'gev-sightseeing-pill';
    pill.textContent = text;
    pillsEl.appendChild(pill);
  }

  function show(billboard) {
    if (!billboard) return;
    active = true;
    if (typeof billboard.onClose === 'function') {
      activeOnClose = billboard.onClose;
    }

    const displayTitle =
      billboard.title || billboard.name || 'Discovered Landmark';
    if (badgeTextEl) {
      if (billboard.venueCategory === 'resort_stay') {
        badgeTextEl.textContent = '🏨 RESORT DAY EXPERIENCE';
      } else if (billboard.tourScope === 'venue') {
        badgeTextEl.textContent = '🎢 PARK DAY EXPERIENCE';
      } else if (billboard.isTourStop) {
        badgeTextEl.textContent = '🛴 TOUR STOP EXPERIENCE';
      } else {
        badgeTextEl.textContent = 'DISCOVERED SIGHTSEEING';
      }
    }

    titleEl.textContent = displayTitle;
    const latStr =
      typeof billboard.lat === 'number' ? billboard.lat.toFixed(4) : '';
    const lonStr =
      typeof billboard.lon === 'number' ? billboard.lon.toFixed(4) : '';
    coordsEl.textContent = latStr && lonStr ? `${latStr}° N, ${lonStr}° W` : '';

    if (pillsEl) {
      pillsEl.innerHTML = '';
      if (billboard.land) appendMetaPill(`🏰 ${billboard.land}`);
      if (billboard.category && !billboard.land) {
        appendMetaPill(`📍 ${billboard.category}`);
      }
      const waitVal = Number.isFinite(billboard.estimatedWaitMin)
        ? billboard.estimatedWaitMin
        : Number.isFinite(billboard.waitTimeMin)
          ? billboard.waitTimeMin
          : null;
      if (waitVal !== null) {
        appendMetaPill(waitVal === 0 ? '⏱ Walk-On' : `⏱ ~${waitVal} min wait`);
      }
      const zoneVal = billboard.showcaseZone || billboard.dayChapter || null;
      if (zoneVal === 'world_showcase') {
        appendMetaPill('🌐 World Showcase');
      } else if (zoneVal === 'front_of_park') {
        appendMetaPill('🚀 Front of Park');
      }
      const snackVal = billboard.snackNote || billboard.snackTag || null;
      if (snackVal) {
        appendMetaPill(`🍿 ${snackVal}`, 'gev-sightseeing-pill-snack');
      }
      pillsEl.classList.toggle('hidden', pillsEl.childElementCount === 0);
    }

    extractEl.textContent =
      billboard.extract ||
      billboard.summary ||
      billboard.lore ||
      'Authentic regional sightseeing photo discovered via Wikimedia Commons.';

    if (companionEl) {
      if (billboard.companionNote) {
        const prefix = billboard.companionName
          ? `💬 ${billboard.companionName}: `
          : '💬 ';
        companionEl.textContent = `${prefix}"${billboard.companionNote}"`;
        companionEl.classList.remove('hidden');
      } else {
        companionEl.textContent = '';
        companionEl.classList.add('hidden');
      }
    }

    if (fallbackIconEl) fallbackIconEl.textContent = billboard.icon || '📍';
    if (fallbackTitleEl) fallbackTitleEl.textContent = displayTitle;
    if (fallbackSubEl) {
      fallbackSubEl.textContent =
        billboard.land || billboard.cityName || billboard.category || '';
    }

    const imgSrc =
      billboard.thumbnailUrl ||
      billboard.originalUrl ||
      billboard.original_url ||
      billboard.image_url ||
      '';
    const directOriginal = String(
      billboard.originalUrl || billboard.original_url || '',
    ).trim();
    activeDirectFallbackUrl =
      directOriginal && directOriginal !== imgSrc ? directOriginal : '';
    if (imgSrc) {
      fallbackEl?.classList.add('hidden');
      imgEl.classList.remove('hidden');
      imgEl.src = imgSrc;
      imgEl.alt = displayTitle;
    } else {
      imgEl.src = '';
      showImageFallback();
    }

    const cleanYtId = String(billboard.youtubeVideoId || '').trim();
    const hasEmbedId = YOUTUBE_VIDEO_ID_RE.test(cleanYtId);
    const searchQuery =
      String(billboard.youtubeSearchQuery || '').trim() ||
      (billboard.isTourStop ? `${displayTitle} 4K POV tour` : '');

    if (mediaEl) {
      if (hasEmbedId || searchQuery) {
        mediaEl.classList.remove('hidden');
        if (hasEmbedId && ytEmbedWrapEl) {
          const nextSig = `${billboard.stopId || displayTitle}:${cleanYtId}`;
          if (activeMediaSignature !== nextSig) {
            teardownYouTubeIframes();
            const iframe = document.createElement('iframe');
            iframe.className = 'gev-sightseeing-yt-iframe';
            iframe.src = `https://www.youtube-nocookie.com/embed/${cleanYtId}?rel=0&modestbranding=1`;
            iframe.title = `${displayTitle} — POV Video`;
            iframe.allow =
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            iframe.loading = 'lazy';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            ytEmbedWrapEl.appendChild(iframe);
            ytEmbedWrapEl.classList.remove('hidden');
            activeMediaSignature = nextSig;
          }
        } else {
          teardownYouTubeIframes();
        }
        if (ytSearchEl) {
          const ytHref = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery || displayTitle)}`;
          ytSearchEl.href = ytHref;
          ytSearchEl.classList.toggle(
            'hidden',
            !(searchQuery || billboard.isTourStop),
          );
        }
      } else {
        teardownYouTubeIframes();
        mediaEl.classList.add('hidden');
      }
    }

    const wikiHref =
      billboard.url ||
      billboard.originalUrl ||
      billboard.original_url ||
      billboard.image_url ||
      '#';
    linkEl.href = wikiHref;
    const isWikiLink = /wikipedia\.org/i.test(String(wikiHref));
    linkEl.textContent = isWikiLink
      ? 'Read on Wikipedia ↗'
      : billboard.sourceLabel
        ? 'Official Gallery ↗'
        : 'View Full Image ↗';
    if (sourceEl) {
      const credit =
        String(billboard.sourceLabel || '').trim() ||
        'Wikimedia Commons / Wikipedia';
      sourceEl.textContent = billboard.cityName
        ? `${billboard.cityName} · ${credit}`
        : `Source: ${credit}`;
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function onKeyDown(e) {
    if (active && e.key === 'Escape') {
      e.preventDefault?.();
      e.stopPropagation?.();
      hide();
    }
  }

  backdrop.addEventListener('click', hide);
  closeBtn.addEventListener('click', hide);
  document.addEventListener('keydown', onKeyDown, true);

  return {
    show,
    hide,
    isVisible: () => active,
    destroy: () => {
      hide();
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
    },
  };
}
