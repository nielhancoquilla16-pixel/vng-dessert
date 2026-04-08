import fetch from 'node-fetch';

export const DEFAULT_STORE_ADDRESS = String(
  process.env.STORE_ADDRESS || 'Monark Subdivision, Las Pinas, Philippines',
).trim();
export const LLAMMA_AI_LABEL = 'Llamma AI';
export const LECHE_FLAN_SAFE_DISTANCE_LABEL = '3-5 km';
export const MAX_LECHE_FLAN_DELIVERY_DISTANCE_KM = 5;
export const LLAMMA_AI_SAFE_MESSAGE = '\u2705 Llamma AI: Your location is within the safe delivery range for leche flan.';
export const LLAMMA_AI_TOO_FAR_MESSAGE = '\u26A0\uFE0F Llamma AI Alert: Your location is too far for delivering leche flan safely. This item is fragile and limited to 3-5 km delivery distance only. Please remove leche flan or choose a nearer address.';
export const LLAMMA_AI_DISTANCE_REQUIRED_MESSAGE = 'Llamma AI needs a verified delivery address before leche flan can be checked out.';
export const LLAMMA_AI_ADDRESS_HINT_MESSAGE = 'Llamma AI could not match that address yet. Please include your house/unit number, street, barangay, and city.';
export const LLAMMA_AI_SERVICE_UNAVAILABLE_MESSAGE = 'Llamma AI could not verify the delivery distance right now. Please try again in a moment.';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 8000;
const geocodeCache = new Map();
const routeDistanceCache = new Map();
let storeLocationPromise = null;
const ROAD_TOKEN_PATTERN = /^(?:st|street|rd|road|ave|avenue|blvd|boulevard|drive|dr|lane|ln|way|hwy|highway|ext|extension)$/i;
const LOCALITY_TOKEN_PATTERN = /^(?:village|subdivision|subd|phase|purok|zone|barangay|brgy)$/i;
const GENERIC_MATCH_TOKENS = new Set([
  'philippines',
  'street',
  'st',
  'road',
  'rd',
  'avenue',
  'ave',
  'drive',
  'dr',
  'lane',
  'ln',
  'way',
  'village',
  'subdivision',
  'subd',
  'barangay',
  'brgy',
  'city',
  'district',
  'metro',
  'manila',
]);

const normalizeAddressText = (value = '') => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
);

const stripTrailingPostalCode = (value = '') => (
  normalizeAddressText(value).replace(/,?\s*\b\d{4}\b\s*$/g, '')
);

const normalizeGeocodingAddress = (value = '') => (
  stripTrailingPostalCode(value)
    .replace(/\.\s+(?=[A-Z])/g, ', ')
    .replace(/([^,\s])\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*\s+City)\b/g, '$1, $2')
    .replace(/([^,\s])\s+(Metro Manila|National Capital Region|NCR|Philippines)\b/gi, '$1, $2')
);

const insertCommaAfterMatch = (value = '', pattern) => (
  String(value || '').replace(pattern, (match) => `${match.trim()}, `)
);

const buildWordTailCandidate = (words = [], wordCount = 0) => {
  if (!Array.isArray(words) || wordCount < 2 || words.length < wordCount) {
    return '';
  }

  const tail = words.slice(-wordCount);

  if (tail.length <= 2) {
    return tail.join(' ');
  }

  return `${tail.slice(0, -2).join(' ')}, ${tail.slice(-2).join(' ')}`;
};

const pushCandidate = (candidates, seen, value) => {
  const normalized = normalizeAddressText(value);

  if (!normalized) {
    return;
  }

  const key = normalized.toLowerCase();
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  candidates.push(normalized);
};

