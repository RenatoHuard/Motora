import { useState, useMemo } from 'react'
import Avatar from '../components/Avatar'

function floorsFromSeats(vehicle, seats) {
  return (vehicle.floors || []).map((meta, fi) => {
    const floorSeats = (seats || []).filter(s => s.floor_num === fi)
    const maxRow     = floorSeats.reduce((m, s) => Math.max(m, s.row_num), 0)
    const rows = Array.from({ length: maxRow }, (_, ri) => {
      const rowNum = ri + 1
      const pick = side => floorSeats
        .filter(s => s.row_num === rowNum && s.side === side)
        .sort((a, b) => a.col_idx - b.col_idx)
        .map(s => ({ id: s.id, label: s.label, exists: s.seat_exists }))
      return { rowId: `${fi}-${ri}`, leftSeats: pick('left'), rightSeats: pick('right') }
    })
    return { ...meta, rows }
  })
}

// ── Seat cell ──────────────────────────────────────────

function SeatViewCell({ seat, passenger, isSelected, isFixed, onClick }) {
  if (!seat.exists) return <div className="seat-empty-slot" />
  const initials = passenger
    ? passenger.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : null

  return (
    <button
      className={`seat-cell-view ${passenger ? 'assigned' : ''} ${isSelected ? 'view-selected' : ''} ${isFixed ? 'fixed-seat' : ''}`}
      onClick={onClick}
      title={passenger?.name || `Poltrona ${seat.label} — livre`}
    >
      {passenger ? (
        passenger.photoUrl
          ? <img src={passenger.photoUrl} className="seat-view-photo" alt=""
              onError={e => { e.currentTarget.style.display = 'none' }} />
          : <span className="seat-view-initials">{initials}</span>
      ) : (
        <span className="seat-view-label">{seat.label}</span>
      )}
    </button>
  )
}

// ── Main ───────────────────────────────────────────────

