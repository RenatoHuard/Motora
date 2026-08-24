import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

export function colorDot(color, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.55)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  })
}

export function gpsDot() {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#2196f3;border:3px solid #fff;box-shadow:0 0 0 6px rgba(33,150,243,0.28)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

const _cache = new Map()

export async function geocodePoint(name) {
  if (_cache.has(name)) return _cache.get(name)
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } })
    const data = await res.json()
    const coord = data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null
    _cache.set(name, coord)
    return coord
  } catch {
    return null
  }
}

export async function geocodeSequential(names, onProgress) {
  const results = []
  for (let i = 0; i < names.length; i++) {
    results.push(await geocodePoint(names[i]))
    onProgress?.(i + 1)
    if (i < names.length - 1 && !_cache.has(names[i + 1])) {
      await new Promise(r => setTimeout(r, 1100))
    }
  }
  return results
}

// ── OSRM road routing ────────────────────────────────
// Returns a [lat, lng][] polyline that follows real roads, or null on failure.
const _routeCache = new Map()

// Returns { polyline: [lat,lng][], steps: OsrmStep[], distance: number, duration: number }
// or null on failure.
export async function getOsrmRoute(waypoints) {
  if (waypoints.length < 2) return null
  const key = waypoints.map(w => w.join(',')).join('|')
  if (_routeCache.has(key)) return _routeCache.get(key)
  try {
    const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]) {
      const r = data.routes[0]
      const result = {
        polyline: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        steps:    r.legs.flatMap(leg => leg.steps),
        distance: r.distance,
        duration: r.duration,
      }
      _routeCache.set(key, result)
      return result
    }
  } catch {}
  return null
}
