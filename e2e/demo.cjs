// Playwright-test mot `vite preview` med mocket Supabase-nettverk (backend ikke nødvendig).
// Kjør: npm run build && npx vite preview --port 4173 &  node e2e/run.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = path.join(__dirname, '..', 'docs', 'demo')
fs.mkdirSync(SHOTS, { recursive: true })

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-4111-8111-111111111111'
const jwt = (admin) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800, email: 'x@konk.invalid' })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'x@konk.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = () => ({ access_token: jwt(), refresh_token: 'r', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user })

const COMP = { id: 'c1', slug: 'julebrustest', title: 'Julebrustesten 2026', kind: 'brus', status: 'open', live_board: true, live_board_names: false }
const ITEMS = ['Glass 1', 'Glass 2', 'Glass 3', 'Glass 4', 'Glass 5', 'Glass 6'].map((l, i) => ({ id: `i${i + 1}`, competition_id: 'c1', position: i + 1, label: l, image_path: null }))
const OPTIONS = ['Mineralvann', 'Julebrus A', 'Julebrus B', 'Solo', 'Pepsi Jul'].map((l, i) => ({ id: `o${i + 1}`, competition_id: 'c1', label: l }))
const RESULTS = {
  overall: { avg: 6.7, n_entries: 48, participants: 8, hit_rate: 0.42 },
  offices: [
    { office_id: 'of1', name: 'Oslo', avg_score: 6.9, n_entries: 30, participants: 5, hit_rate: 0.47 },
    { office_id: 'of2', name: 'Stavanger', avg_score: 6.4, n_entries: 18, participants: 3, hit_rate: 0.33 },
  ],
  items: ITEMS.map((it, i) => ({
    item_id: it.id, position: it.position, label: it.label, avg_score: [7.8, 5.2, 8.4, 4.1, 6.9, 7.8][i], n: 8,
    by_office: [{ office_id: 'of1', name: 'Oslo', avg_score: 7.1, n: 5 }, { office_id: 'of2', name: 'Stavanger', avg_score: 6.2, n: 3 }],
    correct_option_id: 'o2', correct_label: ['Julebrus A', 'Solo', 'Pepsi Jul', 'Mineralvann', 'Julebrus B', 'Julebrus A'][i], hit_rate: [0.5, 0.25, 0.75, 0.38, 0.4, 0.5][i],
  })),
  comments: [
    { item_id: 'i3', comment: 'Myk, krydret og skikkelig juletid!', display_name: 'Kari', office_name: 'Oslo', score: 9 },
    { item_id: 'i3', comment: 'Litt for søt for meg.', display_name: null, office_name: 'Stavanger', score: 7 },
  ],
}

