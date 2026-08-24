import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import VehicleBuilder from './VehicleBuilder'
import VehicleEditor from './VehicleEditor'
import SeatManager from './SeatManager'
import LineBuilder from './LineBuilder'
import TripBuilder, { recurrenceSummary, formatDate } from './TripBuilder'
import PassengerBuilder from './PassengerBuilder'
import TripSeatingView from './TripSeatingView'
import TripRunView from './TripRunView'
import RouteBuilder from './RouteBuilder'
import RouteMapModal from '../components/RouteMapModal'
import ProfilePanel from '../components/ProfilePanel'
import OnboardingWizard from '../components/OnboardingWizard'
import Avatar from '../components/Avatar'

// ── Constants ──────────────────────────────────────────

const SEAT_TYPE_LABEL = { conventional: 'Convencional', executive: 'Executivo', semi_leito: 'Semi-leito', leito: 'Leito' }
const SUBTYPE_LABEL   = { conventional: 'Convencional', double_decker: 'Double Decker', minivan: 'Sprinter / Minivan', executive_van: 'Van Executiva' }
const WEEKDAY_SHORT   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ── Today's matching ───────────────────────────────────

function recurrenceMatchesToday(r, startIso, todayStr) {
  if (!r || r.type === 'none') return false
  if (r.end?.type === 'date' && r.end.date && todayStr > r.end.date) return false

  const today = new Date(todayStr + 'T12:00:00')
  const start = startIso ? new Date(startIso + 'T12:00:00') : today

  switch (r.type) {
    case 'daily':    return true
    case 'weekly':   return (r.weekdays || []).includes(today.getDay())
    case 'biweekly': {
      if (!(r.weekdays || []).includes(today.getDay())) return false
      const diffWeeks = Math.round((today - start) / (7 * 86400000))
      return diffWeeks % 2 === 0
    }
    case 'monthly':  return today.getDate() === start.getDate()
    default:         return false
  }
}

function occursToday(trip) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const startStr = trip.departureDate
  if (!startStr) return false
  const r = trip.recurrence
  if (!r || r.type === 'none') return startStr === todayStr
  if (startStr > todayStr) return false
  return recurrenceMatchesToday(r, startStr, todayStr)
}

function lineOccursToday(line) {
  if (!line.active) return false
  const todayStr = new Date().toISOString().slice(0, 10)
  // use created_at as reference for biweekly/monthly
  const startIso = (line.createdAt || '').slice(0, 10) || todayStr
  return recurrenceMatchesToday(line.recurrence, startIso, todayStr)
}

// ── Vehicle DB helpers ─────────────────────────────────

function toRow(vehicle, userId) {
  const floorMeta = (vehicle.floors || []).map(f => ({ rowLayout: f.rowLayout || '2+2', seatType: f.seatType || 'conventional' }))
  return {
    id: vehicle.id, user_id: userId, name: vehicle.name, plate: vehicle.plate || null,
    vehicle_type: vehicle.vehicleType, bus_type: vehicle.busType || null,
    seat_classes: { rowLayouts: vehicle.rowLayouts || [], seatTypes: vehicle.seatTypes || [], labelScheme: vehicle.labelScheme || 'num_letter' },
    rows_per_floor: vehicle.rowsPerFloor || [], floors: floorMeta,
    total_seats: vehicle.totalSeats || 0, created_at: vehicle.createdAt,
    updated_at: vehicle.updatedAt || new Date().toISOString(),
  }
}

