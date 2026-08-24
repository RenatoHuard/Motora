import { useState } from 'react'
import { recurrenceSummary } from './TripBuilder'

// ── Shared helpers (mirror of TripBuilder) ─────────────

const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const RECURRENCE_TYPES = [
  { key: 'none',     label: 'Não repete' },
  { key: 'daily',    label: 'Todo dia' },
  { key: 'weekly',   label: 'Toda semana' },
  { key: 'biweekly', label: 'A cada 2 semanas' },
  { key: 'monthly',  label: 'Todo mês' },
]

// ── Steps ───────────────────────────────────────────────

function StepInfo({ form, set }) {
  return (
    <>
      <h2 className="wizard-title">Dados da Linha</h2>
      <div className="field">
        <label>Nome da Linha *</label>
        <input type="text" placeholder="Ex: Linha Centro-Sul" autoFocus
          value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="field">
        <label>Origem</label>
        <input type="text" placeholder="Ponto de embarque" value={form.origin}
          onChange={e => set('origin', e.target.value)} />
      </div>
      <div className="field">
        <label>Destino</label>
        <input type="text" placeholder="Ponto de chegada" value={form.destination}
          onChange={e => set('destination', e.target.value)} />
      </div>

      {/* Horários */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Horário de saída (ida)</label>
          <input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
        </div>
        {form.roundTrip && (
          <div className="field" style={{ flex: 1 }}>
            <label>Horário de saída (volta)</label>
            <input type="time" value={form.returnTime} onChange={e => set('returnTime', e.target.value)} />
          </div>
        )}
      </div>

      {/* Ida e volta toggle */}
      <button
        className={`round-trip-toggle ${form.roundTrip ? 'active' : ''}`}
        onClick={() => set('roundTrip', !form.roundTrip)}
      >
        <span className="round-trip-icon">⇄</span>
        <div>
          <div className="round-trip-label">Ida e volta</div>
          <div className="round-trip-hint">
            {form.roundTrip ? 'Esta linha tem viagem de retorno' : 'Ativar para incluir viagem de volta'}
          </div>
        </div>
        <span className="round-trip-check">{form.roundTrip ? '✓' : ''}</span>
      </button>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Observações (opcional)</label>
        <input type="text" placeholder="Notas internas" value={form.notes}
          onChange={e => set('notes', e.target.value)} />
      </div>
    </>
  )
}

function StepVehicle({ vehicles, value, onChange }) {
  if (vehicles.length === 0) {
    return (
      <>
        <h2 className="wizard-title">Veículo Padrão</h2>
        <div className="empty-state" style={{ marginTop: 12 }}>
          <div className="empty-icon">🚌</div>
          <div className="empty-label">Nenhum veículo cadastrado</div>
          <div className="empty-hint">Cadastre um veículo para associar à linha</div>
        </div>
      </>
    )
  }
  return (
    <>
      <h2 className="wizard-title">Veículo Padrão</h2>
      <p className="wizard-subtitle">Qual ônibus realiza esta linha normalmente?</p>
      <div className="vehicle-pick-list">
        {vehicles.map(v => (
          <button key={v.id}
            className={`vehicle-pick-card ${value === v.id ? 'selected' : ''}`}
            onClick={() => onChange(v.id)}
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

function StepRecurrence({ recurrence, onChange }) {
  const { type, weekdays = [], end = { type: 'never' } } = recurrence

  function setType(t) {
    onChange({ ...recurrence, type: t })
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
      <h2 className="wizard-title">Frequência</h2>
      <p className="wizard-subtitle">Com qual frequência esta linha opera?</p>

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
          <label>Dias de operação</label>
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
          </div>
        </div>
      )}

      {type !== 'none' && (
        <div className="recurrence-summary">{recurrenceSummary(recurrence)}</div>
      )}
    </>
  )
}

// ── Wizard ───────────────────────────────────────────────

const STEPS = [
  { id: 'info',       label: 'Dados' },
  { id: 'vehicle',    label: 'Veículo' },
  { id: 'recurrence', label: 'Frequência' },
]

export default function LineBuilder({ vehicles, initialLine, onBack, onSave }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => ({
    name:        initialLine?.name         || '',
    origin:      initialLine?.origin       || '',
    destination: initialLine?.destination  || '',
    time:        initialLine?.departureTime || '',
    returnTime:  initialLine?.returnTime   || '',
    roundTrip:   initialLine?.roundTrip    ?? false,
    notes:       initialLine?.notes        || '',
    vehicleId:   initialLine?.vehicleId    || null,
  }))
  const [recurrence, setRecurrence] = useState(
    () => initialLine?.recurrence || { type: 'none', weekdays: [], end: { type: 'never' } }
  )

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const currentId = STEPS[step]?.id

  function canNext() {
    if (currentId === 'info')    return !!form.name.trim()
    if (currentId === 'vehicle') return !!form.vehicleId || vehicles.length === 0
    return true
  }

  function save() {
    onSave({
      ...(initialLine || {}),
      id:            initialLine?.id || crypto.randomUUID(),
      name:          form.name.trim(),
      origin:        form.origin.trim()      || null,
      destination:   form.destination.trim() || null,
      departureTime: form.time               || null,
      roundTrip:     form.roundTrip,
      returnTime:    form.roundTrip ? (form.returnTime || null) : null,
      vehicleId:     form.vehicleId,
      recurrence,
      notes:         form.notes.trim() || null,
      active:        initialLine?.active ?? true,
      createdAt:     initialLine?.createdAt || new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
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
          {currentId === 'info'       && <StepInfo       form={form} set={set} />}
          {currentId === 'vehicle'    && <StepVehicle    vehicles={vehicles} value={form.vehicleId} onChange={v => set('vehicleId', v)} />}
          {currentId === 'recurrence' && <StepRecurrence recurrence={recurrence} onChange={setRecurrence} />}
        </div>

        <div className="wizard-footer">
          {step < STEPS.length - 1 ? (
            <button className="submit-btn" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Continuar
            </button>
          ) : (
            <button className="submit-btn" onClick={save}>
              {initialLine ? 'Salvar Linha' : 'Cadastrar Linha'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
