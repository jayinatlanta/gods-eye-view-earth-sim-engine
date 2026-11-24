/**
 * Dynamic Sightseeing Discovery Provider.
 * Queries Wikipedia / Wikimedia Commons for authentic ground-level scenic photography
 * and metadata for camera-sparse destinations (e.g. Labadee Haiti, Bora Bora, Amalfi Coast).
 */

import { admitSameSite } from '../common/same-site.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map();
const MAX_CACHE_SIZE = 100;

const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const IMAGE_CACHE_MAX_ENTRIES = 32;
const IMAGE_PROXY_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_PROXY_MAX_REDIRECTS = 2;
const GEO_QUERY_MAX_DISTANCE_KM = 250;
const imageCache = new Map();

export const ALLOWED_SIGHTSEEING_IMAGE_HOSTS = Object.freeze([
  'www.star-island.com',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
]);

const ALLOWED_IMAGE_HOST_SET = new Set(ALLOWED_SIGHTSEEING_IMAGE_HOSTS);

const BAD_PATTERNS = [
  '.svg',
  'flag_of',
  'coat_of_arms',
  'locator_map',
  'symbol',
  'icon',
  'insignia',
];

function sanitizeSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isAllowedSightseeingImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    return ALLOWED_IMAGE_HOST_SET.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function filterScenicImage(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return !BAD_PATTERNS.some((pattern) => lower.includes(pattern));
}

