import { useState } from 'react'

// ── Layout por número de colunas por lado ──────────────

export const ROW_LAYOUT_COLS = {
  '2+2': { left: ['A', 'B'], right: ['C', 'D'] },
  '1+2': { left: ['A'],      right: ['B', 'C'] },
  '1+1': { left: ['A'],      right: ['B'] },
}

// ── Geração de rótulo por esquema ──────────────────────

export function computeSeatLabel(scheme, row, col, side, colIdx, rowIdx, leftLen, rightLen) {
  switch (scheme) {
    case 'letter_num':
      return `${col}${row}`
    case 'sequential_left': {
      const perRow = leftLen + rightLen
      return side === 'left'
        ? String(rowIdx * perRow + colIdx + 1)
        : String(rowIdx * perRow + leftLen + colIdx + 1)
    }
    case 'sequential_right': {
      const perRow = leftLen + rightLen
      return side === 'right'
        ? String(rowIdx * perRow + colIdx + 1)
        : String(rowIdx * perRow + rightLen + colIdx + 1)
    }
    case 'odd_even': {
      if (side === 'right') {
        const n = rowIdx * rightLen + colIdx + 1
        return String(2 * n - 1)            // 1, 3, 5…
      } else {
        // conta do lado do corredor (último índice) para a janela
        const aisleFirst = leftLen - 1 - colIdx
        const n = rowIdx * leftLen + aisleFirst + 1
        return String(2 * n)                // 2, 4, 6…
      }
    }
    case 'num_letter':
    default:
      return `${row}${col}`
  }
}

export function makeSeat(label, exists = true) {
  return { id: crypto.randomUUID(), label, exists, active: true }
}

export function createRow(leftCount, rightCount, rowNum, layout) {
  const { left, right } = layout
  return {
    rowId: crypto.randomUUID(),
    leftSeats:  left.map((col, i) => makeSeat(`${rowNum}${col}`, i >= left.length - leftCount)),
    rightSeats: right.map((col, i) => makeSeat(`${rowNum}${col}`, i < rightCount)),
  }
}

export function generateRows(rowCount, rowLayout, labelScheme = 'num_letter') {
  const layout = ROW_LAYOUT_COLS[rowLayout] || ROW_LAYOUT_COLS['2+2']
  const { left, right } = layout
  return Array.from({ length: rowCount }, (_, rowIdx) => {
    const r = rowIdx + 1
    return {
      rowId: crypto.randomUUID(),
      leftSeats:  left.map((col, ci)  => makeSeat(computeSeatLabel(labelScheme, r, col, 'left',  ci, rowIdx, left.length, right.length))),
      rightSeats: right.map((col, ci) => makeSeat(computeSeatLabel(labelScheme, r, col, 'right', ci, rowIdx, left.length, right.length))),
    }
  })
}

export function countExisting(floors) {
  return floors.reduce((s, fl) =>
    s + fl.rows.reduce((rs, row) =>
      rs + row.leftSeats.filter(x => x.exists).length
         + row.rightSeats.filter(x => x.exists).length, 0), 0)
}

// ── Seat cell ──────────────────────────────────────────

