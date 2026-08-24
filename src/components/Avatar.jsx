export default function Avatar({ name, photoUrl, size = 36 }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    )
  }
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase() || '?'

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--surface-2)',
      border: '2px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 700, color: 'var(--text-dim)',
      userSelect: 'none',
    }}>
      {initials}
    </div>
  )
}