const buildAddressCandidates = (address = '') => {
  const candidates = [];
  const seen = new Set();
  const normalized = normalizeAddressText(address);
  const normalizedGeocodingAddress = normalizeGeocodingAddress(normalized);
  const strippedPeriods = normalizeAddressText(normalizedGeocodingAddress.replace(/\./g, ''));
  const commaFriendly = normalizeAddressText(
    normalizedGeocodingAddress.replace(/\.\s+(?=[A-Z])/g, ', '),
  );

  pushCandidate(candidates, seen, normalized);
  pushCandidate(candidates, seen, normalizedGeocodingAddress);
  pushCandidate(candidates, seen, strippedPeriods);
  pushCandidate(candidates, seen, commaFriendly);
  pushCandidate(candidates, seen, `${normalizedGeocodingAddress}, Philippines`);
  pushCandidate(candidates, seen, `${strippedPeriods}, Philippines`);

  const localitySegments = normalizedGeocodingAddress
    .split(',')
    .map((segment) => normalizeAddressText(segment))
    .filter(Boolean);

  for (let segmentCount = Math.min(3, localitySegments.length); segmentCount >= 2; segmentCount -= 1) {
    const suffixCandidate = localitySegments.slice(-segmentCount).join(', ');
    pushCandidate(candidates, seen, suffixCandidate);
    pushCandidate(candidates, seen, `${suffixCandidate}, Philippines`);
  }

  if (!normalized.includes(',')) {
    const roadSeparated = insertCommaAfterMatch(
      normalizedGeocodingAddress,
      /\b(?:st|street|rd|road|ave|avenue|blvd|boulevard|drive|dr|lane|ln|way|hwy|highway|ext|extension)\.?\s+(?=\S)/i,
    );
    const localitySeparated = insertCommaAfterMatch(
      roadSeparated,
      /\b(?:village|subdivision|subd|phase|purok|zone|barangay|brgy)\s*[A-Za-z0-9-]*\s+(?=\S)/i,
    );
    const words = strippedPeriods.split(' ').filter(Boolean);
    const roadTokenIndex = words.findIndex((word) => ROAD_TOKEN_PATTERN.test(word.replace(/\./g, '')));
    const localityTokenIndex = words.findIndex((word) => LOCALITY_TOKEN_PATTERN.test(word));
    const locationTail3 = buildWordTailCandidate(words, 3);
    const locationTail4 = buildWordTailCandidate(words, 4);

    pushCandidate(candidates, seen, roadSeparated);
    pushCandidate(candidates, seen, localitySeparated);
    pushCandidate(candidates, seen, `${localitySeparated}, Philippines`);
    pushCandidate(candidates, seen, locationTail3);
    pushCandidate(candidates, seen, `${locationTail3}, Philippines`);
    pushCandidate(candidates, seen, locationTail4);
    pushCandidate(candidates, seen, `${locationTail4}, Philippines`);

    if (roadTokenIndex >= 1 && words.length - roadTokenIndex > 2) {
      const roadSegment = words.slice(0, roadTokenIndex + 1).join(' ');
      pushCandidate(candidates, seen, `${roadSegment}, ${locationTail3}`);
      pushCandidate(candidates, seen, `${roadSegment}, ${locationTail3}, Philippines`);
    }

    if (localityTokenIndex >= 1 && words.length - localityTokenIndex > 2) {
      const localitySegment = words.slice(localityTokenIndex - 1).join(' ');
      pushCandidate(candidates, seen, localitySegment);
      pushCandidate(candidates, seen, `${localitySegment}, Philippines`);
    }
  }

  return candidates;
};

const normalizeCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeMatchText = (value = '') => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
);

const extractMatchTokens = (value = '') => (
  normalizeMatchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_MATCH_TOKENS.has(token))
);

const buildPriorityHints = (value = '') => {
  const normalized = normalizeMatchText(value);
  const hints = new Set();
  const tokens = normalized.split(' ').filter(Boolean);

  if (normalized.includes('las pinas')) {
    hints.add('las pinas');
  }

  if (normalized.includes('zapote')) {
    hints.add('zapote');
  }

  if (tokens.length >= 2) {
    hints.add(tokens.slice(-2).join(' '));
  }

  if (tokens.length >= 3) {
    hints.add(tokens.slice(-3).join(' '));
  }

  return [...hints].filter((hint) => hint.length >= 3);
};

