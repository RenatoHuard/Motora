import { useState } from 'react'

// ── Helpers ────────────────────────────────────────────

const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const RECURRENCE_TYPES = [
  { key: 'none',     label: 'Não repete' },
  { key: 'daily',    label: 'Todo dia' },
  { key: 'weekly',   label: 'Toda semana' },
  { key: 'biweekly', label: 'A cada 2 semanas' },
  { key: 'monthly',  label: 'Todo mês' },
]

export function recurrenceSummary(r) {
  if (!r || r.type === 'none') return 'Não repete'
  const days = (r.weekdays || []).map(d => WEEKDAY_LABEL[d]).join(', ')
  const end  = r.end?.type === 'date'  ? ` · até ${formatDate(r.end.date)}`
             : r.end?.type === 'count' ? ` · ${r.end.count}×`
             : ''
  switch (r.type) {
    case 'daily':    return `Todo dia${end}`
    case 'weekly':   return `Toda semana${days ? ' · ' + days : ''}${end}`
    case 'biweekly': return `A cada 2 semanas${days ? ' · ' + days : ''}${end}`
    case 'monthly':  return `Todo mês${end}`
    default:         return ''
  }
}

export function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function weekdayOfDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T12:00:00').getDay()
}

// ── Step 1: line selection ─────────────────────────────