export default function TripSeatingView({
  trip, vehicle, seats, passengers, initialAssignments,
  lineAssignments = [], onBack, onSave, title,
}) {
  const lineMap = useMemo(() =>
    Object.fromEntries((lineAssignments || []).map(a => [a.seatId, a.passengerId]))
  , [lineAssignments])

  const [assignments, setAssignments] = useState(() =>
    Object.fromEntries(
      (initialAssignments || [])
        .filter(a => a.seatId)              // ignore label-only entries; resolved by Dashboard
        .map(a => [a.seatId, a.passengerId])
    )
  )
  const [selectedSeat, setSelectedSeat] = useState(null)
  const [search, setSearch]             = useState('')
  const [activeFloor, setActiveFloor]   = useState(0)

  const floors = useMemo(() => floorsFromSeats(vehicle, seats), [vehicle, seats])
  const fl     = floors[activeFloor]

  const merged = useMemo(() => ({ ...lineMap, ...assignments }), [lineMap, assignments])

  const takenByPassenger = useMemo(() =>
    Object.fromEntries(Object.entries(merged).map(([sid, pid]) => [pid, sid]))
  , [merged])

  const unassigned = passengers.filter(p => !takenByPassenger[p.id])
  const filtered   = search.trim()
    ? unassigned.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : unassigned

  const selectedPassenger = selectedSeat
    ? passengers.find(p => p.id === merged[selectedSeat.id])
    : null

  const isFixedSeat = (seatId) => !!(lineMap[seatId] && !assignments[seatId])

  function toggleSeat(seat) {
    if (selectedSeat?.id === seat.id) { setSelectedSeat(null); setSearch('') }
    else { setSelectedSeat(seat); setSearch('') }
  }

  function assign(passengerId) {
    if (!selectedSeat) return
    setAssignments(prev => ({ ...prev, [selectedSeat.id]: passengerId }))
    setSelectedSeat(null); setSearch('')
  }

  function unassign(seatId) {
    setAssignments(prev => { const n = { ...prev }; delete n[seatId]; return n })
    setSelectedSeat(null)
  }

  function save() {
    const allEntries = Object.entries(merged)
    onSave(allEntries.map(([seatId, passengerId]) => {
      const s = (seats || []).find(x => x.id === seatId)
      return { tripId: trip.id, passengerId, seatId, seatLabel: s?.label || '', floorNum: s?.floor_num ?? 0 }
    }))
  }

  const assignedCount = Object.keys(merged).length

  return (
    <div className="seating-overlay">

      {/* ── Sticky header ── */}
      <div className="seating-sticky-top">
        <div className="seating-header">
          <button className="wizard-back-btn" onClick={onBack}>←</button>
          <div className="seating-title-block">
            <div className="seating-title">{title || `${trip.origin} → ${trip.destination}`}</div>
            <div className="seating-subtitle">
              {vehicle?.name} · {assignedCount} passageiro(s)
              {Object.keys(lineMap).length > 0 && (
                <span> · {Object.keys(lineMap).length} fixo(s) da linha</span>
              )}
            </div>
          </div>
          {floors.length > 1 && (
            <div className="floor-tabs" style={{ marginBottom: 0 }}>
              {floors.map((_, i) => (
                <button key={i} className={`floor-tab ${activeFloor === i ? 'active' : ''}`}
                  onClick={() => setActiveFloor(i)}>
                  {i === 0 ? '1º Andar' : '2º Andar'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="seating-body">

        {!fl || fl.rows.length === 0 ? (
          <div className="run-panel-empty">Poltronas não configuradas para este veículo.</div>
        ) : (
          <div className="bus-wrapper">

            {/* Legend above bus */}
            <div className="seat-legend">
              <div className="seat-legend-item">
                <div className="legend-dot" style={{ background: 'var(--bg)', border: '1.5px solid var(--accent)' }} />
                <span>Livre</span>
              </div>
              <div className="seat-legend-item">
                <div className="legend-dot" style={{ background: 'rgba(242,184,75,0.22)', border: '1.5px solid var(--accent)' }} />
                <span>Atribuído</span>
              </div>
              {Object.keys(lineMap).length > 0 && (
                <div className="seat-legend-item">
                  <div className="legend-dot" style={{ background: 'rgba(109,191,139,0.25)', border: '1.5px solid var(--success)', outline: '2px dashed rgba(109,191,139,0.5)', outlineOffset: 1 }} />
                  <span>Fixo da linha</span>
                </div>
              )}
              <div className="seat-legend-item">
                <div className="legend-dot" style={{ background: 'rgba(109,191,139,0.2)', border: '1.5px solid var(--success)', boxShadow: '0 0 0 2px rgba(109,191,139,0.3)' }} />
                <span>Selecionado</span>
              </div>
            </div>

            {/* Bus silhouette */}
            <div className="bus-shell">
              <div className="bus-front-bar">🚌 Clique em uma poltrona para atribuir</div>
              <div className="bus-shell-body">
                <div className="seat-grid-v2">
                  {fl.rows.map(row => (
                    <div key={row.rowId} className="seat-row-v2">
                      <div className="seat-side">
                        {row.leftSeats.map(seat => (
                          <SeatViewCell key={seat.id} seat={seat}
                            passenger={passengers.find(p => p.id === merged[seat.id])}
                            isSelected={selectedSeat?.id === seat.id}
                            isFixed={isFixedSeat(seat.id)}
                            onClick={() => seat.exists && toggleSeat(seat)} />
                        ))}
                      </div>
                      <div className="seat-aisle" />
                      <div className="seat-side">
                        {row.rightSeats.map(seat => (
                          <SeatViewCell key={seat.id} seat={seat}
                            passenger={passengers.find(p => p.id === merged[seat.id])}
                            isSelected={selectedSeat?.id === seat.id}
                            isFixed={isFixedSeat(seat.id)}
                            onClick={() => seat.exists && toggleSeat(seat)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Assignment panel — below bus, outside the bus drawing */}
        {selectedSeat && (
          <div className="seating-assign-panel">
            <div className="seat-assign-header">
              <span className="seat-assign-title">
                Poltrona {selectedSeat.label}
                {isFixedSeat(selectedSeat.id) && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>(fixo da linha)</span>
                )}
              </span>
              <button className="seat-assign-close" onClick={() => { setSelectedSeat(null); setSearch('') }}>×</button>
            </div>

            {selectedPassenger ? (
              <div className="seat-assign-current">
                <Avatar name={selectedPassenger.name} photoUrl={selectedPassenger.photoUrl} size={40} />
                <div style={{ flex: 1 }}>
                  <div className="seat-assign-passenger-name">{selectedPassenger.name}</div>
                  {selectedPassenger.phone && <div className="seat-assign-passenger-sub">{selectedPassenger.phone}</div>}
                </div>
                <span className={`passenger-type-badge ${selectedPassenger.type}`}>
                  {selectedPassenger.type === 'fixo' ? 'Fixo' : 'Avulso'}
                </span>
                <button className="btn-sm secondary" onClick={() => unassign(selectedSeat.id)}>Remover</button>
              </div>
            ) : (
              <>
                <input className="seat-assign-search" type="text"
                  placeholder="Buscar passageiro…" value={search}
                  onChange={e => setSearch(e.target.value)} autoFocus />
                <div className="seat-assign-list">
                  {filtered.length === 0 ? (
                    <div className="seat-assign-empty">
                      {unassigned.length === 0 ? 'Todos os passageiros já têm poltrona' : 'Nenhum resultado'}
                    </div>
                  ) : filtered.map(p => (
                    <button key={p.id} className="seat-assign-item" onClick={() => assign(p.id)}>
                      <Avatar name={p.name} photoUrl={p.photoUrl} size={30} />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div className="seat-assign-item-name">{p.name}</div>
                        {p.phone && <div className="seat-assign-item-sub">{p.phone}</div>}
                      </div>
                      <span className={`passenger-type-badge ${p.type}`}>
                        {p.type === 'fixo' ? 'Fixo' : 'Avulso'}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Fixed footer with save button ── */}
      <div className="seating-footer">
        <button className="submit-btn" onClick={save}>Salvar Distribuição</button>
      </div>

    </div>
  )
}
