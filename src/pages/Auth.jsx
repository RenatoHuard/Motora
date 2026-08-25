import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth({ onAuthSuccess }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'error' | 'success', text: string }

  function resetMessage() {
    setMessage(null)
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    resetMessage()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    resetMessage()

    if (!email || !password) {
      setMessage({ type: 'error', text: 'Preencha email e senha.' })
      return
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'A senha precisa ter pelo menos 6 caracteres.' })
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      setLoading(false)

      if (error) {
        setMessage({ type: 'error', text: translateError(error.message) })
        return
      }

      if (data.user && !data.session) {
        setMessage({
          type: 'success',
          text: 'Cadastro criado. Verifique seu email para confirmar a conta antes de entrar.',
        })
        return
      }

      onAuthSuccess?.(data.session)
      return
    }

    // login
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: translateError(error.message) })
      return
    }

    onAuthSuccess?.(data.session)
  }

  return (
    <div className="auth-card">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Motora</span>
      </div>
      <p className="auth-subtitle">
        {mode === 'login' ? 'Entre com sua conta.' : 'Crie sua conta para começar.'}
      </p>

      <div className="tab-row">
        <button
          type="button"
          className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
          onClick={() => switchMode('login')}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => switchMode('signup')}
        >
          Cadastrar
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? (
            <span className="gauge-dots">
              <span />
              <span />
              <span />
            </span>
          ) : mode === 'login' ? (
            'Entrar'
          ) : (
            'Criar conta'
          )}
        </button>
      </form>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="auth-apk-row">
        <span className="auth-apk-label">Prefere o app nativo?</span>
        <a href="#" className="auth-apk-btn" onClick={e => e.preventDefault()} title="Em breve">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M17.523 15.341 14.55 12l2.973-3.341A1 1 0 0 0 16.78 7H7.22a1 1 0 0 0-.743 1.659L9.45 12l-2.973 3.341A1 1 0 0 0 7.22 17h9.56a1 1 0 0 0 .743-1.659z"/>
            <path d="M5 2h14M5 22h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Baixar APK
          <span className="auth-apk-badge">em breve</span>
        </a>
      </div>
    </div>
  )
}

function translateError(msg) {
  const map = {
    'Invalid login credentials': 'Email ou senha incorretos.',
    'User already registered': 'Este email já está cadastrado.',
    'Email not confirmed': 'Confirme seu email antes de entrar.',
  }
  return map[msg] || msg
}
