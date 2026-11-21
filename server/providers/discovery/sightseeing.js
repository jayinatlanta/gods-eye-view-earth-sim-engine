/**
 * Dynamic Sightseeing Discovery Provider.
 * Queries Wikipedia / Wikimedia Commons for authentic ground-level scenic photography
 * and metadata for camera-sparse destinations (e.g. Labadee Haiti, Bora Bora, Amalfi Coast).
 */

import { admitSameSite } from '../common/same-site.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map();
const MAX_CACHE_SIZE = 100;

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

export function filterScenicImage(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return !BAD_PATTERNS.some((pattern) => lower.includes(pattern));
}

export async function fetchSightseeingFromWikipedia({
  query,
  lat = null,
  lon = null,
  limit = 2,
  fetchImpl = globalThis.fetch,
} = {}) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return { ok: true, query: '', count: 0, billboards: [] };
  }

  const cacheKey = cleanQuery.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const qEnc = encodeURIComponent(cleanQuery);
  const upstreamUrl =
    `https://en.wikipedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${qEnc}&gsrlimit=6&prop=pageimages|extracts|coordinates` +
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
      const pLat = Number.isFinite(coords.lat) ? coords.lat : lat;
      const pLon = Number.isFinite(coords.lon) ? coords.lon : lon;

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

    const result = {
      ok: true,
      query: cleanQuery,
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

export function sightseeingDiscoveryProxy({
  fetchImpl = globalThis.fetch,
} = {}) {
  function install(middlewares) {
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
