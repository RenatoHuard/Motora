import { useState } from 'react'
import FloorSeatEditor, { countExisting } from '../components/FloorSeatEditor'

const SEAT_TYPES = [
  { key: 'conventional', label: 'Convencional' },
  { key: 'executive',    label: 'Executivo' },
  { key: 'semi_leito',   label: 'Semi-leito' },
  { key: 'leito',        label: 'Leito' },
]

const SEAT_TYPE_LABEL = Object.fromEntries(SEAT_TYPES.map(t => [t.key, t.label]))

export default function VehicleEditor({ vehicle, onBack, onSave }) {
  const [tab, setTab]             = useState('seats')
  const [floors, setFloors]       = useState(vehicle.floors)
  const [activeFloor, setActiveFloor] = useState(0)

  // Info tab state
  const [name, setName]   = useState(vehicle.name)
  const [plate, setPlate] = useState(vehicle.plate || '')
  const [seatTypes, setSeatTypes] = useState(
    vehicle.seatTypes || vehicle.floors.map(f => f.seatType || 'conventional')
  )

  function handleFloorChange(floorIdx, updated) {
    setFloors(prev => prev.map((f, i) => i === floorIdx ? updated : f))
  }

  function handleSeatTypeChange(floorIdx, val) {
    setSeatTypes(prev => prev.map((t, i) => i === floorIdx ? val : t))
  }

  function save() {
    const updatedFloors = floors.map((f, i) => ({ ...f, seatType: seatTypes[i] || f.seatType }))
    onSave({
      ...vehicle,
      name:       name.trim() || vehicle.name,
      plate,
      seatTypes,
      rowLayouts: vehicle.rowLayouts || floors.map(f => f.rowLayout),
      floors:     updatedFloors,
      totalSeats: countExisting(updatedFloors),
      updatedAt:  new Date().toISOString(),
    })
  }

  const fl = floors[activeFloor]

  function floorLabel(f) {
    return [f?.rowLayout, SEAT_TYPE_LABEL[f?.seatType]].filter(Boolean).join(' · ')
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <button className="wizard-back-btn" onClick={onBack}>←</button>
          <div className="wizard-step-label" style={{ flex: 1 }}>
            {name || vehicle.name}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, fontWeight: 400 }}>
              Editor de Veículo
            </div>
          </div>
          <div className="editor-tabs">
            <button className={`editor-tab ${tab === 'seats' ? 'active' : ''}`} onClick={() => setTab('seats')}>
              Assentos
            </button>
            <button className={`editor-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
              Veículo
            </button>
          </div>
        </div>

        <div className="wizard-body">

          {/* ── Seat editor tab ── */}
          {tab === 'seats' && (
            <>
              {floors.length === 0 ? (
                <div className="empty-state" style={{ marginTop: 24 }}>
                  <div className="empty-icon">💺</div>
                  <div className="empty-label">Poltronas não configuradas</div>
                  <div className="empty-hint">
                    Este veículo foi criado antes da atualização. Recadastre-o para configurar as poltronas.
                  </div>
                  <button className="submit-btn" style={{ marginTop: 16, width: 'auto', padding: '10px 24px' }}
                    onClick={() => setTab('info')}>
                    Ver dados do veículo →
                  </button>
                </div>
              ) : (
                <>
                  {floors.length > 1 && (
                    <div className="floor-tabs">
                      {floors.map((_, i) => (
                        <button key={i} className={`floor-tab ${activeFloor === i ? 'active' : ''}`} onClick={() => setActiveFloor(i)}>
                          {i === 0 ? '1º Andar' : '2º Andar'}
                        </button>
                      ))}
                    </div>
                  )}
                  {fl && (
                    <>
                      <p className="editor-floor-label">{floorLabel(fl)}</p>
                      <p className="wizard-subtitle" style={{ marginBottom: 14 }}>
                        Clique no rótulo para renomear · Passe o mouse para remover · Clique em + para restaurar
                      </p>
                      <FloorSeatEditor
                        key={activeFloor}
                        floor={fl}
                        onFloorChange={updated => handleFloorChange(activeFloor, updated)}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Vehicle info tab ── */}
          {tab === 'info' && (
            <div className="editor-info-tab">
              <h2 className="wizard-title">Dados do Veículo</h2>

              <div className="field">
                <label>Nome / Apelido</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Ônibus Principal"
                />
              </div>

              <div className="field">
                <label>Placa (opcional)</label>
                <input
                  type="text"
                  value={plate}
                  onChange={e => setPlate(e.target.value.toUpperCase())}
                  placeholder="ABC-1234"
                  maxLength={8}
                />
              </div>

              {floors.map((f, i) => (
                <div key={i} className="field">
                  <label>
                    {floors.length > 1
                      ? `Tipo de Poltrona — ${i === 0 ? '1º' : '2º'} Andar`
                      : 'Tipo de Poltrona'}
                    <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>
                      {' · layout '}{f.rowLayout}
                    </span>
                  </label>
                  <div className="seat-type-picker">
                    {SEAT_TYPES.map(st => (
                      <button
                        key={st.key}
                        className={`seat-type-btn ${seatTypes[i] === st.key ? 'selected' : ''}`}
                        onClick={() => handleSeatTypeChange(i, st.key)}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        <div className="wizard-footer">
          <button className="submit-btn" onClick={save} disabled={tab === 'info' && !name.trim()}>
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  )
}
