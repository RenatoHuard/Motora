import { useEffect, useState, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { colorDot, gpsDot, geocodeSequential, getOsrmRoute } from './leafletSetup'
import './leafletSetup'

// ── Helpers ───────────────────────────────────────────

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000, rad = x => x * Math.PI / 180
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function closestPolyIdx(polyline, pos) {
  let best = 0, bestD = Infinity
  polyline.forEach((p, i) => { const d = haversine(pos, p); if (d < bestD) { bestD = d; best = i } })
  return best
}

function waypointsAhead(allWaypoints, planPolyline, gpsPos) {
  const dest = allWaypoints[allWaypoints.length - 1]
  const result = [gpsPos]
  if (!planPolyline?.length) { result.push(dest); return result }
  const gpsIdx = closestPolyIdx(planPolyline, gpsPos)
  for (const wp of allWaypoints.slice(1)) {
    const wpIdx = closestPolyIdx(planPolyline, wp)
    if (wpIdx > gpsIdx) result.push(wp)
  }
  if (result.length === 1) result.push(dest)
  return result
}

function fmtDist(m) {
  if (!m) return ''
  return m < 1000 ? `${Math.round(m/10)*10} m` : `${(m/1000).toFixed(1)} km`
}

function stepArrow(type, modifier) {
  if (type === 'arrive') return '⬤'
  if (type === 'roundabout' || type === 'rotary') return '↻'
  return ({ left:'←', right:'→', 'sharp left':'↰', 'sharp right':'↱',
    'slight left':'↖', 'slight right':'↗', straight:'↑', uturn:'↩' })[modifier] || '↑'
}

function stepText(step) {
  const { type, modifier } = step.maneuver
  const name = step.name || step.ref || ''
  if (type === 'depart') return `Siga em frente${name ? ' em '+name : ''}`
  if (type === 'arrive') return 'Destino alcançado'
  if (type === 'roundabout' || type === 'rotary') {
    const ex = step.maneuver.exit ? `, tome a ${step.maneuver.exit}ª saída` : ''
    return `Rotatória${ex}${name ? ' em '+name : ''}`
  }
  const dir = ({ left:'Vire à esquerda', right:'Vire à direita',
    'sharp left':'Vire totalmente à esquerda', 'sharp right':'Vire totalmente à direita',
    'slight left':'Vire levemente à esquerda', 'slight right':'Vire levemente à direita',
    straight:'Continue em frente', uturn:'Faça o retorno' })[modifier] || 'Continue'
  return name ? `${dir} em ${name}` : dir
}

async function fetchRoadRoute(waypoints) {
  try {
    const pts = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson&steps=true`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]) {
      return {
        polyline: data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        steps: data.routes[0].legs.flatMap(l => l.steps),
      }
    }
  } catch {}
  return null
}

function arrowDot(heading) {
  const h = heading ?? 0
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;transform:rotate(${h}deg)">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <polygon points="16,2 28,30 16,22 4,30" fill="#2196f3" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  })
}

function buildGoogleMapsUrl(waypoints) {
  if (!waypoints?.length) return null
  const origin = waypoints[0], destination = waypoints[waypoints.length-1]
  const mid = waypoints.slice(1,-1)
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin[0]},${origin[1]}&destination=${destination[0]},${destination[1]}`
  if (mid.length) url += `&waypoints=${mid.map(w=>`${w[0]},${w[1]}`).join('|')}`
  return url + `&travelmode=driving`
}

function buildWazeUrl(waypoints) {
  if (!waypoints?.length) return null
  const dest = waypoints[waypoints.length-1]
  return `https://waze.com/ul?ll=${dest[0]},${dest[1]}&navigate=yes`
}

// ── Map sub-component ─────────────────────────────────

function PanToGps({ position, follow }) {
  const map = useMap()
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
  const [gpsPos,      setGpsPos]      = useState(null)
  const [gpsError,    setGpsError]    = useState(null)
  const [gpsHeading,  setGpsHeading]  = useState(null)
  const [waypoints,   setWaypoints]   = useState(null)
  const [planRoute,   setPlanRoute]   = useState(null)
  const [planSteps,   setPlanSteps]   = useState(null)
  const [liveRoute,   setLiveRoute]   = useState(null)
  const [liveStep,    setLiveStep]    = useState(0)
  const [status,      setStatus]      = useState('idle')
  const [following,   setFollowing]   = useState(true)
  const [perspective, setPerspective] = useState(false)
  const [navActive,   setNavActive]   = useState(false)
  const [showList,    setShowList]    = useState(false)
  const [navModal,    setNavModal]    = useState(false)
  const [passedPrompt,setPassedPrompt]= useState(false)

  const waypointsRef    = useRef(null)
  const planRouteRef    = useRef(null)
  const liveStepsRef    = useRef(null)
  const lastReRouteRef  = useRef(null)
  const navActiveRef    = useRef(false)
  const passedPromptRef = useRef(false)
  navActiveRef.current    = navActive
  passedPromptRef.current = passedPrompt

  useEffect(() => { waypointsRef.current  = waypoints }, [waypoints])
  useEffect(() => { planRouteRef.current  = planRoute  }, [planRoute])

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

  // ── Re-route from GPS ────────────────────────────
  async function reRouteFromGps(gps) {
    const wps = waypointsRef.current
    const pr  = planRouteRef.current
    if (!wps?.length) return
    const pts = waypointsAhead(wps, pr, gps)
    const result = await fetchRoadRoute(pts)
    if (!result) return
    setLiveRoute(result)
    liveStepsRef.current = result.steps
    setLiveStep(0)
  }

  async function routeViaOrigin(gps) {
    const wps = waypointsRef.current
    if (!wps?.length) return
    const result = await fetchRoadRoute([gps, ...wps])
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
          setLiveStep(prev => {
            if (prev >= s.length - 1) return prev
            const next = s[prev + 1]
            if (!next?.maneuver?.location) return prev
            const [lon, lat] = next.maneuver.location
            return haversine(here, [lat, lon]) < 40 ? prev + 1 : prev
          })
          if (!passedPromptRef.current &&
              (!lastReRouteRef.current || haversine(lastReRouteRef.current, here) > 80)) {
            lastReRouteRef.current = here
            reRouteFromGps(here)
          }
        }
      },
      err => setGpsError('GPS: ' + err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // ── Nav handlers ─────────────────────────────────
  function startInApp() {
    setNavActive(true)
    setPerspective(true)
    setFollowing(true)
    setLiveStep(0)
    setLiveRoute(null)
    liveStepsRef.current   = null
    lastReRouteRef.current = null
    setNavModal(false)

    setGpsPos(prev => {
      if (!prev) return prev
      const wps = waypointsRef.current
      if (!wps?.length) return prev
      const origin = wps[0]
      const pr = planRouteRef.current
      let ahead = false
      if (pr?.length) {
        const gpsIdx    = closestPolyIdx(pr, prev)
        const originIdx = closestPolyIdx(pr, origin)
        ahead = gpsIdx > originIdx + 15
      }
      if (ahead) {
        setPassedPrompt(true)
      } else {
        lastReRouteRef.current = prev
        routeViaOrigin(prev)
      }
      return prev
    })
  }

  function stopNav() {
    setNavActive(false)
    setPerspective(false)
    setPassedPrompt(false)
    setShowList(false)
    setLiveRoute(null)
    setLiveStep(0)
    liveStepsRef.current   = null
    lastReRouteRef.current = null
  }

  function handleIgnoreOrigin() {
    setPassedPrompt(false)
    setGpsPos(prev => { if (prev) { lastReRouteRef.current = prev; reRouteFromGps(prev) }; return prev })
  }

  function handleGoToOrigin() {
    setPassedPrompt(false)
    setGpsPos(prev => { if (prev) { lastReRouteRef.current = prev; routeViaOrigin(prev) }; return prev })
  }

  function handleGoogleMaps() {
    const url = buildGoogleMapsUrl(waypoints)
    if (url) window.open(url, '_blank')
    setNavModal(false)
  }

  function handleWaze() {
    const url = buildWazeUrl(waypoints)
    if (url) window.open(url, '_blank')
    setNavModal(false)
  }

  // ── Derived ──────────────────────────────────────
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

      {/* ── Card de manobra (in-app nav) ── */}
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
          <button className="nav-list-toggle" onClick={() => setShowList(v => !v)}>{showList ? '×' : '☰'}</button>
        </div>
      )}

      {/* ── Lista de passos ── */}
      {navActive && showList && activeSteps && (
        <div className="nav-steps-panel">
          <div className="nav-steps-header">
            <span>Roteiro</span>
            <button onClick={() => setShowList(false)}>×</button>
          </div>
          <div className="nav-steps-list">
            {activeSteps.map((step, i) => (
              <div key={i} className={`nav-step-row${i===liveStep?' current':i<liveStep?' done':''}`}>
                <span className="nav-step-arrow">{stepArrow(step.maneuver.type, step.maneuver.modifier)}</span>
                <span className="nav-step-text">{stepText(step)}</span>
                {step.distance > 0 && <span className="nav-step-dist">{fmtDist(step.distance)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Map ── */}
      <div
        style={{
          flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
          transition: 'transform 0.5s ease',
          ...(perspective ? {
            transform: gpsHeading != null
              ? `rotate(${-gpsHeading}deg) perspective(800px) rotateX(42deg) scale(1.6)`
              : 'perspective(800px) rotateX(42deg) scale(1.6)',
            transformOrigin: 'center 60%',
          } : {}),
        }}
      >
        <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Esri, Maxar, GeoEye, Earthstar Geographics'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.3} attribution="" />
          <PanToGps position={gpsPos} follow={following} />

          {/* Rota planejada — amarela */}
          {planRoute?.length >= 2 && (
            <Polyline positions={planRoute} color="#FFC107"
              weight={navActive ? 3 : 5} opacity={navActive ? 0.25 : 0.92} />
          )}

          {/* Rota ao vivo — azul (só em nav in-app) */}
          {navActive && activePolyline?.length >= 2 && (
            <Polyline positions={activePolyline} color="#2196f3" weight={6} opacity={0.95} />
          )}

          {(waypoints || []).map((coord, i) => {
            const isO = i === 0, isD = i === (waypoints.length-1)
            return <Marker key={i} position={coord}
              icon={colorDot(isO ? '#4caf50' : isD ? '#f44336' : '#FFC107', isO||isD ? 16 : 11)} />
          })}

          {gpsPos && (
            navActive && gpsHeading != null
              ? <Marker position={gpsPos} icon={arrowDot(gpsHeading)} />
              : <Marker position={gpsPos} icon={gpsDot()} />
          )}
        </MapContainer>
      </div>

      {/* ── Modal: escolha de navegação ── */}
      {navModal && (
        <div className="nav-choice-overlay" onClick={() => setNavModal(false)}>
          <div className="nav-choice-modal" onClick={e => e.stopPropagation()}>
            <div className="nav-choice-title">Como deseja navegar?</div>

            <button className="nav-choice-btn" onClick={handleGoogleMaps}>
              <span className="nav-choice-icon">
                <svg viewBox="0 0 48 48" width="32" height="32">
                  <path d="M24 4C15.16 4 8 11.16 8 20c0 12 16 28 16 28s16-16 16-28c0-8.84-7.16-16-16-16z" fill="#EA4335"/>
                  <circle cx="24" cy="20" r="6" fill="white"/>
                </svg>
              </span>
              <span className="nav-choice-info">
                <span className="nav-choice-name">Google Maps</span>
                <span className="nav-choice-desc">Abre no app Google Maps com áudio e pedágios</span>
              </span>
            </button>

            <button className="nav-choice-btn" onClick={handleWaze}>
              <span className="nav-choice-icon">
                <svg viewBox="0 0 48 48" width="32" height="32">
                  <ellipse cx="24" cy="26" rx="18" ry="16" fill="#33CCFF"/>
                  <circle cx="18" cy="34" r="4" fill="#1a1a1a"/>
                  <circle cx="30" cy="34" r="4" fill="#1a1a1a"/>
                  <path d="M17 22 Q24 18 31 22" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  <circle cx="19" cy="19" r="2.5" fill="white"/>
                  <circle cx="29" cy="19" r="2.5" fill="white"/>
                </svg>
              </span>
              <span className="nav-choice-info">
                <span className="nav-choice-name">Waze</span>
                <span className="nav-choice-desc">Abre no Waze com trânsito em tempo real</span>
              </span>
            </button>

            <button className="nav-choice-btn" onClick={startInApp}>
              <span className="nav-choice-icon nav-choice-icon--inapp">🗺️</span>
              <span className="nav-choice-info">
                <span className="nav-choice-name">No aplicativo</span>
                <span className="nav-choice-desc">Vista GPS 3D com rota por vias dentro do Motora</span>
              </span>
            </button>

            <button className="nav-choice-cancel" onClick={() => setNavModal(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Modal: passou do início ── */}
      {passedPrompt && (
        <div className="nav-passed-overlay">
          <div className="nav-passed-modal">
            <div className="nav-passed-icon">📍</div>
            <div className="nav-passed-title">Você não está no início da rota</div>
            <div className="nav-passed-text">
              Parece que você já passou ou ainda não chegou ao ponto de partida. O que deseja fazer?
            </div>
            <button className="nav-passed-btn nav-passed-btn--primary" onClick={handleGoToOrigin}>
              ↩ Ir ao início da rota
            </button>
            <button className="nav-passed-btn" onClick={handleIgnoreOrigin}>
              ▶ Continuar da posição atual
            </button>
          </div>
        </div>
      )}

      {/* ── Botões de navegação ── */}
      {!navActive && status === 'ready' && waypoints?.length >= 2 && (
        <button className="nav-start-btn" onClick={() => setNavModal(true)}>
          ▶ Iniciar Navegação
        </button>
      )}
      {navActive && (
        <button className="nav-stop-btn" onClick={stopNav}>⏹ Encerrar</button>
      )}

      {/* ── Controles ── */}
      <button className={`run-map-center-btn ${following ? 'active' : ''}`}
        onClick={() => setFollowing(f => !f)}
        title={following ? 'Desancorar posição' : 'Seguir GPS'}>⊙</button>

      {status === 'ready' && (
        <button className={`nav-perspective-btn${perspective ? ' active' : ''}`}
          onClick={() => setPerspective(p => !p)}
          title={perspective ? 'Vista normal' : 'Vista GPS (3D)'}>
          {perspective ? '🗺️' : '🚗'}
        </button>
      )}

      <div className="run-map-legend">
        {!navActive && <span><span className="run-map-dot" style={{ background: '#FFC107' }} />Rota planejada</span>}
        {navActive  && <span><span className="run-map-dot" style={{ background: '#2196f3' }} />Rota por vias</span>}
        {gpsPos     && <span><span className="run-map-dot" style={{ background: '#2196f3', boxShadow: '0 0 0 3px rgba(33,150,243,0.3)' }} />Você</span>}
      </div>
    </div>
  )
}