function makeBackend(state) {
  return async (route) => {
    const req = route.fulfill ? route.request() : null
    const url = new URL(req.url())
    const p = url.pathname
    const q = url.searchParams
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    state.calls.push(`${req.method()} ${p}${url.search}`)
    if (p.endsWith('/functions/v1/konk-admin')) {
      const b = req.postDataJSON()
      state.adminCalls = state.adminCalls || []
      state.adminCalls.push(b)
      if (b.action === 'delete_user' && state.profileList) state.profileList = state.profileList.filter((x) => x.id !== b.user_id)
      return json(b.action === 'reset_pin' ? { pin: '654123' } : { ok: true })
    }
    if (p.endsWith('/functions/v1/konk-auth')) {
      const b = req.postDataJSON()
      if (b.action === 'change_pin') {
        state.pinChange = b
        if (b.old_pin !== '123456') return json({ error: 'invalid_pin' }, 401)
        return json({ ok: true })
      }
      if (b.action === 'register') { state.registered = b; return json({ pin: '482915', session: session() }) }
      if (b.pin === '123456' && String(b.display_name || '').trim().toLowerCase() === 'kari') return json({ session: session() })
      return json({ error: 'invalid_pin' }, 401)
    }
    if (p === '/auth/v1/user') return json(user)
    const eq = (k) => (q.get(k) || '').replace(/^eq\./, '')
    const single = (rows) => ((req.headers()['accept'] || '').includes('object+json') ? json(rows[0] ?? null) : json(rows))
    if (p.endsWith('/rest/v1/konk_offices')) return json([{ id: 'of1', name: 'Oslo' }, { id: 'of2', name: 'Stavanger' }])
    if (p.endsWith('/rest/v1/konk_profiles')) {
      if (req.method() === 'PATCH') { state.profilePatch = req.postDataJSON(); return json([]) }
      if (state.profileList && !q.get('id')) return json(state.profileList)
      return single([{ id: UID, display_name: 'Kari Nordmann', office_id: 'of1', anonymous: false, is_admin: !!state.admin }])
    }
    if (p.endsWith('/rest/v1/konk_competitions')) {
      const c = { ...COMP, status: state.status, live_board: state.liveOff ? false : true, live_board_names: !!state.names }
      if (q.get('slug')) return single(eq('slug') === c.slug ? [c] : [])
      return json([c])
    }
    if (state.quiz && p.endsWith('/rest/v1/konk_quiz_questions')) {
      const Qz = state.quiz
      const m = req.method()
      const ids = () => { const v = q.get('id') || ''; const mm = v.match(/^in\.\((.*)\)$/); return mm ? mm[1].split(',') : [v.replace('eq.', '')] }
      const key = (r) => (r.theme.trim().toLowerCase() + '|' + r.question.trim().toLowerCase())
      if (m === 'GET') return json(Qz.rows)
      if (m === 'POST') {
        const body = req.postDataJSON(); const list = Array.isArray(body) ? body : [body]
        const have = new Set(Qz.rows.map(key)); const mine = new Set()
        for (const r of list) { const k = key(r); if (have.has(k) || mine.has(k)) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409); mine.add(k) }
        for (const r of list) { Qz.rows.push({ id: 'qz' + (++Qz.n), hidden: false, created_at: '2026-12-01T10:00:00Z', ...r }); Qz.ops.push(['+', r.question]) }
        return json([], 201)
      }
      if (m === 'PATCH') { const b = req.postDataJSON(); for (const r of Qz.rows) if (ids().includes(r.id)) Object.assign(r, b); Qz.ops.push(['~', ids().join(',')]); return json([]) }
      if (m === 'DELETE') { Qz.rows = Qz.rows.filter((r) => !ids().includes(r.id)); Qz.ops.push(['-', ids().join(',')]); return json([]) }
    }
    if (state.glass) {
      const G = state.glass
      const m = req.method()
      const idq = (q.get('id') || '').replace('eq.', '')
      if (p.endsWith('/rest/v1/konk_items')) {
        if (m === 'GET') return json(G.items.slice().sort((a, b) => a.position - b.position))
        if (m === 'POST') { const b = req.postDataJSON(); const row = { id: 'ni' + b.position, image_path: null, ...b }; G.items.push(row); G.ops.push(['item+', b.position]); return json([row], 201) }
        if (m === 'PATCH') { const it = G.items.find((x) => x.id === idq); Object.assign(it, req.postDataJSON()); G.ops.push(['item~', idq]); return json([it]) }
        if (m === 'DELETE') { G.items = G.items.filter((x) => x.id !== idq); G.ops.push(['item-', idq]); return json([]) }
      }
      if (p.endsWith('/rest/v1/konk_item_answers')) {
        if (m === 'GET') return json(Object.entries(G.answers).map(([item_id, correct_option_id]) => ({ item_id, correct_option_id })))
        if (m === 'POST') { const b = req.postDataJSON(); G.answers[b.item_id] = b.correct_option_id; G.ops.push(['ans', b.item_id, b.correct_option_id]); return json([], 201) }
        if (m === 'DELETE') { const iid = (q.get('item_id') || '').replace('eq.', ''); delete G.answers[iid]; G.ops.push(['ans-', iid]); return json([]) }
      }
      if (p.endsWith('/rest/v1/konk_guess_options')) {
        if (m === 'GET') return json(G.options)
        if (m === 'POST') { const b = req.postDataJSON(); const row = { id: 'no' + (G.options.length + 1), competition_id: 'c1', ...b }; G.options.push(row); G.ops.push(['opt+', b.label]); return json([row], 201) }
      }
    }
    if (p.endsWith('/rest/v1/konk_items')) {
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': `0-0/${ITEMS.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } })
      return json(ITEMS)
    }
    if (p.endsWith('/rest/v1/konk_guess_options')) return json(OPTIONS)
    if (p.endsWith('/rest/v1/konk_entries')) {
      if (req.method() === 'DELETE') {
        const idq = (q.get('id') || '').replace('eq.', ''), uq = (q.get('user_id') || '').replace('eq.', '')
        state.deletes = state.deletes || []
        const hit = Object.entries(state.entries).filter(([, e]) => (idq && e.id === idq) || (!idq && uq && e.user_id === uq) || (!idq && !uq))
        for (const [k, e] of hit) { delete state.entries[k]; state.deletes.push(e.id) }
        return json(hit.map(([, e]) => ({ id: e.id })))
      }
      if (req.method() === 'POST') { const b = req.postDataJSON(); state.saves.push(b); state.entries[b.item_id] = { id: 'e' + b.item_id, ...b }; return json([], 201) }
      return json(Object.values(state.entries))
    }
    if (state.qz && p.includes('/rpc/konk_quiz_')) {
      const Q = state.qz
      const fn = p.split('/rpc/')[1]
      const b = req.method() === 'POST' ? req.postDataJSON() : {}
      Q.calls.push(fn + ' ' + JSON.stringify(b))
      if (fn === 'konk_quiz_themes') return json([{ theme: 'jul', n: 30 }])
      if (fn === 'konk_quiz_my_rooms') return json(Q.myRooms || [])
      if (fn === 'konk_quiz_room_create') { Q.state = Q.lobby(); return json({ ok: true, code: 'ABCD' }) }
      if (fn === 'konk_quiz_room_join') return json(b.p_code === 'ABCD' ? { ok: true, code: 'ABCD' } : { error: 'not_found' })
      if (fn === 'konk_quiz_room_start') { Q.state = Q.question(); return json({ ok: true }) }
      if (fn === 'konk_quiz_room_skip') { Q.state = Q.state.phase === 'question' ? Q.answer() : Q.finished(); return json({ ok: true }) }
      if (fn === 'konk_quiz_room_answer') { Q.answers.push(b); Q.state = { ...Q.state, answered: true, n_answered: 2 }; return json({ ok: true }) }
      if (fn === 'konk_quiz_room_close') { Q.closed = true; return json({ ok: true }) }
      if (fn === 'konk_quiz_room_state') return json(Q.closed ? { error: 'not_found' } : Q.state)
    }
    if (p.endsWith('/rpc/konk_my_progress')) return json(Object.keys(state.entries).length)
    if (p.endsWith('/rpc/konk_live_board')) {
      if (state.liveOff) return json({ message: 'live_off' }, 400)
      state.liveCalls = (state.liveCalls || 0) + 1
      const bump = state.liveCalls > 1 ? 1 : 0
      const off = (id, name, a, n, h = 0, g = 0) => ({ office_id: id, name, avg_score: a, n, hits: h, guesses: g, hit_rate: g >= 2 ? h / g : null })
      return json({
        status: state.status, min_n: 2, names: !!state.names, updated_at: '2026-12-01T10:00:00Z',
        overall: { n_entries: 7 + bump, participants: 3, avg: 7.2, hits: 3, guesses: 7, hit_rate: 3 / 7 },
        offices: [
          { office_id: 'of1', name: 'Oslo', avg_score: 7.8, n_entries: 4, participants: 2, hits: 3, guesses: 4, hit_rate: 0.75 },
          { office_id: 'of2', name: 'Stavanger', avg_score: null, n_entries: 1, participants: 1, hits: 0, guesses: 1, hit_rate: null },
        ],
        items: [
          { item_id: 'i1', position: 1, label: 'Glass 1', brus: state.names ? 'Ringnes' : null, avg_score: 6.5 + bump, n: 3, hits: 1, guesses: 3, hit_rate: 1 / 3, by_office: [off('of1', 'Oslo', 7, 2, 1, 2), off('of2', 'Stavanger', null, 1, 0, 1)] },
          { item_id: 'i2', position: 2, label: 'Glass 2', brus: state.names ? 'Askim' : null, avg_score: 8.25, n: 4, hits: 2, guesses: 4, hit_rate: 0.5, by_office: [off('of1', 'Oslo', 8.5, 3, 2, 3), off('of2', 'Stavanger', null, 1, 0, 1)] },
        ],
        people: [
          { name: 'Kari', office_id: 'of1', office_name: 'Oslo', hits: 2, guesses: 2, answered: 2 },
          { name: 'Anonym', office_id: 'of1', office_name: 'Oslo', hits: 1, guesses: 2, answered: 2 },
          { name: 'Ola', office_id: 'of2', office_name: 'Stavanger', hits: 0, guesses: 1, answered: 1 },
        ],
        people_min: 3,
      })
    }
    if (p.endsWith('/rpc/konk_results')) return state.status === 'closed' || state.admin ? json(RESULTS) : json({ message: 'not_closed' }, 400)
    if (p.endsWith('/rpc/konk_get_feedback')) return json(state.feedback.map((f) => ({ ...f, display_name: 'Kari', office_name: 'Oslo', created_at: '2026-12-01T10:00:00Z' })))
    if (p.endsWith('/rest/v1/konk_feedback')) {
      if (req.method() === 'POST') { const b = req.postDataJSON(); const row = { id: 'f' + (state.feedback.length + 1), ...b }; state.feedback.push(row); return json([], 201) }
      if (req.method() === 'DELETE') { state.feedback = state.feedback.filter((f) => f.id !== eq('id')); return json([]) }
      return json(state.feedback.filter((f) => f.user_id === UID))
    }
    return json({ message: 'mock: ' + p }, 404)
  }
}

