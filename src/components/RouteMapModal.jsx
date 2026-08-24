import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import { colorDot, geocodeSequential, getOsrmRoute } from './leafletSetup'
import './leafletSetup'

function FitBounds({ coords }) {
  const map    = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || coords.length === 0) return
    fitted.current = true
    if (coords.length === 1) map.setView(coords[0], 13)
    else map.fitBounds(coords, { padding: [40, 40], maxZoom: 14 })
  }, [coords, map])
  return null
}

export default function RouteMapModal({ line, onClose }) {
  const [phase,    setPhase]    = useState('geocoding') // 'geocoding' | 'routing' | 'done' | 'error'
  const [progress, setProgress] = useState(0)
  const [stops,    setStops]    = useState(null)  // [{coord, name, idx}]
  const [route,    setRoute]    = useState(null)  // [lat,lng][] road geometry | null = straight line

  const names = [
    line.origin,
    ...(line.stops || []).map(s => s.name).filter(Boolean),
    line.destination,
  ].filter(Boolean)

  useEffect(() => {
    if (names.length === 0) { setPhase('error'); return }
    let cancelled = false

    async function run() {
      // Step 1: geocode
      setPhase('geocoding')
      const coords = await geocodeSequential(names, p => { if (!cancelled) setProgress(p) })
      if (cancelled) return

      const valid = coords.map((c, i) => ({ coord: c, name: names[i], idx: i })).filter(x => x.coord)
      setStops(valid)

      if (valid.length < 2) { setPhase('done'); return }

      // Step 2: get road route from OSRM
      setPhase('routing')
      const waypoints = valid.map(x => x.coord)
      const result = await getOsrmRoute(waypoints)
      if (!cancelled) {
        setRoute(result?.polyline || null)
        setPhase('done')
      }
    }

    run()
    return () => { cancelled = true }
  }, [line.id])

  const polyline      = route || (stops || []).map(x => x.coord)
  const boundsCoords  = (stops || []).map(x => x.coord)
  const loading       = phase === 'geocoding' || phase === 'routing'

  return (
    <div className="route-map-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="route-map-modal">

        <div className="route-map-header">
          <button className="wizard-back-btn" onClick={onClose}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>
              {[line.origin, line.destination].filter(Boolean).join(' → ')}
            </div>
          </div>
          {phase === 'routing' && (
            <div style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>Calculando rota…</div>
          )}
        </div>

        <div className="route-map-container">
          {phase === 'geocoding' && (
            <div className="route-map-loading">
              <div className="route-map-spinner" />
              <span>Localizando pontos… {progress}/{names.length}</span>
            </div>
          )}

          {phase === 'error' && (
            <div className="route-map-loading">
              <span style={{ fontSize: 28 }}>🗺️</span>
              <span>Trajeto não configurado.</span>
            </div>
          )}

          {(phase === 'routing' || phase === 'done') && stops && stops.length > 0 && (
            <MapContainer center={stops[0].coord} zoom={10} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds coords={boundsCoords} />

              {polyline.length >= 2 && (
                <Polyline positions={polyline} color="#FFC107" weight={4} opacity={0.9} />
              )}

              {stops.map(({ coord, name, idx }) => {
                const isOrigin = idx === 0
                const isDest   = idx === names.length - 1
                const color    = isOrigin ? '#4caf50' : isDest ? '#f44336' : '#FFC107'
                return (
                  <Marker key={idx} position={coord} icon={colorDot(color, isOrigin || isDest ? 16 : 12)}>
                    <Popup>
                      <strong>{isOrigin ? 'Início' : isDest ? 'Fim' : 'Parada'}</strong><br />{name}
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          )}
        </div>

      </div>
    </div>
  )
}
