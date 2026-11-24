/**
 * Pure Cesium-Free Experiences Catalog Adapter.
 *
 * Aggregates read-only metadata from existing canonical Earth Sim catalogs
 * without duplicating coordinates or mutating source catalogs:
 * - Theme Parks (`themeParkCatalog.js` + WDW Magic Kingdom / EPCOT via `localeClassifier.js`)
 * - Resort Stays (`resortStayCatalog.js`)
 * - Next Experiences: State Parks, Water & Mountain, Boardwalk & Strip (`nextExperiencesCatalog.js`)
 * - Living Cities (`livingCitiesCatalog.js`)
 * - Wilderness Trailheads (`trailheadCatalog.js`)
 * - Curated & Claimed Domiciles (`domicileCatalog.js`)
 *
 * Phase 2 (`24.50b`) will extend this adapter with Rails & Monorails, Flights &
 * Heli, Scenic Drives, Waterways, and Corridors.
 */

import { msg } from '../../i18n/index.js';
import {
  PARK_FIREWORKS_ANCHORS,
  STAGE3_THEME_PARK_LANDMARKS,
  STAGE3_THEME_PARK_METADATA,
} from '../../layers/citylife/themeParkCatalog.js';
import {
  RESORT_STAY_LANDMARKS,
  RESORT_STAY_METADATA,
} from '../../layers/citylife/resortStayCatalog.js';
import {
  NEXT_EXPERIENCE_LANDMARKS,
  NEXT_EXPERIENCE_METADATA,
} from '../../layers/citylife/nextExperiencesCatalog.js';
import { EXEMPLAR_LOCALES } from '../../layers/citylife/localeClassifier.js';
import { LIVING_CITIES } from '../../citylife/livingCitiesCatalog.js';
import {
  BIOME_META,
  TRAIL_DIFFICULTIES,
  WILDERNESS_TRAILHEADS,
} from '../../layers/wilderness/trailheadCatalog.js';
import {
  DOMICILE_TYPOLOGY_META,
  getAllDomiciles,
} from '../../layers/estates/domicileCatalog.js';

export const EXPERIENCE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'all', label: msg('All'), icon: 'category' }),
  Object.freeze({
    id: 'theme-parks',
    label: msg('Theme Parks'),
    icon: 'star',
  }),
  Object.freeze({
    id: 'resort-stays',
    label: msg('Resort Stays'),
    icon: 'sunny',
  }),
  Object.freeze({
    id: 'state-parks',
    label: msg('State Parks'),
    icon: 'eco',
  }),
  Object.freeze({
    id: 'water-mountain',
    label: msg('Water & Mountain'),
    icon: 'water_drop',
  }),
  Object.freeze({
    id: 'boardwalk-strip',
    label: msg('Boardwalk & Strip'),
    icon: 'flare',
  }),
  Object.freeze({
    id: 'living-cities',
    label: msg('Living Cities'),
    icon: 'location_city',
  }),
  Object.freeze({
    id: 'wilderness',
    label: msg('Wilderness'),
    icon: 'navigation',
  }),
  Object.freeze({
    id: 'domiciles',
    label: msg('Domiciles'),
    icon: 'emergency_home',
  }),
]);

function categoryForNextExperience(meta) {
  const vc = String(meta?.venueCategory || '').toLowerCase();
  if (vc === 'state_park') return 'state-parks';
  if (vc === 'water_park' || vc === 'mountain_adventure')
    return 'water-mountain';
  if (
    vc === 'boardwalk_strip' ||
    vc === 'boardwalk_promenade' ||
    vc === 'entertainment_strip'
  )
    return 'boardwalk-strip';
  return 'water-mountain';
}

function firstImageFromStops(stops) {
  if (!Array.isArray(stops)) return '';
  for (const s of stops) {
    if (s?.imageUrl) return s.imageUrl;
  }
  return '';
}

function firstWikiTitleFromStops(stops) {
  if (!Array.isArray(stops)) return '';
  for (const s of stops) {
    if (s?.wikiTitle) return s.wikiTitle;
  }
  return '';
}

function makeAccentForCategory(category) {
  switch (category) {
    case 'theme-parks':
      return '#f472b6';
    case 'resort-stays':
      return '#38bdf8';
    case 'state-parks':
      return '#34d399';
    case 'water-mountain':
      return '#22d3ee';
    case 'boardwalk-strip':
      return '#fbbf24';
    case 'living-cities':
      return '#60a5fa';
    case 'wilderness':
      return '#10b981';
    case 'domiciles':
      return '#a78bfa';
    default:
      return '#00d4ff';
  }
}