async function newPage(browser, state, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts })
  await ctx.route(/pthpjpxfbfvgoqkqxotj\.supabase\.co/, makeBackend(state))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return { ctx, page, errors }
}
const freshState = (over = {}) => ({ status: 'open', admin: false, entries: {}, saves: [], feedback: [], calls: [], ...over })
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') })

;(async () => {
  const browser = await chromium.launch()
  const FN = ['Kari','Ola','Nina','Per','Ine','Jon','Siri','Atle','Mona','Lars','Tone','Geir','Hilde','Rune','Eva','Knut','Anne','Stein','Live','Odd']
  const LN = ['Hansen','Berg','Nilsen','Larsen','Olsen','Dahl','Moe','Lie','Aas','Strand']
  const pl = Array.from({ length: 100 }, (_, i) => ({ name: i === 46 ? 'Kari Nordmann' : `${FN[i % 20]} ${LN[Math.floor(i / 10) % 10]}`, office: i % 2 ? 'Stavanger' : 'Oslo', host: false, me: i === 46 }))
  const rk = pl.map((p, i) => ({ name: i % 9 === 0 ? 'Anonym' : p.name, office: p.office, points: Math.max(0, 780 - i * 8), correct: Math.max(0, 5 - Math.floor(i / 22)), me: p.me }))
  const of = [{ office: 'Oslo', players: 50, points: 19800, avg: 396, correct: 120 }, { office: 'Stavanger', players: 50, points: 18900, avg: 378, correct: 112 }]
  const base = { code: 'JULX', theme: 'jul', n_questions: 5, seconds: 30, reveal_seconds: 7, is_host: false, is_player: true }
  const q = { nr: 2, question: 'Hvilket land kommer julenissen fra, ifølge flest tradisjoner?', options: ['Norge', 'Finland', 'Island', 'Sverige'] }
  const S = {
    lobby: { ...base, status: 'lobby', players: pl },
    question: { ...base, status: 'playing', players: pl, ...q, phase: 'question', left_ms: 21000, answered: false, n_answered: 63, n_players: 100 },
    answered: { ...base, status: 'playing', players: pl, ...q, phase: 'question', left_ms: 14000, answered: true, n_answered: 88, n_players: 100 },
    answer: { ...base, status: 'playing', players: pl, ...q, phase: 'answer', left_ms: 5000, correct_index: 1, explanation: 'Mange mener Korvatunturi i Finland er julenissens hjem.', mine: { choice: 0, correct: false, points: 0 }, ranking: rk, offices: of, answered: true, n_answered: 100, n_players: 100 },
    finished: { ...base, status: 'finished', players: pl, ranking: rk, offices: of },
  }
  const state = freshState({ admin: true })
  state.qz = { calls: [], answers: [], myRooms: [{ code: 'JULX', status: 'lobby', theme: 'jul', created_at: '2026-12-01T10:00:00Z', players: 100 }], state: S.lobby }
  state.qz.lobby = () => S.lobby; state.qz.question = () => S.question
  const full = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true })
  const go = async (page, key, name, wait) => { state.qz.state = S[key]; await page.reload(); await page.getByTestId(wait).first().waitFor({ timeout: 8000 }); await page.waitForTimeout(300); await full(page, name) }

  // --- Telefon: spiller ---
  {
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor(); await full(page, '01-forside')
    await page.goto(BASE + '/quiz'); await page.getByLabel('Romkode').waitFor(); await full(page, '02-quiz-bli-med')
    await page.goto(BASE + '/quiz/ny'); await page.getByRole('heading', { name: 'Nytt quiz-rom' }).waitFor(); await full(page, '03-nytt-rom')
    await page.goto(BASE + '/quiz/JULX')
    await page.getByTestId('quiz-kode').waitFor(); await page.waitForTimeout(300); await full(page, '04-spiller-lobby-100')
    await go(page, 'question', '05-spiller-sporsmal', 'quiz-sporsmal')
    await go(page, 'answered', '06-spiller-svar-sendt', 'quiz-sendt')
    await go(page, 'answer', '07-spiller-fasit-topp5-og-meg', 'quiz-forklaring')
    await go(page, 'finished', '08-spiller-ferdig-alle-100', 'quiz-ferdig')
    // vertsvisning
    for (const [k, n] of [['lobby', '09-vert-lobby'], ['question', '10-vert-sporsmal']]) { S[k] = { ...S[k], is_host: true }; await go(page, k, n, k === 'lobby' ? 'quiz-kode' : 'quiz-sporsmal') }
    await ctx.close()
  }
  // --- Storskjerm (projektor 1280x720) ---
  {
    for (const k of ['lobby', 'question', 'answer', 'finished']) S[k] = { ...S[k], is_host: true, is_player: false }
    const { ctx, page } = await newPage(browser, state, { viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false })
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    for (const [k, n, w] of [['lobby', '11-skjerm-lobby-100', 'skjerm-kode'], ['question', '12-skjerm-sporsmal', 'skjerm-sporsmal'], ['answer', '13-skjerm-fasit', 'skjerm-sporsmal'], ['finished', '14-skjerm-pall', 'skjerm-pall']]) {
      state.qz.state = S[k]; await page.goto(BASE + '/quiz/JULX/skjerm'); await page.getByTestId(w).waitFor({ timeout: 8000 }); await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); console.log(n, await page.evaluate(() => document.documentElement.scrollHeight))
    }
    await ctx.close()
  }
  await browser.close(); console.log('ferdig')
})().catch((e) => { console.error('FEIL', e); process.exit(1) })
