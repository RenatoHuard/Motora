import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'

// ── recurrence helpers ────────────────────────────────

function recurrenceMatchesToday(r, startIso, todayStr) {
  if (!r || r.type === 'none') return false
  if (r.end?.type === 'date' && r.end.date && todayStr > r.end.date) return false
  const today = new Date(todayStr + 'T12:00:00')
  const start = startIso ? new Date(startIso + 'T12:00:00') : today
  switch (r.type) {
    case 'daily': return true
    case 'weekly': return (r.weekdays || []).includes(today.getDay())
    case 'biweekly': {
      if (!(r.weekdays || []).includes(today.getDay())) return false
      const diffWeeks = Math.round((today - start) / (7 * 86400000))
      return diffWeeks % 2 === 0
    }
    case 'monthly': return today.getDate() === start.getDate()
    default: return false
  }
}

function occursToday(trip) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const startStr = trip.departure_date
  if (!startStr) return false
  const r = trip.recurrence
  if (!r || r.type === 'none') return startStr === todayStr
  if (startStr > todayStr) return false
  return recurrenceMatchesToday(r, startStr, todayStr)
}

function lineOccursToday(line) {
  if (!line.active) return false
  const todayStr = new Date().toISOString().slice(0, 10)
  const startIso = (line.created_at || '').slice(0, 10) || todayStr
  return recurrenceMatchesToday(line.recurrence, startIso, todayStr)
}

// ── component ─────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter()
  const [todayItems, setTodayItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: trips }, { data: lines }, { data: vehicles }] = await Promise.all([
      supabase.from('trips').select('*').eq('user_id', user.id),
      supabase.from('lines').select('*').eq('user_id', user.id),
      supabase.from('vehicles').select('id, name').eq('user_id', user.id),
    ])

    const items = []

    // Lines that run today
    for (const line of (lines || [])) {
      if (!lineOccursToday(line)) continue
      const vehicle = (vehicles || []).find(v => v.id === line.vehicle_id)
      items.push({ key: `line-${line.id}`, kind: 'line', line, vehicle })
    }

    // One-off or recurring trips today
    for (const trip of (trips || [])) {
      if (!occursToday(trip)) continue
      const vehicle = (vehicles || []).find(v => v.id === (trip.substitute_vehicle_id || trip.vehicle_id))
      items.push({ key: `trip-${trip.id}`, kind: 'trip', trip, vehicle })
    }

    setTodayItems(items)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function handleRun(item) {
    const id = item.kind === 'line' ? item.line.id : item.trip.id
    const type = item.kind
    // pass stop data via serialized JSON in query params
    const stops = item.kind === 'line'
      ? (item.line.stops || [])
      : []
    router.push({
      pathname: '/trip/[id]',
      params: {
        id,
        type,
        origin: item.kind === 'line' ? (item.line.origin || '') : (item.trip.origin || ''),
        destination: item.kind === 'line' ? (item.line.destination || '') : (item.trip.destination || ''),
        stops: JSON.stringify(stops),
        vehicleName: item.vehicle?.name || '',
      },
    })
  }

  function renderItem({ item }) {
    const isLine = item.kind === 'line'
    const origin = isLine ? item.line.origin : item.trip.origin
    const destination = isLine ? item.line.destination : item.trip.destination
    const time = isLine ? item.line.departure_time : item.trip.departure_time
    const vehicleName = item.vehicle?.name || ''

    return (
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <Text style={styles.route} numberOfLines={1}>
            {origin || '—'} → {destination || '—'}
          </Text>
          <View style={styles.metaRow}>
            {time && <Text style={styles.metaText}>⬆ {time.slice(0, 5)}</Text>}
            {vehicleName ? <Text style={styles.metaText}>· {vehicleName}</Text> : null}
            {isLine && <Text style={styles.badge}>{item.line.name}</Text>}
          </View>
        </View>
        <TouchableOpacity style={styles.runBtn} onPress={() => handleRun(item)}>
          <Text style={styles.runBtnText}>Iniciar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hoje</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#0a84ff" />
      ) : (
        <FlatList
          data={todayItems}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={todayItems.length === 0 ? styles.empty : styles.list}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <Text style={styles.emptyIcon}>🚌</Text>
              <Text style={styles.emptyTitle}>Nenhuma corrida hoje</Text>
              <Text style={styles.emptyText}>
                Adicione viagens ou linhas pelo app web para vê-las aqui.
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f6ff' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0a84ff' },
  logoutText: { fontSize: 14, color: '#999', fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  empty: { flex: 1 },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardMain: { flex: 1, marginRight: 12 },
  route: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaText: { fontSize: 13, color: '#666' },
  badge: {
    fontSize: 11, color: '#0a84ff', backgroundColor: '#e8f3ff',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontWeight: '600',
  },
  runBtn: {
    backgroundColor: '#0a84ff', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  runBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