function SeatCell({ seat, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function commit() {
    const val = draft.trim().toUpperCase().slice(0, 3)
    onUpdate({ label: val || seat.label })
    setEditing(false)
  }

  if (!seat.exists) {
    return (
      <button className="seat-gap" onClick={() => onUpdate({ exists: true })} title="Adicionar poltrona">+</button>
    )
  }
  if (editing) {
    return (
      <input
        className="seat-cell-input"
        value={draft}
        maxLength={3}
        autoFocus
        onChange={e => setDraft(e.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
      />
    )
  }
  return (
    <div className="seat-wrapper">
      <button className="seat-cell active" onClick={() => { setDraft(seat.label); setEditing(true) }} title="Renomear">
        {seat.label}
      </button>
      <button className="seat-remove-btn" onClick={() => onUpdate({ exists: false })}>×</button>
    </div>
  )
}

// ── Insert zone ────────────────────────────────────────

function InsertZone({ isActive, onTrigger }) {
  return (
    <div className={`row-insert-zone ${isActive ? 'zone-active' : ''}`} onClick={onTrigger}>
      <div className="row-insert-line" />
      <button className="row-insert-btn" tabIndex={-1}>+</button>
    </div>
  )
}

function SidePicker({ label, value, max, onChange }) {
  return (
    <div className="add-row-side">
      <span>{label}</span>
      {Array.from({ length: max + 1 }, (_, n) => (
        <button key={n} className={`count-btn ${value === n ? 'selected' : ''}`} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  )
}

// ── Main floor editor ──────────────────────────────────

export default function FloorSeatEditor({ floor, onFloorChange }) {
  const layout   = ROW_LAYOUT_COLS[floor.rowLayout] || ROW_LAYOUT_COLS['2+2']
  const maxLeft  = layout.left.length
  const maxRight = layout.right.length

  const [insertAt,    setInsertAt]    = useState(null)
  const [appendOpen,  setAppendOpen]  = useState(false)
  const [leftCount,   setLeftCount]   = useState(maxLeft)
  const [rightCount,  setRightCount]  = useState(maxRight)

  function updateFloor(rows) { onFloorChange({ ...floor, rows }) }

  function updateSeat(rowIdx, side, seatIdx, patch) {
    updateFloor(floor.rows.map((row, ri) => {
      if (ri !== rowIdx) return row
      const key = side === 'left' ? 'leftSeats' : 'rightSeats'
      return { ...row, [key]: row[key].map((s, si) => si === seatIdx ? { ...s, ...patch } : s) }
    }))
  }

  function removeRow(rowIdx) { updateFloor(floor.rows.filter((_, i) => i !== rowIdx)) }

  function openInsert(idx) {
    setInsertAt(idx); setAppendOpen(false)
    setLeftCount(maxLeft); setRightCount(maxRight)
  }

  function commitInsert() {
    const rowNum = (insertAt ?? floor.rows.length) + 1
    const newRow = createRow(leftCount, rightCount, rowNum, layout)
    const rows = [...floor.rows]
    rows.splice(insertAt, 0, newRow)
    updateFloor(rows)
    setInsertAt(null)
  }

  function commitAppend() {
    const rowNum = floor.rows.length + 1
    updateFloor([...floor.rows, createRow(leftCount, rightCount, rowNum, layout)])
    setAppendOpen(false)
  }

  function cancelForm() { setInsertAt(null); setAppendOpen(false) }

  const totalExisting = floor.rows.reduce((s, r) =>
    s + r.leftSeats.filter(x => x.exists).length + r.rightSeats.filter(x => x.exists).length, 0)

  const formOpen    = insertAt !== null || appendOpen
  const insertLabel = insertAt === 0 ? 'Inserir na frente'
    : insertAt != null ? `Inserir após fileira ${insertAt}`
    : 'Adicionar ao Final'

  return (
    <div>
      <div className="bus-front">🚌 Frente do veículo</div>

      <div className="seat-grid-v2">
        <InsertZone isActive={insertAt === 0} onTrigger={() => openInsert(0)} />

        {floor.rows.map((row, rowIdx) => (
          <div key={row.rowId}>
            <div className="seat-row-v2">
              <div className="seat-side">
                {row.leftSeats.map((seat, si) => (
                  <SeatCell key={seat.id} seat={seat} onUpdate={p => updateSeat(rowIdx, 'left', si, p)} />
                ))}
              </div>
              <div className="seat-aisle" />
              <div className="seat-side">
                {row.rightSeats.map((seat, si) => (
                  <SeatCell key={seat.id} seat={seat} onUpdate={p => updateSeat(rowIdx, 'right', si, p)} />
                ))}
              </div>
              <button className="row-delete-btn" onClick={() => removeRow(rowIdx)} title="Remover fileira">×</button>
            </div>
            <InsertZone isActive={insertAt === rowIdx + 1} onTrigger={() => openInsert(rowIdx + 1)} />
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="add-row-form">
          <div className="add-row-form-title">{insertLabel}</div>
          <div className="add-row-controls">
            <SidePicker label="Esquerda" value={leftCount}  max={maxLeft}  onChange={setLeftCount} />
            <SidePicker label="Direita"  value={rightCount} max={maxRight} onChange={setRightCount} />
          </div>
          <div className="add-row-actions">
            <button className="btn-sm primary" onClick={appendOpen ? commitAppend : commitInsert} disabled={leftCount === 0 && rightCount === 0}>
              {appendOpen ? 'Adicionar' : 'Inserir'}
            </button>
            <button className="btn-sm secondary" onClick={cancelForm}>Cancelar</button>
          </div>
        </div>
      )}

      {!formOpen && (
        <button className="add-row-trigger" onClick={() => { setAppendOpen(true); setLeftCount(maxLeft); setRightCount(maxRight) }}>
          + Adicionar Fileira ao Final
        </button>
      )}

      <div className="seat-editor-footer">
        {totalExisting} poltrona{totalExisting !== 1 ? 's' : ''} neste andar
      </div>
    </div>
  )
}
