import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import Avatar from './Avatar'

export default function ProfilePanel({ session, profile, onUpdate, onLogout, onClose }) {
  const [editing,   setEditing]   = useState(false)
  const [name,      setName]      = useState(profile?.display_name || '')
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const fileRef = useRef()

  const displayName = profile?.display_name || ''
  const planActive  = profile?.plan_active ?? false

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const ext  = file.name.split('.').pop().toLowerCase()
      const path = `${session.user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('motora-avatars')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('motora-avatars').getPublicUrl(path)
      const url = data.publicUrl + '?t=' + Date.now()
      const { error: dbErr } = await supabase.from('motora_profiles').upsert(
        { id: session.user.id, photo_url: url, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      if (dbErr) throw dbErr
      onUpdate({ ...profile, photo_url: url })
    } catch {
      setError('Erro ao enviar foto. Verifique se o bucket "motora-avatars" foi criado no Supabase Storage.')
    }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('motora_profiles').upsert(
      { id: session.user.id, display_name: name.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )
    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    onUpdate({ ...profile, display_name: name.trim() || null })
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="profile-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="profile-panel">
        <div className="profile-panel-header">
          <span className="profile-panel-title">Meu Perfil</span>
          <button className="profile-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Avatar */}
        <div className="profile-avatar-area">
          <div className="profile-avatar-wrap">
            <Avatar name={displayName || session.user.email} photoUrl={profile?.photo_url} size={80} />
            <button
              className="profile-photo-btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Trocar foto"
            >
              {uploading ? '…' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>
        </div>

        {/* Plan badge */}
        <div className={`profile-plan-badge ${planActive ? 'active' : ''}`}>
          {planActive ? '✓ Plano Ativo' : 'Sem plano ativo'}
        </div>

        {error && <div className="profile-error">{error}</div>}

        {/* Info / edit form */}
        {editing ? (
          <div className="profile-form">
            <label className="profile-label">Nome</label>
            <input
              className="profile-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <div className="profile-form-btns">
              <button className="profile-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button className="profile-cancel-btn" onClick={() => { setEditing(false); setName(profile?.display_name || '') }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-info">
            <div className="profile-display-name">
              {displayName || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Nome não definido</span>}
            </div>
            <div className="profile-email">{session.user.email}</div>
            <button className="profile-edit-btn" onClick={() => { setEditing(true); setName(profile?.display_name || '') }}>
              Editar perfil
            </button>
          </div>
        )}

        <div className="profile-footer">
          <button className="profile-logout-btn" onClick={onLogout}>Sair da conta</button>
        </div>
      </div>
    </div>
  )
}
