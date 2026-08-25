import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://ugfzarhpjfmvyrnquztg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZnphcmhwamZtdnlybnF1enRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDQyNTQsImV4cCI6MjEwMDgyMDI1NH0.MAXdOb0eb607yugDD909-rDSgZEM53lgbejEDGqRugw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
