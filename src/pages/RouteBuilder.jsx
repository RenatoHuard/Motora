import { useState } from 'react'

export default function RouteBuilder({ line, onBack, onSave }) {
  const [stops, setStops] = useState(() =>
    (line.stops || []).map(s => ({ ...s, id: s.id || crypto.randomUUID() }))
  )

  function addStop(afterIdx) {
    const newStop = { id: crypto.randomUUID(), name: '' }
    setStops(prev => {
      const n = [...prev]
      n.splice(afterIdx + 1, 0, newStop)
      return n
    })
  }

  function removeStop(id) {
    setStops(prev => prev.filter(s => s.id !== id))
  }

  function updateName(id, value) {
    setStops(prev => prev.map(s => s.id === id ? { ...s, name: value } : s))
  }

  function moveUp(i) {
    if (i === 0) return
    setStops(prev => {
      const n = [...prev];
      [n[i - 1], n[i]] = [n[i], n[i - 1]]
      return n
    })
  }

  function moveDown(i) {
    setStops(prev => {
      if (i >= prev.length - 1) return prev
      const n = [...prev];
      [n[i], n[i + 1]] = [n[i + 1], n[i]]
      return n
    })
  }

  function save() {
    onSave(stops.filter(s => s.name.trim()))
  }

  const origin      = line.origin      || 'Origem não definida'
  const destination = line.destination || 'Destino não definido'

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <button className="wizard-back-btn" onClick={onBack}>←</button>
          <div className="wizard-step-label" style={{ flex: 1 }}>
            Trajeto — {line.name}
          </div>
        </div>

        <div className="wizard-body route-wizard-body">
          <div className="route-builder">

            {/* ── Origem ── */}
            <div className="route-node">
              <div className="route-dot origin-dot" />
              <div className="route-node-content">
                <div className="route-node-label">Início</div>
                <div className="route-node-name">{origin}</div>
              </div>
            </div>

            {/* ── Insert button before first stop (or if no stops) ── */}
            <AddStopRow onAdd={() => addStop(-1)} />

            {/* ── Paradas intermediárias ── */}
            {stops.map((stop, i) => (
              <div key={stop.id}>
                <div className="route-node stop-node">
                  <div className="route-dot stop-dot" />
                  <div className="route-node-content">
                    <input
                      className="route-stop-input"
                      value={stop.name}
                      onChange={e => updateName(stop.id, e.target.value)}
                      placeholder="Nome da parada…"
                      autoFocus={stop.name === ''}
                    />
                  </div>
                  <div className="route-node-actions">
                    <button className="route-move-btn" onClick={() => moveUp(i)}
                      disabled={i === 0} title="Mover para cima">↑</button>
                    <button className="route-move-btn" onClick={() => moveDown(i)}
                      disabled={i === stops.length - 1} title="Mover para baixo">↓</button>
                    <button className="route-remove-btn" onClick={() => removeStop(stop.id)}
                      title="Remover parada">×</button>
                  </div>
                </div>
                <AddStopRow onAdd={() => addStop(i)} />
              </div>
            ))}

            {/* ── Destino ── */}
            <div className="route-node">
              <div className="route-dot destination-dot" />
              <div className="route-node-content">
                <div className="route-node-label">Fim</div>
                <div className="route-node-name">{destination}</div>
              </div>
            </div>

          </div>
        </div>

        <div className="wizard-footer">
          <button className="submit-btn" onClick={save}>Salvar Trajeto</button>
        </div>
      </div>
    </div>
  )
}

function AddStopRow({ onAdd }) {
  return (
    <div className="route-add-row">
      <div className="route-connector" />
      <button className="route-add-btn" onClick={onAdd}>+ Adicionar parada</button>
    </div>
  )
}
