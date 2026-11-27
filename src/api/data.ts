import { ApiError, supabase } from './client'
import type { QuizQuestionInput } from '../lib/quizImport'
import type {
  QuizQuestion, LiveBoard, Competition, CompetitionStatus, Entry, FeedbackRow, FeedbackTarget, GuessOption, Id, Item, MyFeedback, Office, Profile, Results,
} from './types'

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new ApiError('db', 0, r.error.message)
  return r.data as T
}

// ---- lesing (deltaker) ----
export async function listOffices() {
  return check(await supabase.from('konk_offices').select('id,name').order('name')) as Office[]
}
export async function getProfile(userId: Id) {
  return check(
    await supabase.from('konk_profiles').select('id,display_name,office_id,anonymous,is_admin').eq('id', userId).maybeSingle(),
  ) as Profile | null
}
export async function updateProfile(userId: Id, patch: { display_name: string; anonymous: boolean }) {
  const r = await supabase.from('konk_profiles').update(patch).eq('id', userId)
  if (r.error?.code === '23505') throw new ApiError('name_taken', 409)
  check(r)
}
export async function listCompetitions(includeDraft = false) {
  let q = supabase.from('konk_competitions').select('id,slug,title,kind,status,live_board,live_board_names,visible,sort_order,code').order('sort_order').order('title')
  if (!includeDraft) q = q.neq('status', 'draft')
  return check(await q) as Competition[]
}
export async function getCompetition(slug: string) {
  return check(
    await supabase.from('konk_competitions').select('id,slug,title,kind,status,live_board,live_board_names,visible,sort_order,code').eq('slug', slug).maybeSingle(),
  ) as Competition | null
}
export async function listItems(competitionId: Id) {
  return check(
    await supabase.from('konk_items').select('id,competition_id,position,label,image_path').eq('competition_id', competitionId).order('position'),
  ) as Item[]
}
export async function listOptions(competitionId: Id) {
  return check(
    await supabase.from('konk_guess_options').select('id,competition_id,label').eq('competition_id', competitionId).order('label'),
  ) as GuessOption[]
}
export async function listMyEntries(userId: Id, itemIds: Id[]) {
  if (!itemIds.length) return [] as Entry[]
  return check(
    await supabase.from('konk_entries').select('id,user_id,item_id,score,guess_option_id,comment,tags').eq('user_id', userId).in('item_id', itemIds),
  ) as Entry[]
}
export async function saveEntry(e: { user_id: Id; item_id: Id; score: number; guess_option_id: Id | null; comment: string | null; tags: string[] }) {
  check(await supabase.from('konk_entries').upsert(e, { onConflict: 'user_id,item_id' }))
}
export async function myProgress(competitionId: Id) {
  const n = check(await supabase.rpc('konk_my_progress', { p_competition: competitionId }))
  return Number(n ?? 0)
}
export async function countItems(competitionId: Id) {
  const r = await supabase.from('konk_items').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId)
  if (r.error) throw new ApiError('db', 0, r.error.message)
  return r.count ?? 0
}

// ---- resultater og feedback ----
export async function getResults(competitionId: Id) {
  const r = await supabase.rpc('konk_results', { p_competition: competitionId })
  if (r.error) throw new ApiError(r.error.message.includes('not_closed') ? 'not_closed' : 'db', 0, r.error.message)
  return r.data as Results
}
export async function getLiveBoard(competitionId: Id) {
  const r = await supabase.rpc('konk_live_board', { p_competition: competitionId })
  if (r.error) throw new ApiError(r.error.message.includes('live_off') ? 'live_off' : 'db', 0, r.error.message)
  return r.data as LiveBoard
}
export async function getFeedback(competitionId: Id) {
  return check(await supabase.rpc('konk_get_feedback', { p_competition: competitionId })) as FeedbackRow[]
}
export async function listMyFeedback(userId: Id, competitionId: Id) {
  return check(
    await supabase.from('konk_feedback').select('id,competition_id,item_id,target,emoji,comment').eq('user_id', userId).eq('competition_id', competitionId),
  ) as MyFeedback[]
}
export async function addFeedback(f: {
  user_id: Id; competition_id: Id; item_id: Id | null; target: FeedbackTarget; emoji: string | null; comment: string | null
}) {
  check(await supabase.from('konk_feedback').insert(f))
}
export async function deleteFeedback(id: Id) {
  check(await supabase.from('konk_feedback').delete().eq('id', id))
}

