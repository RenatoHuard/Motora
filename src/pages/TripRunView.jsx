import { useState, useMemo } from 'react'
import Avatar from '../components/Avatar'
import TripMapView from '../components/TripMapView'

// ── Helpers ────────────────────────────────────────────

function floorsFromSeats(vehicle, seats) {
  return (vehicle.floors || []).map((meta, fi) => {
    const fs  = (seats || []).filter(s => s.floor_num === fi)
    const max = fs.reduce((m, s) => Math.max(m, s.row_num), 0)
    const rows = Array.from({ length: max }, (_, ri) => {
      const rn   = ri + 1
      const pick = side => fs
        .filter(s => s.row_num === rn && s.side === side)
        .sort((a, b) => a.col_idx - b.col_idx)
        .map(s => ({ id: s.id, label: s.label, exists: s.seat_exists }))
      return { rowId: `${fi}-${ri}`, leftSeats: pick('left'), rightSeats: pick('right') }
    })
    return { ...meta, rows }
  })
}

function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
}

// ── Seat cell ──────────────────────────────────────────
// state: 'empty' | 'absent' | 'present' | 'avulso'

function RunSeatCell({ seat, state, owner, avulso, isSelected, onClick }) {
  if (!seat.exists) return <div className="seat-empty-slot" />
  const label = owner ? initials(owner.name) : avulso ? initials(avulso.name) : seat.label
  return (
    <button
      className={`seat-cell-run ${state} ${isSelected ? 'run-selected' : ''}`}
      onClick={onClick}
      title={owner?.name || avulso?.name || `Poltrona ${seat.label} — livre`}
    >
      {label}
    </button>
  )
}

// ── Main ───────────────────────────────────────────────

const STATE_LABEL = { empty: 'Livre', absent: 'Ausente', present: 'Presente', avulso: 'Avulso' }