/**
 * Builds the unified, read-only array of normalized Experience cards for
 * `ExperiencesExplorer.vue` and pin projection on the Cesium globe.
 *
 * Each card carries:
 * `{ id, title, shortTitle, category, categoryLabel, region, summary,
 *    lat, lon, elev, stopCount, metaText, tags, thumbnailUrl, wikiTitle,
 *    accent, icon, actionLabel, launch: { kind, targetId, ... }, featuredRank }`
 */
export function buildExperiencesCatalog({ includeDomiciles = true } = {}) {
  const items = [];
  const seenIds = new Set();
  const pushItem = (item) => {
    if (!item?.id || seenIds.has(item.id)) return;
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
    seenIds.add(item.id);
    items.push(item);
  };

  // 1. Flagship WDW Magic Kingdom & EPCOT (anchored to EXEMPLAR_LOCALES / PARK_FIREWORKS_ANCHORS)
  const coreParks = [
    {
      tourId: 'wdw_magic_kingdom',
      localeKey: 'disney_magic_kingdom',
      // i18n-ignore: proper park name
      title: 'Magic Kingdom Park (WDW)',
      shortTitle: 'Magic Kingdom',
      region: 'Orlando, FL · USA',
      summary:
        'Walt Disney World · Main Street U.S.A., Fantasyland, Tomorrowland & Castle Fireworks.',
      stopCount: 12,
      wikiTitle: 'Magic_Kingdom',
      featuredRank: 10,
    },
    {
      tourId: 'wdw_epcot',
      localeKey: 'disney_epcot',
      // i18n-ignore: proper park name
      title: 'EPCOT (WDW)',
      shortTitle: 'EPCOT',
      region: 'Orlando, FL · USA',
      summary:
        'Walt Disney World · Spaceship Earth, World Celebration & World Showcase Lagoon.',
      stopCount: 15,
      wikiTitle: 'Epcot',
      featuredRank: 11,
    },
  ];
  for (const park of coreParks) {
    const loc =
      EXEMPLAR_LOCALES[park.localeKey] || PARK_FIREWORKS_ANCHORS[park.tourId];
    if (!loc) continue;
    pushItem({
      id: `tour:${park.tourId}`,
      title: park.title,
      shortTitle: park.shortTitle,
      category: 'theme-parks',
      categoryLabel: 'Theme Parks',
      region: park.region,
      summary: park.summary,
      lat: loc.lat,
      lon: loc.lon,
      elev: loc.elev || 32,
      stopCount: park.stopCount,
      metaText: `${park.stopCount} stops · Park Day`,
      tags: ['Theme Park', 'Park Day', 'Walk Midway', 'Fireworks'],
      thumbnailUrl: '',
      wikiTitle: park.wikiTitle,
      accent: makeAccentForCategory('theme-parks'),
      icon: 'star',
      actionLabel: 'Start Park Day',
      featuredRank: park.featuredRank,
      launch: { kind: 'tour', cityId: park.tourId, tourMode: 'all' },
    });
  }

  // 2. Stage-3 Curated Theme Parks (11 parks -> 13 total with MK & EPCOT)
  let parkRank = 12;
  for (const [parkId, meta] of Object.entries(STAGE3_THEME_PARK_METADATA)) {
    const stops = STAGE3_THEME_PARK_LANDMARKS[parkId] || [];
    pushItem({
      id: `tour:${parkId}`,
      title: meta.name,
      shortTitle: meta.shortName || meta.name,
      category: 'theme-parks',
      categoryLabel: 'Theme Parks',
      region:
        `${meta.country || ''}${meta.continent ? ` · ${meta.continent}` : ''}`.trim(),
      summary: meta.populationNote || `${stops.length} curated attractions.`,
      lat: meta.centerLat,
      lon: meta.centerLon,
      elev: stops[0]?.elev || 32,
      stopCount: stops.length,
      metaText: `${stops.length} stops · Park Day`,
      tags: [
        'Theme Park',
        'Park Day',
        meta.country || 'Global',
        ...(meta.supportedTransitModes || ['walk_midway']),
      ],
      thumbnailUrl: firstImageFromStops(stops),
      wikiTitle: firstWikiTitleFromStops(stops),
      accent: makeAccentForCategory('theme-parks'),
      icon: 'star',
      actionLabel: 'Start Park Day',
      featuredRank: parkRank++,
      launch: { kind: 'tour', cityId: parkId, tourMode: 'all' },
    });
  }

  // 3. Curated Resort Stays (7 Resorts)
  let resortRank = 30;
  for (const [resortId, meta] of Object.entries(RESORT_STAY_METADATA)) {
    const stops = RESORT_STAY_LANDMARKS[resortId] || [];
    pushItem({
      id: `resort:${resortId}`,
      title: meta.name,
      shortTitle: meta.shortName || meta.name,
      category: 'resort-stays',
      categoryLabel: 'Resort Stays',
      region: meta.cityLabel || `${meta.country || ''}`,
      summary: meta.populationNote || 'Destination Resort Day Off & Check-In.',
      lat: meta.centerLat,
      lon: meta.centerLon,
      elev: stops[0]?.elev || 26,
      stopCount: stops.length,
      metaText: `${stops.length} amenities · Resort Day Off`,
      tags: [
        'Resort Stay',
        'Basecamp Check-In',
        'Golf Cart',
        meta.cityLabel || meta.country || 'Resort',
      ],
      thumbnailUrl: firstImageFromStops(stops),
      wikiTitle: firstWikiTitleFromStops(stops),
      accent: makeAccentForCategory('resort-stays'),
      icon: 'sunny',
      actionLabel: 'Check In',
      featuredRank: resortRank++,
      launch: { kind: 'resort', cityId: resortId, tourMode: 'all' },
    });
  }

  // 4. Next Experiences (Water Park, Mountain Adventure, State Parks, Boardwalk & Strip)
  let nextRank = 50;
  for (const [venueId, meta] of Object.entries(NEXT_EXPERIENCE_METADATA)) {
    const stops = NEXT_EXPERIENCE_LANDMARKS[venueId] || [];
    const category = categoryForNextExperience(meta);
    const catMeta = EXPERIENCE_CATEGORIES.find((c) => c.id === category);
    pushItem({
      id: `experience:${venueId}`,
      title: meta.name,
      shortTitle: meta.shortName || meta.name,
      category,
      categoryLabel: catMeta?.label || 'Experiences',
      region: `${meta.country || 'USA'}${meta.continent ? ` · ${meta.continent}` : ''}`,
      summary: meta.populationNote || `${stops.length} curated stops.`,
      lat: meta.centerLat,
      lon: meta.centerLon,
      elev: stops[0]?.elev || 120,
      stopCount: stops.length,
      metaText: `${stops.length} stops · ${catMeta?.label || 'Adventure'}`,
      tags: [
        catMeta?.label || 'Experience',
        ...(meta.supportedTransitModes || []),
        meta.country || 'USA',
      ],
      thumbnailUrl: firstImageFromStops(stops),
      wikiTitle: firstWikiTitleFromStops(stops),
      accent: makeAccentForCategory(category),
      icon: catMeta?.icon || 'travel_explore',
      actionLabel: 'Launch Experience',
      featuredRank: nextRank++,
      launch: { kind: 'tour', cityId: venueId, tourMode: 'all' },
    });
  }

  // 5. Living Cities (30+ Global Cities)
  let cityRank = 80;
  for (const city of Object.values(LIVING_CITIES)) {
    const corridors = city.corridors || [];
    const landmarks = city.landmarks || [];
    pushItem({
      id: `city:${city.id}`,
      title: `${city.name}${city.country ? `, ${city.country}` : ''}`,
      shortTitle: city.name,
      category: 'living-cities',
      categoryLabel: 'Living Cities',
      region: city.region || city.country || 'Global',
      summary: landmarks.length
        ? `Street-level living city: ${landmarks.slice(0, 4).join(', ')}.`
        : 'Street-level pedestrians, transit corridors & ambient soundscape.',
      lat: city.lat,
      lon: city.lon,
      elev: city.elev || 20,
      stopCount: Math.max(corridors.length, landmarks.length),
      metaText: `${corridors.length} corridors · Living City`,
      tags: [
        'Living City',
        city.country || '',
        city.region || '',
        ...landmarks.slice(0, 3),
      ].filter(Boolean),
      thumbnailUrl: '',
      wikiTitle: city.name.replace(/\s+/g, '_'),
      accent: makeAccentForCategory('living-cities'),
      icon: 'location_city',
      actionLabel: 'Step Into City',
      featuredRank: cityRank++,
      launch: { kind: 'city', cityId: city.id },
    });
  }

  // 6. Wilderness Trailheads & National Parks
  let trailRank = 140;
  for (const trail of WILDERNESS_TRAILHEADS) {
    const biome = BIOME_META[trail.biome];
    const diff = TRAIL_DIFFICULTIES[trail.difficulty];
    const trailLat = trail.coordinates?.lat ?? trail.lat;
    const trailLon = trail.coordinates?.lon ?? trail.lon;
    const trailElev = trail.coordinates?.elevM ?? trail.elev ?? 1000;
    const distKm = trail.trailLengthKm ?? trail.distanceKm;
    pushItem({
      id: `trail:${trail.id}`,
      title: trail.name,
      shortTitle: trail.name,
      category: 'wilderness',
      categoryLabel: 'Wilderness',
      region: trail.park
        ? `${trail.park}${trail.state ? `, ${trail.state}` : ''}`
        : biome?.label || 'Wilderness',
      summary:
        trail.description ||
        `${trail.park || 'National Park'} · ${distKm || 0} km · +${trail.elevationGainM || 0}m gain.`,
      lat: trailLat,
      lon: trailLon,
      elev: trailElev,
      stopCount: trail.waypoints?.length || 1,
      metaText: `${distKm ?? '—'} km · ${diff?.badge || 'Trail'}`,
      tags: [
        'Wilderness',
        trail.park || '',
        trail.state || '',
        biome?.label || '',
        diff?.badge || '',
      ].filter(Boolean),
      thumbnailUrl: '',
      wikiTitle: '',
      accent: biome?.colorHex || makeAccentForCategory('wilderness'),
      icon: 'navigation',
      actionLabel: 'Fly To Trailhead',
      featuredRank: trailRank++,
      launch: { kind: 'wilderness', trailheadId: trail.id },
    });
  }

  // 7. Curated & Claimed Domiciles / Estates
  if (includeDomiciles) {
    let domRank = 180;
    for (const dom of getAllDomiciles()) {
      const typ = DOMICILE_TYPOLOGY_META[dom.typology];
      pushItem({
        id: `domicile:${dom.id}`,
        title: dom.title || dom.name || dom.id,
        shortTitle: dom.shortTitle || dom.title || dom.id,
        category: 'domiciles',
        categoryLabel: 'Domiciles',
        region: dom.address || dom.region || typ?.label || 'Domicile',
        summary:
          dom.schedule ||
          typ?.defaultSchedule ||
          'Personal estate, fleet driveway & departure terminal.',
        lat: dom.lat,
        lon: dom.lon,
        elev: dom.elev || 20,
        stopCount: 1,
        metaText: `${typ?.shortLabel || 'Estate'} · Personal Fleet`,
        tags: ['Domicile', 'Estate', typ?.label || 'Home'].filter(Boolean),
        thumbnailUrl: '',
        wikiTitle: '',
        accent: typ?.accentHex || makeAccentForCategory('domiciles'),
        icon: 'emergency_home',
        actionLabel: 'Visit Estate',
        featuredRank: domRank++,
        launch: { kind: 'domicile', domicileId: dom.id },
      });
    }
  }

  return items;
}

/**
 * Pure filter + sort function used by `ExperiencesExplorer.vue` and unit tests.
 */
export function filterAndSortExperiences(
  items,
  { query = '', chips = [], sort = 'featured' } = {},
) {
  const words = String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const chipSet = new Set(
    Array.isArray(chips) ? chips.filter((c) => c && c !== 'all') : [],
  );

  const filtered = (items || []).filter((item) => {
    if (chipSet.size > 0 && !chipSet.has(item.category)) return false;
    if (words.length > 0) {
      const haystack = [
        item.title,
        item.shortTitle,
        item.region,
        item.summary,
        item.categoryLabel,
        ...(item.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (words.some((w) => !haystack.includes(w))) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  if (sort === 'az') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'stops') {
    sorted.sort(
      (a, b) =>
        (b.stopCount || 0) - (a.stopCount || 0) ||
        a.title.localeCompare(b.title),
    );
  } else {
    sorted.sort(
      (a, b) =>
        (a.featuredRank ?? 999) - (b.featuredRank ?? 999) ||
        a.title.localeCompare(b.title),
    );
  }
  return sorted;
}
