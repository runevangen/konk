import { createClient } from '@supabase/supabase-js'
import { cleanEnv, cleanUrl } from '../lib/env'

export const SUPABASE_URL: string = cleanUrl(import.meta.env.VITE_SUPABASE_URL)
export const SUPABASE_ANON_KEY: string = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mangler (se .env.example)')
}

export const supabase = createClient(SUPABASE_URL || 'http://localhost:0', SUPABASE_ANON_KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, status = 0, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}