const escapeRegExp = (value = '') => (
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

const buildSearchUrl = (address, limit = 5) => {
  const params = new URLSearchParams({
    q: address,
    format: 'jsonv2',
    limit: String(limit),
    countrycodes: 'ph',
    addressdetails: '1',
  });

  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
};

const buildRouteUrl = (from, to) => {
  const params = new URLSearchParams({
    overview: 'false',
    alternatives: 'false',
    steps: 'false',
  });

  return `${OSRM_ROUTE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?${params.toString()}`;
};

const buildRouteCacheKey = (from, to) => (
  [
    Number(from?.latitude).toFixed(6),
    Number(from?.longitude).toFixed(6),
    Number(to?.latitude).toFixed(6),
    Number(to?.longitude).toFixed(6),
  ].join('|')
);

const fetchJsonWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'VNG-Llamma-AI/1.0 (delivery-check)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}.`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const mapGeocodeResult = (entry, queryUsed = '') => {
  const latitude = normalizeCoordinate(entry?.lat);
  const longitude = normalizeCoordinate(entry?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    displayName: String(entry?.display_name || queryUsed || '').trim(),
    queryUsed: String(queryUsed || '').trim(),
  };
};

const buildGeocodeHaystack = (entry = {}, queryUsed = '') => normalizeMatchText([
  entry?.display_name,
  entry?.name,
  queryUsed,
  ...Object.values(entry?.address || {}),
].filter(Boolean).join(' '));

const scoreGeocodeResult = (entry, originalAddress = '', queryUsed = '') => {
  const haystack = buildGeocodeHaystack(entry, queryUsed);
  const tokens = [...new Set(extractMatchTokens(originalAddress))];
  const hints = buildPriorityHints(originalAddress);
  let score = 0;

  for (const hint of hints) {
    if (haystack.includes(hint)) {
      score += hint.split(' ').length >= 2 ? 40 : 16;
    }
  }

  for (const token of tokens) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i');
    if (pattern.test(haystack)) {
      score += token.length >= 5 ? 8 : 5;
    }
  }

  if (hints.includes('las pinas') && !haystack.includes('las pinas')) {
    score -= 60;
  }

  if (hints.includes('zapote') && !haystack.includes('zapote')) {
    score -= 25;
  }

  if (normalizeMatchText(queryUsed) === normalizeMatchText(originalAddress)) {
    score += 6;
  }

  return score;
};

const selectBestGeocodeResult = (payload = [], originalAddress = '', queryUsed = '') => {
  const entries = Array.isArray(payload) ? payload : [];
  let bestResult = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const mapped = mapGeocodeResult(entry, queryUsed);
    if (!mapped) {
      continue;
    }

    const score = scoreGeocodeResult(entry, originalAddress, queryUsed);
    if (score > bestScore) {
      bestResult = mapped;
      bestScore = score;
    }
  }

  return bestResult;
};

export const formatDistanceKm = (distanceKm) => {
  const normalized = Number(distanceKm);
  return Number.isFinite(normalized) ? normalized.toFixed(1) : '';
};

export const evaluateLecheFlanDeliveryDistance = (distanceKm) => {
  const normalized = Number(distanceKm);

  if (!Number.isFinite(normalized) || normalized < 0) {
    return {
      allowed: false,
      code: 'distance_required',
      message: LLAMMA_AI_DISTANCE_REQUIRED_MESSAGE,
    };
  }

  if (normalized > MAX_LECHE_FLAN_DELIVERY_DISTANCE_KM) {
    return {
      allowed: false,
      code: 'too_far',
      message: LLAMMA_AI_TOO_FAR_MESSAGE,
    };
  }

  return {
    allowed: true,
    code: 'within_range',
    message: LLAMMA_AI_SAFE_MESSAGE,
  };
};

