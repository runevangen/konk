import { ApiError, supabase } from './client'

export interface QuizPlayer { name: string; office: string; host: boolean; me: boolean }
export interface RankRow { name: string; office: string; points: number; correct: number; me: boolean }
export interface OfficeRow { office: string; players: number; points: number; avg: number | null; correct: number }

/** Tilstanden serveren gir ved hvert kall. Fasit-feltene finnes bare i fasit-fasen. */
export interface QuizState {
  error?: 'not_found' | 'not_member' | 'question_missing'
  code: string
  status: 'lobby' | 'playing' | 'finished'
  theme: string | null
  is_host: boolean
  is_player: boolean
  n_questions: number
  seconds: number
  reveal_seconds: number
  players: QuizPlayer[]
  // playing
  nr?: number
  phase?: 'countdown' | 'question' | 'answer'
  question?: string
  options?: string[]
  left_ms?: number
  answered?: boolean
  n_answered?: number
  n_players?: number
  // answer-fasen
  correct_index?: number
  explanation?: string
  mine?: { choice: number; correct: boolean; points: number } | null
  ranking?: RankRow[]
  offices?: OfficeRow[]
}

export type JoinResult = { ok: true; code: string } | { error: 'not_found' | 'started' | 'full' | 'too_many' }

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await supabase.rpc(fn, args)
  if (r.error) throw new ApiError('db', 0, r.error.message)
  return r.data as T
}

export const quizThemes = () => rpc<{ theme: string; n: number }[]>('konk_quiz_themes')
export const quizMyRooms = () => rpc<{ code: string; status: string; theme: string | null; created_at: string; players: number }[]>('konk_quiz_my_rooms')
export const quizCreate = (o: { theme: string | null; count: number; seconds: number; reveal: number; hostPlays: boolean }) =>
  rpc<{ ok: true; code: string }>('konk_quiz_room_create', { p_theme: o.theme, p_count: o.count, p_seconds: o.seconds, p_reveal: o.reveal, p_host_plays: o.hostPlays })
export const quizJoin = (code: string) => rpc<JoinResult>('konk_quiz_room_join', { p_code: code })
export const quizState = (code: string) => rpc<QuizState>('konk_quiz_room_state', { p_code: code })
export const quizAnswer = (code: string, nr: number, choice: number) => rpc<{ ok: true }>('konk_quiz_room_answer', { p_code: code, p_nr: nr, p_choice: choice })
export const quizStart = (code: string) => rpc<{ ok: true }>('konk_quiz_room_start', { p_code: code })
export const quizSkip = (code: string) => rpc<{ ok: true }>('konk_quiz_room_skip', { p_code: code })
export const quizClose = (code: string) => rpc<{ ok: true }>('konk_quiz_room_close', { p_code: code })
