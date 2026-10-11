export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
}

export interface PlaceAutocompleteItem {
  placeId: string;
  mainText: string;
  secondaryText: string;
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// In-Memory LRU / TTL Cache to prevent quota burn
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SimpleTtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxItems: number;
  private ttlMs: number;

  constructor(maxItems = 500, ttlMs = 5 * 60 * 1000) {
    this.maxItems = maxItems;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh position for LRU behavior
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const autocompleteCache = new SimpleTtlCache<PlaceAutocompleteItem[]>(500, 5 * 60 * 1000);
const geocodeCache = new SimpleTtlCache<{ address: string; latitude: number; longitude: number }>(500, 10 * 60 * 1000);
const reverseGeocodeCache = new SimpleTtlCache<{ address: string; latitude: number; longitude: number }>(500, 10 * 60 * 1000);
const routeCache = new SimpleTtlCache<RouteResult>(500, 10 * 60 * 1000);

export const KNOWN_PLACES: Array<PlaceAutocompleteItem & { address: string }> = [
  // Jharkhand State Hubs & Educational Landmarks
  {
    placeId: "jh_cuj",
    mainText: "Central University of Jharkhand (CUJ)",
    secondaryText: "Cheri-Manatu, Ranchi, Jharkhand",
    address: "Central University of Jharkhand, Cheri-Manatu Campus, Kanke, Ranchi, Jharkhand 835222, India",
    latitude: 23.4682,
    longitude: 85.3402,
  },
  {
    placeId: "jh_rnc_station",
    mainText: "Ranchi Railway Station (RNC)",
    secondaryText: "Station Road, Gosaintola, Ranchi, Jharkhand",
    address: "Ranchi Junction Railway Station, Gosaintola, Ranchi, Jharkhand 834001, India",
    latitude: 23.3512,
    longitude: 85.3340,
  },
  {
    placeId: "jh_ixr_airport",
    mainText: "Birsa Munda Airport (IXR)",
    secondaryText: "Hinoo, Ranchi, Jharkhand",
    address: "Birsa Munda Airport, Airport Road, Hinoo, Ranchi, Jharkhand 834002, India",
    latitude: 23.3143,
    longitude: 85.3218,
  },
  {
    placeId: "jh_bit_mesra",
    mainText: "BIT Mesra",
    secondaryText: "Mesra, Ranchi, Jharkhand",
    address: "Birla Institute of Technology, Mesra, Ranchi, Jharkhand 835215, India",
    latitude: 23.4244,
    longitude: 85.4382,
  },
  {
    placeId: "jh_ranchi_main_rd",
    mainText: "Main Road Ranchi",
    secondaryText: "Hindpiri, Ranchi, Jharkhand",
    address: "Main Road, Hindpiri, Ranchi, Jharkhand 834001, India",
    latitude: 23.3644,
    longitude: 85.3283,
  },
  {
    placeId: "jh_tatanagar",
    mainText: "Tatanagar Junction Railway Station",
    secondaryText: "Khasmahal, Jamshedpur, Jharkhand",
    address: "Tatanagar Junction, Jamshedpur, Jharkhand 831002, India",
    latitude: 22.7712,
    longitude: 86.2029,
  },
  {
    placeId: "jh_dhanbad_station",
    mainText: "Dhanbad Railway Station",
    secondaryText: "Dhanbad, Jharkhand",
    address: "Dhanbad Junction Railway Station, Dhanbad, Jharkhand 826001, India",
    latitude: 23.7915,
    longitude: 86.4304,
  },
  // Telangana Metropolitan Hubs & Landmarks
  {
    placeId: "hyd_hitec",
    mainText: "HITEC City (Cyber Towers)",
    secondaryText: "Madhapur, Hyderabad, Telangana",
    address: "Cyber Towers, HITEC City, Madhapur, Hyderabad, Telangana 500081, India",
    latitude: 17.4504,
    longitude: 78.3808,
  },
  {
    placeId: "hyd_rgia",
    mainText: "Rajiv Gandhi International Airport (HYD)",
    secondaryText: "Shamshabad, Hyderabad, Telangana",
    address: "Rajiv Gandhi International Airport, Shamshabad, Hyderabad, Telangana 500409, India",
    latitude: 17.2403,
    longitude: 78.4294,
  },
  {
    placeId: "hyd_charminar",
    mainText: "Charminar",
    secondaryText: "Old City, Hyderabad, Telangana",
    address: "Charminar, Ghansi Bazaar, Hyderabad, Telangana 500002, India",
    latitude: 17.3616,
    longitude: 78.4747,
  },
  {
    placeId: "hyd_inorbit",
    mainText: "Inorbit Mall",
    secondaryText: "Mindspace, Madhapur, Hyderabad",
    address: "Inorbit Mall, Mindspace, Madhapur, Hyderabad, Telangana 500081, India",
    latitude: 17.4348,
    longitude: 78.3867,
  },
  {
    placeId: "hyd_jubilee",
    mainText: "Jubilee Hills",
    secondaryText: "Road No. 36, Hyderabad, Telangana",
    address: "Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033, India",
    latitude: 17.4319,
    longitude: 78.4073,
  },
  {
    placeId: "hyd_secunderabad",
    mainText: "Secunderabad Railway Station",
    secondaryText: "Station Road, Secunderabad, Telangana",
    address: "Secunderabad Junction Railway Station, Secunderabad, Telangana 500003, India",
    latitude: 17.4344,
    longitude: 78.5015,
  },
  // Karnataka Hubs
  {
    placeId: "blr_airport",
    mainText: "Kempegowda International Airport (BLR)",
    secondaryText: "Devanahalli, Bengaluru, Karnataka",
    address: "Kempegowda International Airport, Bengaluru, Karnataka 560300, India",
    latitude: 13.1986,
    longitude: 77.7066,
  },
  {
    placeId: "blr_indiranagar",
    mainText: "Indiranagar 100ft Road",
    secondaryText: "Indiranagar, Bengaluru, Karnataka",
    address: "100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038, India",
    latitude: 12.9784,
    longitude: 77.6408,
  },
  // Maharashtra Hubs
  {
    placeId: "mumbai_gateway",
    mainText: "Gateway of India",
    secondaryText: "Apollo Bandar, Colaba, Mumbai",
    address: "Gateway of India, Colaba, Mumbai, Maharashtra 400001, India",
    latitude: 18.9220,
    longitude: 72.8347,
  },
  {
    placeId: "mumbai_airport",
    mainText: "Chhatrapati Shivaji Maharaj Airport (BOM)",
    secondaryText: "Sahar, Andheri East, Mumbai",
    address: "Chhatrapati Shivaji Maharaj International Airport, Mumbai, Maharashtra 400099, India",
    latitude: 19.0896,
    longitude: 72.8656,
  },
  {
    placeId: "pune_hinjewadi",
    mainText: "Hinjewadi IT Park",
    secondaryText: "Hinjewadi, Pune, Maharashtra",
    address: "Rajiv Gandhi Infotech Park, Hinjewadi Phase 1, Pune, Maharashtra 411057, India",
    latitude: 18.5913,
    longitude: 73.7389,
  },
  // Delhi NCR Hubs
  {
    placeId: "del_connaught",
    mainText: "Connaught Place",
    secondaryText: "Connaught Place, New Delhi, Delhi",
    address: "Connaught Place, New Delhi, Delhi 110001, India",
    latitude: 28.6315,
    longitude: 77.2167,
  },
  {
    placeId: "del_igi",
    mainText: "Indira Gandhi International Airport (DEL)",
    secondaryText: "Palam, New Delhi, Delhi",
    address: "Indira Gandhi International Airport, New Delhi, Delhi 110037, India",
    latitude: 28.5562,
    longitude: 77.1000,
  },
  // Tamil Nadu, West Bengal & Gujarat Hubs
  {
    placeId: "chn_central",
    mainText: "Chennai Central Railway Station",
    secondaryText: "Park Town, Chennai, Tamil Nadu",
    address: "Puratchi Thalaivar Dr. M.G. Ramachandran Central Railway Station, Chennai, Tamil Nadu 600003, India",
    latitude: 13.0827,
    longitude: 80.2707,
  },
  {
    placeId: "kol_victoria",
    mainText: "Victoria Memorial",
    secondaryText: "Maidan, Kolkata, West Bengal",
    address: "Victoria Memorial, Queens Way, Maidan, Kolkata, West Bengal 700071, India",
    latitude: 22.5448,
    longitude: 88.3426,
  },
  {
    placeId: "ahm_sghighway",
    mainText: "SG Highway",
    secondaryText: "Bodakdev, Ahmedabad, Gujarat",
    address: "Sarkhej - Gandhinagar Highway, Bodakdev, Ahmedabad, Gujarat 380054, India",
    latitude: 23.0338,
    longitude: 72.5070,
  },
];

function getServerApiKey(): string | undefined {
  const key =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_CLIENT_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  if (!key || key.trim() === "" || key.includes("placeholder") || key === "YOUR_KEY") {
    return undefined;
  }
  return key.trim();
}

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// ---------------------------------------------------------------------------
// 1. Calculate Route (Directions API with caching & haversine fallback)
// ---------------------------------------------------------------------------
export async function calculateRoute(origin: LatLng, destination: LatLng): Promise<RouteResult> {
  const cacheKey = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}->${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getServerApiKey();

  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&region=in&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data: any = await res.json();
        if (data.status === "OK" && data.routes?.[0]?.legs?.[0]) {
          const leg = data.routes[0].legs[0];
          const result: RouteResult = {
            distanceMeters: leg.distance.value,
            durationSeconds: leg.duration.value,
            polyline: data.routes[0].overview_polyline?.points,
          };
          routeCache.set(cacheKey, result);
          return result;
        } else if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
          console.warn(`[Google Directions API Warning] Status: ${data.status} - ${data.error_message || "Check billing / key restrictions"}. Using fallback engine.`);
        } else if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") {
          console.info(`[Google Directions API Info] Status: ${data.status}. Falling back to road estimate.`);
        } else if (data.status === "INVALID_REQUEST") {
          console.warn(`[Google Directions API Warning] Invalid coordinates provided: ${origin.latitude},${origin.longitude} -> ${destination.latitude},${destination.longitude}`);
        }
      }
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        console.warn("[Google Directions API Timeout] Request exceeded 5000ms. Falling back to road estimate.");
      } else {
        console.warn(`[Google Directions API Network Error] ${err.message}. Falling back to road estimate.`);
      }
    }
  }

  // Fallback to high-precision OSRM / Geodesic road estimation
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=polyline&steps=false`;
    const res = await fetch(osrmUrl, { headers: { "User-Agent": "RideBooker/1.0" }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.code === "Ok" && data.routes?.[0]) {
        const r = data.routes[0];
        const result: RouteResult = {
          distanceMeters: Math.round(r.distance),
          durationSeconds: Math.round(r.duration),
          polyline: Array.isArray(r.geometry?.coordinates)
            ? encodePolyline(r.geometry.coordinates.map(([longitude, latitude]: [number, number]) => ({ latitude, longitude })))
            : undefined,
        };
        routeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {}

  const straightLine = haversineDistanceMeters(origin, destination);
  const roadDistanceMeters = Math.round(straightLine * 1.28);
  const baseSpeedMps = 8.88;
  const travelTimeSeconds = Math.round(roadDistanceMeters / baseSpeedMps + 120);

  const fallbackResult: RouteResult = {
    distanceMeters: Math.max(500, roadDistanceMeters),
    durationSeconds: Math.max(180, travelTimeSeconds),
  };
  routeCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded || typeof encoded !== "string") return [];
  const poly: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return poly;
}

function encodeSignedNumber(num: number): string {
  let sgn_num = num < 0 ? ~(num << 1) : num << 1;
  let encodeString = "";
  while (sgn_num >= 0x20) {
    encodeString += String.fromCharCode((0x20 | (sgn_num & 0x1f)) + 63);
    sgn_num >>= 5;
  }
  encodeString += String.fromCharCode(sgn_num + 63);
  return encodeString;
}

export function encodePolyline(points: LatLng[]): string {
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);

    const dLat = lat - prevLat;
    const dLng = lng - prevLng;

    prevLat = lat;
    prevLng = lng;

    encoded += encodeSignedNumber(dLat) + encodeSignedNumber(dLng);
  }

  return encoded;
}

export async function calculateMultiStopRoute(points: LatLng[]): Promise<RouteResult> {
  if (!points || points.length < 2) {
    return { distanceMeters: 0, durationSeconds: 0 };
  }
  if (points.length === 2) {
    return calculateRoute(points[0], points[1]);
  }

  const cacheKey = points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join("->");
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getServerApiKey();

  if (apiKey) {
    try {
      const origin = points[0];
      const destination = points[points.length - 1];
      const intermediates = points.slice(1, -1);
      const waypointsParam = intermediates.map((p) => `via:${p.latitude},${p.longitude}`).join("|");
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&waypoints=${encodeURIComponent(waypointsParam)}&region=in&key=${apiKey}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data: any = await res.json();
        if (data.status === "OK" && data.routes?.[0]?.legs) {
          const legs = data.routes[0].legs;
          let totalDistance = 0;
          let totalDuration = 0;
          for (const leg of legs) {
            totalDistance += leg.distance?.value || 0;
            totalDuration += leg.duration?.value || 0;
          }
          const result: RouteResult = {
            distanceMeters: totalDistance,
            durationSeconds: totalDuration,
            polyline: data.routes[0].overview_polyline?.points,
          };
          routeCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (err: any) {
      console.warn(`[Google Directions Multi-Stop Error] ${err.message}. Calculating segment-by-segment.`);
    }
  }

  // Calculate segment-by-segment
  let totalDistance = 0;
  let totalDuration = 0;
  const combinedCoordinates: LatLng[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const leg = await calculateRoute(points[i], points[i + 1]);
    totalDistance += leg.distanceMeters;
    totalDuration += leg.durationSeconds;
    if (leg.polyline) {
      const decoded = decodePolyline(leg.polyline);
      if (decoded.length > 0) {
        if (combinedCoordinates.length > 0) {
          combinedCoordinates.push(...decoded.slice(1));
        } else {
          combinedCoordinates.push(...decoded);
        }
      }
    } else {
      if (combinedCoordinates.length === 0) {
        combinedCoordinates.push(points[i]);
      }
      combinedCoordinates.push(points[i + 1]);
    }
  }

  const result: RouteResult = {
    distanceMeters: totalDistance,
    durationSeconds: totalDuration,
    polyline: combinedCoordinates.length > 1 ? encodePolyline(combinedCoordinates) : undefined,
  };

  routeCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// 2. Search Places Autocomplete (Places API with caching & India biasing)
// ---------------------------------------------------------------------------
export async function searchPlacesAutocomplete(query: string): Promise<PlaceAutocompleteItem[]> {
  const q = query.trim();
  if (!q) return KNOWN_PLACES.slice(0, 6);

  const cacheKey = q.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getServerApiKey();

  // 1. Local catalog fast-match
  const localMatches = KNOWN_PLACES.filter(
    (p) =>
      p.mainText.toLowerCase().includes(cacheKey) ||
      p.secondaryText.toLowerCase().includes(cacheKey) ||
      p.address.toLowerCase().includes(cacheKey)
  );

  // 2. Try Google Places Autocomplete API with strict India country restriction
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:in&region=in&language=en&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data: any = await res.json();
        if (data.status === "OK" && Array.isArray(data.predictions) && data.predictions.length > 0) {
          const results: PlaceAutocompleteItem[] = [];
          for (const pred of data.predictions.slice(0, 6)) {
            let lat = 0;
            let lng = 0;
            try {
              const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&fields=geometry&region=in&language=en&key=${apiKey}`;
              const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(3000) });
              if (detailRes.ok) {
                const detailData: any = await detailRes.json();
                lat = detailData?.result?.geometry?.location?.lat ?? 0;
                lng = detailData?.result?.geometry?.location?.lng ?? 0;
              }
            } catch {}

            results.push({
              placeId: pred.place_id,
              mainText: pred.structured_formatting?.main_text || pred.description.split(",")[0],
              secondaryText: pred.structured_formatting?.secondary_text || pred.description,
              latitude: lat,
              longitude: lng,
            });
          }
          if (results.length > 0) {
            autocompleteCache.set(cacheKey, results);
            return results;
          }
        } else if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
          console.warn(`[Google Places Autocomplete API Warning] Status: ${data.status} - ${data.error_message || "Check API key permissions"}. Using local catalog.`);
        } else if (data.status === "ZERO_RESULTS") {
          console.info(`[Google Places Autocomplete Info] No results for: "${q}"`);
        }
      }
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        console.warn("[Google Places Autocomplete Timeout] Request timed out. Using fallback.");
      } else {
        console.warn(`[Google Places Autocomplete Network Error] ${err.message}. Using fallback.`);
      }
    }
  }

  // 3. OpenStreetMap / Nominatim search fallback with countrycodes=in
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&addressdetails=1&limit=6`;
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "RideBookerApp/1.0 (contact@ridebooker.app)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const osmResults = data.map((item: any, idx: number) => {
          const name = item.name || item.display_name.split(",")[0];
          const addressParts = item.display_name.split(",").slice(1).join(",").trim();
          return {
            placeId: `osm_${item.place_id || idx}`,
            mainText: name,
            secondaryText: addressParts || item.display_name,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          };
        });
        const combined = [...localMatches, ...osmResults].slice(0, 6);
        autocompleteCache.set(cacheKey, combined);
        return combined;
      }
    }
  } catch {}

  if (localMatches.length > 0) {
    autocompleteCache.set(cacheKey, localMatches);
    return localMatches;
  }

  return [];
}

// ---------------------------------------------------------------------------
// 3. Geocode Address (Geocoding API with caching & India biasing)
// ---------------------------------------------------------------------------
export async function geocodeAddress(address: string): Promise<{ address: string; latitude: number; longitude: number }> {
  const q = address.trim();
  if (!q) return { address: "", latitude: 17.4435, longitude: 78.3772 };

  const cacheKey = q.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getServerApiKey();

  // 1. Fast match known landmarks (check keywords)
  const matched = KNOWN_PLACES.find((p) => {
    const mainLower = p.mainText.toLowerCase();
    const addrLower = p.address.toLowerCase();
    const qLower = cacheKey;
    return (
      mainLower === qLower ||
      mainLower.includes(qLower) ||
      qLower.includes(mainLower) ||
      addrLower.includes(qLower)
    );
  });

  if (matched) {
    const res = { address: matched.address, latitude: matched.latitude, longitude: matched.longitude };
    geocodeCache.set(cacheKey, res);
    return res;
  }

  // Check specific Jharkhand keywords if offline
  if (cacheKey.includes("jharkhand") || cacheKey.includes("ranchi") || cacheKey.includes("cuj")) {
    if (cacheKey.includes("university") || cacheKey.includes("cuj")) {
      const res = {
        address: "Central University of Jharkhand, Cheri-Manatu Campus, Ranchi, Jharkhand 835222, India",
        latitude: 23.4682,
        longitude: 85.3402,
      };
      geocodeCache.set(cacheKey, res);
      return res;
    }
    if (cacheKey.includes("station") || cacheKey.includes("railway") || cacheKey.includes("rnc")) {
      const res = {
        address: "Ranchi Junction Railway Station, Gosaintola, Ranchi, Jharkhand 834001, India",
        latitude: 23.3512,
        longitude: 85.3340,
      };
      geocodeCache.set(cacheKey, res);
      return res;
    }
    if (cacheKey.includes("airport") || cacheKey.includes("ixr") || cacheKey.includes("birsa")) {
      const res = {
        address: "Birsa Munda Airport, Airport Road, Hinoo, Ranchi, Jharkhand 834002, India",
        latitude: 23.3143,
        longitude: 85.3218,
      };
      geocodeCache.set(cacheKey, res);
      return res;
    }
  }

  // 2. Google Geocoding API with India country restriction
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:in&region=in&language=en&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data: any = await res.json();
        if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
          const loc = data.results[0].geometry.location;
          const result = {
            address: data.results[0].formatted_address || q,
            latitude: loc.lat,
            longitude: loc.lng,
          };
          geocodeCache.set(cacheKey, result);
          return result;
        } else if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
          console.warn(`[Google Geocoding API Warning] Status: ${data.status} - ${data.error_message || "Check API key permissions"}.`);
        } else if (data.status === "ZERO_RESULTS") {
          console.info(`[Google Geocoding Info] Zero results for address: "${q}"`);
        }
      }
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        console.warn("[Google Geocoding Timeout] Request timed out. Using fallback.");
      } else {
        console.warn(`[Google Geocoding Network Error] ${err.message}. Using fallback.`);
      }
    }
  }

  // 3. OpenStreetMap Nominatim Global Geocoder fallback with countrycodes=in
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&limit=1`;
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "RideBookerApp/1.0 (contact@ridebooker.app)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const result = {
          address: data[0].display_name || q,
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
        geocodeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {}

  const fallback = {
    address: `${q}, India`,
    latitude: 17.4435,
    longitude: 78.3772,
  };
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}