function StepLine({ lines, vehicles, value, onChange }) {
  return (
    <>
      <h2 className="wizard-title">Linha</h2>
      <p className="wizard-subtitle">Esta viagem pertence a uma linha fixa?</p>

      <div className="vehicle-pick-list">
        <button
          className={`vehicle-pick-card ${!value ? 'selected' : ''}`}
          onClick={() => onChange(null)}
        >
          <span className="vehicle-pick-icon">🗺️</span>
          <div className="vehicle-pick-info">
            <div className="vehicle-pick-name">Viagem avulsa</div>
            <div className="vehicle-pick-sub">Sem vínculo com linha fixa</div>
          </div>
          {!value && <span className="vehicle-pick-check">✓</span>}
        </button>

        {lines.map(line => {
          const v = vehicles.find(vv => vv.id === line.vehicleId)
          return (
            <button key={line.id}
              className={`vehicle-pick-card ${value === line.id ? 'selected' : ''}`}
              onClick={() => onChange(line.id)}
            >
              <span className="vehicle-pick-icon">🔁</span>
              <div className="vehicle-pick-info">
                <div className="vehicle-pick-name">{line.name}</div>
                <div className="vehicle-pick-sub">
                  {[line.origin && line.destination ? `${line.origin} → ${line.destination}` : null, v?.name]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              {value === line.id && <span className="vehicle-pick-check">✓</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ── Step 2: vehicle ────────────────────────────────────

function StepVehicle({ vehicles, selectedLine, value, substituteId, onVehicle, onSubstitute }) {
  const lineVehicle = selectedLine ? vehicles.find(v => v.id === selectedLine.vehicleId) : null
  const isSubstituting = !!(substituteId)

  if (!selectedLine) {
    // No line — free vehicle pick
    return (
      <>
        <h2 className="wizard-title">Veículo</h2>
        <p className="wizard-subtitle">Qual veículo realizará esta viagem?</p>
        <div className="vehicle-pick-list">
          {vehicles.map(v => (
            <button key={v.id}
              className={`vehicle-pick-card ${value === v.id ? 'selected' : ''}`}
              onClick={() => onVehicle(v.id)}
            >
              <span className="vehicle-pick-icon">{v.vehicleType === 'bus' ? '🚌' : '🚐'}</span>
              <div className="vehicle-pick-info">
                <div className="vehicle-pick-name">{v.name}</div>
                <div className="vehicle-pick-sub">
                  {[v.plate, `${v.totalSeats} lugares`].filter(Boolean).join(' · ')}
                </div>
              </div>
              {value === v.id && <span className="vehicle-pick-check">✓</span>}
            </button>
          ))}
        </div>
      </>
    )
  }

  // Has line — show default + optional substitute
  return (
    <>
      <h2 className="wizard-title">Veículo</h2>
      <div className="line-vehicle-default">
        <span className="vehicle-pick-icon">{lineVehicle?.vehicleType === 'bus' ? '🚌' : '🚐'}</span>
        <div>
          <div className="vehicle-pick-name">{lineVehicle?.name || '—'}</div>
          <div className="vehicle-pick-sub">Veículo padrão da linha · {lineVehicle?.totalSeats} lugares</div>
        </div>
        <span className="vehicle-badge" style={{ marginLeft: 'auto' }}>Padrão</span>
      </div>

      <button
        className={`substitute-toggle ${isSubstituting ? 'active' : ''}`}
        onClick={() => {
          if (isSubstituting) {
            onSubstitute(null)
            onVehicle(selectedLine.vehicleId)
          } else {
            onSubstitute('')  // will be set when user picks
          }
        }}
      >
        <span>🔄</span>
        <span>{isSubstituting ? 'Cancelar substituição' : 'Usar veículo substituto'}</span>
      </button>

      {isSubstituting && (
        <div className="vehicle-pick-list" style={{ marginTop: 12 }}>
          {vehicles
            .filter(v => v.id !== selectedLine.vehicleId)
            .map(v => (
              <button key={v.id}
                className={`vehicle-pick-card ${substituteId === v.id ? 'selected' : ''}`}
                onClick={() => { onSubstitute(v.id); onVehicle(v.id) }}
              >
                <span className="vehicle-pick-icon">{v.vehicleType === 'bus' ? '🚌' : '🚐'}</span>
                <div className="vehicle-pick-info">
                  <div className="vehicle-pick-name">{v.name}</div>
                  <div className="vehicle-pick-sub">
                    {[v.plate, `${v.totalSeats} lugares`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {substituteId === v.id && <span className="vehicle-pick-check">✓</span>}
              </button>
            ))}
        </div>
      )}
    </>
  )
}

// ── Step 3: details ────────────────────────────────────

function StepDetails({ form, set }) {
  return (
    <>
      <h2 className="wizard-title">Detalhes da Viagem</h2>
      <div className="field">
        <label>Origem</label>
        <input type="text" placeholder="Cidade / terminal de saída" value={form.origin}
          onChange={e => set('origin', e.target.value)} />
      </div>
      <div className="field">
        <label>Destino</label>
        <input type="text" placeholder="Cidade / terminal de chegada" value={form.destination}
          onChange={e => set('destination', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Data de saída</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Horário</label>
          <input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Observações (opcional)</label>
        <input type="text" placeholder="Notas internas" value={form.notes}
          onChange={e => set('notes', e.target.value)} />
      </div>
    </>
  )
}

// ── Step 4: recurrence ─────────────────────────────────

function StepRecurrence({ recurrence, onChange, departureDate }) {
  const { type, weekdays = [], end = { type: 'never' } } = recurrence

  function setType(t) {
    let wd = weekdays
    if ((t === 'weekly' || t === 'biweekly') && wd.length === 0) {
      const d = weekdayOfDate(departureDate)
      if (d !== null) wd = [d]
    }
    onChange({ ...recurrence, type: t, weekdays: wd })
  }

  function toggleWeekday(d) {
    const next = weekdays.includes(d)
      ? weekdays.filter(w => w !== d)
      : [...weekdays, d].sort((a, b) => a - b)
    onChange({ ...recurrence, weekdays: next })
  }

  function setEnd(patch) {
    onChange({ ...recurrence, end: { ...end, ...patch } })
  }

  const needsWeekdays = type === 'weekly' || type === 'biweekly'

  return (
    <>
      <h2 className="wizard-title">Repetição</h2>
      <p className="wizard-subtitle">Esta viagem se repete com alguma frequência?</p>

      <div className="recurrence-type-list">
        {RECURRENCE_TYPES.map(opt => (
          <button key={opt.key}
            className={`recurrence-type-btn ${type === opt.key ? 'selected' : ''}`}
            onClick={() => setType(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {needsWeekdays && (
        <div className="field" style={{ marginTop: 20 }}>
          <label>Repetir nos dias</label>
          <div className="weekday-picker">
            {WEEKDAY_LABEL.map((label, d) => (
              <button key={d}
                className={`weekday-btn ${weekdays.includes(d) ? 'selected' : ''}`}
                onClick={() => toggleWeekday(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {type !== 'none' && (
        <div className="field" style={{ marginTop: 20 }}>
          <label>Terminar</label>
          <div className="recurrence-end-list">
            <label className="radio-row">
              <input type="radio" name="end" checked={end.type === 'never'}
                onChange={() => setEnd({ type: 'never' })} />
              <span>Nunca</span>
            </label>
            <label className="radio-row">
              <input type="radio" name="end" checked={end.type === 'date'}
                onChange={() => setEnd({ type: 'date', date: '' })} />
              <span>Na data</span>
              {end.type === 'date' && (
                <input type="date" className="inline-input" value={end.date || ''}
                  onChange={e => setEnd({ type: 'date', date: e.target.value })} />
              )}
            </label>
            <label className="radio-row">
              <input type="radio" name="end" checked={end.type === 'count'}
                onChange={() => setEnd({ type: 'count', count: 10 })} />
              <span>Após</span>
              {end.type === 'count' && (
                <>
                  <input type="number" className="inline-input inline-input--num"
                    min={1} max={999} value={end.count || 1}
                    onChange={e => setEnd({ type: 'count', count: Number(e.target.value) })} />
                  <span>ocorrências</span>
                </>
              )}
            </label>
          </div>
        </div>
      )}

      {type !== 'none' && (
        <div className="recurrence-summary">{recurrenceSummary(recurrence)}</div>
      )}
    </>
  )
}

// ── Wizard ─────────────────────────────────────────────

const STEPS = [
  { id: 'line',       label: 'Linha' },
  { id: 'vehicle',    label: 'Veículo' },
  { id: 'details',    label: 'Detalhes' },
  { id: 'recurrence', label: 'Repetição' },
]

export default function TripBuilder({ vehicles, lines = [], onBack, onSave, initialTrip }) {
  const [step, setStep] = useState(0)
  const [lineId, setLineId]           = useState(initialTrip?.lineId || null)
  const [substituteId, setSubstituteId] = useState(initialTrip?.substituteVehicleId || null)

  const selectedLine = lines.find(l => l.id === lineId) || null

  const [form, setForm] = useState(() => {
    if (initialTrip) {
      return {
        vehicleId:   initialTrip.vehicleId,
        origin:      initialTrip.origin      || '',
        destination: initialTrip.destination || '',
        date:        initialTrip.departureDate || '',
        time:        initialTrip.departureTime || '',
        notes:       initialTrip.notes        || '',
      }
    }
    return { vehicleId: null, origin: '', destination: '', date: '', time: '', notes: '' }
  })

  const [recurrence, setRecurrence] = useState(
    () => initialTrip?.recurrence || { type: 'none', weekdays: [], end: { type: 'never' } }
  )

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  // When line changes, pre-fill form
  function handleLineChange(id) {
    setLineId(id)
    setSubstituteId(null)
    const line = lines.find(l => l.id === id)
    if (line) {
      setForm(f => ({
        ...f,
        vehicleId:   line.vehicleId   || f.vehicleId,
        origin:      line.origin      || f.origin,
        destination: line.destination || f.destination,
        time:        line.departureTime || f.time,
      }))
      setRecurrence(line.recurrence || { type: 'none', weekdays: [], end: { type: 'never' } })
    }
  }

  const currentId = STEPS[step]?.id

  function canNext() {
    switch (currentId) {
      case 'line':       return true
      case 'vehicle':    return !!form.vehicleId
      case 'details':    return !!(form.origin?.trim()) && !!(form.destination?.trim()) && !!form.date
      case 'recurrence': return true
      default: return false
    }
  }

  function save() {
    onSave({
      ...(initialTrip || {}),
      id:                   initialTrip?.id || crypto.randomUUID(),
      lineId:               lineId || null,
      vehicleId:            form.vehicleId,
      substituteVehicleId:  substituteId || null,
      origin:               form.origin.trim(),
      destination:          form.destination.trim(),
      departureDate:        form.date,
      departureTime:        form.time || null,
      recurrence,
      notes:                form.notes.trim() || null,
      createdAt:            initialTrip?.createdAt || new Date().toISOString(),
      updatedAt:            new Date().toISOString(),
    })
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <button className="wizard-back-btn"
            onClick={step === 0 ? onBack : () => setStep(s => s - 1)}>←</button>
          <span className="wizard-step-label">{STEPS[step]?.label}</span>
          <div className="wizard-progress">
            {STEPS.map((_, i) => <div key={i} className={`wizard-dot ${i <= step ? 'active' : ''}`} />)}
          </div>
        </div>

        <div className="wizard-body">
          {currentId === 'line' && (
            <StepLine lines={lines} vehicles={vehicles} value={lineId} onChange={handleLineChange} />
          )}
          {currentId === 'vehicle' && (
            <StepVehicle
              vehicles={vehicles}
              selectedLine={selectedLine}
              value={form.vehicleId}
              substituteId={substituteId}
              onVehicle={v => set('vehicleId', v)}
              onSubstitute={setSubstituteId}
            />
          )}
          {currentId === 'details' && <StepDetails form={form} set={set} />}
          {currentId === 'recurrence' && (
            <StepRecurrence recurrence={recurrence} onChange={setRecurrence} departureDate={form.date} />
          )}
        </div>

        <div className="wizard-footer">
          {step < STEPS.length - 1 ? (
            <button className="submit-btn" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Continuar
            </button>
          ) : (
            <button className="submit-btn" onClick={save} disabled={!canNext()}>
              {initialTrip ? 'Salvar Viagem' : 'Cadastrar Viagem'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
