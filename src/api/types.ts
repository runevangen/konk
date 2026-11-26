export type Id = string
export type CompetitionStatus = 'draft' | 'open' | 'closed'

export interface Office { id: Id; name: string }
export interface Competition { id: Id; slug: string; title: string; kind: string; status: CompetitionStatus; live_board: boolean; live_board_names: boolean }
export interface Item { id: Id; competition_id: Id; position: number; label: string; image_path: string | null }
export interface GuessOption { id: Id; competition_id: Id; label: string }
export interface Entry {
  id?: Id
  user_id: Id
  item_id: Id
  score: number
  guess_option_id: Id | null
  comment: string | null
  hidden?: boolean
}
export interface Profile { id: Id; display_name: string; office_id: Id | null; anonymous: boolean; is_admin: boolean }

export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  token_type: string
  user: { id: string; [k: string]: unknown }
}

export interface RegisterInput { display_name: string; office_id: Id; anonymous: boolean }

export interface ResultsOverall { avg: number | null; n_entries: number; participants: number; hit_rate: number | null }
export interface ResultsOffice { office_id: Id; name: string; avg_score: number | null; n_entries: number; participants: number; hit_rate: number | null }
export interface ResultsItemOffice { office_id: Id; name: string; avg_score: number | null; n: number }
export interface ResultsItem {
  item_id: Id; position: number; label: string; avg_score: number | null; n: number
  by_office: ResultsItemOffice[]
  correct_option_id: Id | null; correct_label: string | null; hit_rate: number | null
}
export interface ResultsComment { item_id: Id; comment: string; display_name: string | null; office_name: string; score: number }
export interface Results { overall: ResultsOverall; offices: ResultsOffice[]; items: ResultsItem[]; comments: ResultsComment[] }

export type FeedbackTarget = 'item' | 'result'
export interface FeedbackRow {
  id: Id; item_id: Id | null; target: FeedbackTarget; emoji: string | null; comment: string | null
  display_name: string | null; office_name: string; created_at: string
}
export interface MyFeedback {
  id: Id; competition_id: Id; item_id: Id | null; target: FeedbackTarget; emoji: string | null; comment: string | null
}

export interface LiveOffice { office_id: Id; name: string; avg_score: number | null; n_entries: number; participants: number; hits: number; guesses: number; hit_rate: number | null }
export interface LiveItemOffice { office_id: Id; name: string; avg_score: number | null; n: number; hits: number; guesses: number; hit_rate: number | null }
export interface LiveItem { item_id: Id; position: number; label: string; brus: string | null; avg_score: number | null; n: number; hits: number; guesses: number; hit_rate: number | null; by_office: LiveItemOffice[] }
export interface LivePerson { name: string; office_id: Id; office_name: string; hits: number; guesses: number; answered: number }
export interface LiveBoard {
  status: CompetitionStatus
  min_n: number
  names: boolean
  updated_at: string
  overall: { n_entries: number; participants: number; avg: number | null; hits: number; guesses: number; hit_rate: number | null }
  offices: LiveOffice[]
  items: LiveItem[]
  people: LivePerson[]
  people_min: number
}

export interface QuizQuestion {
  id: Id; theme: string; category: string | null; difficulty: string | null; question: string
  options: string[]; correct: number; explanation: string; source: string | null; hidden: boolean; created_at: string
}