// ---------------------------------------------------------------------------
// 4. Reverse Geocode (Reverse Geocoding API with caching & catalog fallback)
// ---------------------------------------------------------------------------
export async function reverseGeocode(coords: LatLng): Promise<{ address: string; latitude: number; longitude: number }> {
  const cacheKey = `${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getServerApiKey();

  // 1. Check nearby known landmarks (within 1.5km)
  let closest = KNOWN_PLACES[0];
  let minD = Infinity;
  for (const place of KNOWN_PLACES) {
    const d = haversineDistanceMeters(coords, place);
    if (d < minD) {
      minD = d;
      closest = place;
    }
  }

  if (minD < 1500) {
    const res = {
      address: closest.address,
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
    reverseGeocodeCache.set(cacheKey, res);
    return res;
  }

  // 2. Google Reverse Geocoding API with India region
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&region=in&language=en&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data: any = await res.json();
        if (data.status === "OK" && data.results?.[0]?.formatted_address) {
          const result = {
            address: data.results[0].formatted_address,
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
          reverseGeocodeCache.set(cacheKey, result);
          return result;
        } else if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
          console.warn(`[Google Reverse Geocoding Warning] Status: ${data.status} - ${data.error_message || "Check API key permissions"}.`);
        }
      }
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        console.warn("[Google Reverse Geocoding Timeout] Request timed out. Using fallback.");
      } else {
        console.warn(`[Google Reverse Geocoding Network Error] ${err.message}. Using fallback.`);
      }
    }
  }

  // 3. OpenStreetMap Nominatim Reverse Geocoding fallback with countrycodes=in
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&countrycodes=in&format=json`;
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "RideBookerApp/1.0 (contact@ridebooker.app)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.display_name) {
        const result = {
          address: data.display_name,
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        reverseGeocodeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {}

  const fallback = {
    address: `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}, India`,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
  reverseGeocodeCache.set(cacheKey, fallback);
  return fallback;
}
