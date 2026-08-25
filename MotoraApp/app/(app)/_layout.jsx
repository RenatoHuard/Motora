import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Motora', headerShown: false }} />
      <Stack.Screen name="trip/[id]" options={{ title: 'Navegação', headerShown: false }} />
    </Stack>
  )
}