function fromRow(row) {
  const meta   = (row.seat_classes && typeof row.seat_classes === 'object' && !Array.isArray(row.seat_classes)) ? row.seat_classes : {}
  const floors = (row.floors || []).map(f => ({ rowLayout: f.rowLayout || '2+2', seatType: f.seatType || 'conventional', rows: [] }))
  return {
    id: row.id, name: row.name, plate: row.plate, vehicleType: row.vehicle_type, busType: row.bus_type,
    rowLayouts: meta.rowLayouts || floors.map(f => f.rowLayout), seatTypes: meta.seatTypes || floors.map(f => f.seatType),
    labelScheme: meta.labelScheme || 'num_letter', rowsPerFloor: row.rows_per_floor, floors,
    totalSeats: row.total_seats, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function ensureFloorMeta(vehicle) {
  if (vehicle.floors?.length) return vehicle
  const rowLayouts = vehicle.rowLayouts || []
  const seatTypes  = vehicle.seatTypes  || []
  if (!rowLayouts.length) return vehicle
  return { ...vehicle, floors: rowLayouts.map((rl, i) => ({ rowLayout: rl, seatType: seatTypes[i] || 'conventional', rows: [] })) }
}

function reconstructFloors(vehicle, seats) {
  return (vehicle.floors || []).map((meta, fi) => {
    const fs  = (seats || []).filter(s => s.floor_num === fi)
    const max = fs.reduce((m, s) => Math.max(m, s.row_num), 0)
    const rows = Array.from({ length: max }, (_, ri) => {
      const rn   = ri + 1
      const pick = side => fs.filter(s => s.row_num === rn && s.side === side).sort((a, b) => a.col_idx - b.col_idx)
        .map(s => ({ id: s.id, label: s.label, exists: s.seat_exists, active: s.active }))
      return { rowId: crypto.randomUUID(), leftSeats: pick('left'), rightSeats: pick('right') }
    })
    return { rowLayout: meta.rowLayout || '2+2', seatType: meta.seatType || 'conventional', rows }
  })
}

function floorsToSeats(vehicleId, userId, floors) {
  const seats = [], now = new Date().toISOString()
  ;(floors || []).forEach((floor, fi) => {
    ;(floor.rows || []).forEach((row, ri) => {
      const push = (side, list) => list.forEach((seat, ci) => seats.push({
        id: seat.id, vehicle_id: vehicleId, user_id: userId,
        floor_num: fi, row_num: ri + 1, side, col_idx: ci,
        label: seat.label, seat_exists: seat.exists, active: seat.active, updated_at: now,
      }))
      push('left', row.leftSeats)
      push('right', row.rightSeats)
    })
  })
  return seats
}

// ── Line DB helpers ────────────────────────────────────

function lineToRow(l, userId) {
  return {
    id: l.id, user_id: userId, name: l.name,
    vehicle_id: l.vehicleId || null,
    origin: l.origin || null, destination: l.destination || null,
    departure_time: l.departureTime || null,
    round_trip: l.roundTrip ?? false,
    return_time: l.returnTime || null,
    recurrence: l.recurrence || { type: 'none' },
    notes: l.notes || null, active: l.active ?? true,
    stops: l.stops || [],
    created_at: l.createdAt, updated_at: l.updatedAt || new Date().toISOString(),
  }
}

function lineFromRow(row) {
  return {
    id: row.id, name: row.name, vehicleId: row.vehicle_id,
    origin: row.origin, destination: row.destination,
    departureTime: row.departure_time,
    roundTrip: row.round_trip ?? false,
    returnTime: row.return_time,
    recurrence: row.recurrence || { type: 'none' },
    notes: row.notes, active: row.active,
    stops: row.stops || [],
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function lpFromRow(row) {
  return { id: row.id, lineId: row.line_id, passengerId: row.passenger_id, seatId: row.seat_id, seatLabel: row.seat_label, floorNum: row.floor_num }
}

// ── Trip DB helpers ────────────────────────────────────

function tripToRow(t, userId) {
  return {
    id: t.id, user_id: userId,
    line_id: t.lineId || null,
    vehicle_id: t.vehicleId || null,
    substitute_vehicle_id: t.substituteVehicleId || null,
    origin: t.origin || null, destination: t.destination || null,
    departure_date: t.departureDate, departure_time: t.departureTime || null,
    recurrence: t.recurrence || { type: 'none' }, notes: t.notes || null,
    created_at: t.createdAt, updated_at: t.updatedAt || new Date().toISOString(),
  }
}

function tripFromRow(row) {
  return {
    id: row.id,
    lineId: row.line_id, vehicleId: row.vehicle_id,
    substituteVehicleId: row.substitute_vehicle_id,
    origin: row.origin, destination: row.destination,
    departureDate: row.departure_date, departureTime: row.departure_time,
    recurrence: row.recurrence || { type: 'none' }, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

// ── Passenger DB helpers ───────────────────────────────

function passengerToRow(p, userId) {
  return {
    id: p.id, user_id: userId, name: p.name,
    email: p.email || null, phone: p.phone || null, photo_url: p.photoUrl || null,
    type: p.type || 'avulso', created_at: p.createdAt,
    updated_at: p.updatedAt || new Date().toISOString(),
  }
}

function passengerFromRow(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, photoUrl: row.photo_url, type: row.type, createdAt: row.created_at, updatedAt: row.updated_at }
}

function tpFromRow(row) {
  return { id: row.id, tripId: row.trip_id, passengerId: row.passenger_id, seatId: row.seat_id, seatLabel: row.seat_label, floorNum: row.floor_num }
}

// ── Effective vehicle helper ───────────────────────────

function effectiveVehicle(trip, lines, vehicles) {
  if (trip.substituteVehicleId) return vehicles.find(v => v.id === trip.substituteVehicleId) || null
  if (trip.lineId) {
    const line = lines.find(l => l.id === trip.lineId)
    if (line?.vehicleId) return vehicles.find(v => v.id === line.vehicleId) || null
  }
  return vehicles.find(v => v.id === trip.vehicleId) || null
}

// ── Today's view ───────────────────────────────────────

function TodayCard({ item, vehicles, loading, onRun }) {
  if (item.kind === 'line') {
    const { line, substituteVehicleId } = item
    const vehicle     = substituteVehicleId
      ? vehicles.find(v => v.id === substituteVehicleId)
      : vehicles.find(v => v.id === line.vehicleId)
    const lineVehicle = vehicles.find(v => v.id === line.vehicleId)
    const isSubst     = !!substituteVehicleId

    return (
      <div className={`today-card ${isSubst ? 'substituted' : ''}`}>
        <div className="today-card-left">
          <div className="today-route">
            {line.origin || '—'} <span className="today-arrow">→</span> {line.destination || '—'}
            {line.roundTrip && <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--accent)' }}>⇄</span>}
          </div>
          <div className="today-meta">
            {line.departureTime && <span className="today-time">⬆ {line.departureTime.slice(0, 5)}</span>}
            {line.roundTrip && line.returnTime && (
              <span className="today-time" style={{ color: 'var(--text-dim)' }}>⬇ {line.returnTime.slice(0, 5)}</span>
            )}
            <span className="today-line-name">· {line.name}</span>
            {vehicle && <span className="today-vehicle">· {vehicle.name}</span>}
          </div>
          {isSubst && lineVehicle && (
            <div className="today-subst-info">Substituindo: {lineVehicle.name}</div>
          )}
        </div>
        <div className="today-card-right">
          {isSubst && <span className="subst-badge">🔄 Substituição</span>}
          <button className="iniciar-btn" onClick={() => onRun(item)} disabled={loading}>
            {loading ? '…' : 'Iniciar Corrida'}
          </button>
        </div>
      </div>
    )
  }

  // kind === 'trip'
  const { trip } = item
  const vehicle   = vehicles.find(v => v.id === (trip.substituteVehicleId || trip.vehicleId))
  const isSubst   = !!trip.substituteVehicleId

  return (
    <div className={`today-card ${isSubst ? 'substituted' : ''}`}>
      <div className="today-card-left">
        <div className="today-route">
          {trip.origin} <span className="today-arrow">→</span> {trip.destination}
        </div>
        <div className="today-meta">
          {trip.departureTime && <span className="today-time">⬆ {trip.departureTime.slice(0, 5)}</span>}
          {vehicle && <span className="today-vehicle">· {vehicle.name}</span>}
        </div>
      </div>
      <div className="today-card-right">
        {isSubst && <span className="subst-badge">🔄 Substituição</span>}
        <button className="iniciar-btn" onClick={() => onRun(item)} disabled={loading}>
          {loading ? '…' : 'Iniciar Corrida'}
        </button>
      </div>
    </div>
  )
}

// ── Management cards ───────────────────────────────────

function LineCard({ line, vehicles, linePassengers, passengers, onEdit, onSeating, onPassengers, onRoute, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const vehicle = vehicles.find(v => v.id === line.vehicleId)
  const fixedCount = linePassengers.filter(lp => lp.lineId === line.id).length
  const rec = recurrenceSummary(line.recurrence)

  return (
    <div className="vehicle-card">
      <span className="vehicle-card-icon">🔁</span>
      <div className="vehicle-card-info">
        <div className="vehicle-card-name">{line.name}</div>
        <div className="vehicle-card-details">
          {line.origin && line.destination && <span>{line.origin} → {line.destination} · </span>}
          {vehicle ? vehicle.name : <span style={{ opacity: 0.5 }}>Sem veículo</span>}
        </div>
        <div className="vehicle-card-details" style={{ marginTop: 3, gap: 8, flexWrap: 'wrap' }}>
          {line.departureTime && (
            <span className="time-badge">⬆ {line.departureTime.slice(0, 5)}</span>
          )}
          {line.roundTrip && line.returnTime && (
            <span className="time-badge return">⬇ {line.returnTime.slice(0, 5)}</span>
          )}
          {line.roundTrip && !line.returnTime && (
            <span className="time-badge return" style={{ opacity: 0.6 }}>⬇ ida e volta</span>
          )}
          <span className="vehicle-badge trip-badge">{rec}</span>
          {fixedCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fixedCount} fixo(s)</span>}
          {(line.stops || []).length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{line.stops.length} parada(s)</span>
          )}
        </div>
      </div>
      <div className="vehicle-card-actions">
        {confirming ? (
          <>
            <span className="confirm-label">Excluir?</span>
            <button className="card-action-btn danger" onClick={() => onDelete(line)}>Sim</button>
            <button className="card-action-btn" onClick={() => setConfirming(false)}>Não</button>
          </>
        ) : (
          <div className="line-card-btn-layout">
            <div className="line-card-btn-grid">
              <button className="card-action-btn grid-btn" onClick={() => onSeating(line)}>Poltronas</button>
              <button className="card-action-btn grid-btn" onClick={() => onPassengers(line)}>Passageiros</button>
              <button className="card-action-btn grid-btn" onClick={() => onRoute(line)}>Trajeto</button>
              <button className="card-action-btn grid-btn" onClick={() => onEdit(line)}>Editar</button>
            </div>
            <button className="card-action-btn danger delete-btn" onClick={() => setConfirming(true)} title="Excluir">×</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TripCard({ trip, lines, vehicles, loading, onView, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const line    = lines.find(l => l.id === trip.lineId)
  const vehicle = effectiveVehicle(trip, lines, vehicles)
  const rec     = recurrenceSummary(trip.recurrence)
  const isSubst = !!(trip.substituteVehicleId)
  const isNone  = !trip.recurrence || trip.recurrence.type === 'none'

  return (
    <div className="vehicle-card">
      <span className="vehicle-card-icon">{vehicle?.vehicleType === 'bus' ? '🚌' : '🚐'}</span>
      <div className="vehicle-card-info">
        <div className="vehicle-card-name">{trip.origin} → {trip.destination}</div>
        <div className="vehicle-card-details">
          {line && <span className="vehicle-badge" style={{ marginRight: 6 }}>{line.name}</span>}
          {vehicle?.name}{isSubst && ' 🔄'}
          {trip.departureDate && <span> · {formatDate(trip.departureDate)}</span>}
          {trip.departureTime && <span> · {trip.departureTime.slice(0, 5)}</span>}
        </div>
      </div>
      {!isNone && <span className="vehicle-badge trip-badge">{rec}</span>}
      <div className="vehicle-card-actions">
        {confirming ? (
          <>
            <span className="confirm-label">Excluir?</span>
            <button className="card-action-btn danger" onClick={() => onDelete(trip)}>Sim</button>
            <button className="card-action-btn" onClick={() => setConfirming(false)}>Não</button>
          </>
        ) : (
          <>
            <button className="card-action-btn" onClick={() => onView(trip)} disabled={loading}>
              {loading ? '…' : 'Ver'}
            </button>
            <button className="card-action-btn" onClick={() => onEdit(trip)}>Editar</button>
            <button className="card-action-btn danger" onClick={() => setConfirming(true)} title="Excluir">×</button>
          </>
        )}
      </div>
    </div>
  )
}

function VehicleCard({ vehicle, loading, onEdit, onManage, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="vehicle-card">
      <span className="vehicle-card-icon">{vehicle.vehicleType === 'bus' ? '🚌' : '🚐'}</span>
      <div className="vehicle-card-info">
        <div className="vehicle-card-name">{vehicle.name}</div>
        <div className="vehicle-card-details">
          {vehicle.plate && <span>{vehicle.plate} · </span>}
          <span>{SUBTYPE_LABEL[vehicle.busType] || ''}</span>
          {vehicle.floors?.length > 1 && <span> · 2 andares</span>}
        </div>
      </div>
      <div className="vehicle-card-right">
        <span className="vehicle-badge">{SEAT_TYPE_LABEL[vehicle.seatTypes?.[0]] || ''}</span>
        <span className="vehicle-seats">{vehicle.totalSeats} lugares</span>
      </div>
      <div className="vehicle-card-actions">
        {confirming ? (
          <>
            <span className="confirm-label">Excluir?</span>
            <button className="card-action-btn danger" onClick={() => onDelete(vehicle)}>Sim</button>
            <button className="card-action-btn" onClick={() => setConfirming(false)}>Não</button>
          </>
        ) : (
          <>
            <button className="card-action-btn" onClick={() => onManage(vehicle)} disabled={loading}>{loading ? '…' : 'Lugares'}</button>
            <button className="card-action-btn" onClick={() => onEdit(vehicle)} disabled={loading}>{loading ? '…' : 'Editar'}</button>
            <button className="card-action-btn danger" onClick={() => setConfirming(true)} title="Excluir">×</button>
          </>
        )}
      </div>
    </div>
  )
}

function PassengerCard({ passenger, lines, linePassengers, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  const assignment = (linePassengers || []).find(lp => lp.passengerId === passenger.id)
  const assignedLine = assignment ? (lines || []).find(l => l.id === assignment.lineId) : null

  return (
    <div className="vehicle-card">
      <Avatar name={passenger.name} photoUrl={passenger.photoUrl} size={40} />
      <div className="vehicle-card-info">
        <div className="vehicle-card-name">{passenger.name}</div>
        <div className="vehicle-card-details">
          {[passenger.email, passenger.phone].filter(Boolean).join(' · ') || <span style={{ opacity: 0.5 }}>Sem contato</span>}
        </div>
        {passenger.type === 'fixo' && assignedLine && (
          <div className="vehicle-card-details" style={{ marginTop: 4, gap: 6 }}>
            <span className="pax-line-badge">🔁 {assignedLine.name}</span>
            {assignment.seatLabel && (
              <span className="pax-seat-badge">Pl. {assignment.seatLabel}</span>
            )}
          </div>
        )}
        {passenger.type === 'fixo' && !assignedLine && (
          <div className="vehicle-card-details" style={{ marginTop: 4, opacity: 0.5, fontSize: 12 }}>
            Sem linha atribuída
          </div>
        )}
      </div>
      <span className={`passenger-type-badge ${passenger.type}`}>
        {passenger.type === 'fixo' ? 'Fixo' : 'Avulso'}
      </span>
      <div className="vehicle-card-actions">
        {confirming ? (
          <>
            <span className="confirm-label">Excluir?</span>
            <button className="card-action-btn danger" onClick={() => onDelete(passenger)}>Sim</button>
            <button className="card-action-btn" onClick={() => setConfirming(false)}>Não</button>
          </>
        ) : (
          <>
            <button className="card-action-btn" onClick={() => onEdit(passenger)}>Editar</button>
            <button className="card-action-btn danger" onClick={() => setConfirming(true)} title="Excluir">×</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────

export default function Dashboard({ session, onLogout }) {
  const [view,        setView]        = useState('home')
  const [mainTab,     setMainTab]     = useState('principal')  // 'principal' | 'cadastro'
  const [cadastroTab, setCadastroTab] = useState('linhas')     // 'linhas' | 'viagens' | 'passageiros' | 'veiculos'
  const [paxFilter,   setPaxFilter]   = useState('todos')      // 'todos' | 'fixo' | 'avulso'
  const [paxLineId,   setPaxLineId]   = useState('')           // '' = todas as linhas

  const [vehicles,       setVehicles]       = useState([])
  const [lines,          setLines]          = useState([])
  const [linePassengers, setLinePassengers] = useState([])
  const [trips,          setTrips]          = useState([])
  const [tripPassengers, setTripPassengers] = useState([])
  const [passengers,     setPassengers]     = useState([])

  const [selectedVehicle,      setSelectedVehicle]      = useState(null)
  const [selectedLine,         setSelectedLine]          = useState(null)
  const [selectedTrip,         setSelectedTrip]          = useState(null)
  const [selectedPassenger,    setSelectedPassenger]     = useState(null)
  const [selectedLineForRoute, setSelectedLineForRoute]  = useState(null)
  const [routeMapLine,         setRouteMapLine]          = useState(null)

  // For seating views
  const [tripSeats, setTripSeats] = useState([])
  const [tripTPs,   setTripTPs]   = useState([])
  const [lineTPs,   setLineTPs]   = useState([]) // line's fixed passengers when viewing trip

  // For driver run view
  const [runLine,           setRunLine]           = useState(null)
  const [runVehicle,        setRunVehicle]        = useState(null)
  const [runSeats,          setRunSeats]          = useState([])
  const [runLinePassengers, setRunLinePassengers] = useState([])

  // Profile
  const [profile,      setProfile]      = useState(null)
  const [showProfile,  setShowProfile]  = useState(false)

  // Direction picker (ida/volta) for round-trip lines
  const [directionItem, setDirectionItem] = useState(null)

  const [loading,   setLoading]   = useState(true)
  const [loadingId, setLoadingId] = useState(null)
  const [error,     setError]     = useState(null)

  const userId = session.user.id

  useEffect(() => { loadAll(); loadProfile() }, [])

  async function loadProfile() {
    const { data } = await supabase.from('motora_profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data || { id: userId, display_name: null, photo_url: null, plan_active: false })
  }

  async function loadAll() {
    setLoading(true); setError(null)
    const [
      { data: vData, error: vErr },
      { data: lData },
      { data: lpData },
      { data: tData },
      { data: tpData },
      { data: pData },
    ] = await Promise.all([
      supabase.from('motora_vehicles').select('*').order('created_at'),
      supabase.from('motora_lines').select('*').order('name'),
      supabase.from('motora_line_passengers').select('*'),
      supabase.from('motora_trips').select('*').order('departure_date'),
      supabase.from('motora_trip_passengers').select('*'),
      supabase.from('motora_passengers').select('*').order('name'),
    ])
    if (vErr) setError('Erro ao carregar dados: ' + vErr.message)
    setVehicles((vData  || []).map(fromRow))
    setLines((lData     || []).map(lineFromRow))
    setLinePassengers((lpData || []).map(lpFromRow))
    setTrips((tData     || []).map(tripFromRow))
    setTripPassengers((tpData || []).map(tpFromRow))
    setPassengers((pData || []).map(passengerFromRow))
    setLoading(false)
  }

  // ── Today's items (lines + trips) ─────────────────

  const todayItems = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)

    // Lines that occur today — check for explicit trip override (substitute)
    const lineItems = lines
      .filter(lineOccursToday)
      .map(line => {
        const explicitTrip = trips.find(t =>
          t.lineId === line.id && occursToday(t)
        )
        return {
          kind: 'line',
          id: 'line-' + line.id,
          line,
          substituteVehicleId: explicitTrip?.substituteVehicleId || null,
          tripId: explicitTrip?.id || null,
        }
      })

    // Standalone trips not linked to any line that's already shown
    const lineIdsShown = new Set(lineItems.map(i => i.line.id))
    const tripItems = trips
      .filter(t => occursToday(t) && (!t.lineId || !lineIdsShown.has(t.lineId)))
      .map(t => ({ kind: 'trip', id: 'trip-' + t.id, trip: t }))

    // Sort by departure time
    const timeOf = item =>
      item.kind === 'line' ? (item.line.departureTime || '99:99')
                           : (item.trip.departureTime || '99:99')

    return [...lineItems, ...tripItems].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))
  }, [lines, trips])

  // ── Vehicle actions ────────────────────────────────

  async function openWithSeats(vehicle, targetView) {
    setLoadingId(vehicle.id)
    const { data: seats, error } = await supabase.from('motora_seats').select('*')
      .eq('vehicle_id', vehicle.id).order('floor_num').order('row_num').order('col_idx')
    setLoadingId(null)
    if (error) setError('Aviso: não foi possível carregar assentos — ' + error.message)
    const v = ensureFloorMeta(vehicle)
    setSelectedVehicle({ ...v, floors: reconstructFloors(v, seats || []) })
    setView(targetView)
  }

  async function handleVehicleSaved(vehicle) {
    setError(null)
    const row = toRow(vehicle, userId)
    const { error: vErr } = await supabase.from('motora_vehicles').upsert(row, { onConflict: 'id' })
    if (vErr) { setError('Erro ao salvar veículo: ' + vErr.message); return }
    await supabase.from('motora_seats').delete().eq('vehicle_id', vehicle.id)
    const seats = floorsToSeats(vehicle.id, userId, vehicle.floors || [])
    if (seats.length > 0) {
      const { error: sErr } = await supabase.from('motora_seats').insert(seats)
      if (sErr) { setError('Erro ao salvar assentos: ' + sErr.message); return }
    }
    const lw = { ...vehicle, floors: row.floors.map(f => ({ ...f, rows: [] })) }
    setVehicles(prev => { const idx = prev.findIndex(v => v.id === vehicle.id); if (idx >= 0) { const u = [...prev]; u[idx] = lw; return u } return [...prev, lw] })
    setView('home')
  }

  async function handleDeleteVehicle(vehicle) {
    const { error } = await supabase.from('motora_vehicles').delete().eq('id', vehicle.id)
    if (error) { setError('Erro ao excluir veículo: ' + error.message); return }
    setVehicles(prev => prev.filter(v => v.id !== vehicle.id))
  }

  // ── Line actions ───────────────────────────────────

  async function handleLineSaved(line) {
    setError(null)
    const { error } = await supabase.from('motora_lines').upsert(lineToRow(line, userId), { onConflict: 'id' })
    if (error) { setError('Erro ao salvar linha: ' + error.message); return }
    setLines(prev => { const idx = prev.findIndex(l => l.id === line.id); if (idx >= 0) { const u = [...prev]; u[idx] = line; return u } return [...prev, line].sort((a, b) => a.name.localeCompare(b.name)) })
    setView('home')
  }

  async function handleDeleteLine(line) {
    const { error } = await supabase.from('motora_lines').delete().eq('id', line.id)
    if (error) { setError('Erro ao excluir linha: ' + error.message); return }
    setLines(prev => prev.filter(l => l.id !== line.id))
  }

  function openPassengersForLine(line) {
    setMainTab('cadastro')
    setCadastroTab('passageiros')
    setPaxFilter('fixo')
    setPaxLineId(line.id)
  }

  function openRouteEditor(line) {
    setSelectedLineForRoute(line)
    setView('route-builder')
  }

  async function handleRouteSaved(stops) {
    setError(null)
    const { error } = await supabase.from('motora_lines').update({ stops }).eq('id', selectedLineForRoute.id)
    if (error) { setError('Erro ao salvar trajeto: ' + error.message); return }
    setLines(prev => prev.map(l => l.id === selectedLineForRoute.id ? { ...l, stops } : l))
    setView('home')
  }

  async function openLineSeating(line) {
    if (!line.vehicleId) { setError('Esta linha não tem veículo associado.'); return }
    setLoadingId('line-' + line.id)
    const vehicle = vehicles.find(v => v.id === line.vehicleId)
    const [{ data: seats, error: sErr }, { data: lps }] = await Promise.all([
      supabase.from('motora_seats').select('*').eq('vehicle_id', line.vehicleId).order('floor_num').order('row_num').order('col_idx'),
      supabase.from('motora_line_passengers').select('*').eq('line_id', line.id),
    ])
    setLoadingId(null)
    if (sErr) { setError('Erro ao carregar assentos: ' + sErr.message); return }
    setTripSeats(seats || [])
    // Resolve seat_label → seat_id for LPs saved via PassengerBuilder (which stores label only)
    const resolvedLps = (lps || []).map(lp => {
      if (!lp.seat_id && lp.seat_label) {
        const seat = (seats || []).find(s => s.label === lp.seat_label && s.seat_exists)
        if (seat) return { ...lp, seat_id: seat.id }
      }
      return lp
    })
    setTripTPs(resolvedLps.map(lpFromRow).map(lp => ({ ...lp, tripId: line.id })))
    setSelectedLine(line)
    setSelectedVehicle(vehicle || null)
    setView('line-seating')
  }

  async function handleLineSeatingsSaved(assignments) {
    setError(null)
    await supabase.from('motora_line_passengers').delete().eq('line_id', selectedLine.id)
    if (assignments.length > 0) {
      const rows = assignments.map(a => ({
        id: crypto.randomUUID(), user_id: userId,
        line_id: selectedLine.id, passenger_id: a.passengerId,
        seat_id: a.seatId, seat_label: a.seatLabel, floor_num: a.floorNum ?? 0,
      }))
      const { error } = await supabase.from('motora_line_passengers').insert(rows)
      if (error) { setError('Erro ao salvar poltronas: ' + error.message); return }
    }
    const { data } = await supabase.from('motora_line_passengers').select('*')
    setLinePassengers((data || []).map(lpFromRow))
    setView('home')
  }

  // ── Trip actions ───────────────────────────────────

  async function handleTripSaved(trip) {
    setError(null)
    const { error } = await supabase.from('motora_trips').upsert(tripToRow(trip, userId), { onConflict: 'id' })
    if (error) { setError('Erro ao salvar viagem: ' + error.message); return }
    setTrips(prev => { const idx = prev.findIndex(t => t.id === trip.id); if (idx >= 0) { const u = [...prev]; u[idx] = trip; return u } return [...prev, trip].sort((a, b) => (a.departureDate || '').localeCompare(b.departureDate || '')) })
    setView('home')
  }

  async function handleDeleteTrip(trip) {
    const { error } = await supabase.from('motora_trips').delete().eq('id', trip.id)
    if (error) { setError('Erro ao excluir viagem: ' + error.message); return }
    setTrips(prev => prev.filter(t => t.id !== trip.id))
  }

  async function openTripSeating(trip) {
    const vId = trip.substituteVehicleId
      || (trip.lineId ? lines.find(l => l.id === trip.lineId)?.vehicleId : null)
      || trip.vehicleId
    if (!vId) { setError('Esta viagem não tem veículo associado.'); return }
    setLoadingId('trip-' + trip.id)
    const vehicle = vehicles.find(v => v.id === vId)
    const [{ data: seats, error: sErr }, { data: tps }, { data: lps }] = await Promise.all([
      supabase.from('motora_seats').select('*').eq('vehicle_id', vId).order('floor_num').order('row_num').order('col_idx'),
      supabase.from('motora_trip_passengers').select('*').eq('trip_id', trip.id),
      trip.lineId ? supabase.from('motora_line_passengers').select('*').eq('line_id', trip.lineId) : Promise.resolve({ data: [] }),
    ])
    setLoadingId(null)
    if (sErr) { setError('Erro ao carregar assentos: ' + sErr.message); return }
    setTripSeats(seats || [])
    setTripTPs((tps || []).map(tpFromRow))
    setLineTPs((lps || []).map(lpFromRow))
    setSelectedTrip(trip)
    setSelectedVehicle(vehicle || null)
    setView('trip-seating')
  }

  async function handleTodayView(item) {
    if (item.kind === 'line') {
      if (item.tripId) {
        const trip = trips.find(t => t.id === item.tripId)
        if (trip) return openTripSeating(trip)
      }
      return openLineSeating(item.line)
    }
    return openTripSeating(item.trip)
  }

  // Called from TodayCard — shows direction picker for round-trip lines
  function handleIniciarCorrida(item) {
    const l = item.kind === 'line' ? item.line : lines.find(ln => ln.id === item.trip?.lineId)
    if (l?.roundTrip) {
      setDirectionItem(item)
    } else {
      openTripRun(item, 'ida')
    }
  }

  async function openTripRun(item, direction = 'ida') {
    let line, vehicleId

    if (item.kind === 'line') {
      line      = item.line
      vehicleId = item.substituteVehicleId || line.vehicleId
    } else {
      const trip = item.trip
      const linkedLine = trip.lineId ? lines.find(l => l.id === trip.lineId) : null
      line      = linkedLine || { name: trip.origin + ' → ' + trip.destination, origin: trip.origin, destination: trip.destination, departureTime: trip.departureTime, roundTrip: false, returnTime: null }
      vehicleId = trip.substituteVehicleId || linkedLine?.vehicleId || trip.vehicleId
    }

    // For volta: swap origin/destination, use returnTime, reverse stops
    if (direction === 'volta' && line.roundTrip) {
      line = {
        ...line,
        origin:        line.destination,
        destination:   line.origin,
        departureTime: line.returnTime || line.departureTime,
        stops:         [...(line.stops || [])].reverse(),
      }
    }

    if (!vehicleId) { setError('Esta corrida não tem veículo associado.'); return }

    const itemId = item.id
    setLoadingId(itemId)

    const runVehicleObj = vehicles.find(v => v.id === vehicleId) || null
    const lineId        = item.kind === 'line' ? item.line.id : item.trip.lineId

    const [{ data: seats, error: sErr }, { data: lps }] = await Promise.all([
      supabase.from('motora_seats').select('*').eq('vehicle_id', vehicleId).order('floor_num').order('row_num').order('col_idx'),
      lineId
        ? supabase.from('motora_line_passengers').select('*').eq('line_id', lineId)
        : item.kind === 'trip'
          ? supabase.from('motora_trip_passengers').select('*').eq('trip_id', item.trip.id)
          : Promise.resolve({ data: [] }),
    ])

    setLoadingId(null)
    if (sErr) { setError('Erro ao carregar assentos: ' + sErr.message); return }

    const mappedLps = (lps || []).map(r => ({
      id: r.id, passengerId: r.passenger_id || r.passenger_id,
      seatId: r.seat_id, seatLabel: r.seat_label, floorNum: r.floor_num,
    }))

    setRunLine(line)
    setRunVehicle(runVehicleObj)
    setRunSeats(seats || [])
    setRunLinePassengers(mappedLps)
    setView('trip-run')
  }

  async function handleSeatingSaved(assignments) {
    setError(null)
    await supabase.from('motora_trip_passengers').delete().eq('trip_id', selectedTrip.id)
    if (assignments.length > 0) {
      const rows = assignments.map(a => ({
        id: crypto.randomUUID(), user_id: userId,
        trip_id: a.tripId, passenger_id: a.passengerId,
        seat_id: a.seatId, seat_label: a.seatLabel, floor_num: a.floorNum ?? 0,
      }))
      const { error } = await supabase.from('motora_trip_passengers').insert(rows)
      if (error) { setError('Erro ao salvar atribuições: ' + error.message); return }
    }
    const { data } = await supabase.from('motora_trip_passengers').select('*')
    setTripPassengers((data || []).map(tpFromRow))
    setView('home')
  }

  // ── Passenger actions ──────────────────────────────

  async function handlePassengerSaved(passenger) {
    setError(null)
    const { error } = await supabase.from('motora_passengers').upsert(passengerToRow(passenger, userId), { onConflict: 'id' })
    if (error) { setError('Erro ao salvar passageiro: ' + error.message); return }

    const { prevFixedLineId, fixedLineId, fixedSeatLabel } = passenger
    if (prevFixedLineId && prevFixedLineId !== fixedLineId) {
      await supabase.from('motora_line_passengers').delete().eq('passenger_id', passenger.id).eq('line_id', prevFixedLineId)
    }
    if (fixedLineId) {
      // Resolve seat_id from seat_label so both storage paths stay in sync
      let resolvedSeatId = null
      if (fixedSeatLabel) {
        const fixedLine = lines.find(l => l.id === fixedLineId)
        if (fixedLine?.vehicleId) {
          const { data: seatRow } = await supabase
            .from('motora_seats')
            .select('id')
            .eq('vehicle_id', fixedLine.vehicleId)
            .eq('label', fixedSeatLabel)
            .eq('seat_exists', true)
            .maybeSingle()
          resolvedSeatId = seatRow?.id || null
        }
      }
      await supabase.from('motora_line_passengers').delete().eq('passenger_id', passenger.id).eq('line_id', fixedLineId)
      await supabase.from('motora_line_passengers').insert({
        id: crypto.randomUUID(), user_id: userId,
        line_id: fixedLineId, passenger_id: passenger.id,
        seat_id: resolvedSeatId, seat_label: fixedSeatLabel || null, floor_num: 0,
      })
    }

    const { data: lpData } = await supabase.from('motora_line_passengers').select('*')
    setLinePassengers((lpData || []).map(lpFromRow))

    const clean = { ...passenger }
    delete clean.fixedLineId; delete clean.fixedSeatLabel; delete clean.prevFixedLineId
    setPassengers(prev => { const idx = prev.findIndex(p => p.id === passenger.id); if (idx >= 0) { const u = [...prev]; u[idx] = clean; return u } return [...prev, clean].sort((a, b) => a.name.localeCompare(b.name)) })
    setView('home')
  }

  async function handleDeletePassenger(passenger) {
    const { error } = await supabase.from('motora_passengers').delete().eq('id', passenger.id)
    if (error) { setError('Erro ao excluir passageiro: ' + error.message); return }
    setPassengers(prev => prev.filter(p => p.id !== passenger.id))
    setLinePassengers(prev => prev.filter(lp => lp.passengerId !== passenger.id))
    setTripPassengers(prev => prev.filter(tp => tp.passengerId !== passenger.id))
  }

  async function handleRunSavePassenger(name) {
    const pax = {
      id: crypto.randomUUID(), name: name.trim(), type: 'avulso',
      email: null, phone: null, photoUrl: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    const { error } = await supabase.from('motora_passengers').insert(passengerToRow(pax, userId))
    if (error) { setError('Erro ao salvar passageiro: ' + error.message); return }
    setPassengers(prev => [...prev, pax].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleLogout() { await supabase.auth.signOut(); onLogout?.() }
  function handleProfileUpdate(updated) { setProfile(updated) }
  function handleBack() {
    setView('home')
    setSelectedVehicle(null); setSelectedLine(null); setSelectedTrip(null)
    setSelectedPassenger(null); setSelectedLineForRoute(null)
    setRunLine(null); setRunVehicle(null); setRunSeats([]); setRunLinePassengers([])
  }

  // ── Today label ────────────────────────────────────

  const todayLabel = useMemo(() => {
    const d = new Date()
    return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()]} ${d.getFullYear()}`
  }, [])

  // ── Filtered passengers ────────────────────────────

  const filteredPassengers = useMemo(() => {
    let list = passengers
    if (paxFilter === 'avulso') return list.filter(p => p.type === 'avulso')
    if (paxFilter === 'fixo') {
      list = list.filter(p => p.type === 'fixo')
      if (paxLineId) {
        const ids = new Set(linePassengers.filter(lp => lp.lineId === paxLineId).map(lp => lp.passengerId))
        return list.filter(p => ids.has(p.id))
      }
      return list
    }
    return list
  }, [passengers, linePassengers, paxFilter, paxLineId])

  // ── Render ─────────────────────────────────────────

  return (
    <div className="dashboard-layout">
      <nav className="navbar">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">Motora</span>
        </div>
        <div className="nav-right">
          <button className="profile-avatar-btn" onClick={() => setShowProfile(true)} title="Perfil">
            <Avatar
              name={profile?.display_name || session.user.email}
              photoUrl={profile?.photo_url}
              size={34}
            />
          </button>
        </div>
      </nav>

      {/* ── Profile panel ── */}
      {showProfile && (
        <ProfilePanel
          session={session}
          profile={profile}
          onUpdate={handleProfileUpdate}
          onLogout={handleLogout}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* ── Direction picker (ida/volta) ── */}
      {directionItem && (() => {
        const dirLine = directionItem.kind === 'line'
          ? directionItem.line
          : lines.find(l => l.id === directionItem.trip?.lineId)
        return (
          <div className="direction-overlay" onClick={() => setDirectionItem(null)}>
            <div className="direction-modal" onClick={e => e.stopPropagation()}>
              <div className="direction-modal-title">Qual o sentido da corrida?</div>
              <div className="direction-modal-subtitle">{dirLine?.name}</div>
              <div className="direction-btns">
                <button className="direction-btn" onClick={() => { setDirectionItem(null); openTripRun(directionItem, 'ida') }}>
                  <span className="direction-arrow">↑</span>
                  <span className="direction-label">Ida</span>
                  <span className="direction-route">{dirLine?.origin} → {dirLine?.destination}</span>
                  {dirLine?.departureTime && <span className="direction-time">{dirLine.departureTime.slice(0, 5)}</span>}
                </button>
                <button className="direction-btn" onClick={() => { setDirectionItem(null); openTripRun(directionItem, 'volta') }}>
                  <span className="direction-arrow">↓</span>
                  <span className="direction-label">Volta</span>
                  <span className="direction-route">{dirLine?.destination} → {dirLine?.origin}</span>
                  {dirLine?.returnTime && <span className="direction-time">{dirLine.returnTime.slice(0, 5)}</span>}
                </button>
              </div>
              <button className="direction-cancel" onClick={() => setDirectionItem(null)}>Cancelar</button>
            </div>
          </div>
        )
      })()}

      {/* ── Full-screen views ── */}
      {view === 'vehicle-builder' && <VehicleBuilder onBack={handleBack} onSave={handleVehicleSaved} />}
      {view === 'vehicle-editor'  && <VehicleEditor vehicle={selectedVehicle} onBack={handleBack} onSave={handleVehicleSaved} />}
      {view === 'seat-manager'    && <SeatManager vehicle={selectedVehicle} onBack={handleBack} onSave={handleVehicleSaved} />}
      {view === 'line-builder'    && <LineBuilder vehicles={vehicles} initialLine={selectedLine} onBack={handleBack} onSave={handleLineSaved} />}
      {view === 'trip-builder'    && <TripBuilder vehicles={vehicles} lines={lines} initialTrip={selectedTrip} onBack={handleBack} onSave={handleTripSaved} />}
      {view === 'passenger-builder' && (
        <PassengerBuilder
          passenger={selectedPassenger}
          lines={lines}
          vehicles={vehicles}
          assignments={selectedPassenger ? linePassengers.filter(lp => lp.passengerId === selectedPassenger.id) : []}
          onBack={handleBack}
          onSave={handlePassengerSaved}
        />
      )}
      {view === 'line-seating' && selectedLine && selectedVehicle && (
        <TripSeatingView
          trip={{ id: selectedLine.id, origin: selectedLine.origin, destination: selectedLine.destination }}
          vehicle={selectedVehicle}
          seats={tripSeats}
          passengers={passengers}
          initialAssignments={tripTPs}
          lineAssignments={[]}
          onBack={handleBack}
          onSave={handleLineSeatingsSaved}
          title={`Poltronas fixas — ${selectedLine.name}`}
        />
      )}
      {view === 'trip-seating' && selectedTrip && selectedVehicle && (
        <TripSeatingView
          trip={selectedTrip}
          vehicle={selectedVehicle}
          seats={tripSeats}
          passengers={passengers}
          initialAssignments={tripTPs}
          lineAssignments={lineTPs}
          onBack={handleBack}
          onSave={handleSeatingSaved}
        />
      )}
      {view === 'route-builder' && selectedLineForRoute && (
        <RouteBuilder
          line={selectedLineForRoute}
          onBack={handleBack}
          onSave={handleRouteSaved}
        />
      )}
      {view === 'trip-run' && runLine && (
        <TripRunView
          line={runLine}
          vehicle={runVehicle}
          seats={runSeats}
          linePassengers={runLinePassengers}
          passengers={passengers}
          onSavePassenger={handleRunSavePassenger}
          onBack={handleBack}
        />
      )}

      {/* ── Route map modal ── */}
      {routeMapLine && (
        <RouteMapModal line={routeMapLine} onClose={() => setRouteMapLine(null)} />
      )}

      {/* ── Home ── */}
      {view === 'home' && (
        <main className="dashboard-main">
          {error && <div className="message error" style={{ marginBottom: 16 }}>{error}</div>}

          {/* ── Tab bar ── */}
          <div className="dash-tab-bar">
            <button
              className={`dash-tab ${mainTab === 'principal' ? 'active' : ''}`}
              onClick={() => setMainTab('principal')}
            >
              Principal
            </button>
            <button
              className={`dash-tab ${mainTab === 'cadastro' ? 'active' : ''}`}
              onClick={() => setMainTab('cadastro')}
            >
              Cadastro
            </button>
          </div>

          {/* ── Aba Principal ── */}
          {mainTab === 'principal' && (
            <>
              {/* Onboarding — aparece quando não há dados ainda */}
              {!loading && (
                <OnboardingWizard
                  vehicles={vehicles}
                  lines={lines}
                  trips={trips}
                  userId={userId}
                  onOpenVehicle={() => setView('vehicle-builder')}
                  onOpenLine={() => { setSelectedLine(null); setView('line-builder') }}
                  onOpenTrip={() => { setSelectedTrip(null); setView('trip-builder') }}
                />
              )}

              {/* Lista de corridas de hoje — aparece quando há dados */}
              {(loading || vehicles.length > 0 || lines.length > 0 || trips.length > 0) && (
                <section className="dash-section today-section" style={{ marginTop: 0, borderTop: 'none' }}>
                  <div className="today-header">
                    <h2 className="today-title">Hoje</h2>
                    <span className="today-date">{todayLabel}</span>
                  </div>
                  {loading ? (
                    <div className="today-empty">Carregando…</div>
                  ) : todayItems.length === 0 ? (
                    <div className="today-empty" style={{ flexDirection: 'column', gap: 8, padding: '40px 16px' }}>
                      <span style={{ fontSize: 36 }}>🛣️</span>
                      <span>Nenhuma corrida programada para hoje.</span>
                    </div>
                  ) : (
                    <div className="today-list">
                      {todayItems.map(item => (
                        <TodayCard
                          key={item.id}
                          item={item}
                          vehicles={vehicles}
                          loading={loadingId === item.id}
                          onRun={handleIniciarCorrida}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {/* ── Aba Cadastro ── */}
          {mainTab === 'cadastro' && (
            <>
              {/* Sub-abas */}
              <div className="cadastro-tab-bar">
                {[
                  { id: 'linhas',      label: 'Linhas' },
                  { id: 'viagens',     label: 'Viagens' },
                  { id: 'passageiros', label: 'Passageiros' },
                  { id: 'trajetos',    label: 'Trajetos' },
                  { id: 'veiculos',    label: 'Veículos' },
                ].map(t => (
                  <button key={t.id}
                    className={`cadastro-tab ${cadastroTab === t.id ? 'active' : ''}`}
                    onClick={() => setCadastroTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Linhas ── */}
              {cadastroTab === 'linhas' && (
                <section className="dash-section cadastro-section">
                  <div className="cadastro-section-top">
                    <button className="add-btn" onClick={() => { setSelectedLine(null); setView('line-builder') }}
                      disabled={vehicles.length === 0}
                      title={vehicles.length === 0 ? 'Cadastre um veículo primeiro' : ''}>
                      + Nova Linha
                    </button>
                  </div>
                  {loading ? null : lines.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🔁</div>
                      <div className="empty-label">Nenhuma linha cadastrada</div>
                      <div className="empty-hint">Uma linha define um fretado fixo com veículo e passageiros padrão</div>
                    </div>
                  ) : (
                    <div className="vehicle-list">
                      {lines.map(l => (
                        <LineCard key={l.id} line={l} vehicles={vehicles}
                          linePassengers={linePassengers} passengers={passengers}
                          onEdit={line => { setSelectedLine(line); setView('line-builder') }}
                          onSeating={openLineSeating}
                          onPassengers={openPassengersForLine}
                          onRoute={openRouteEditor}
                          onDelete={handleDeleteLine}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Viagens ── */}
              {cadastroTab === 'viagens' && (
                <section className="dash-section cadastro-section">
                  <div className="cadastro-section-top">
                    <button className="add-btn" onClick={() => { setSelectedTrip(null); setView('trip-builder') }}
                      disabled={vehicles.length === 0}
                      title={vehicles.length === 0 ? 'Cadastre um veículo primeiro' : ''}>
                      + Nova Viagem
                    </button>
                  </div>
                  {loading ? null : trips.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🗺️</div>
                      <div className="empty-label">Nenhuma viagem agendada</div>
                    </div>
                  ) : (
                    <div className="vehicle-list">
                      {trips.map(t => (
                        <TripCard key={t.id} trip={t} lines={lines} vehicles={vehicles}
                          loading={loadingId === 'trip-' + t.id}
                          onView={openTripSeating}
                          onEdit={trip => { setSelectedTrip(trip); setView('trip-builder') }}
                          onDelete={handleDeleteTrip}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Passageiros ── */}
              {cadastroTab === 'passageiros' && (
                <section className="dash-section cadastro-section">
                  <div className="cadastro-section-top">
                    <button className="add-btn" onClick={() => { setSelectedPassenger(null); setView('passenger-builder') }}>
                      + Novo Passageiro
                    </button>
                  </div>

                  {/* Filtro */}
                  <div className="pax-filter-bar">
                    {['todos', 'fixo', 'avulso'].map(f => (
                      <button key={f}
                        className={`pax-filter-chip ${paxFilter === f ? 'active' : ''}`}
                        onClick={() => { setPaxFilter(f); setPaxLineId('') }}>
                        {f === 'todos' ? 'Todos' : f === 'fixo' ? 'Fixos' : 'Avulsos'}
                      </button>
                    ))}
                    {paxFilter === 'fixo' && lines.length > 0 && (
                      <select className="pax-line-select"
                        value={paxLineId}
                        onChange={e => setPaxLineId(e.target.value)}>
                        <option value="">Todas as linhas</option>
                        {lines.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {loading ? null : filteredPassengers.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">👤</div>
                      <div className="empty-label">
                        {passengers.length === 0 ? 'Nenhum passageiro cadastrado' : 'Nenhum passageiro neste filtro'}
                      </div>
                    </div>
                  ) : (
                    <div className="vehicle-list">
                      {filteredPassengers.map(p => (
                        <PassengerCard key={p.id} passenger={p}
                          lines={lines} linePassengers={linePassengers}
                          onEdit={() => { setSelectedPassenger(p); setView('passenger-builder') }}
                          onDelete={handleDeletePassenger} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Trajetos ── */}
              {cadastroTab === 'trajetos' && (
                <section className="dash-section cadastro-section">
                  {loading ? null : lines.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🗺️</div>
                      <div className="empty-label">Nenhuma linha cadastrada</div>
                      <div className="empty-hint">Cadastre uma linha para definir seu trajeto</div>
                    </div>
                  ) : (
                    <div className="vehicle-list">
                      {lines.map(l => {
                        const stops = l.stops || []
                        const allPoints = [l.origin, ...stops.map(s => s.name), l.destination].filter(Boolean)
                        const hasRoute = allPoints.length >= 2
                        return (
                          <div key={l.id}
                            className={`vehicle-card${hasRoute ? ' route-card' : ''}`}
                            onClick={hasRoute ? () => setRouteMapLine(l) : undefined}
                            title={hasRoute ? 'Ver trajeto no mapa' : undefined}
                          >
                            <span className="vehicle-card-icon">🗺️</span>
                            <div className="vehicle-card-info">
                              <div className="vehicle-card-name">{l.name}</div>
                              <div className="route-preview-line">
                                {hasRoute
                                  ? allPoints.map((p, i) => (
                                      <span key={i} className="route-preview-part">
                                        <span className="route-preview-dot" />
                                        <span className="route-preview-name">{p}</span>
                                        {i < allPoints.length - 1 && <span className="route-preview-arrow">→</span>}
                                      </span>
                                    ))
                                  : <span style={{ fontSize: 12, color: 'var(--text-dim)', opacity: 0.7 }}>Trajeto não configurado</span>
                                }
                              </div>
                              {stops.length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                                  {stops.length} parada{stops.length !== 1 ? 's' : ''} intermediária{stops.length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                            <div className="vehicle-card-actions" onClick={e => e.stopPropagation()}>
                              {hasRoute && (
                                <button className="card-action-btn" onClick={() => setRouteMapLine(l)}>Mapa</button>
                              )}
                              <button className="card-action-btn" onClick={() => openRouteEditor(l)}>
                                {stops.length > 0 ? 'Editar' : 'Configurar'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* ── Veículos ── */}
              {cadastroTab === 'veiculos' && (
                <section className="dash-section cadastro-section">
                  <div className="cadastro-section-top">
                    <button className="add-btn" onClick={() => setView('vehicle-builder')}>+ Novo Veículo</button>
                  </div>
                  {loading ? null : vehicles.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">🚌</div>
                      <div className="empty-label">Nenhum veículo cadastrado</div>
                    </div>
                  ) : (
                    <div className="vehicle-list">
                      {vehicles.map(v => (
                        <VehicleCard key={v.id} vehicle={v} loading={loadingId === v.id}
                          onEdit={v => openWithSeats(v, 'vehicle-editor')}
                          onManage={v => openWithSeats(v, 'seat-manager')}
                          onDelete={handleDeleteVehicle} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      )}
    </div>
  )
}
