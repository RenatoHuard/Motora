import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (checkingSession) {
    return <div className="app-shell" />
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
