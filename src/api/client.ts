import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseConfig } from '../lib/env'

// Offentlige verdier (samme som alle nettlesere ser). Brukes som reserve hvis miljøvariablene mangler eller er ødelagt.
const FALLBACK = {
  url: 'https://pthpjpxfbfvgoqkqxotj.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0aHBqcHhmYmZ2Z29xa3F4b3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0NTY3ODksImV4cCI6MjExMDAzMjc4OX0.rNd7qbcafvq6H9sJSr4NnvbVhnix0GaozGXV5MzbTNc',
}
const cfg = resolveSupabaseConfig(
  { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY },
  FALLBACK,
)
export const SUPABASE_URL: string = cfg.url
export const SUPABASE_ANON_KEY: string = cfg.key

if (cfg.usedFallback.url || cfg.usedFallback.key) {
  console.warn('Ugyldige/manglende VITE_SUPABASE_*-variabler, bruker innebygd reserve (se .env.example)')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
