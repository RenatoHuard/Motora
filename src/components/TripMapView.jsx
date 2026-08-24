import { useEffect, useState, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import { colorDot, gpsDot, geocodeSequential, getOsrmRoute } from './leafletSetup'
import './leafletSetup'

// ── Helpers ───────────────────────────────────────────

function haversine([lat1, lon1], [lat2, lon2]) {
  const R   = 6371000
  const rad = x => x * Math.PI / 180
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Index of the polyline vertex nearest to pos
function closestPolyIdx(polyline, pos) {
  let best = 0, bestD = Infinity
  polyline.forEach((p, i) => {
    const d = haversine(pos, p)
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}

// Returns waypoints still ahead of gpsPos on the planned polyline.
// Always starts with gpsPos and ends with the destination.
function waypointsAhead(allWaypoints, planPolyline, gpsPos) {
  const dest   = allWaypoints[allWaypoints.length - 1]
  const result = [gpsPos]

  if (!planPolyline?.length) {
    result.push(dest)
    return result
  }

  const gpsIdx = closestPolyIdx(planPolyline, gpsPos)

  // For each waypoint after origin, include it if its polyline position is still ahead
  for (const wp of allWaypoints.slice(1)) {
    const wpIdx = closestPolyIdx(planPolyline, wp)
    if (wpIdx > gpsIdx) result.push(wp)
  }

  // Guarantee destination is present
  if (result.length === 1) result.push(dest)

  return result
}

function fmtDist(m) {
  if (!m) return ''
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1)} km`
}

function stepArrow(type, modifier) {
  if (type === 'arrive') return '⬤'
  if (type === 'roundabout' || type === 'rotary') return '↻'
  return ({
    left: '←', right: '→',
    'sharp left': '↰', 'sharp right': '↱',
    'slight left': '↖', 'slight right': '↗',
    straight: '↑', uturn: '↩',
  })[modifier] || '↑'
}

function stepText(step) {
  const { type, modifier } = step.maneuver
  const name = step.name || step.ref || ''
  if (type === 'depart') return `Siga em frente${name ? ' em ' + name : ''}`
  if (type === 'arrive') return 'Destino alcançado'
  if (type === 'roundabout' || type === 'rotary') {
    const ex = step.maneuver.exit ? `, tome a ${step.maneuver.exit}ª saída` : ''
    return `Rotatória${ex}${name ? ' em ' + name : ''}`
  }
  const dir = ({
    left: 'Vire à esquerda',
    right: 'Vire à direita',
    'sharp left': 'Vire totalmente à esquerda',
    'sharp right': 'Vire totalmente à direita',
    'slight left': 'Vire levemente à esquerda',
    'slight right': 'Vire levemente à direita',
    straight: 'Continue em frente',
    uturn: 'Faça o retorno',
  })[modifier] || 'Continue'
  return name ? `${dir} em ${name}` : dir
}

// Re-route via OSRM through the given waypoints (no cache — GPS changes constantly)
async function fetchRoadRoute(waypoints) {
  try {
    const pts = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson&steps=true`
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]) {
      return {
        polyline: data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        steps:    data.routes[0].legs.flatMap(l => l.steps),
      }
    }
  } catch {}
  return null
}

// ── Map sub-component ─────────────────────────────────

function PanToGps({ position, follow }) {
  const map    = useMap()
  const didSet = useRef(false)
  useEffect(() => {
    if (!position) return
    if (!didSet.current) { map.setView(position, 16); didSet.current = true }
    else if (follow) map.panTo(position, { animate: true, duration: 0.5 })
  }, [position, follow, map])
  return null
}

// ── Main ──────────────────────────────────────────────