export const calculateAirDistanceKm = (from, to) => {
  const fromLat = normalizeCoordinate(from?.latitude);
  const fromLng = normalizeCoordinate(from?.longitude);
  const toLat = normalizeCoordinate(to?.latitude);
  const toLng = normalizeCoordinate(to?.longitude);

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(toLat - fromLat);
  const longitudeDelta = toRadians(toLng - fromLng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(longitudeDelta / 2) ** 2;
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusKm * arc;
};

export const calculateRouteDistanceKm = async (from, to) => {
  const fromLat = normalizeCoordinate(from?.latitude);
  const fromLng = normalizeCoordinate(from?.longitude);
  const toLat = normalizeCoordinate(to?.latitude);
  const toLng = normalizeCoordinate(to?.longitude);

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return null;
  }

  const cacheKey = buildRouteCacheKey(
    { latitude: fromLat, longitude: fromLng },
    { latitude: toLat, longitude: toLng },
  );

  if (routeDistanceCache.has(cacheKey)) {
    return routeDistanceCache.get(cacheKey);
  }

  const payload = await fetchJsonWithTimeout(buildRouteUrl(
    { latitude: fromLat, longitude: fromLng },
    { latitude: toLat, longitude: toLng },
  ));
  const distanceMeters = Number(payload?.routes?.[0]?.distance);

  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error('Route distance could not be resolved.');
  }

  const routeDistanceKm = distanceMeters / 1000;
  routeDistanceCache.set(cacheKey, routeDistanceKm);
  return routeDistanceKm;
};

