/**
 * Screen-Space Glassmorphic Thought & Persona Bubble Overlay.
 * (Living City Capability + Route Slice)
 *
 * Anchors a sleek, zero-token demographic thought bubble above latched or hovered
 * pedestrians in the 3D scene using Cesium.SceneTransforms.worldToWindowCoordinates.
 */

import * as Cesium from 'cesium';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

let thoughtBubbleSeq = 0;

export function createThoughtBubbleOverlay({
  viewer = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container || typeof document === 'undefined') {
    return {
      updatePosition: () => {},
      show: () => {},
      hide: () => {},
      destroy: () => {},
      isVisible: () => false,
    };
  }

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'gev-thought-bubble';
  bubbleEl.style.cssText = `
    position: fixed;
    width: 288px;
    background: rgba(13, 17, 23, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(6, 182, 212, 0.45);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    z-index: 10003;
    padding: 12px 14px;
    display: none;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    pointer-events: auto;
    transition: opacity 0.15s ease, transform 0.1s ease-out;
    transform: translate(-50%, -100%);
    opacity: 0;
  `;

  // Tail arrow pointing down to the pedestrian
  const tail = document.createElement('div');
  tail.style.cssText = `
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid rgba(6, 182, 212, 0.5);
  `;
  bubbleEl.appendChild(tail);

  container.appendChild(bubbleEl);

  const dock = getGlobalDrawerCoordinator();
  const overlayGroupId = `thought-bubble-${++thoughtBubbleSeq}`;
  dock.registerOverlayGroup(overlayGroupId, {
    elements: [bubbleEl],
  });

  let currentPersona = null;
  let currentPosition = null;
  let isVisible = false;
  let onCameraModeCallback = null;
  let activeCameraMode = 'companion';
  let lastRenderedSignature = '';
  let dismissedSignature = null;
  const scratchWindowPos = new Cesium.Cartesian2();

  function computeDismissSignature(persona) {
    if (!persona) return '';
    const thought =
      persona.thought ||
      persona.currentThought ||
      'Enjoying the living world atmosphere.';
    return `${persona.name || ''}|${thought}|${Boolean(persona.isCompanion)}`;
  }

  function computeRenderSignature(persona) {
    if (!persona) return '';
    const thought =
      persona.thought ||
      persona.currentThought ||
      'Enjoying the living world atmosphere.';
    const loc = persona.city || persona.typology || 'Local Biome';
    return `${persona.name || ''}|${persona.occupation || ''}|${thought}|${loc}|${activeCameraMode}|${Boolean(persona.isCompanion)}`;
  }

  function renderContent(persona) {
    if (!persona) return;
    const name = persona.name || 'Living World Contact';
    const ageStr = persona.age ? `(${persona.age})` : '';
    const occupation = persona.occupation || 'Local Resident';
    const thought =
      persona.thought ||
      persona.currentThought ||
      'Enjoying the living world atmosphere.';
    const vibeColor = persona.vibeColor || '#06b6d4';
    const vibeIcon = persona.vibeIcon || '😊';
    const vibeLabel = persona.vibeLabel || 'Calm';
    const speedKmh =
      persona.speedKmh ||
      (persona.speedMs ? (persona.speedMs * 3.6).toFixed(1) : '1.5');
    const locationStr = persona.city || persona.typology || 'Local Biome';
    const isCompanion = Boolean(persona.isCompanion);

    const rainBadge = persona.isRaining
      ? `<span style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 4px; padding: 1px 4px; font-size: 10px; color: #38bdf8;">☂️ Rain Pace</span>`
      : '';
    const speedIcon = persona.isJogger ? '🏃' : '🚶';

    const camModes = isCompanion
      ? [
          { id: 'iso_chase', label: '🎥 Iso' },
          { id: 'first_person', label: '👁️ 1st' },
          { id: 'heli', label: '🚁 Heli' },
          { id: 'overview', label: '🛰️ Overview' },
        ]
      : [
          { id: 'companion', label: '🚶 Follow' },
          { id: 'flaneur', label: '🎥 Front' },
          { id: 'balcony', label: '🚁 Heli' },
          { id: 'free', label: '🔓 Free' },
        ];

    bubbleEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 6px;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-size: 13px; color: #f0f6fc;">${name}</strong>
            ${ageStr ? `<span style="font-size: 11px; color: #8b949e;">${ageStr}</span>` : ''}
            ${rainBadge}
          </div>
          <div style="font-size: 10px; color: #38bdf8; font-weight: 500;">${occupation}</div>
        </div>
        <button class="gev-bubble-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 14px; padding: 0 2px;" title="Dismiss">✕</button>
      </div>

      <div style="font-size: 11px; line-height: 1.4; color: #e6edf3; font-style: italic; background: rgba(255, 255, 255, 0.04); border-left: 2px solid ${vibeColor}; padding: 6px 8px; border-radius: 4px;">
        "${thought}"
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #8b949e; padding-top: 2px;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <span>${vibeIcon}</span>
          <span style="color: ${vibeColor}; font-weight: 500;">${vibeLabel}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
          <span style="white-space: nowrap;">${speedIcon} ${speedKmh} km/h</span>
          <span style="color: #484f58;">•</span>
          <span style="color: #c9d1d9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 175px;" title="${locationStr}">📍 ${locationStr}</span>
        </div>
      </div>

      <!-- Quick Camera Perspective Selector -->
      <div class="gev-bubble-cam-bar" style="display: flex; gap: 4px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
        ${camModes
          .map(
            (m) => `
          <button class="gev-bubble-cam-btn ${activeCameraMode === m.id ? 'active' : ''}" data-mode="${m.id}" style="flex: 1; background: ${activeCameraMode === m.id ? 'rgba(6, 182, 212, 0.25)' : '#161b22'}; border: 1px solid ${activeCameraMode === m.id ? '#06b6d4' : '#30363d'}; border-radius: 4px; color: ${activeCameraMode === m.id ? '#22d3ee' : '#8b949e'}; font-size: 10px; font-weight: ${activeCameraMode === m.id ? '600' : 'normal'}; padding: 4px 2px; cursor: pointer;">${m.label}</button>
        `,
          )
          .join('')}
      </div>
    `;

    bubbleEl.appendChild(tail);

    const closeBtn = bubbleEl.querySelector('.gev-bubble-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissedSignature = computeDismissSignature(currentPersona);
        hide();
      });
    }

    const camBtns = bubbleEl.querySelectorAll('.gev-bubble-cam-btn');
    camBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.getAttribute('data-mode');
        activeCameraMode = mode;
        camBtns.forEach((b) => {
          b.style.background = '#161b22';
          b.style.borderColor = '#30363d';
          b.style.color = '#8b949e';
          b.style.fontWeight = 'normal';
        });
        btn.style.background = 'rgba(6, 182, 212, 0.25)';
        btn.style.borderColor = '#06b6d4';
        btn.style.color = '#22d3ee';
        btn.style.fontWeight = '600';
        lastRenderedSignature = computeRenderSignature(currentPersona);
        if (onCameraModeCallback) {
          onCameraModeCallback(mode);
        }
      });
    });
  }

  function show(arg1, arg2) {
    if (!arg1 && !arg2) return;
    let pos = null;
    let persona = null;

    // Robust polymorphic argument detection (supports show(pos, persona) and show(persona, pos))
    if (
      arg1 &&
      (arg1.name ||
        arg1.thought ||
        arg1.currentThought ||
        arg1.occupation ||
        arg1.typology)
    ) {
      persona = arg1;
      pos = arg2;
    } else if (
      arg2 &&
      (arg2.name ||
        arg2.thought ||
        arg2.currentThought ||
        arg2.occupation ||
        arg2.typology)
    ) {
      persona = arg2;
      pos = arg1;
    } else {
      pos = arg1;
      persona = arg2 || {};
    }

    const dismissSig = computeDismissSignature(persona);
    if (dismissedSignature && dismissSig === dismissedSignature) {
      return;
    }
    const renderSig = computeRenderSignature(persona);

    // Convert { lat, lon, elev } to Cartesian3 if needed
    let cartesianPos = pos;
    if (
      pos &&
      typeof pos.lat === 'number' &&
      typeof pos.lon === 'number' &&
      typeof pos.x !== 'number'
    ) {
      cartesianPos = Cesium.Cartesian3.fromDegrees(
        pos.lon,
        pos.lat,
        (pos.elev || 0) + 1.2,
      );
    }

    currentPersona = persona;
    currentPosition = cartesianPos;
    if (!isVisible || renderSig !== lastRenderedSignature) {
      lastRenderedSignature = renderSig;
      renderContent(persona);
      bubbleEl.style.display = 'flex';
      requestAnimationFrame(() => {
        bubbleEl.style.opacity = '1';
      });
      isVisible = true;
    }
    updatePosition(cartesianPos);
  }

  function hide() {
    bubbleEl.style.opacity = '0';
    setTimeout(() => {
      if (!isVisible) {
        bubbleEl.style.display = 'none';
      }
    }, 150);
    isVisible = false;
    lastRenderedSignature = '';
    currentPersona = null;
    currentPosition = null;
  }

  function resetDismissal() {
    dismissedSignature = null;
  }

  function updatePosition(cartesianPos = currentPosition) {
    if (!isVisible || !viewer || !cartesianPos) return;
    currentPosition = cartesianPos;

    try {
      // Offset head height +1.1 meters along geodetic surface normal so the bubble
      // stays tightly anchored right above the dot at close ISO_CHASE camera ranges.
      const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        cartesianPos,
        new Cesium.Cartesian3(),
      );
      const elevatedHeadPos = Cesium.Cartesian3.add(
        cartesianPos,
        Cesium.Cartesian3.multiplyByScalar(
          normal,
          1.1,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );

      const winPos = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        elevatedHeadPos,
        scratchWindowPos,
      );

      if (!winPos) {
        bubbleEl.style.display = 'none';
        return;
      }

      // Check if coordinate is in front of camera
      const camera = viewer.scene.camera;
      const toPos = Cesium.Cartesian3.subtract(
        elevatedHeadPos,
        camera.positionWC,
        new Cesium.Cartesian3(),
      );
      const dot = Cesium.Cartesian3.dot(camera.directionWC, toPos);

      if (dot <= 0) {
        bubbleEl.style.display = 'none';
        return;
      }

      let x = Math.round(winPos.x);
      let y = Math.round(winPos.y - 10);
      const vw =
        viewer.scene?.canvas?.clientWidth ||
        (typeof window !== 'undefined' ? window.innerWidth : 0);
      const vh =
        viewer.scene?.canvas?.clientHeight ||
        (typeof window !== 'undefined' ? window.innerHeight : 0);
      if (vw > 340 && vh > 260) {
        const halfW = 152;
        x = Math.min(Math.max(x, halfW), vw - halfW);
        y = Math.min(Math.max(y, 170), vh - 92);
      }

      bubbleEl.style.display = 'flex';
      bubbleEl.style.left = `${x}px`;
      bubbleEl.style.top = `${y}px`;
    } catch {
      // Non-browser or headless mock
    }
  }

  return {
    show,
    hide,
    resetDismissal,
    updatePosition,
    onCameraMode: (cb) => {
      onCameraModeCallback = cb;
    },
    setCameraMode: (mode) => {
      activeCameraMode = mode;
    },
    isVisible: () => isVisible,
    getPersona: () => currentPersona,
    destroy: () => {
      dock.unregisterOverlayGroup(overlayGroupId);
      hide();
      bubbleEl.remove();
    },
  };
}