// ---- admin ----
export async function saveCompetition(c: { id?: Id; slug: string; title: string; kind: string; status: CompetitionStatus; live_board: boolean; live_board_names: boolean }) {
  const { id, ...rest } = c
  if (id) check(await supabase.from('konk_competitions').update(rest).eq('id', id))
  else check(await supabase.from('konk_competitions').insert(rest))
}
/** Bli med i en konkurranse med den korte koden. Kontoen husker det, så koden trengs ikke igjen (også for konkurranser som er skjult fra forsiden). Null hvis koden ikke finnes. */
export async function joinCompetitionByCode(code: string) {
  return check(await supabase.rpc('konk_join_by_code', { p_code: code })) as { slug: string; title: string; status: CompetitionStatus } | null
}
/** Admin: gi konkurransen en ny kode. */
export async function regenCompetitionCode(id: Id) {
  return check(await supabase.rpc('konk_regen_comp_code', { p_id: id })) as string
}
/** Skjul eller vis en konkurranse for alle andre enn admin. */
export async function setCompetitionVisible(id: Id, visible: boolean) {
  check(await supabase.from('konk_competitions').update({ visible }).eq('id', id))
}
/** Lagre rekkefølgen på forsiden: bare rader hvis plass er endret skrives. */
export async function saveCompetitionOrder(order: { id: Id; sort_order: number }[]) {
  await Promise.all(order.map((o) => supabase.from('konk_competitions').update({ sort_order: o.sort_order }).eq('id', o.id).then(check)))
}
/** Sletter konkurransen med glass, fasit, svar og kommentarer (cascade i databasen). Kan ikke angres. */
export async function deleteCompetition(id: Id) {
  check(await supabase.from('konk_competitions').delete().eq('id', id))
}
export async function saveItem(i: { id?: Id; competition_id: Id; position: number; label: string }) {
  const { id, ...rest } = i
  if (id) check(await supabase.from('konk_items').update(rest).eq('id', id))
  else check(await supabase.from('konk_items').insert(rest))
}
export async function deleteItem(id: Id) { check(await supabase.from('konk_items').delete().eq('id', id)) }
export async function addOption(competition_id: Id, label: string) {
  check(await supabase.from('konk_guess_options').insert({ competition_id, label }))
}
export async function deleteOption(id: Id) { check(await supabase.from('konk_guess_options').delete().eq('id', id)) }
export async function listAnswers(itemIds: Id[]) {
  if (!itemIds.length) return [] as { item_id: Id; correct_option_id: Id }[]
  return check(await supabase.from('konk_item_answers').select('item_id,correct_option_id').in('item_id', itemIds)) as {
    item_id: Id; correct_option_id: Id
  }[]
}
export async function setAnswer(item_id: Id, correct_option_id: Id | null) {
  if (!correct_option_id) check(await supabase.from('konk_item_answers').delete().eq('item_id', item_id))
  else check(await supabase.from('konk_item_answers').upsert({ item_id, correct_option_id }, { onConflict: 'item_id' }))
}
export async function listProfiles() {
  return check(
    await supabase.from('konk_profiles').select('id,display_name,office_id,anonymous,is_admin').order('display_name'),
  ) as Profile[]
}
export interface ModEntry { id: Id; item_id: Id; user_id: Id; score: number; comment: string | null; hidden: boolean; featured: boolean }
export async function listCommentEntries(itemIds: Id[]) {
  if (!itemIds.length) return [] as ModEntry[]
  return check(
    await supabase.from('konk_entries').select('id,item_id,user_id,score,comment,hidden,featured').in('item_id', itemIds).not('comment', 'is', null).neq('comment', ''),
  ) as ModEntry[]
}
export async function setEntryHidden(id: Id, hidden: boolean) {
  check(await supabase.from('konk_entries').update({ hidden }).eq('id', id))
}
/** «Dagens sitat»: ett per glass. Fjerner alle andre på samme glass først, så det aldri er to. */
export async function setEntryFeatured(itemId: Id, entryId: Id, featured: boolean) {
  check(await supabase.from('konk_entries').update({ featured: false }).eq('item_id', itemId).eq('featured', true))
  if (featured) check(await supabase.from('konk_entries').update({ featured: true }).eq('id', entryId))
}
export interface ModFeedback {
  id: Id; user_id: Id; item_id: Id | null; target: FeedbackTarget; emoji: string | null; comment: string | null; hidden: boolean
}
export async function listAllFeedback(competitionId: Id) {
  return check(
    await supabase.from('konk_feedback').select('id,user_id,item_id,target,emoji,comment,hidden').eq('competition_id', competitionId),
  ) as ModFeedback[]
}
export async function setFeedbackHidden(id: Id, hidden: boolean) {
  check(await supabase.from('konk_feedback').update({ hidden }).eq('id', id))
}

