import { useState } from 'react'

export default function SeatManager({ vehicle, onBack, onSave }) {
  const [floors, setFloors] = useState(vehicle.floors)
  const [activeFloor, setActiveFloor] = useState(0)

  function toggleSeat(floorIdx, rowIdx, side, seatIdx) {
    setFloors(prev =>
      prev.map((fl, fi) => {
        if (fi !== floorIdx) return fl
        return {
          ...fl,
          rows: fl.rows.map((row, ri) => {
            if (ri !== rowIdx) return row
            const key = side === 'left' ? 'leftSeats' : 'rightSeats'
            return {
              ...row,
              [key]: row[key].map((s, si) =>
                si === seatIdx ? { ...s, active: !s.active } : s
              ),
            }
          }),
        }
      })
    )
  }

  const fl = floors[activeFloor]

  if (!fl || !fl.rows?.length) {
    return (
      <div className="wizard-overlay">
        <div className="wizard-container">
          <div className="wizard-header">
            <button className="wizard-back-btn" onClick={onBack}>←</button>
            <div className="wizard-step-label">{vehicle.name}</div>
          </div>
          <div className="wizard-body">
            <div className="empty-state">
              <div className="empty-icon">💺</div>
              <div className="empty-label">Nenhuma poltrona configurada</div>
              <div className="empty-hint">
                Use "Editar" para configurar as fileiras e poltronas deste veículo.
              </div>
            </div>
          </div>
          <div className="wizard-footer">
            <button className="submit-btn secondary" onClick={onBack}>Voltar</button>
          </div>
        </div>
      </div>
    )
  }

  const stats = fl.rows.reduce(
    (acc, row) => {
      const all = [...row.leftSeats, ...row.rightSeats].filter(s => s.exists)
      acc.total += all.length
      acc.active += all.filter(s => s.active).length
      return acc
    },
    { total: 0, active: 0 }
  )

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <button className="wizard-back-btn" onClick={onBack}>←</button>
          <div style={{ flex: 1 }}>
            <div className="wizard-step-label">{vehicle.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Gestão de Lugares</div>
          </div>
          <div className="seat-stats">
            <span className="stat-available">{stats.active} livres</span>
            <span className="stat-sep">·</span>
            <span className="stat-occupied">{stats.total - stats.active} ocupados</span>
            <span className="stat-sep">·</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{stats.total} total</span>
          </div>
        </div>

        <div className="wizard-body">
          <p className="wizard-subtitle" style={{ marginBottom: 14 }}>
            Clique em uma poltrona para alternar entre livre e ocupada.
          </p>

          {floors.length > 1 && (
            <div className="floor-tabs">
              {floors.map((_, i) => (
                <button
                  key={i}
                  className={`floor-tab ${activeFloor === i ? 'active' : ''}`}
                  onClick={() => setActiveFloor(i)}
                >
                  {i === 0 ? '1º Andar' : '2º Andar'}
                </button>
              ))}
            </div>
          )}

          <div className="bus-front">🚌 Frente do veículo</div>

          <div className="seat-grid-v2" style={{ marginTop: 10 }}>
            {fl.rows.map((row, rowIdx) => (
              <div key={row.rowId} className="seat-row-v2">
                <div className="seat-side">
                  {row.leftSeats.map((seat, seatIdx) =>
                    !seat.exists ? (
                      <div key={seat.id} className="seat-empty-slot" />
                    ) : (
                      <button
                        key={seat.id}
                        className={`seat-cell ${seat.active ? 'active' : 'occupied'}`}
                        onClick={() => toggleSeat(activeFloor, rowIdx, 'left', seatIdx)}
                        title={seat.active ? 'Livre — clique para ocupar' : 'Ocupado — clique para liberar'}
                      >
                        {seat.label}
                      </button>
                    )
                  )}
                </div>
                <div className="seat-aisle" />
                <div className="seat-side">
                  {row.rightSeats.map((seat, seatIdx) =>
                    !seat.exists ? (
                      <div key={seat.id} className="seat-empty-slot" />
                    ) : (
                      <button
                        key={seat.id}
                        className={`seat-cell ${seat.active ? 'active' : 'occupied'}`}
                        onClick={() => toggleSeat(activeFloor, rowIdx, 'right', seatIdx)}
                        title={seat.active ? 'Livre — clique para ocupar' : 'Ocupado — clique para liberar'}
                      >
                        {seat.label}
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="seat-legend" style={{ marginTop: 14 }}>
            <div className="seat-legend-item">
              <div className="legend-dot legend-dot--active" />
              <span>Livre</span>
            </div>
            <div className="seat-legend-item">
              <div className="legend-dot legend-dot--occupied" />
              <span>Ocupado</span>
            </div>
            <div className="seat-legend-item">
              <div className="legend-dot legend-dot--inactive" />
              <span>Sem poltrona</span>
            </div>
          </div>
        </div>

        <div className="wizard-footer">
          <button className="submit-btn" onClick={() => onSave({ ...vehicle, floors })}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
