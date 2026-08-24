import { useEffect, useState } from 'react'

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('show') // 'show' | 'fade'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fade'), 1800)
    const t2 = setTimeout(() => onDone?.(),     2400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div className={`splash ${phase === 'fade' ? 'splash--fade' : ''}`}>
      <div className="splash-content">
        <img src="/logo.jpg" alt="Motora" className="splash-logo" />
        <div className="splash-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}
