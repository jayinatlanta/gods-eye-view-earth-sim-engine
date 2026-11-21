const clean = (value) => String(value || '').trim();

/**
 * Decide which map provider can deliver the best startup experience.
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {'google-direct'|'google-ion'|'osm'}
 */
export function selectMapStartupRoute({
  googleApiKey = '',
  cesiumToken = '',
} = {}) {
  if (clean(googleApiKey)) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'osm';
}

/**
 * Load Google Photorealistic 3D Tiles through direct Google access when
 * configured, otherwise through Cesium ion's hosted Google asset. Direct
 * access uses a browser key, or else short-lived tokens from the app's
 * server (see googleTokens.js). If direct access fails and an ion token is
 * available, ion is the recovery path.
 *
 * @param {object} Cesium
 * @param {{googleApiKey?: string, cesiumToken?: string, googleTokens?: {token: Function}|null}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-token'|'google-ion'|'osm', errors: Error[]}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey = '', cesiumToken = '', googleTokens = null } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  const attempts = [];
  if (googleKey)
    attempts.push({
      route: 'google-direct',
      create: () => createGoogleDirectTileset(Cesium, googleKey),
    });
  else if (googleTokens)
    attempts.push({
      route: 'google-token',
      create: () => createGoogleTokenTileset(Cesium, googleTokens),
    });
  if (ionToken)
    attempts.push({
      route: 'google-ion',
      create: () => createGoogleIonTileset(Cesium, ionToken),
    });

  for (const attempt of attempts) {
    try {
      const tileset = await attempt.create();
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { tileset: null, route: 'osm', errors };
}

/**
 * Detect mobile or touch-coarse displays to scale 3D tile cache budgets.
 */
export function isMobileScreen() {
  if (typeof globalThis.matchMedia === 'function') {
    if (globalThis.matchMedia('(pointer: coarse)').matches) return true;
    if (globalThis.matchMedia('(max-width: 768px)').matches) return true;
  }
  if (typeof globalThis.navigator !== 'undefined') {
    if ((globalThis.navigator.maxTouchPoints || 0) > 1) return true;
    if (/Android|iPhone|iPad|iPod/i.test(globalThis.navigator.userAgent || ''))
      return true;
  }
  return false;
}

/**
 * Photorealistic 3D Tiles cache and refinement options scaled to client platform.
 * Mobile devices clamp cache to 192MB + 128MB overflow and higher screen space error (24)
 * to prevent browser tab WebGL / out-of-memory crash.
 */
export function getPhotorealisticTilesetOptions(overrides = {}) {
  const isMobile = isMobileScreen();
  return {
    cacheBytes: isMobile ? 192 * 1024 * 1024 : 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: isMobile
      ? 128 * 1024 * 1024
      : 1024 * 1024 * 1024,
    maximumScreenSpaceError: isMobile ? 24 : 16,
    enableCollision: true,
    asynchronouslyLoadImagery: true,
    // Do not defer building child tiles behind a 200ms motion timer; under
    // requestRenderMode the scene can settle before that timer elapses.
    foveatedTimeDelay: 0.0,
    ...overrides,
  };
}

/** Pass credentials to the source instead of changing SDK-wide defaults. */
export function createGoogleDirectTileset(Cesium, key, options = {}) {
  key = clean(key);
  if (!key) throw new Error('Google 3D requires an explicit browser key');
  const isMobile = isMobileScreen();
  const tilesetOptions = isMobile
    ? getPhotorealisticTilesetOptions(options)
    : {
        asynchronouslyLoadImagery: true,
        foveatedTimeDelay: 0.0,
        ...options,
      };
  // Tiles keep drawing their own texture while draped weather loads.
  return Cesium.createGooglePhotorealistic3DTileset(
    { key, onlyUsingWithGoogleGeocoder: true },
    tilesetOptions,
  );
}

/**
 * Google 3D with short-lived tokens instead of a key. Every tile request
 * carries the token as a header; a tile refused for an expired token gets
 * the renewed one and is tried once more.
 */
export async function createGoogleTokenTileset(Cesium, tokens, options = {}) {
  const token = await tokens.token();
  if (!token) throw new Error('Google 3D tokens are not offered');
  const credit = Cesium.GoogleMaps.getDefaultCredit?.();
  const resource = new Cesium.Resource({
    url: `${Cesium.GoogleMaps.mapTilesApiEndpoint}v1/3dtiles/root.json`,
    headers: { Authorization: `Bearer ${token}` },
    credits: credit ? [credit] : undefined,
    retryAttempts: 1,
    async retryCallback(failed, error) {
      if (![401, 403].includes(error?.statusCode)) return false;
      const used = failed.headers.Authorization?.replace(/^Bearer /, '');
      const renewed = await tokens.token({ replacing: used });
      if (!renewed || renewed === used) return false;
      failed.headers.Authorization = `Bearer ${renewed}`;
      return true;
    },
  });
  // The settings Cesium's Google helper applies to the key route.
  return Cesium.Cesium3DTileset.fromUrl(
    resource,
    getPhotorealisticTilesetOptions(options),
  );
}

export async function createGoogleIonTileset(
  Cesium,
  accessToken,
  { signal, ...options } = {},
) {
  accessToken = clean(accessToken);
  if (!accessToken)
    throw new Error('Google 3D through ion requires an explicit token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(2275207, {
    accessToken,
  });
  signal?.throwIfAborted();
  // Match the installed SDK's Google helper rendering/cache defaults.
  return Cesium.Cesium3DTileset.fromUrl(
    resource,
    getPhotorealisticTilesetOptions(options),
  );
}