export const geocodeAddress = async (address = '') => {
  const normalizedAddress = normalizeAddressText(address);

  if (!normalizedAddress) {
    return null;
  }

  if (geocodeCache.has(normalizedAddress)) {
    return geocodeCache.get(normalizedAddress);
  }

  let result = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let lastError = null;
  const candidates = buildAddressCandidates(normalizedAddress);

  for (const candidate of candidates) {
    try {
      if (geocodeCache.has(candidate)) {
        result = geocodeCache.get(candidate);
      } else {
        const payload = await fetchJsonWithTimeout(buildSearchUrl(candidate, 5));
        result = selectBestGeocodeResult(payload, normalizedAddress, candidate);
        geocodeCache.set(candidate, result);
      }

      if (result) {
        const candidateScore = scoreGeocodeResult({
          display_name: result.displayName,
          address: {},
        }, normalizedAddress, candidate);

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          geocodeCache.set(normalizedAddress, result);
        }

        if (candidateScore >= 50) {
          return result;
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!result && lastError) {
    throw lastError;
  }

  const finalResult = geocodeCache.get(normalizedAddress) || result;
  geocodeCache.set(normalizedAddress, finalResult || null);
  return finalResult || null;
};

export const resolveStoreLocation = async () => {
  const envLatitude = normalizeCoordinate(process.env.STORE_LATITUDE);
  const envLongitude = normalizeCoordinate(process.env.STORE_LONGITUDE);

  if (Number.isFinite(envLatitude) && Number.isFinite(envLongitude)) {
    return {
      latitude: envLatitude,
      longitude: envLongitude,
      displayName: DEFAULT_STORE_ADDRESS,
    };
  }

  if (!storeLocationPromise) {
    storeLocationPromise = geocodeAddress(DEFAULT_STORE_ADDRESS).catch((error) => {
      storeLocationPromise = null;
      throw error;
    });
  }

  const storeLocation = await storeLocationPromise;

  if (!storeLocation) {
    storeLocationPromise = null;
    const error = new Error('Store location could not be resolved for delivery analysis.');
    error.status = 503;
    throw error;
  }

  return storeLocation;
};

export const analyzeDeliveryAddress = async ({
  address = '',
  containsLecheFlan = false,
} = {}) => {
  const normalizedAddress = String(address || '').trim();

  if (!normalizedAddress) {
    return {
      code: 'needs_address',
      tone: containsLecheFlan ? 'warning' : 'info',
      assistantMessage: containsLecheFlan
        ? LLAMMA_AI_DISTANCE_REQUIRED_MESSAGE
        : `${LLAMMA_AI_LABEL} is waiting for your delivery address.`,
      distanceKm: null,
      distanceText: '',
      containsLecheFlan,
      canProceed: !containsLecheFlan,
      checkoutBlocked: containsLecheFlan,
      isDistanceVerified: false,
      distanceSource: '',
      storeAddress: DEFAULT_STORE_ADDRESS,
      matchedAddress: '',
    };
  }

  try {
    const [storeLocation, customerLocation] = await Promise.all([
      resolveStoreLocation(),
      geocodeAddress(normalizedAddress),
    ]);

    if (!customerLocation) {
      return {
        code: 'address_not_found',
        tone: containsLecheFlan ? 'warning' : 'info',
        assistantMessage: LLAMMA_AI_ADDRESS_HINT_MESSAGE,
        distanceKm: null,
        distanceText: '',
        containsLecheFlan,
        canProceed: !containsLecheFlan,
        checkoutBlocked: containsLecheFlan,
        isDistanceVerified: false,
        distanceSource: '',
        storeAddress: storeLocation.displayName || DEFAULT_STORE_ADDRESS,
        matchedAddress: '',
      };
    }

    let distanceKm = null;
    let isDistanceVerified = false;
    let distanceSource = 'road';

    try {
      distanceKm = await calculateRouteDistanceKm(storeLocation, customerLocation);
      isDistanceVerified = Number.isFinite(Number(distanceKm)) && Number(distanceKm) >= 0;
    } catch {
      distanceKm = calculateAirDistanceKm(storeLocation, customerLocation);
      distanceSource = 'air';
    }

    const distanceText = formatDistanceKm(distanceKm);
    const isAerialEstimate = distanceSource !== 'road';

    if (containsLecheFlan && !isDistanceVerified) {
      return {
        code: 'distance_unverified',
        tone: 'warning',
        assistantMessage: LLAMMA_AI_SERVICE_UNAVAILABLE_MESSAGE,
        distanceKm,
        distanceText,
        containsLecheFlan,
        canProceed: false,
        checkoutBlocked: true,
        isDistanceVerified: false,
        distanceSource,
        storeAddress: storeLocation.displayName || DEFAULT_STORE_ADDRESS,
        matchedAddress: customerLocation.displayName || normalizedAddress,
      };
    }

    const validation = containsLecheFlan
      ? evaluateLecheFlanDeliveryDistance(distanceKm)
      : {
          allowed: true,
          code: 'no_restriction',
          message: isAerialEstimate
            ? `${LLAMMA_AI_LABEL}: We could only estimate the distance right now. Checkout can continue for non-fragile items.`
            : `${LLAMMA_AI_LABEL}: Road distance is ${distanceText} km. No leche flan detected, so checkout can continue.`,
        };

    return {
      code: validation.code,
      tone: containsLecheFlan
        ? (validation.allowed ? 'success' : 'warning')
        : 'info',
      assistantMessage: validation.message,
      distanceKm,
      distanceText,
      containsLecheFlan,
      canProceed: validation.allowed,
      checkoutBlocked: !validation.allowed,
      isDistanceVerified,
      distanceSource,
      storeAddress: storeLocation.displayName || DEFAULT_STORE_ADDRESS,
      matchedAddress: customerLocation.displayName || normalizedAddress,
    };
  } catch {
    return {
      code: 'service_error',
      tone: containsLecheFlan ? 'warning' : 'info',
      assistantMessage: LLAMMA_AI_SERVICE_UNAVAILABLE_MESSAGE,
      distanceKm: null,
      distanceText: '',
      containsLecheFlan,
      canProceed: !containsLecheFlan,
      checkoutBlocked: containsLecheFlan,
      isDistanceVerified: false,
      distanceSource: '',
      storeAddress: DEFAULT_STORE_ADDRESS,
      matchedAddress: '',
    };
  }
};
