import { ApiError, supabase } from './client'
import type {
  Competition, CompetitionStatus, Entry, FeedbackRow, FeedbackTarget, GuessOption, Id, Item, MyFeedback, Office, Profile, Results,
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
  let q = supabase.from('konk_competitions').select('id,slug,title,kind,status').order('title')
  if (!includeDraft) q = q.neq('status', 'draft')
  return check(await q) as Competition[]
}
export async function getCompetition(slug: string) {
  return check(
    await supabase.from('konk_competitions').select('id,slug,title,kind,status').eq('slug', slug).maybeSingle(),
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
    await supabase.from('konk_entries').select('id,user_id,item_id,score,guess_option_id,comment').eq('user_id', userId).in('item_id', itemIds),
  ) as Entry[]
}
export async function saveEntry(e: { user_id: Id; item_id: Id; score: number; guess_option_id: Id | null; comment: string | null }) {
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
export async function saveCompetition(c: { id?: Id; slug: string; title: string; kind: string; status: CompetitionStatus }) {
  const { id, ...rest } = c
  if (id) check(await supabase.from('konk_competitions').update(rest).eq('id', id))
  else check(await supabase.from('konk_competitions').insert(rest))
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
export interface ModEntry { id: Id; item_id: Id; user_id: Id; score: number; comment: string | null; hidden: boolean }
export async function listCommentEntries(itemIds: Id[]) {
  if (!itemIds.length) return [] as ModEntry[]
  return check(
    await supabase.from('konk_entries').select('id,item_id,user_id,score,comment,hidden').in('item_id', itemIds).not('comment', 'is', null).neq('comment', ''),
  ) as ModEntry[]
}
export async function setEntryHidden(id: Id, hidden: boolean) {
  check(await supabase.from('konk_entries').update({ hidden }).eq('id', id))
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
