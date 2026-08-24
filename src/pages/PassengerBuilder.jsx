import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import Avatar from '../components/Avatar'

// ── DiceBear preset avatars (adventurer style, free, no API key) ──
// dicebear.com — generates consistent illustrated characters by seed

const AVATAR_PRESETS = [
  'Bubba', 'Felix', 'Luna', 'Oliver', 'Milo', 'Zoe',
  'Sasha', 'Cleo', 'Bandit', 'Boots', 'Midnight', 'Oscar',
  'Buster', 'Loki', 'Nova', 'Pepper',
]

function presetUrl(seed) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
}

// ── Photo section sub-component ───────────────────────

function PhotoSection({ photoUrl, name, onChange }) {
  const [tab, setTab] = useState(() => {
    // If current photoUrl is a dicebear URL, start on preset tab
    return photoUrl?.includes('dicebear.com') ? 'preset' : 'url'
  })

  return (
    <div className="photo-section">
      <div className="photo-section-preview">
        <Avatar name={name || '?'} photoUrl={photoUrl} size={72} />
      </div>

      <div className="photo-section-tabs">
        <button
          className={`photo-tab-btn ${tab === 'preset' ? 'active' : ''}`}
          onClick={() => setTab('preset')}
        >
          Avatares
        </button>
        <button
          className={`photo-tab-btn ${tab === 'url' ? 'active' : ''}`}
          onClick={() => setTab('url')}
        >
          URL
        </button>
      </div>

      {tab === 'preset' && (
        <div className="avatar-preset-grid">
          {/* "Sem avatar" option */}
          <button
            className={`avatar-preset-cell none-cell ${!photoUrl ? 'selected' : ''}`}
            onClick={() => onChange('')}
            title="Sem avatar"
          >
            <span style={{ fontSize: 22, opacity: 0.35 }}>?</span>
          </button>

          {AVATAR_PRESETS.map(seed => {
            const url      = presetUrl(seed)
            const selected = photoUrl === url
            return (
              <button
                key={seed}
                className={`avatar-preset-cell ${selected ? 'selected' : ''}`}
                onClick={() => onChange(url)}
                title={seed}
              >
                <img src={url} alt={seed} width={44} height={44} />
              </button>
            )
          })}
        </div>
      )}

      {tab === 'url' && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>URL da foto</label>
          <input
            type="url"
            placeholder="https://…"
            value={photoUrl}
            onChange={e => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────

export default function PassengerBuilder({ passenger, lines, vehicles, assignments, onBack, onSave }) {
  const existingAssignment = (assignments || [])[0] || null

  const [form, setForm] = useState({
    name:     passenger?.name     || '',
    email:    passenger?.email    || '',
    phone:    passenger?.phone    || '',
    photoUrl: passenger?.photoUrl || '',
    type:     passenger?.type     || 'avulso',
  })

  const [fixedLineId,    setFixedLineId]    = useState(existingAssignment?.lineId    || '')
  const [fixedSeatLabel, setFixedSeatLabel] = useState(existingAssignment?.seatLabel || '')
  const [seatLabels,     setSeatLabels]     = useState([])
  const [loadingSeats,   setLoadingSeats]   = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!fixedLineId) { setSeatLabels([]); return }
    const line    = (lines || []).find(l => l.id === fixedLineId)
    const vehicle = line ? (vehicles || []).find(v => v.id === line.vehicleId) : null
    if (!vehicle) { setSeatLabels([]); return }
    setLoadingSeats(true)
    Promise.all([
      supabase.from('motora_seats').select('label, floor_num, row_num, col_idx')
        .eq('vehicle_id', vehicle.id).eq('seat_exists', true),
      supabase.from('motora_line_passengers').select('seat_label, passenger_id')
        .eq('line_id', fixedLineId),
    ]).then(([{ data: seats }, { data: lps }]) => {
      const taken = new Set(
        (lps || [])
          .filter(lp => lp.passenger_id !== (passenger?.id || ''))
          .map(lp => lp.seat_label)
          .filter(Boolean)
      )
      const available = (seats || [])
        .filter(s => !taken.has(s.label))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
        .map(s => ({ label: s.label, display: s.floor_num > 0 ? `${s.label} (2º andar)` : s.label }))
      setSeatLabels(available)
      setLoadingSeats(false)
    })
  }, [fixedLineId])

  function save() {
    onSave({
      ...(passenger || {}),
      id:             passenger?.id || crypto.randomUUID(),
      name:           form.name.trim(),
      email:          form.email.trim()    || null,
      phone:          form.phone.trim()    || null,
      photoUrl:       form.photoUrl.trim() || null,
      type:           form.type,
      fixedLineId:    form.type === 'fixo' ? (fixedLineId || null) : null,
      fixedSeatLabel: form.type === 'fixo' ? (fixedSeatLabel || null) : null,
      prevFixedLineId: existingAssignment?.lineId || null,
      createdAt:      passenger?.createdAt || new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
    })
  }

  const selectedLine = (lines || []).find(l => l.id === fixedLineId)
  const lineVehicle  = selectedLine ? (vehicles || []).find(v => v.id === selectedLine.vehicleId) : null

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <div className="wizard-header">
          <button className="wizard-back-btn" onClick={onBack}>←</button>
          <span className="wizard-step-label">{passenger ? 'Editar Passageiro' : 'Novo Passageiro'}</span>
        </div>

        <div className="wizard-body">
          {/* Tipo */}
          <div className="passenger-type-toggle" style={{ marginBottom: 16 }}>
            <button className={`type-toggle-btn ${form.type === 'avulso' ? 'active' : ''}`}
              onClick={() => set('type', 'avulso')}>Avulso</button>
            <button className={`type-toggle-btn ${form.type === 'fixo' ? 'active' : ''}`}
              onClick={() => set('type', 'fixo')}>Fixo</button>
          </div>

          {/* Foto / Avatar */}
          <PhotoSection
            photoUrl={form.photoUrl}
            name={form.name}
            onChange={v => set('photoUrl', v)}
          />

          <div className="field">
            <label>Nome *</label>
            <input type="text" placeholder="Nome completo" value={form.name}
              onChange={e => set('name', e.target.value)} autoFocus={!passenger} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" placeholder="email@exemplo.com" value={form.email}
              onChange={e => set('email', e.target.value)} />
          </div>
          <div className="field">
            <label>Telefone</label>
            <input type="tel" placeholder="(11) 99999-9999" value={form.phone}
              onChange={e => set('phone', e.target.value)} />
          </div>

          {/* Fixo: linha + poltrona */}
          {form.type === 'fixo' && (
            <div className="passenger-fixed-section">
              <div className="passenger-trips-title">Linha e Poltrona Fixa</div>

              <div className="field" style={{ marginBottom: 10 }}>
                <label>Linha / Fretado</label>
                {(lines || []).length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0' }}>
                    Nenhuma linha cadastrada. Cadastre uma linha primeiro.
                  </p>
                ) : (
                  <select value={fixedLineId}
                    onChange={e => { setFixedLineId(e.target.value); setFixedSeatLabel('') }}
                    style={{ width: '100%', padding: '9px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }}>
                    <option value="">— Selecione uma linha —</option>
                    {(lines || []).map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}{l.origin && l.destination ? ` (${l.origin} → ${l.destination})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {fixedLineId && (
                <>
                  {lineVehicle && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                      🚌 {lineVehicle.name} · {lineVehicle.totalSeats} lugares
                    </div>
                  )}
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>
                      Poltrona
                      {loadingSeats && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> (carregando…)</span>}
                      {!loadingSeats && seatLabels.length > 0 && (
                        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> — {seatLabels.length} disponíve{seatLabels.length === 1 ? 'l' : 'is'}</span>
                      )}
                    </label>
                    {seatLabels.length > 0 ? (
                      <select value={fixedSeatLabel} onChange={e => setFixedSeatLabel(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }}>
                        <option value="">— Sem poltrona fixa —</option>
                        {seatLabels.map(s => (
                          <option key={s.label} value={s.label}>{s.display}</option>
                        ))}
                      </select>
                    ) : !loadingSeats ? (
                      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0' }}>
                        Todas as poltronas desta linha já estão atribuídas.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Avulso: atribuições existentes */}
          {form.type === 'avulso' && (assignments || []).length > 0 && (
            <div className="passenger-trips-section">
              <div className="passenger-trips-title">Viagens Atribuídas</div>
              {(assignments || []).map((a, i) => (
                <div key={i} className="passenger-trip-row">
                  <span className="passenger-trip-route">{a.lineId ? '🔁 Linha' : '🗺️ Viagem'}</span>
                  <span className="passenger-trip-seat">{a.seatLabel ? `Poltrona ${a.seatLabel}` : 'Sem poltrona'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wizard-footer">
          <button className="submit-btn" onClick={save} disabled={!form.name.trim()}>
            {passenger ? 'Salvar Alterações' : 'Cadastrar Passageiro'}
          </button>
        </div>
      </div>
    </div>
  )
}