// ---- admin: slett svar ----
export interface AdminEntry { id: Id; item_id: Id; user_id: Id; score: number | null; guess_option_id: Id | null; comment: string | null; hidden: boolean }
export async function listCompetitionEntries(itemIds: Id[]) {
  if (!itemIds.length) return [] as AdminEntry[]
  return check(
    await supabase.from('konk_entries').select('id,item_id,user_id,score,guess_option_id,comment,hidden').in('item_id', itemIds),
  ) as AdminEntry[]
}
/** Sletter ett svar. Kaster hvis ingenting ble slettet (f.eks. manglende tilgang). */
export async function deleteEntry(id: Id) {
  const r = await supabase.from('konk_entries').delete().eq('id', id).select('id')
  const rows = check(r) as { id: Id }[]
  if (!rows.length) throw new ApiError('not_deleted', 403, 'Svaret ble ikke slettet (mangler tilgang).')
}
/** Sletter alle svar og tilbakemeldinger fra én bruker i én konkurranse. Returnerer antall slettede svar. */
export async function deleteUserAnswers(userId: Id, competitionId: Id, itemIds: Id[]) {
  const fb = await supabase.from('konk_feedback').delete().eq('user_id', userId).eq('competition_id', competitionId)
  check(fb)
  if (!itemIds.length) return 0
  const r = await supabase.from('konk_entries').delete().eq('user_id', userId).in('item_id', itemIds).select('id')
  return (check(r) as { id: Id }[]).length
}
/** Nullstiller en konkurranse: sletter ALLE svar og tilbakemeldinger. Returnerer antall slettede svar. */
export async function deleteAllAnswers(competitionId: Id, itemIds: Id[]) {
  check(await supabase.from('konk_feedback').delete().eq('competition_id', competitionId))
  if (!itemIds.length) return 0
  const r = await supabase.from('konk_entries').delete().in('item_id', itemIds).select('id')
  return (check(r) as { id: Id }[]).length
}

// ---- quiz: spørsmålsbank (kun admin; RLS) ----
const QUIZ_COLS = 'id,theme,category,difficulty,question,options,correct,explanation,source,hidden,created_at,source_level,review_status,review_note'
export async function listQuizQuestions() {
  return check(await supabase.from('konk_quiz_questions').select(QUIZ_COLS).order('theme').order('created_at').order('id')) as QuizQuestion[]
}
const toRow = (q: QuizQuestionInput, userId: Id | null, hidden = false) => ({
  theme: q.theme.trim(), category: q.category, difficulty: q.difficulty, question: q.question.trim(), options: q.options.map((o) => o.trim()),
  correct: q.correct, explanation: q.explanation, source: q.source, created_by: userId, hidden,
  source_level: q.sourceLevel, review_status: q.reviewStatus, review_note: q.reviewNote,
})
/** Setter inn spørsmål i bunter. Feiler en bunt, prøves radene én og én, så vi kan si nøyaktig hvilke som ble avvist. */
export async function insertQuizQuestions(items: { line: number; q: QuizQuestionInput; hidden?: boolean }[], userId: Id | null) {
  const failed: { line: number; message: string }[] = []
  let inserted = 0
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50)
    const r = await supabase.from('konk_quiz_questions').insert(chunk.map((c) => toRow(c.q, userId, c.hidden)))
    if (!r.error) { inserted += chunk.length; continue }
    for (const c of chunk) {
      const one = await supabase.from('konk_quiz_questions').insert(toRow(c.q, userId, c.hidden))
      if (one.error) failed.push({ line: c.line, message: one.error.code === '23505' ? 'Finnes allerede i dette temaet.' : one.error.message })
      else inserted++
    }
  }
  return { inserted, failed }
}
export async function updateQuizQuestion(id: Id, q: QuizQuestionInput & { hidden: boolean }) {
  const r = await supabase.from('konk_quiz_questions').update({
    theme: q.theme.trim(), category: q.category, difficulty: q.difficulty, question: q.question.trim(), options: q.options.map((o) => o.trim()),
    correct: q.correct, explanation: q.explanation, source: q.source, hidden: q.hidden,
    source_level: q.sourceLevel, review_status: q.reviewStatus, review_note: q.reviewNote,
  }).eq('id', id)
  if (r.error?.code === '23505') throw new ApiError('db', 0, 'Dette spørsmålet finnes allerede i temaet.')
  check(r)
}
export async function setQuizHidden(ids: Id[], hidden: boolean) {
  if (ids.length) check(await supabase.from('konk_quiz_questions').update({ hidden }).in('id', ids))
}
export async function deleteQuizQuestions(ids: Id[]) {
  if (ids.length) check(await supabase.from('konk_quiz_questions').delete().in('id', ids))
}
