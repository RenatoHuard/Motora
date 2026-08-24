import { useState, useMemo } from 'react'
import FloorSeatEditor, {
  ROW_LAYOUT_COLS,
  computeSeatLabel,
  generateRows,
  countExisting,
} from '../components/FloorSeatEditor'

// ── Labels ─────────────────────────────────────────────

const SEAT_TYPE_LABEL = {
  conventional: 'Convencional',
  executive:    'Executivo',
  semi_leito:   'Semi-leito',
  leito:        'Leito',
}

const LABEL_SCHEME_LABEL = {
  num_letter:       'Número + Letra  (1A, 1B…)',
  letter_num:       'Letra + Número  (A1, B1…)',
  sequential_right: 'Numerada pela Direita',
  sequential_left:  'Numerada pela Esquerda',
  odd_even:         'Pares e Ímpares',
}

const SUBTYPE_LABEL = {
  conventional:  'Convencional',
  double_decker: 'Double Decker',
  minivan:       'Sprinter / Minivan',
  executive_van: 'Van Executiva',
}

// ── Shared option card ─────────────────────────────────

function OptionCard({ icon, label, desc, selected, onClick, children }) {
  return (
    <button className={`option-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      {icon && <span className="option-card-icon">{icon}</span>}
      {children}
      <span className="option-card-label">{label}</span>
      {desc && <span className="option-card-desc">{desc}</span>}
    </button>
  )
}

// ── Mini layout preview ────────────────────────────────

function LayoutPreview({ leftCount, rightCount, selected }) {
  return (
    <div className="layout-preview-mini">
      {Array.from({ length: leftCount },  (_, i) => <div key={i}  className={`layout-seat-mini${selected ? ' selected' : ''}`} />)}
      <div className="layout-aisle-mini" />
      {Array.from({ length: rightCount }, (_, i) => <div key={i}  className={`layout-seat-mini${selected ? ' selected' : ''}`} />)}
    </div>
  )
}

// ── Step: vehicle type ─────────────────────────────────

function StepVehicleType({ value, onChange }) {
  return (
    <>
      <h2 className="wizard-title">Tipo de Veículo</h2>
      <p className="wizard-subtitle">Qual veículo você deseja cadastrar?</p>
      <div className="option-grid">
        <OptionCard icon="🚌" label="Ônibus" desc="Convencional ou Double Decker" selected={value === 'bus'} onClick={() => onChange('bus')} />
        <OptionCard icon="🚐" label="Van" desc="Sprinter / Minivan" selected={value === 'van'} onClick={() => onChange('van')} />
      </div>
    </>
  )
}

// ── Step: bus/van config ───────────────────────────────

function StepBusConfig({ form, set }) {
  if (form.vehicleType === 'van') {
    return (
      <>
        <h2 className="wizard-title">Tipo de Van</h2>
        <p className="wizard-subtitle">Como é sua van?</p>
        <div className="option-grid">
          <OptionCard icon="🚐" label="Sprinter / Minivan" desc="Até 15 passageiros" selected={form.busType === 'minivan'} onClick={() => set('busType', 'minivan')} />
          <OptionCard icon="🚌" label="Van Executiva" desc="Poltronas individuais" selected={form.busType === 'executive_van'} onClick={() => set('busType', 'executive_van')} />
        </div>
      </>
    )
  }
  return (
    <>
      <h2 className="wizard-title">Configuração do Ônibus</h2>
      <p className="wizard-subtitle">Quantos andares possui o veículo?</p>
      <div className="option-grid">
        <OptionCard icon="🚍" label="Convencional" desc="1 andar" selected={form.busType === 'conventional'} onClick={() => set('busType', 'conventional')} />
        <OptionCard icon="🚌" label="Double Decker" desc="2 andares independentes" selected={form.busType === 'double_decker'} onClick={() => set('busType', 'double_decker')} />
      </div>
    </>
  )
}

// ── Step: row layout (physical columns per side) ───────

function StepRowLayout({ floorLabel, value, onChange }) {
  const LAYOUTS = [
    { key: '2+2', left: 2, right: 2, desc: '4 poltronas por fileira' },
    { key: '1+2', left: 1, right: 2, desc: '3 poltronas por fileira' },
    { key: '1+1', left: 1, right: 1, desc: '2 poltronas por fileira' },
  ]
  return (
    <>
      <h2 className="wizard-title">{floorLabel ? `Layout — ${floorLabel}` : 'Layout de Fileira'}</h2>
      <p className="wizard-subtitle">Quantas poltronas por lado em cada fileira?</p>
      <div className="option-grid">
        {LAYOUTS.map(l => (
          <OptionCard key={l.key} label={l.key} desc={l.desc} selected={value === l.key} onClick={() => onChange(l.key)}>
            <LayoutPreview leftCount={l.left} rightCount={l.right} selected={value === l.key} />
          </OptionCard>
        ))}
      </div>
    </>
  )
}

// ── Step: seat type (comfort level) ───────────────────

function StepSeatType({ floorLabel, value, onChange }) {
  return (
    <>
      <h2 className="wizard-title">{floorLabel ? `Poltrona — ${floorLabel}` : 'Tipo de Poltrona'}</h2>
      <p className="wizard-subtitle">Qual é o conforto das poltronas?</p>
      <div className="option-grid">
        <OptionCard icon="💺" label="Convencional" desc="Poltrona reclinável padrão" selected={value === 'conventional'} onClick={() => onChange('conventional')} />
        <OptionCard icon="💺" label="Executivo" desc="Poltrona premium, mais espaço" selected={value === 'executive'} onClick={() => onChange('executive')} />
        <OptionCard icon="💺" label="Semi-leito" desc="Reclinação ampla" selected={value === 'semi_leito'} onClick={() => onChange('semi_leito')} />
        <OptionCard icon="💺" label="Leito" desc="Cama completa" selected={value === 'leito'} onClick={() => onChange('leito')} />
      </div>
    </>
  )
}

// ── Step: label scheme ─────────────────────────────────

const SCHEMES = [
  { key: 'num_letter',       label: 'Número + Letra',       desc: '1A, 1B, 1C, 1D…' },
  { key: 'letter_num',       label: 'Letra + Número',       desc: 'A1, B1, C1, D1…' },
  { key: 'sequential_right', label: 'Numerada pela Direita', desc: '1, 2, 3, 4… iniciando pela direita' },
  { key: 'sequential_left',  label: 'Numerada pela Esquerda', desc: '1, 2, 3, 4… iniciando pela esquerda' },
  { key: 'odd_even',         label: 'Pares e Ímpares',       desc: 'Direita: ímpares · Esquerda: pares' },
]

function SchemePreview({ schemeKey, rowLayout }) {
  const layout = ROW_LAYOUT_COLS[rowLayout] || ROW_LAYOUT_COLS['2+2']
  const { left, right } = layout
  const leftLabels  = left.map((col, ci)  => computeSeatLabel(schemeKey, 1, col, 'left',  ci, 0, left.length, right.length))
  const rightLabels = right.map((col, ci) => computeSeatLabel(schemeKey, 1, col, 'right', ci, 0, left.length, right.length))
  return (
    <div className="scheme-preview">
      {leftLabels.map((l, i) => <span key={i} className="scheme-seat">{l}</span>)}
      <span className="scheme-aisle">│</span>
      {rightLabels.map((r, i) => <span key={i} className="scheme-seat">{r}</span>)}
    </div>
  )
}

function StepLabelScheme({ value, onChange, rowLayout }) {
  return (
    <>
      <h2 className="wizard-title">Numeração das Poltronas</h2>
      <p className="wizard-subtitle">Como serão os rótulos gerados? Você pode renomear individualmente depois.</p>
      <div className="scheme-list">
        {SCHEMES.map(s => (
          <button key={s.key} className={`scheme-card ${value === s.key ? 'selected' : ''}`} onClick={() => onChange(s.key)}>
            <div className="scheme-info">
              <span className="scheme-label">{s.label}</span>
              <span className="scheme-desc">{s.desc}</span>
            </div>
            <SchemePreview schemeKey={s.key} rowLayout={rowLayout} />
          </button>
        ))}
      </div>
    </>
  )
}

// ── Step: number of rows per floor ─────────────────────

function StepLayout({ form, set, floorCount }) {
  const rows = form.rowsPerFloor.length === floorCount
    ? form.rowsPerFloor
    : Array(floorCount).fill(form.rowsPerFloor[0] || 10)

  function updateRows(i, val) {
    const updated = [...rows]
    updated[i] = Number(val)
    set('rowsPerFloor', updated)
  }

  const total = rows.slice(0, floorCount).reduce((sum, r, i) => {
    const rl = form.rowLayouts?.[i] || '2+2'
    const { left, right } = ROW_LAYOUT_COLS[rl] || ROW_LAYOUT_COLS['2+2']
    return sum + r * (left.length + right.length)
  }, 0)

  return (
    <>
      <h2 className="wizard-title">Número de Fileiras</h2>
      <p className="wizard-subtitle">Quantas fileiras em cada andar?</p>
      <div className="layout-inputs">
        {Array.from({ length: floorCount }).map((_, i) => (
          <div key={i} className="field">
            <label>
              {floorCount > 1 ? `${i === 0 ? '1º' : '2º'} Andar` : 'Fileiras de assentos'}
              {form.rowLayouts?.[i] && (
                <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>
                  {' · '}{form.rowLayouts[i]}{' · '}{SEAT_TYPE_LABEL[form.seatTypes?.[i]] || ''}
                </span>
              )}
            </label>
            <div className="row-input-wrapper">
              <input type="number" min={1} max={30} value={rows[i] ?? 10} onChange={e => updateRows(i, e.target.value)} />
              <span className="row-input-hint">fileiras</span>
            </div>
          </div>
        ))}
        <div className="layout-preview">
          <span className="layout-preview-label">Total estimado de assentos</span>
          <span className="layout-preview-count">{total}</span>
        </div>
      </div>
    </>
  )
}

// ── Step: seat editor ──────────────────────────────────

function StepSeatEditor({ floors, activeFloor, onFloorChange, onFloorTabChange }) {
  const fl = floors[activeFloor]
  return (
    <>
      <h2 className="wizard-title">Editor de Assentos</h2>
      <p className="wizard-subtitle">
        Clique no rótulo para renomear · Passe o mouse para remover · Clique em + para restaurar
      </p>
      {floors.length > 1 && (
        <div className="floor-tabs">
          {floors.map((f, i) => (
            <button key={i} className={`floor-tab ${activeFloor === i ? 'active' : ''}`} onClick={() => onFloorTabChange(i)}>
              {i === 0 ? '1º Andar' : '2º Andar'}
              <span className="floor-tab-class">
                {' · '}{f.rowLayout}{' · '}{SEAT_TYPE_LABEL[f.seatType]?.[0] || ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {fl && (
        <FloorSeatEditor key={activeFloor} floor={fl} onFloorChange={updated => onFloorChange(activeFloor, updated)} />
      )}
    </>
  )
}

// ── Step: identification ───────────────────────────────

function StepIdentification({ form, set, floors }) {
  const total          = countExisting(floors)
  const isDoubleDecker = form.busType === 'double_decker'
  return (
    <>
      <h2 className="wizard-title">Identificação do Veículo</h2>
      <p className="wizard-subtitle">Como você quer chamar este veículo?</p>
      <div className="field">
        <label>Nome / Apelido</label>
        <input type="text" placeholder="Ex: Ônibus Principal, Leito 01" value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="field">
        <label>Placa (opcional)</label>
        <input type="text" placeholder="ABC-1234" value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} maxLength={8} />
      </div>
      <div className="vehicle-summary">
        <div className="summary-row"><span>Tipo</span><span>{form.vehicleType === 'bus' ? 'Ônibus' : 'Van'}</span></div>
        <div className="summary-row"><span>Configuração</span><span>{SUBTYPE_LABEL[form.busType] || ''}</span></div>
        {floors.map((fl, i) => (
          <div key={i} className="summary-row">
            <span>{isDoubleDecker ? `${i === 0 ? '1º' : '2º'} Andar` : 'Poltronas'}</span>
            <span>{fl.rowLayout} · {SEAT_TYPE_LABEL[fl.seatType] || ''}</span>
          </div>
        ))}
        <div className="summary-row">
          <span>Numeração</span><span>{LABEL_SCHEME_LABEL[form.labelScheme] || ''}</span>
        </div>
        <div className="summary-row highlight"><span>Total de Assentos</span><span>{total}</span></div>
      </div>
    </>
  )
}

// ── Dynamic steps ──────────────────────────────────────

function useSteps(busType) {
  return useMemo(() => {
    const s = [
      { id: 'type',          label: 'Tipo' },
      { id: 'config',        label: 'Configuração' },
      { id: 'row_layout_0',  label: busType === 'double_decker' ? 'Fileira 1º Andar' : 'Layout' },
      { id: 'seat_type_0',   label: busType === 'double_decker' ? 'Poltrona 1º Andar' : 'Poltrona' },
    ]
    if (busType === 'double_decker') {
      s.push({ id: 'row_layout_1', label: 'Fileira 2º Andar' })
      s.push({ id: 'seat_type_1',  label: 'Poltrona 2º Andar' })
    }
    s.push({ id: 'layout',       label: 'Fileiras' })
    s.push({ id: 'label_scheme', label: 'Numeração' })
    s.push({ id: 'seats',        label: 'Assentos' })
    s.push({ id: 'id',           label: 'Identificação' })
    return s
  }, [busType])
}

// ── Main wizard ────────────────────────────────────────

export default function VehicleBuilder({ onBack, onSave, initialVehicle }) {
  const [step, setStep] = useState(0)

  const [form, setForm] = useState(() => {
    if (initialVehicle) {
      return {
        vehicleType:  initialVehicle.vehicleType,
        busType:      initialVehicle.busType,
        rowLayouts:   initialVehicle.rowLayouts  || initialVehicle.floors?.map(f => f.rowLayout  || '2+2') || [],
        seatTypes:    initialVehicle.seatTypes   || initialVehicle.floors?.map(f => f.seatType   || 'conventional') || [],
        labelScheme:  initialVehicle.labelScheme || 'num_letter',
        rowsPerFloor: initialVehicle.floors?.map(f => f.rows.length) || [10],
        name:  initialVehicle.name,
        plate: initialVehicle.plate || '',
      }
    }
    return {
      vehicleType: null,
      busType:     null,
      rowLayouts:  [],
      seatTypes:   [],
      labelScheme: 'num_letter',
      rowsPerFloor: [10],
      name:  '',
      plate: '',
    }
  })

  const [floors, setFloors]           = useState(() => initialVehicle ? initialVehicle.floors : [])
  const [activeFloor, setActiveFloor] = useState(0)

  const steps      = useSteps(form.busType)
  const floorCount = form.busType === 'double_decker' ? 2 : 1
  const currentId  = steps[step]?.id

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function setPerFloor(arrKey, floorIdx, val) {
    setForm(f => {
      const arr = [...(f[arrKey] || [])]
      arr[floorIdx] = val
      return { ...f, [arrKey]: arr }
    })
  }

  function buildFloors() {
    const rows = form.rowsPerFloor.length === floorCount
      ? form.rowsPerFloor
      : Array(floorCount).fill(form.rowsPerFloor[0] || 10)
    setFloors(rows.map((rowCount, fi) => {
      const rowLayout = form.rowLayouts?.[fi] || '2+2'
      const seatType  = form.seatTypes?.[fi]  || 'conventional'
      return { rowLayout, seatType, rows: generateRows(rowCount, rowLayout, form.labelScheme || 'num_letter') }
    }))
  }

  function handleFloorChange(floorIdx, updated) {
    setFloors(prev => prev.map((f, i) => i === floorIdx ? updated : f))
  }

  function canNext() {
    switch (currentId) {
      case 'type':          return !!form.vehicleType
      case 'config':        return !!form.busType
      case 'row_layout_0':  return !!(form.rowLayouts?.[0])
      case 'seat_type_0':   return !!(form.seatTypes?.[0])
      case 'row_layout_1':  return !!(form.rowLayouts?.[1])
      case 'seat_type_1':   return !!(form.seatTypes?.[1])
      case 'layout':        return form.rowsPerFloor.slice(0, floorCount).every(r => r >= 1 && r <= 30)
      case 'label_scheme':  return !!(form.labelScheme)
      case 'seats':         return true
      case 'id':            return form.name.trim().length > 0
      default:              return false
    }
  }

  function next() {
    if (currentId === 'label_scheme') buildFloors()
    setStep(s => s + 1)
  }

  function back() {
    if (step === 0) onBack()
    else setStep(s => s - 1)
  }

  function save() {
    onSave({
      ...(initialVehicle || {}),
      id:          initialVehicle?.id || crypto.randomUUID(),
      vehicleType: form.vehicleType,
      busType:     form.busType,
      rowLayouts:  form.rowLayouts,
      seatTypes:   form.seatTypes,
      labelScheme: form.labelScheme,
      rowsPerFloor: form.rowsPerFloor,
      name:        form.name,
      plate:       form.plate,
      floors,
      totalSeats:  countExisting(floors),
      createdAt:   initialVehicle?.createdAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    })
  }

  const floorLabel = (i) => i === 0 ? '1º Andar' : '2º Andar'

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <button className="wizard-back-btn" onClick={back}>←</button>
          <span className="wizard-step-label">{steps[step]?.label}</span>
          <div className="wizard-progress">
            {steps.map((_, i) => <div key={i} className={`wizard-dot ${i <= step ? 'active' : ''}`} />)}
          </div>
        </div>

        <div className="wizard-body">
          {currentId === 'type' && (
            <StepVehicleType value={form.vehicleType} onChange={v => { set('vehicleType', v); set('busType', null); set('rowLayouts', []); set('seatTypes', []) }} />
          )}
          {currentId === 'config' && (
            <StepBusConfig form={form} set={(k, v) => { set(k, v); set('rowLayouts', []); set('seatTypes', []) }} />
          )}
          {currentId === 'row_layout_0' && (
            <StepRowLayout floorLabel={form.busType === 'double_decker' ? floorLabel(0) : null} value={form.rowLayouts?.[0] || null} onChange={v => setPerFloor('rowLayouts', 0, v)} />
          )}
          {currentId === 'seat_type_0' && (
            <StepSeatType floorLabel={form.busType === 'double_decker' ? floorLabel(0) : null} value={form.seatTypes?.[0] || null} onChange={v => setPerFloor('seatTypes', 0, v)} />
          )}
          {currentId === 'row_layout_1' && (
            <StepRowLayout floorLabel={floorLabel(1)} value={form.rowLayouts?.[1] || null} onChange={v => setPerFloor('rowLayouts', 1, v)} />
          )}
          {currentId === 'seat_type_1' && (
            <StepSeatType floorLabel={floorLabel(1)} value={form.seatTypes?.[1] || null} onChange={v => setPerFloor('seatTypes', 1, v)} />
          )}
          {currentId === 'layout' && <StepLayout form={form} set={set} floorCount={floorCount} />}
          {currentId === 'label_scheme' && (
            <StepLabelScheme value={form.labelScheme} onChange={v => set('labelScheme', v)} rowLayout={form.rowLayouts?.[0] || '2+2'} />
          )}
          {currentId === 'seats' && (
            <StepSeatEditor floors={floors} activeFloor={activeFloor} onFloorChange={handleFloorChange} onFloorTabChange={setActiveFloor} />
          )}
          {currentId === 'id' && <StepIdentification form={form} set={set} floors={floors} />}
        </div>

        <div className="wizard-footer">
          {step < steps.length - 1 ? (
            <button className="submit-btn" onClick={next} disabled={!canNext()}>Continuar</button>
          ) : (
            <button className="submit-btn" onClick={save} disabled={!canNext()}>
              {initialVehicle ? 'Salvar Alterações' : 'Salvar Veículo'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