export async function fetchSightseeingFromWikipedia({
  query = '',
  title = '',
  lat = null,
  lon = null,
  limit = 2,
  fetchImpl = globalThis.fetch,
} = {}) {
  const cleanTitle = (title || '').trim();
  const cleanQuery = (query || '').trim();
  const effectiveQuery = cleanTitle || cleanQuery;
  if (!effectiveQuery) {
    return { ok: true, query: '', count: 0, billboards: [] };
  }

  const hasAnchorCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const coordBucket = hasAnchorCoords
    ? `@${Math.round(lat * 2) / 2},${Math.round(lon * 2) / 2}`
    : '';
  const cacheKey = cleanTitle
    ? `title:${cleanTitle.toLowerCase()}${coordBucket}`
    : `${cleanQuery.toLowerCase()}${coordBucket}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const upstreamUrl = cleanTitle
    ? `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cleanTitle)}&redirects=1` +
      `&prop=pageimages|extracts|coordinates&piprop=thumbnail|original&pithumbsize=640&exintro=1&explaintext=1&format=json`
    : `https://en.wikipedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=6&prop=pageimages|extracts|coordinates` +
      `&piprop=thumbnail|original&pithumbsize=1024&exintro=1&explaintext=1&format=json`;

  try {
    const res = await fetchImpl(upstreamUrl, {
      headers: {
        'User-Agent':
          'GodsEyeView/1.0 (Sightseeing-Discovery; +https://github.com/bilawalsidhu/gods-eye-view)',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Upstream Wikipedia status ${res.status}`,
        count: 0,
        billboards: [],
      };
    }

    const json = await res.json();
    const pages = Object.values(json?.query?.pages || {});
    pages.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));

    const billboards = [];
    for (const page of pages) {
      const thumb = page?.thumbnail?.source;
      if (!thumb || !filterScenicImage(thumb)) continue;

      const title = page.title || cleanQuery;
      const extract = (page.extract || '').trim();
      const coords = page.coordinates?.[0] || {};
      const pageHasCoords =
        Number.isFinite(coords.lat) && Number.isFinite(coords.lon);
      if (hasAnchorCoords && pageHasCoords) {
        const distKm = haversineDistanceKm(lat, lon, coords.lat, coords.lon);
        if (distKm > GEO_QUERY_MAX_DISTANCE_KM) continue;
      }
      const pLat = pageHasCoords ? coords.lat : lat;
      const pLon = pageHasCoords ? coords.lon : lon;

      const slug = sanitizeSlug(title);
      billboards.push({
        id: `billboard-${slug}`,
        title,
        image_url: thumb,
        original_url: page.original?.source || thumb,
        summary: extract.length > 200 ? `${extract.slice(0, 197)}...` : extract,
        lat: pLat,
        lon: pLon,
        source: 'Wikimedia Commons / Wikipedia',
        source_kind: 'discovered_sightseeing',
        kind: 'discovered_sightseeing',
      });

      if (billboards.length >= limit) break;
    }

    if (billboards.length === 0 && cleanTitle && cleanQuery) {
      return fetchSightseeingFromWikipedia({
        query: cleanQuery,
        lat,
        lon,
        limit,
        fetchImpl,
      });
    }
    const result = {
      ok: true,
      query: effectiveQuery,
      ...(cleanTitle ? { title: cleanTitle } : {}),
      count: billboards.length,
      billboards,
    };

    // Cache result
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(cacheKey, { timestamp: Date.now(), data: result });

    return result;
  } catch (err) {
    return {
      ok: false,
      error: `Discovery fetch failed: ${err.message}`,
      count: 0,
      billboards: [],
    };
  }
}

export async function fetchSightseeingImage(
  rawUrl,
  { fetchImpl = globalThis.fetch } = {},
) {
  if (!isAllowedSightseeingImageUrl(rawUrl)) {
    return {
      ok: false,
      status: 403,
      error: 'Sightseeing image host is not allowlisted',
    };
  }

  const normalizedUrl = new URL(rawUrl.trim()).toString();
  const cached = imageCache.get(normalizedUrl);
  if (cached && Date.now() - cached.timestamp < IMAGE_CACHE_TTL_MS) {
    return {
      ok: true,
      status: 200,
      contentType: cached.contentType,
      body: cached.body,
    };
  }

  let currentUrl = normalizedUrl;
  try {
    for (let hop = 0; hop <= IMAGE_PROXY_MAX_REDIRECTS; hop += 1) {
      const res = await fetchImpl(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'GodsEyeView/1.0 (Sightseeing-Image-Proxy; +https://github.com/bilawalsidhu/gods-eye-view)',
          Accept: 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers?.get?.('location');
        if (!loc || hop === IMAGE_PROXY_MAX_REDIRECTS) {
          return { ok: false, status: 502, error: 'Too many redirects' };
        }
        const resolved = new URL(loc, currentUrl).toString();
        if (!isAllowedSightseeingImageUrl(resolved)) {
          return {
            ok: false,
            status: 403,
            error: 'Redirect target host is not allowlisted',
          };
        }
        currentUrl = resolved;
        continue;
      }

      if (!res.ok) {
        return {
          ok: false,
          status: 502,
          error: `Upstream image status ${res.status}`,
        };
      }

      const rawContentType = String(
        res.headers?.get?.('content-type') || '',
      ).toLowerCase();
      const mediaType = rawContentType.split(';')[0].trim();
      if (!mediaType.startsWith('image/') || mediaType === 'image/svg+xml') {
        return {
          ok: false,
          status: 502,
          error: 'Upstream response is not a raster image',
        };
      }

      const contentLen = Number(res.headers?.get?.('content-length') || 0);
      if (Number.isFinite(contentLen) && contentLen > IMAGE_PROXY_MAX_BYTES) {
        return { ok: false, status: 502, error: 'Upstream image too large' };
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > IMAGE_PROXY_MAX_BYTES) {
        return {
          ok: false,
          status: 502,
          error: 'Upstream image size out of bounds',
        };
      }

      if (imageCache.size >= IMAGE_CACHE_MAX_ENTRIES) {
        const oldest = imageCache.keys().next().value;
        if (oldest) imageCache.delete(oldest);
      }
      imageCache.set(normalizedUrl, {
        timestamp: Date.now(),
        contentType: mediaType,
        body: buf,
      });

      return {
        ok: true,
        status: 200,
        contentType: mediaType,
        body: buf,
      };
    }
    return { ok: false, status: 502, error: 'Upstream image fetch failed' };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Image proxy fetch failed: ${err.message}`,
    };
  }
}

export function sightseeingDiscoveryProxy({
  fetchImpl = globalThis.fetch,
} = {}) {
  function install(middlewares) {
    middlewares.use('/api/discovery/sightseeing/image', async (req, res) => {
      if (admitSameSite(req, res)) return;

      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
        return;
      }

      const parsed = new URL(req.url || '/', 'http://localhost');
      const targetUrl = parsed.searchParams.get('url') || '';
      if (!targetUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Missing url parameter' }));
        return;
      }

      const result = await fetchSightseeingImage(targetUrl, { fetchImpl });
      if (!result.ok) {
        res.statusCode = result.status || 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: result.error }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(result.body);
    });

    middlewares.use('/api/discovery/sightseeing', async (req, res) => {
      if (admitSameSite(req, res)) return;

      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
        return;
      }

      const url = new URL(req.url || '/', 'http://localhost');
      const query = url.searchParams.get('query') || '';
      const title = url.searchParams.get('title') || '';
      const latParam = url.searchParams.get('lat');
      const lonParam = url.searchParams.get('lon');
      const limitParam = url.searchParams.get('limit');

      const lat = latParam ? Number(latParam) : null;
      const lon = lonParam ? Number(lonParam) : null;
      const limit = limitParam
        ? Math.min(6, Math.max(1, Number(limitParam)))
        : 2;

      const data = await fetchSightseeingFromWikipedia({
        query,
        title,
        lat,
        lon,
        limit,
        fetchImpl,
      });

      res.statusCode = data.ok ? 200 : 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    });
  }

  return {
    name: 'gev-sightseeing-discovery-provider',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
