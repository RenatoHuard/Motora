import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { AuthProvider, useAuth } from '../src/context/AuthContext'

function RootGuard() {
  const { session } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (session === undefined) return // still loading

    const inAuth = segments[0] === '(auth)'
    if (!session && !inAuth) router.replace('/(auth)/')
    if (session && inAuth) router.replace('/(app)/')
  }, [session, segments])

  return null
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootGuard />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  )
}