export default function TripRunView({ line, vehicle, seats, linePassengers, passengers, onSavePassenger, onBack }) {
  // presence: Set of passengerId
  const [presence, setPresence]       = useState(() => new Set())
  // avulso: seatId → { name }
  const [avulso, setAvulso]           = useState({})
  const [selectedSeat, setSelectedSeat] = useState(null)
  // panel: 'none' | 'presentes' | 'ausentes'
  const [panel, setPanel]             = useState('none')
  const [addName, setAddName]         = useState('')
  const [activeFloor, setActiveFloor] = useState(0)
  // 'bus' | 'list'
  const [viewMode, setViewMode]       = useState('bus')

  const floors = useMemo(() => floorsFromSeats(vehicle, seats), [vehicle, seats])
  const fl     = floors[activeFloor]

  // seatId → passenger object
  // Falls back to label matching when seat_id was not stored (PassengerBuilder path)
  const seatOwner = useMemo(() => {
    const map = {}
    ;(linePassengers || []).forEach(lp => {
      const p = (passengers || []).find(p => p.id === lp.passengerId)
      if (!p) return
      if (lp.seatId) {
        map[lp.seatId] = p
      } else if (lp.seatLabel) {
        const seat = (seats || []).find(s => s.label === lp.seatLabel && s.seat_exists)
        if (seat) map[seat.id] = p
      }
    })
    return map
  }, [linePassengers, passengers, seats])

  // Passengers with neither seatId nor seatLabel — truly unassigned
  const unseatedPassengers = useMemo(() =>
    (linePassengers || [])
      .filter(lp => !lp.seatId && !lp.seatLabel)
      .map(lp => (passengers || []).find(p => p.id === lp.passengerId))
      .filter(Boolean)
  , [linePassengers, passengers])

  // Flat sorted list of all real seats for list view
  const allSeats = useMemo(() => {
    if (!floors.length) return []
    return floors.flatMap(fl =>
      fl.rows.flatMap(row => [...row.leftSeats, ...row.rightSeats])
    )
      .filter(s => s.exists)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
  }, [floors])

  function getSeatState(seat) {
    if (!seat.exists) return 'nonexistent'
    if (avulso[seat.id]) return 'avulso'
    const owner = seatOwner[seat.id]
    if (!owner) return 'empty'
    return presence.has(owner.id) ? 'present' : 'absent'
  }

  // Stats
  const presentCount = presence.size + Object.keys(avulso).length
  const absentFixedLps = (linePassengers || []).filter(lp => !presence.has(lp.passengerId))
  const absentCount  = absentFixedLps.length

  function markPresent(pid)  { setPresence(prev => new Set([...prev, pid])) }
  function markAbsent(pid)   { setPresence(prev => { const n = new Set(prev); n.delete(pid); return n }) }
  function removeAvulso(sid) { setAvulso(prev => { const n = { ...prev }; delete n[sid]; return n }) }
  function doAddAvulso(sid, name) {
    setAvulso(prev => ({ ...prev, [sid]: { name } }))
    setAddName(''); setSelectedSeat(null)
  }

  function handleSeatClick(seat) {
    setPanel('none')
    setSelectedSeat(prev => prev?.id === seat.id ? null : seat)
    setAddName('')
  }

  function togglePanel(p) { setPanel(prev => prev === p ? 'none' : p); setSelectedSeat(null) }

  // Selected seat details
  const selState  = selectedSeat ? getSeatState(selectedSeat) : null
  const selOwner  = selectedSeat ? seatOwner[selectedSeat.id] : null
  const selAvulso = selectedSeat ? avulso[selectedSeat.id]   : null

  return (
    <div className={`run-overlay${viewMode === 'map' ? ' run-overlay--map' : ''}`}>

      {/* ── Sticky top: header + stats ── */}
      <div className="run-sticky-top">
        <div className="run-header">
          <button className="wizard-back-btn" onClick={onBack}>←</button>
          <div className="run-title-block">
            <div className="run-title">{line.name}</div>
            <div className="run-subtitle">
              {[line.origin, line.destination].filter(Boolean).join(' → ')}
              {line.departureTime && <span> · {line.departureTime.slice(0, 5)}</span>}
              {line.roundTrip && line.returnTime && <span> · ⬇ {line.returnTime.slice(0, 5)}</span>}
              {vehicle && <span> · {vehicle.name}</span>}
            </div>
          </div>
          <div className="run-view-toggle">
            <button className={`run-view-btn ${viewMode === 'bus' ? 'active' : ''}`}
              onClick={() => setViewMode('bus')} title="Mapa do ônibus">🚌</button>
            <button className={`run-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')} title="Lista de poltronas">☰</button>
            <button className={`run-view-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')} title="Trajeto com GPS">🗺️</button>
          </div>
        </div>

        <div className="run-stats-bar">
          <button
            className={`run-stat present ${panel === 'presentes' ? 'active' : ''}`}
            onClick={() => togglePanel('presentes')}
          >
            <span className="run-stat-count">{presentCount}</span>
            <span className="run-stat-label">Presentes</span>
          </button>
          <button
            className={`run-stat absent ${panel === 'ausentes' ? 'active' : ''}`}
            onClick={() => togglePanel('ausentes')}
          >
            <span className="run-stat-count">{absentCount}</span>
            <span className="run-stat-label">Ausentes</span>
          </button>
        </div>
      </div>

      {/* ── Panels (scroll with content) ── */}
      {panel === 'presentes' && (
        <div className="run-panel">
          {presentCount === 0 && <div className="run-panel-empty">Nenhum passageiro presente ainda</div>}
          {[...presence].map(pid => {
            const p  = (passengers || []).find(p => p.id === pid)
            const lp = (linePassengers || []).find(lp => lp.passengerId === pid)
            if (!p) return null
            return (
              <div key={pid} className="run-panel-row">
                <Avatar name={p.name} photoUrl={p.photoUrl} size={30} />
                <span className="run-panel-name">{p.name}</span>
                {lp?.seatLabel && <span className="run-panel-seat">Pl. {lp.seatLabel}</span>}
                <button className="run-action-btn minus" onClick={() => markAbsent(pid)}>−</button>
              </div>
            )
          })}
          {Object.entries(avulso).map(([sid, av]) => {
            const s = (seats || []).find(s => s.id === sid)
            return (
              <div key={sid} className="run-panel-row">
                <Avatar name={av.name} size={30} />
                <span className="run-panel-name">{av.name} <span className="run-avulso-tag">avulso</span></span>
                {s?.label && <span className="run-panel-seat">Pl. {s.label}</span>}
                <button className="run-action-btn minus" onClick={() => removeAvulso(sid)}>−</button>
              </div>
            )
          })}
        </div>
      )}

      {panel === 'ausentes' && (
        <div className="run-panel">
          {absentCount === 0
            ? <div className="run-panel-empty">Todos os passageiros fixos embarcaram! ✓</div>
            : absentFixedLps.map(lp => {
                const p = (passengers || []).find(p => p.id === lp.passengerId)
                if (!p) return null
                return (
                  <div key={lp.passengerId} className="run-panel-row">
                    <Avatar name={p.name} photoUrl={p.photoUrl} size={30} />
                    <span className="run-panel-name">{p.name}</span>
                    {lp.seatLabel && <span className="run-panel-seat">Pl. {lp.seatLabel}</span>}
                    <button className="run-action-btn plus" onClick={() => markPresent(lp.passengerId)}>✓</button>
                  </div>
                )
              })
          }
        </div>
      )}

      {/* ── Body: full-page flow, overlay scrolls ── */}
      <div className={`run-body${viewMode === 'map' ? ' run-body--map' : ''}`}>

        {floors.length > 1 && viewMode === 'bus' && (
          <div className="floor-tabs" style={{ marginBottom: 12 }}>
            {floors.map((_, i) => (
              <button key={i} className={`floor-tab ${activeFloor === i ? 'active' : ''}`}
                onClick={() => setActiveFloor(i)}>
                {i === 0 ? '1º Andar' : '2º Andar'}
              </button>
            ))}
          </div>
        )}

        {/* ── Bus silhouette view ── */}
        {viewMode === 'bus' && (
          !fl || fl.rows.length === 0 ? (
            <div className="run-panel-empty">Poltronas não configuradas para este veículo.</div>
          ) : (
            <div className="bus-wrapper">
              <div className="seat-legend">
                <div className="seat-legend-item">
                  <div className="legend-dot" style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }} />
                  <span>Livre</span>
                </div>
                <div className="seat-legend-item">
                  <div className="legend-dot" style={{ background: 'rgba(255,193,7,0.2)', border: '1.5px dashed var(--accent)' }} />
                  <span>Ausente</span>
                </div>
                <div className="seat-legend-item">
                  <div className="legend-dot" style={{ background: 'rgba(109,191,139,0.25)', border: '1.5px solid var(--success)' }} />
                  <span>Presente</span>
                </div>
                <div className="seat-legend-item">
                  <div className="legend-dot" style={{ background: 'rgba(100,149,237,0.25)', border: '1.5px solid #6495ed' }} />
                  <span>Avulso</span>
                </div>
              </div>

              <div className="bus-shell">
                <div className="bus-front-bar">🚌 Frente do veículo</div>
                <div className="bus-shell-body">
                  {unseatedPassengers.length > 0 && (
                    <div className="run-unseated-banner" style={{ marginBottom: 10 }}>
                      {unseatedPassengers.length} passageiro(s) sem poltrona atribuída
                    </div>
                  )}
                  <div className="seat-grid-v2">
                    {fl.rows.map(row => (
                      <div key={row.rowId} className="seat-row-v2">
                        <div className="seat-side">
                          {row.leftSeats.map(seat => (
                            <RunSeatCell key={seat.id} seat={seat}
                              state={getSeatState(seat)}
                              owner={seatOwner[seat.id]}
                              avulso={avulso[seat.id]}
                              isSelected={selectedSeat?.id === seat.id}
                              onClick={() => seat.exists && handleSeatClick(seat)} />
                          ))}
                        </div>
                        <div className="seat-aisle" />
                        <div className="seat-side">
                          {row.rightSeats.map(seat => (
                            <RunSeatCell key={seat.id} seat={seat}
                              state={getSeatState(seat)}
                              owner={seatOwner[seat.id]}
                              avulso={avulso[seat.id]}
                              isSelected={selectedSeat?.id === seat.id}
                              onClick={() => seat.exists && handleSeatClick(seat)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── List view ── */}
        {viewMode === 'list' && (
          <div className="run-list-view">
            {allSeats.length === 0 ? (
              <div className="run-panel-empty">Poltronas não configuradas para este veículo.</div>
            ) : allSeats.map(seat => {
              const state  = getSeatState(seat)
              const owner  = seatOwner[seat.id]
              const av     = avulso[seat.id]
              const person = owner || (av ? { name: av.name, photoUrl: null } : null)
              return (
                <button
                  key={seat.id}
                  className={`run-list-item ${state} ${selectedSeat?.id === seat.id ? 'run-selected' : ''}`}
                  onClick={() => handleSeatClick(seat)}
                >
                  <span className="run-list-num">{seat.label}</span>
                  <div className="run-list-avatar">
                    {person
                      ? <Avatar name={person.name} photoUrl={person.photoUrl} size={36} />
                      : <div className="run-list-empty-avatar" />
                    }
                  </div>
                  <span className="run-list-name">
                    {person?.name || <span className="run-list-free">Livre</span>}
                    {state === 'avulso' && <span className="run-avulso-tag" style={{ marginLeft: 6 }}>avulso</span>}
                  </span>
                  <span className={`run-list-status ${state}`}>{STATE_LABEL[state] || ''}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── GPS map view ── */}
        {viewMode === 'map' && <TripMapView line={line} />}

      </div>

      {/* ── Seat detail — bottom sheet, outside body so it doesn't affect scroll ── */}
      {selectedSeat && viewMode !== 'map' && (
        <>
          <div className="seat-detail-backdrop" onClick={() => { setSelectedSeat(null); setAddName('') }} />
          <div className="seat-detail-panel">
            <div className="seat-detail-handle" />
            <div className="seat-detail-header">
              <span className="seat-detail-label">Poltrona {selectedSeat.label}</span>
              <button className="seat-assign-close" onClick={() => { setSelectedSeat(null); setAddName('') }}>×</button>
            </div>

            {selState === 'empty' && (
              <div className="seat-detail-body">
                <p className="seat-detail-info">Assento livre — sem passageiro fixo</p>

                {/* Quick-pick: existing avulso passengers not yet in a seat this run */}
                {(() => {
                  const usedIds = new Set([
                    ...Object.values(avulso).map(() => null), // avulso by seatId, not id
                    ...(linePassengers || []).map(lp => lp.passengerId),
                  ].filter(Boolean))
                  const alreadyInSeat = new Set(Object.values(avulso).map(av => av.name.toLowerCase()))
                  const suggestions = (passengers || []).filter(p =>
                    p.type === 'avulso' &&
                    !usedIds.has(p.id) &&
                    !alreadyInSeat.has(p.name.toLowerCase()) &&
                    (!addName.trim() || p.name.toLowerCase().includes(addName.toLowerCase()))
                  ).slice(0, 5)

                  return suggestions.length > 0 ? (
                    <div className="run-pax-suggestions">
                      {suggestions.map(p => (
                        <button key={p.id} className="run-pax-suggestion-item"
                          onClick={() => doAddAvulso(selectedSeat.id, p.name)}>
                          <Avatar name={p.name} photoUrl={p.photoUrl} size={26} />
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null
                })()}

                <div className="seat-detail-add">
                  <input
                    className="seat-assign-search"
                    type="text"
                    placeholder="Novo passageiro avulso…"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addName.trim() && doAddAvulso(selectedSeat.id, addName.trim())}
                    autoFocus
                  />
                </div>

                {addName.trim() && (
                  <div className="run-embark-actions">
                    <button className="run-embarcar-btn outline"
                      onClick={() => doAddAvulso(selectedSeat.id, addName.trim())}>
                      Embarcar
                    </button>
                    <button className="run-embarcar-btn"
                      onClick={() => {
                        doAddAvulso(selectedSeat.id, addName.trim())
                        onSavePassenger?.(addName.trim())
                      }}>
                      Embarcar + Salvar
                    </button>
                  </div>
                )}
              </div>
            )}

            {selState === 'absent' && selOwner && (
              <div className="seat-detail-body">
                <div className="seat-detail-passenger">
                  <Avatar name={selOwner.name} photoUrl={selOwner.photoUrl} size={42} />
                  <div>
                    <div className="seat-detail-name">{selOwner.name}</div>
                    <div className="seat-detail-sub absent">Não embarcou</div>
                  </div>
                </div>
                <button className="seat-detail-action-btn present"
                  onClick={() => { markPresent(selOwner.id); setSelectedSeat(null) }}>
                  ✓ Confirmar embarque
                </button>
              </div>
            )}

            {selState === 'present' && selOwner && (
              <div className="seat-detail-body">
                <div className="seat-detail-passenger">
                  <Avatar name={selOwner.name} photoUrl={selOwner.photoUrl} size={42} />
                  <div>
                    <div className="seat-detail-name">{selOwner.name}</div>
                    <div className="seat-detail-sub present">Embarcou ✓</div>
                  </div>
                </div>
                <button className="seat-detail-action-btn remove"
                  onClick={() => { markAbsent(selOwner.id); setSelectedSeat(null) }}>
                  − Remover embarque
                </button>
              </div>
            )}

            {selState === 'avulso' && selAvulso && (
              <div className="seat-detail-body">
                <div className="seat-detail-passenger">
                  <Avatar name={selAvulso.name} size={42} />
                  <div>
                    <div className="seat-detail-name">{selAvulso.name}</div>
                    <div className="seat-detail-sub" style={{ color: '#6495ed' }}>Passageiro avulso</div>
                  </div>
                </div>
                <button className="seat-detail-action-btn remove"
                  onClick={() => { removeAvulso(selectedSeat.id); setSelectedSeat(null) }}>
                  − Desembarcar
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
