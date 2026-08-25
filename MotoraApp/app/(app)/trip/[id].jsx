import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Platform, ActivityIndicator, Linking, Modal, Pressable,
} from 'react-native'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'

// ── OSRM routing ─────────────────────────────────────

async function fetchRoadRoute(waypoints) {
  // waypoints: [[lat, lon], ...]
  const coords = waypoints.map(([lat, lon]) => `${lon},${lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`
  const res = await fetch(url)
  const json = await res.json()
  if (json.code !== 'Ok' || !json.routes?.length) return null
  const route = json.routes[0]
  const coords2d = route.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))
  const steps = route.legs.flatMap(leg =>
    (leg.steps || []).map(s => ({
      instruction: s.maneuver?.instruction || s.name || '',
      distance: s.distance,
    }))
  )
  return { polyline: coords2d, steps, distance: route.distance, duration: route.duration }
}

// ── Geometry helpers ──────────────────────────────────

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function closestPolyIdx(polyline, [lat, lon]) {
  let best = 0, bestD = Infinity
  polyline.forEach(({ latitude, longitude }, i) => {
    const d = haversine([lat, lon], [latitude, longitude])
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}

function formatDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

// ── Main ──────────────────────────────────────────────

export default function TripNavScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()

  const origin = params.origin || ''
  const destination = params.destination || ''
  const stops = JSON.parse(params.stops || '[]')
  const vehicleName = params.vehicleName || ''

  // waypoints as [lat, lon] arrays — parsed from stop objects
  const allWaypoints = useRef(null)

  const [gpsPos, setGpsPos] = useState(null)         // { latitude, longitude }
  const [heading, setHeading] = useState(null)
  const [grantStatus, setGrantStatus] = useState('pending') // pending | granted | denied
  const [route, setRoute] = useState(null)            // { polyline, steps, distance, duration }
  const [routeLoading, setRouteLoading] = useState(false)
  const [navActive, setNavActive] = useState(false)
  const [liveStep, setLiveStep] = useState(0)
  const [passedPrompt, setPassedPrompt] = useState(false)  // "already past origin?"
  const [navModal, setNavModal] = useState(false)
  const mapRef = useRef(null)
  const locationSub = useRef(null)
  const lastReRoute = useRef(null)
  const navActiveRef = useRef(false)
  const passedPromptRef = useRef(false)
  const routeRef = useRef(null)

  navActiveRef.current = navActive
  passedPromptRef.current = passedPrompt
  routeRef.current = route

  // ── Parse waypoints ──────────────────────────────────

  useEffect(() => {
    // stops are [{lat, lng}] or [{coords: {lat, lng}}] depending on version
    const wps = []

    function parseCoord(s) {
      if (!s) return null
      const lat = s.lat ?? s.latitude
      const lon = s.lng ?? s.longitude ?? s.lon
      if (lat == null || lon == null) return null
      return [parseFloat(lat), parseFloat(lon)]
    }

    const originCoord = stops[0] ? parseCoord(stops[0]) : null
    const destCoord = stops[stops.length - 1] ? parseCoord(stops[stops.length - 1]) : null

    for (const stop of stops) {
      const c = parseCoord(stop)
      if (c) wps.push(c)
    }

    allWaypoints.current = wps.length >= 2 ? wps : null
    if (wps.length >= 2) loadPlanRoute(wps)
  }, [])

  async function loadPlanRoute(wps) {
    setRouteLoading(true)
    const result = await fetchRoadRoute(wps)
    setRouteLoading(false)
    if (result) setRoute(result)
  }

  // ── GPS permission + tracking ────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { setGrantStatus('denied'); return }
      setGrantStatus('granted')

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        loc => {
          const { latitude, longitude, heading: h } = loc.coords
          const pos = { latitude, longitude }
          setGpsPos(pos)
          if (h != null && h >= 0) setHeading(h)

          if (!navActiveRef.current || passedPromptRef.current) return

          // re-route if moved >80m from last re-route point
          const posArr = [latitude, longitude]
          if (lastReRoute.current) {
            const dist = haversine(posArr, lastReRoute.current)
            if (dist > 80) {
              lastReRoute.current = posArr
              routeViaOrigin(posArr)
            }
          }

          // advance step
          if (routeRef.current) {
            const idx = closestPolyIdx(routeRef.current.polyline, posArr)
            const total = routeRef.current.polyline.length
            const stepIdx = Math.floor((idx / total) * (routeRef.current.steps.length))
            setLiveStep(Math.min(stepIdx, routeRef.current.steps.length - 1))
          }
        }
      )
      locationSub.current = sub
    })()

    return () => locationSub.current?.remove()
  }, [])

  async function routeViaOrigin(gpsArr) {
    const wps = allWaypoints.current
    if (!wps?.length) return
    const fullWps = [gpsArr, ...wps]
    setRouteLoading(true)
    const result = await fetchRoadRoute(fullWps)
    setRouteLoading(false)
    if (result) setRoute(result)
  }

  // ── Center map on GPS ────────────────────────────────

  useEffect(() => {
    if (gpsPos && mapRef.current && navActive) {
      mapRef.current.animateCamera({
        center: gpsPos,
        heading: heading ?? 0,
        pitch: navActive ? 45 : 0,
        zoom: 17,
      }, { duration: 800 })
    }
  }, [gpsPos, navActive])

  // ── Start navigation ─────────────────────────────────

  function openNavModal() {
    if (!allWaypoints.current?.length) {
      Alert.alert('Sem rota', 'Esta corrida não tem waypoints configurados.')
      return
    }
    setNavModal(true)
  }

  function startInApp() {
    setNavModal(false)
    setNavActive(true)

    if (!gpsPos) return
    const wps = allWaypoints.current
    if (!wps?.length) return

    const gpsArr = [gpsPos.latitude, gpsPos.longitude]
    const origin = wps[0]
    const rt = routeRef.current

    let ahead = false
    if (rt?.polyline?.length) {
      const gpsIdx = closestPolyIdx(rt.polyline, gpsArr)
      const originIdx = closestPolyIdx(rt.polyline, origin)
      ahead = gpsIdx > originIdx + 15
    }

    if (ahead) {
      setPassedPrompt(true)
    } else {
      lastReRoute.current = gpsArr
      routeViaOrigin(gpsArr)
    }
  }

  function handleGoogleMaps() {
    setNavModal(false)
    const wps = allWaypoints.current
    if (!wps?.length) return
    const org = wps[0], dest = wps[wps.length - 1]
    const mid = wps.slice(1, -1)
    let url = `https://www.google.com/maps/dir/?api=1&origin=${org[0]},${org[1]}&destination=${dest[0]},${dest[1]}`
    if (mid.length) url += `&waypoints=${mid.map(w => `${w[0]},${w[1]}`).join('|')}`
    url += `&travelmode=driving`
    Linking.openURL(url)
  }

  function handleWaze() {
    setNavModal(false)
    const wps = allWaypoints.current
    if (!wps?.length) return
    const dest = wps[wps.length - 1]
    Linking.openURL(`https://waze.com/ul?ll=${dest[0]},${dest[1]}&navigate=yes`)
  }

  // ── Render ────────────────────────────────────────────

  const currentStep = route?.steps?.[liveStep]

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Voltar</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerRoute} numberOfLines={1}>
            {origin} → {destination}
          </Text>
          {vehicleName ? <Text style={styles.headerVehicle}>{vehicleName}</Text> : null}
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {grantStatus === 'denied' && (
          <View style={styles.permDenied}>
            <Text style={styles.permText}>Permissão de localização negada.</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()}>
              <Text style={styles.permLink}>Abrir Configurações</Text>
            </TouchableOpacity>
          </View>
        )}

        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          showsUserLocation={false}
          showsMyLocationButton={false}
          pitchEnabled
          rotateEnabled
          initialRegion={{
            latitude: -15.77, longitude: -47.93,
            latitudeDelta: 30, longitudeDelta: 30,
          }}
        >
          {/* Route polyline */}
          {route?.polyline && (
            <Polyline
              coordinates={route.polyline}
              strokeColor="#2196f3"
              strokeWidth={5}
            />
          )}

          {/* GPS position marker */}
          {gpsPos && (
            <Marker coordinate={gpsPos} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.gpsDot, navActive && styles.gpsDotNav]}>
                {navActive && heading != null && (
                  <View style={[styles.gpsArrow, { transform: [{ rotate: `${heading}deg` }] }]}>
                    <View style={styles.arrowHead} />
                  </View>
                )}
              </View>
            </Marker>
          )}

          {/* Waypoint markers */}
          {(allWaypoints.current || []).map(([lat, lon], i) => (
            <Marker
              key={i}
              coordinate={{ latitude: lat, longitude: lon }}
              pinColor={i === 0 ? 'green' : i === (allWaypoints.current.length - 1) ? 'red' : 'orange'}
            />
          ))}
        </MapView>

        {routeLoading && (
          <View style={styles.routeLoading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.routeLoadingText}>Calculando rota…</Text>
          </View>
        )}
      </View>

      {/* Maneuver card (during active nav) */}
      {navActive && currentStep && (
        <View style={styles.maneuverCard}>
          <Text style={styles.maneuverDist}>{formatDist(currentStep.distance)}</Text>
          <Text style={styles.maneuverText} numberOfLines={2}>{currentStep.instruction}</Text>
        </View>
      )}

      {/* Passed origin prompt */}
      {passedPrompt && (
        <View style={styles.passedOverlay}>
          <View style={styles.passedCard}>
            <Text style={styles.passedTitle}>Você já passou do início da rota</Text>
            <Text style={styles.passedText}>O que deseja fazer?</Text>
            <View style={styles.passedBtns}>
              <TouchableOpacity
                style={styles.passedBtn}
                onPress={() => {
                  setPassedPrompt(false)
                  passedPromptRef.current = false
                  if (gpsPos) {
                    const gpsArr = [gpsPos.latitude, gpsPos.longitude]
                    lastReRoute.current = gpsArr
                    routeViaOrigin(gpsArr)
                  }
                }}
              >
                <Text style={styles.passedBtnText}>↩ Ir ao início</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.passedBtn, styles.passedBtnPrimary]}
                onPress={() => {
                  setPassedPrompt(false)
                  passedPromptRef.current = false
                  if (gpsPos) {
                    const gpsArr = [gpsPos.latitude, gpsPos.longitude]
                    const wps = allWaypoints.current || []
                    const rt = routeRef.current
                    if (rt?.polyline) {
                      const gpsIdx = closestPolyIdx(rt.polyline, gpsArr)
                      const remaining = rt.polyline.slice(gpsIdx)
                      setRoute({ ...rt, polyline: remaining })
                    }
                    lastReRoute.current = gpsArr
                  }
                }}
              >
                <Text style={styles.passedBtnText}>▶ Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {!navActive ? (
          <TouchableOpacity style={styles.startBtn} onPress={openNavModal}>
            <Text style={styles.startBtnText}>Iniciar Navegação</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopBtn} onPress={() => { setNavActive(false); setPassedPrompt(false) }}>
            <Text style={styles.stopBtnText}>Encerrar Navegação</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Nav choice modal */}
      <Modal transparent visible={navModal} animationType="slide" onRequestClose={() => setNavModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setNavModal(false)}>
          <Pressable style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Como deseja navegar?</Text>

            <TouchableOpacity style={styles.navOption} onPress={handleGoogleMaps}>
              <View style={[styles.navIcon, { backgroundColor: '#4285F4' }]}>
                <Text style={styles.navIconText}>G</Text>
              </View>
              <View>
                <Text style={styles.navOptionName}>Google Maps</Text>
                <Text style={styles.navOptionDesc}>Abre o Google Maps com o trajeto completo</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navOption} onPress={handleWaze}>
              <View style={[styles.navIcon, { backgroundColor: '#00D4FF' }]}>
                <Text style={styles.navIconText}>W</Text>
              </View>
              <View>
                <Text style={styles.navOptionName}>Waze</Text>
                <Text style={styles.navOptionDesc}>Abre o Waze para o destino final</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navOption} onPress={startInApp}>
              <View style={[styles.navIcon, { backgroundColor: '#0a84ff' }]}>
                <Text style={styles.navIconText}>M</Text>
              </View>
              <View>
                <Text style={styles.navOptionName}>No aplicativo</Text>
                <Text style={styles.navOptionDesc}>Rota calculada dentro do Motora</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setNavModal(false)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  backBtn: { marginRight: 12 },
  backText: { fontSize: 17, color: '#0a84ff', fontWeight: '600' },
  headerInfo: { flex: 1 },
  headerRoute: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  headerVehicle: { fontSize: 12, color: '#888', marginTop: 1 },

  mapContainer: { flex: 1 },
  map: { flex: 1 },

  permDenied: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 5,
  },
  permText: { color: '#fff', fontSize: 16, marginBottom: 12 },
  permLink: { color: '#0a84ff', fontSize: 15, fontWeight: '700' },

  routeLoading: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
  },
  routeLoadingText: { color: '#fff', fontSize: 13 },

  gpsDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#2196f3', borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  gpsDotNav: { width: 36, height: 36, borderRadius: 18 },
  gpsArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  arrowHead: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 20,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#2196f3',
  },

  maneuverCard: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 90, left: 12, right: 12,
    backgroundColor: '#1a1a2e', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  maneuverDist: { fontSize: 18, fontWeight: '800', color: '#0a84ff', minWidth: 64 },
  maneuverText: { flex: 1, fontSize: 14, color: '#fff', fontWeight: '500' },

  passedOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 20,
  },
  passedCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, marginHorizontal: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  passedTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginBottom: 6 },
  passedText: { fontSize: 14, color: '#666', marginBottom: 20 },
  passedBtns: { flexDirection: 'row', gap: 12 },
  passedBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  passedBtnPrimary: { backgroundColor: '#0a84ff' },
  passedBtnText: { fontWeight: '700', fontSize: 14, color: '#1a1a2e' },

  bottomBar: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 4,
  },
  startBtn: { backgroundColor: '#0a84ff', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  stopBtn: { backgroundColor: '#ff3b30', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 20, textAlign: 'center' },
  navOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  navIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navIconText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  navOptionName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  navOptionDesc: { fontSize: 13, color: '#888' },
  modalCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  modalCancelText: { fontSize: 16, color: '#999', fontWeight: '600' },
})
