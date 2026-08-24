import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import SplashScreen from './components/SplashScreen'

export default function App() {
  const [session,         setSession]         = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [splashDone,      setSplashDone]      = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Show splash until both session check is done AND splash timer finishes
  const showSplash = !splashDone || checkingSession

  if (showSplash) {
    return (
      <SplashScreen onDone={() => setSplashDone(true)} />
    )
  }

  return (
    <div className={`app-shell${session ? ' app-shell--nav' : ''}`}>
      {session ? (
        <Dashboard session={session} onLogout={() => setSession(null)} />
      ) : (
        <Auth onAuthSuccess={(newSession) => setSession(newSession)} />
      )}
    </div>
  )
}
