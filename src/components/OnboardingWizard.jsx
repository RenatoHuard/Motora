import { useState, useRef } from 'react'

// ── Feature explanation cards ──────────────────────────

const FEATURES = [
  {
    icon: '🚌',
    title: 'Veículos',
    desc: 'Cadastre seu ônibus, van ou micro-ônibus. Configure o layout real das poltronas por andar.',
  },
  {
    icon: '🔁',
    title: 'Linhas fixas',
    desc: 'Para fretados que se repetem. Defina horários, passageiros fixos e poltronas permanentes.',
  },
  {
    icon: '🗓️',
    title: 'Viagens avulsas',
    desc: 'Para corridas pontuais. Gerencie embarques e poltronas no momento da corrida.',
  },
  {
    icon: '👥',
    title: 'Passageiros',
    desc: 'Cadastre passageiros fixos ou avulsos com foto, contato e poltrona preferencial.',
  },
  {
    icon: '🗺️',
    title: 'GPS e Navegação',
    desc: 'Navegue pelo trajeto com GPS em tempo real, instruções passo a passo e mapa de satélite.',
  },
]

const CARD_WIDTH  = 168
const CARD_GAP    = 10
const CARD_STRIDE = CARD_WIDTH + CARD_GAP

export default function OnboardingWizard({ vehicles, lines, trips, userId, onOpenVehicle, onOpenLine, onOpenTrip }) {
  const [featIdx,    setFeatIdx]    = useState(0)
  const [dismissed,  setDismissed]  = useState(
    () => localStorage.getItem(`motora_ob_done_${userId}`) === '1'
  )
  const scrollRef = useRef(null)

  // Derive phase from data
  const hasVehicle = vehicles.length > 0
  const hasMore    = lines.length > 0 || trips.length > 0

  // Auto-dismiss once setup is complete
  if (hasVehicle && hasMore && !dismissed) {
    localStorage.setItem(`motora_ob_done_${userId}`, '1')
    // Don't set state here — render will re-check next cycle
  }

  function dismiss() {
    localStorage.setItem(`motora_ob_done_${userId}`, '1')
    setDismissed(true)
  }

  if (dismissed || (hasVehicle && hasMore)) return null

  function scrollTo(idx) {
    const clamped = Math.max(0, Math.min(FEATURES.length - 1, idx))
    setFeatIdx(clamped)
    scrollRef.current?.scrollTo({ left: clamped * CARD_STRIDE, behavior: 'smooth' })
  }

  // ── Welcome screen (no vehicle yet) ──────────────────
  if (!hasVehicle) {
    return (
      <div className="ob-root">
        <div className="ob-hero">
          <div className="ob-hero-mark" />
          <div className="ob-hero-title">Bem-vindo ao Motora</div>
          <div className="ob-hero-sub">Gerencie seu fretado de forma simples, do embarque ao GPS.</div>
        </div>

        <div className="ob-feat-label">O que você pode fazer</div>

        <div className="ob-feat-row">
          {/* Prev arrow */}
          <button
            className="ob-arrow-btn"
            onClick={() => scrollTo(featIdx - 1)}
            disabled={featIdx === 0}
            aria-label="Anterior"
          >
            ‹
          </button>

          {/* Cards */}
          <div className="ob-feat-scroll" ref={scrollRef}>
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={`ob-feat-card ${i === featIdx ? 'focused' : ''}`}
                onClick={() => scrollTo(i)}
              >
                <div className="ob-feat-icon">{f.icon}</div>
                <div className="ob-feat-title">{f.title}</div>
                <div className="ob-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Next arrow */}
          <button
            className="ob-arrow-btn"
            onClick={() => scrollTo(featIdx + 1)}
            disabled={featIdx === FEATURES.length - 1}
            aria-label="Próximo"
          >
            ›
          </button>
        </div>

        {/* Pip dots */}
        <div className="ob-feat-dots">
          {FEATURES.map((_, i) => (
            <div
              key={i}
              className={`ob-feat-pip ${i === featIdx ? 'active' : ''}`}
              onClick={() => scrollTo(i)}
            />
          ))}
        </div>

        <div className="ob-cta-area">
          <div className="ob-cta-hint">Vamos começar cadastrando seu veículo</div>
          <button className="ob-primary-btn" onClick={onOpenVehicle}>
            🚌 Cadastrar meu veículo
          </button>
        </div>
      </div>
    )
  }

  // ── After vehicle: ask about lines / trips ────────────
  return (
    <div className="ob-root">
      <div className="ob-steps">
        <div className="ob-step-dot done" />
        <div className="ob-step-dot active" />
        <div className="ob-step-dot" />
      </div>

      <div className="ob-check-row">
        <div className="ob-check-badge">✓</div>
        <div>
          <div className="ob-check-title">Veículo cadastrado!</div>
          <div className="ob-check-sub">Agora diga como você costuma trabalhar</div>
        </div>
      </div>

      <div className="ob-choice-grid">
        <button className="ob-choice-card" onClick={onOpenLine}>
          <span className="ob-choice-icon">🔁</span>
          <span className="ob-choice-label">Tenho fretados fixos</span>
          <span className="ob-choice-desc">Linhas que se repetem com passageiros regulares</span>
        </button>
        <button className="ob-choice-card" onClick={onOpenTrip}>
          <span className="ob-choice-icon">🗓️</span>
          <span className="ob-choice-label">Tenho viagens avulsas</span>
          <span className="ob-choice-desc">Corridas pontuais, sem recorrência fixa</span>
        </button>
        <button className="ob-choice-card both" onClick={onOpenLine}>
          <span className="ob-choice-icon">⚡</span>
          <span className="ob-choice-label">Tenho os dois</span>
          <span className="ob-choice-desc">Comece pelas linhas fixas e adicione viagens depois</span>
        </button>
      </div>

      <button className="ob-skip-btn" onClick={dismiss}>Configurar depois</button>
    </div>
  )
}