export default function TripMapView({ line }) {
  const [gpsPos,    setGpsPos]    = useState(null)
  const [gpsError,  setGpsError]  = useState(null)
  const [waypoints, setWaypoints] = useState(null)  // geocoded stop coords
  const [planRoute, setPlanRoute] = useState(null)  // original planned route (yellow)
  const [planSteps, setPlanSteps] = useState(null)

  // Live re-route from GPS
  const [liveRoute, setLiveRoute] = useState(null)  // {polyline, steps}
  const [liveStep,  setLiveStep]  = useState(0)

  const [status,      setStatus]      = useState('idle')
  const [following,   setFollowing]   = useState(true)
  const [navActive,   setNavActive]   = useState(false)
  const [showList,    setShowList]    = useState(false)
  const [perspective, setPerspective] = useState(false)  // vista 3D estilo GPS
  const [gpsHeading,  setGpsHeading]  = useState(null)   // direção de deslocamento (0–360°)

  // Refs for access inside async GPS callbacks (avoid stale closure)
  const waypointsRef   = useRef(null)
  const planRouteRef   = useRef(null)
  const liveStepsRef   = useRef(null)
  const lastReRouteRef = useRef(null)
  const navActiveRef   = useRef(false)
  navActiveRef.current = navActive

  useEffect(() => { waypointsRef.current = waypoints }, [waypoints])
  useEffect(() => { planRouteRef.current = planRoute  }, [planRoute])

  const names = [
    line.origin,
    ...(line.stops || []).map(s => s.name).filter(Boolean),
    line.destination,
  ].filter(Boolean)

  // ── Geocode + plan route ──────────────────────────
  useEffect(() => {
    if (names.length === 0) { setStatus('ready'); return }
    let cancelled = false
    async function run() {
      setStatus('geocoding')
      const coords = await geocodeSequential(names)
      if (cancelled) return
      const valid = coords.filter(Boolean)
      setWaypoints(valid)
      if (valid.length >= 2) {
        setStatus('routing')
        const result = await getOsrmRoute(valid)
        if (!cancelled) {
          if (result) { setPlanRoute(result.polyline); setPlanSteps(result.steps) }
          else { setPlanRoute(valid) }
          setStatus('ready')
        }
      } else { setStatus('ready') }
    }
    run()
    return () => { cancelled = true }
  }, [line.id])

  // ── Re-route from GPS respecting remaining stops ──
  async function reRouteFromGps(gps) {
    const wps = waypointsRef.current
    const pr  = planRouteRef.current
    if (!wps?.length) return

    // Keep intermediate stops that haven't been passed yet
    const pts = waypointsAhead(wps, pr, gps)
    const result = await fetchRoadRoute(pts)
    if (!result) return
    setLiveRoute(result)
    liveStepsRef.current = result.steps
    setLiveStep(0)
  }

  // ── GPS watch ────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError('GPS não disponível neste dispositivo'); return }
    const id = navigator.geolocation.watchPosition(
      pos => {
        const here = [pos.coords.latitude, pos.coords.longitude]
        setGpsPos(here)
        if (pos.coords.heading !== null) setGpsHeading(pos.coords.heading)

        const s = liveStepsRef.current
        if (s && navActiveRef.current) {
          // Advance step when within 40m of next maneuver
          setLiveStep(prev => {
            if (prev >= s.length - 1) return prev
            const next = s[prev + 1]
            if (!next?.maneuver?.location) return prev
            const [lon, lat] = next.maneuver.location
            return haversine(here, [lat, lon]) < 40 ? prev + 1 : prev
          })

          // Re-route every 80m
          if (!lastReRouteRef.current || haversine(lastReRouteRef.current, here) > 80) {
            lastReRouteRef.current = here
            reRouteFromGps(here)
          }
        }
      },
      err => setGpsError('GPS: ' + err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])  // mount once — reads state via refs

  // ── Start navigation ─────────────────────────────
  function startNav() {
    setNavActive(true)
    setFollowing(true)
    setLiveStep(0)
    setLiveRoute(null)
    liveStepsRef.current   = null
    lastReRouteRef.current = null
    // Immediate re-route from current GPS
    setGpsPos(prev => {
      if (prev) {
        lastReRouteRef.current = prev
        reRouteFromGps(prev)
      }
      return prev
    })
  }

  function stopNav() {
    setNavActive(false)
    setShowList(false)
    setLiveRoute(null)
    setLiveStep(0)
    liveStepsRef.current   = null
    lastReRouteRef.current = null
  }

  const activeSteps    = liveRoute?.steps || planSteps
  const activePolyline = liveRoute?.polyline
  const currentStep    = activeSteps?.[liveStep]
  const nextStep       = activeSteps?.[liveStep + 1]

  const distToNext = useMemo(() => {
    if (!currentStep || !gpsPos) return 0
    if (nextStep?.maneuver?.location) {
      const [lon, lat] = nextStep.maneuver.location
      return haversine(gpsPos, [lat, lon])
    }
    return currentStep.distance || 0
  }, [gpsPos, currentStep, nextStep])

  const center      = gpsPos || waypoints?.[0] || [-23.5505, -46.6333]
  const statusToast = status === 'geocoding' ? '🔍 Localizando pontos…'
    : status === 'routing' ? '🛣️ Calculando rota…'
    : navActive && !liveRoute ? '🔄 Recalculando rota…' : null

  return (
    <div className="run-map-view">
      {statusToast && <div className="run-map-toast">{statusToast}</div>}
      {gpsError    && <div className="run-map-toast run-map-toast--error">{gpsError}</div>}

      {/* ── Next maneuver card ── */}
      {navActive && currentStep && (
        <div className="nav-maneuver-card">
          <div className="nav-arrow-box">
            <span className="nav-arrow-icon">{stepArrow(currentStep.maneuver.type, currentStep.maneuver.modifier)}</span>
          </div>
          <div className="nav-info">
            <div className="nav-dist">{fmtDist(distToNext)}</div>
            <div className="nav-street">{stepText(currentStep)}</div>
            {nextStep && (
              <div className="nav-next-hint">
                Depois: {stepArrow(nextStep.maneuver.type, nextStep.maneuver.modifier)} {stepText(nextStep)}
              </div>
            )}
          </div>
          <button className="nav-list-toggle" onClick={() => setShowList(v => !v)} title="Roteiro completo">
            {showList ? '×' : '☰'}
          </button>
        </div>
      )}

      {/* ── Step list panel ── */}
      {navActive && showList && activeSteps && (
        <div className="nav-steps-panel">
          <div className="nav-steps-header">
            <span>Roteiro</span>
            <button onClick={() => setShowList(false)}>×</button>
          </div>
          <div className="nav-steps-list">
            {activeSteps.map((step, i) => (
              <div key={i} className={`nav-step-row${i === liveStep ? ' current' : i < liveStep ? ' done' : ''}`}>
                <span className="nav-step-arrow">{stepArrow(step.maneuver.type, step.maneuver.modifier)}</span>
                <span className="nav-step-text">{stepText(step)}</span>
                {step.distance > 0 && <span className="nav-step-dist">{fmtDist(step.distance)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Start navigation button ── */}
      {!navActive && status === 'ready' && planSteps && (
        <button className="nav-start-btn" onClick={startNav}>
          ▶ Iniciar Navegação
        </button>
      )}

      {/* ── Map ── */}
      <div
        className={`map-perspective-wrap${perspective ? ' map-perspective-wrap--active' : ''}`}
        style={perspective && gpsHeading !== null ? { perspective: '700px' } : undefined}
      >
        <div
          className={`map-heading-wrap${perspective && gpsHeading !== null ? ' map-heading-wrap--active' : ''}`}
          style={perspective && gpsHeading !== null
            ? { transform: `rotate(${-gpsHeading}deg)` }
            : undefined}
        >
          <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Esri, Maxar, GeoEye, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.3} attribution="" />

            <PanToGps position={gpsPos} follow={following} />

            {/* Rota planejada — amarela, esmaecida quando nav ativa */}
            {planRoute?.length >= 2 && (
              <Polyline
                positions={planRoute}
                color="#FFC107"
                weight={navActive ? 3 : 5}
                opacity={navActive ? 0.25 : 0.92}
              />
            )}

            {/* Rota ao vivo do GPS — azul, seguindo vias reais */}
            {navActive && activePolyline?.length >= 2 && (
              <Polyline positions={activePolyline} color="#2196f3" weight={6} opacity={0.95} />
            )}

            {/* Marcadores de parada */}
            {(waypoints || []).map((coord, i) => {
              const isO = i === 0, isD = i === (waypoints.length - 1)
              return <Marker key={i} position={coord}
                icon={colorDot(isO ? '#4caf50' : isD ? '#f44336' : '#FFC107', isO || isD ? 16 : 11)} />
            })}

            {/* Ponto do GPS */}
            {gpsPos && <Marker position={gpsPos} icon={gpsDot()} />}
          </MapContainer>
        </div>
      </div>

      {/* ── Controles ── */}
      <button className={`run-map-center-btn ${following ? 'active' : ''}`}
        onClick={() => setFollowing(f => !f)}
        title={following ? 'Desancorar posição' : 'Seguir GPS'}>⊙</button>

      {navActive && (
        <button
          className={`nav-perspective-btn${perspective ? ' active' : ''}`}
          onClick={() => setPerspective(p => !p)}
          title={perspective ? 'Vista normal' : 'Vista GPS (3D)'}
        >
          {perspective ? '🗺' : '🚗'}
        </button>
      )}

      {navActive && (
        <button className="nav-stop-btn" onClick={stopNav}>⏹ Encerrar</button>
      )}

      <div className="run-map-legend">
        {!navActive && <span><span className="run-map-dot" style={{ background: '#FFC107' }} />Rota planejada</span>}
        {navActive && <span><span className="run-map-dot" style={{ background: '#2196f3' }} />Rota por vias</span>}
        {gpsPos && <span><span className="run-map-dot" style={{ background: '#2196f3', boxShadow: '0 0 0 3px rgba(33,150,243,0.3)' }} />Você</span>}
      </div>
    </div>
  )
}
