// Playwright-test mot `vite preview` med mocket Supabase-nettverk (backend ikke nødvendig).
// Kjør: npm run build && npx vite preview --port 4173 &  node e2e/run.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots')
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
    if (state.comps && p.endsWith('/rest/v1/konk_competitions')) {
      const m = req.method()
      state.compCalls = state.compCalls || []
      if (m === 'PATCH') { const c = state.comps.find((x) => x.id === eq('id')); const b = req.postDataJSON(); Object.assign(c, b); state.compCalls.push(['PATCH', c.id, b]); return json([]) }
      if (m === 'DELETE') { state.compCalls.push(['DELETE', eq('id')]); state.comps = state.comps.filter((x) => x.id !== eq('id')); return json([]) }
      const rows = state.comps.filter((x) => state.admin || (x.visible && x.status !== 'draft')).sort((a, b) => a.sort_order - b.sort_order)
      if (q.get('slug')) return single(rows.filter((x) => x.slug === eq('slug')))
      return json(rows)
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
  const results = []
  const ok = (name) => { results.push(name); console.log('OK  ', name) }

  // --- Login + feil pin + registrering (pin vises én gang) ---
  {
    const state = freshState()
    const { ctx, page, errors } = await newPage(browser, state)
    await page.goto(BASE + '/')
    await page.waitForURL('**/login')
    await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('999999')
    await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByText('Feil navn eller pinkode').waitFor()
    await shot(page, '01-login')
    ok('login: feil pin gir feilmelding')

    await page.getByRole('link', { name: 'Ny bruker' }).click()
    await page.getByRole('heading', { name: 'Ny bruker' }).waitFor()
    await page.getByLabel('Navn', { exact: true }).fill('Kari Nordmann')
    await page.getByLabel('Kontor').selectOption('of1')
    await page.getByRole('button', { name: 'Opprett bruker' }).click()
    await page.getByTestId('pin').waitFor()
    assert.strictEqual(await page.getByTestId('pin').innerText(), '482915')
    assert.strictEqual(state.registered.anonymous, false)
    await shot(page, '02-registrer-pin')
    await page.getByRole('button', { name: 'Jeg har lagret koden – fortsett' }).click()
    await page.waitForURL(BASE + '/')
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    // pin skal være borte fra DOM, storage og URL
    assert.ok(!(await page.content()).includes('482915'), 'pin i DOM etter bekreftelse')
    const stored = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))
    assert.ok(!stored.includes('482915'), 'pin i storage')
    await page.reload()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    assert.ok(!(await page.content()).includes('482915'))
    ok('registrering: pin vises én gang, ikke i DOM/storage etter bekreftelse/reload; session persisteres')
    await shot(page, '03-hovedside')
    assert.deepStrictEqual(errors, [])
    await ctx.close()
  }

  // --- Login med riktig pin ---
  {
    const state = freshState()
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login')
    await page.locator('#name').fill('kari'); await page.locator('#pin').fill('123 456')
    await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    ok('login: riktig pin')
    await ctx.close()
  }

  // --- Stepper / autosave ---
  {
    const state = freshState()
    const { ctx, page, errors } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByRole('link', { name: /Julebrustesten/ }).click()
    await page.getByRole('heading', { name: /Glass 1 av 6/ }).waitFor()
    await page.getByLabel('Julebrus A', { exact: true }).check()           // gjetning før score
    await page.getByText('Velg en score for å lagre').waitFor()
    assert.strictEqual(state.saves.length, 0)
    await page.locator('.score-grid input[value=\"8\"]').check()
    await page.getByText('Lagret ✓').waitFor()
    assert.strictEqual(state.saves.at(-1).score, 8); assert.strictEqual(state.saves.at(-1).guess_option_id, 'o2')
    assert.strictEqual(state.saves.at(-1).user_id, UID)
    await page.getByLabel('Kommentar (valgfri)').fill('Fin og krydret')
    await page.getByText('Lagret ✓').waitFor({ timeout: 4000 })
    await page.waitForTimeout(1200)
    assert.strictEqual(state.saves.at(-1).comment, 'Fin og krydret')
    // kommentar + Neste uten å vente: flush
    await page.getByLabel('Kommentar (valgfri)').fill('Endret rett før neste')
    await page.getByRole('button', { name: 'Neste →' }).click()
    await page.getByRole('heading', { name: /Glass 2 av 6/ }).waitFor()
    await page.waitForTimeout(300)
    assert.strictEqual(state.saves.at(-1).comment, 'Endret rett før neste')
    ok('stepper: score/gjett/kommentar autosaves (upsert), flush ved Neste, gjetning uten score ber om score')
    // glass 3 for skjermbilde
    await page.getByRole('button', { name: 'Glass 3', exact: false }).first().click()
    await page.locator('.score-grid input[value=\"9\"]').check()
    await page.getByLabel('Pepsi Jul', { exact: true }).check()
    await page.getByLabel('Kommentar (valgfri)').fill('Skikkelig juletid!')
    await page.getByText('Lagret ✓').waitFor()
    await page.waitForTimeout(1200)
    await shot(page, '04-glass-stepper')
    await page.screenshot({ path: path.join(SHOTS, '04b-glass-stepper-full.png'), fullPage: true })
    // reload gjenoppretter
    await page.reload()
    await page.getByRole('heading', { name: /Glass 3 av 6/ }).waitFor()
    assert.strictEqual(await page.locator('.score-grid input[value="9"]').isChecked(), true)
    ok('stepper: valgt glass i URL og lagrede svar lastes igjen')
    // ingen horisontal scroll på mobil
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, 'horisontal scroll: ' + overflow)
    ok('mobil: ingen horisontal scroll i stepper')
    assert.deepStrictEqual(errors, [])
    await ctx.close()
  }

  // --- Mine svar: alt samlet, forside leder dit, endre-lenke, Ferdig leder dit ---
  {
    const state = freshState({ status: 'open', entries: {
      i1: { id: 'e1', user_id: UID, item_id: 'i1', score: 7, guess_option_id: 'o2', comment: 'Frisk og fin' },
      i3: { id: 'e3', user_id: UID, item_id: 'i3', score: 9, guess_option_id: null, comment: null },
    } })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    // snarvei til live tavle på forsiden (finnes ved siden av kortet, ikke inni lenken)
    const tavleLink = page.getByRole('link', { name: /Se live tavle/ })
    await tavleLink.waitFor()
    assert.strictEqual(await tavleLink.getAttribute('href'), '/k/julebrustest/tavle')
    await shot(page, '16-forside-snarvei')
    await page.getByText('Se og endre svarene dine').click()
    await page.getByRole('heading', { name: 'Mine svar' }).waitFor()
    await page.getByText('2 av 6 glass besvart').waitFor()
    const kort = page.getByTestId('rediger-kort')
    await kort.nth(5).waitFor()
    assert.strictEqual(await kort.nth(0).locator('.score-grid input[value="7"]').isChecked(), true)
    assert.strictEqual(await kort.nth(2).locator('.score-grid input[value="9"]').isChecked(), true)
    assert.strictEqual(await kort.nth(0).getByLabel('Gjetter på').inputValue(), 'o2')
    assert.strictEqual(await kort.nth(0).getByLabel(/Kommentar/).inputValue(), 'Frisk og fin')
    assert.strictEqual(await kort.nth(2).getByLabel('Gjetter på').inputValue(), '')
    assert.strictEqual(await page.getByText('ikke besvart', { exact: true }).count(), 4)
    await shot(page, '14-mine-svar')
    // ett trykk på et tall lagrer med en gang, uten «Endre» og uten mellomskjerm
    await kort.nth(0).locator('.score-grid label:has(input[value="4"])').click()
    await page.getByTestId('status-1').getByText('Lagret ✓').waitFor()
    assert.strictEqual(state.saves.at(-1).score, 4)
    // den nye verdien er det glass-for-glass-siden også viser
    await page.goto(BASE + '/k/julebrustest?glass=1')
    await page.getByRole('heading', { name: /Glass 1 av 6/ }).waitFor()
    assert.strictEqual(await page.locator('.score-grid input[value="4"]').isChecked(), true)
    ok('mine svar: alle svar redigerbare i oversikten, ett trykk lagrer, og glass-for-glass-siden viser siste versjon')
    await ctx.close()
  }

  // --- Robust valg: aldri to markerte tall/gjetninger, også ved raske trykk og hopping mellom glass ---
  {
    const state = freshState({ status: 'open' })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest')
    await page.getByRole('heading', { name: /Glass 1 av 6/ }).waitFor()
    const onScores = () => page.locator('.score-grid span.on').allInnerTexts()
    const onGuess = () => page.locator('.option-list span.on').allInnerTexts()
    const tap = (n) => page.locator(`.score-grid label:has(input[value="${n}"])`).click()
    // raske trykk uten pauser: bare siste gjelder
    for (const n of [1, 10, 3, 1, 10]) await tap(n)
    assert.deepStrictEqual(await onScores(), ['10'])
    // sett ulike verdier på alle glass, hopp frem og tilbake
    const values = [1, 10, 4, 7, 2, 9]
    for (let i = 0; i < 6; i++) {
      await page.getByRole('navigation', { name: 'Velg glass' }).getByRole('button', { name: new RegExp('^Glass ' + (i + 1)) }).click()
      await page.getByRole('heading', { name: new RegExp('Glass ' + (i + 1) + ' av 6') }).waitFor()
      await tap(values[i])
      await page.getByLabel('Julebrus A').check().catch(() => page.getByText('Julebrus A').click())
      assert.deepStrictEqual(await onScores(), [String(values[i])], `glass ${i + 1}: feil markering rett etter valg`)
    }
    for (const i of [5, 0, 3, 1, 4, 2, 5, 0]) {
      await page.getByRole('navigation', { name: 'Velg glass' }).getByRole('button', { name: new RegExp('^Glass ' + (i + 1)) }).click()
      await page.getByRole('heading', { name: new RegExp('Glass ' + (i + 1) + ' av 6') }).waitFor()
      assert.deepStrictEqual(await onScores(), [String(values[i])], `glass ${i + 1}: feil/flere markerte tall ved hopping`)
      assert.strictEqual((await onGuess()).length, 1, `glass ${i + 1}: nøyaktig én gjetting skal være markert`)
      assert.strictEqual(await page.locator('.score-grid input:checked').count(), 1, `glass ${i + 1}: nøyaktig ett avkrysset tall`)
    }
    // forrige/neste-knapper
    await page.getByRole('button', { name: 'Neste →' }).click()
    await page.getByRole('button', { name: 'Neste →' }).click()
    await page.getByRole('button', { name: '← Forrige' }).click()
    await page.getByRole('heading', { name: /Glass 2 av 6/ }).waitFor()
    const cur = Number((await page.getByRole('heading', { level: 2 }).first().innerText()).match(/Glass (\d) av/)[1])
    assert.deepStrictEqual(await onScores(), [String(values[cur - 1])])
    // og etter oppdatering av siden
    await page.reload()
    await page.getByRole('heading', { name: /Glass \d av 6/ }).waitFor()
    const cur2 = Number((await page.getByRole('heading', { level: 2 }).first().innerText()).match(/Glass (\d) av/)[1])
    assert.deepStrictEqual(await onScores(), [String(values[cur2 - 1])])
    ok('stepper: aldri to markerte tall/gjetninger (raske trykk, hopping, forrige/neste og reload)')
    await ctx.close()
  }

  // --- Låst + resultat ikke klart ---
  {
    const state = freshState({ status: 'closed', entries: { i1: { id: 'e1', user_id: UID, item_id: 'i1', score: 7, guess_option_id: 'o1', comment: 'ok' } } })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest')
    await page.getByText('Konkurransen er avsluttet').waitFor()
    assert.strictEqual(await page.locator('.score-grid input[value="5"]').isDisabled(), true)
    ok('stepper: låst når ikke open')

    // --- Resultatside ---
    await page.goto(BASE + '/k/julebrustest/resultat')
    await page.getByRole('heading', { name: /Resultat:/ }).waitFor()
    await page.locator('details.rank-item').first().locator('summary').click()
    await page.getByText('Myk, krydret').waitFor()
    await page.locator('details.rank-item').first().getByRole('button', { name: 'Digger' }).click()
    await page.waitForFunction(() => document.querySelector('details.rank-item[open] .react[aria-pressed=true]'))
    assert.strictEqual(state.feedback.length, 1); assert.strictEqual(state.feedback[0].target, 'item'); assert.strictEqual(state.feedback[0].item_id, 'i3')
    await page.locator('details.rank-item').first().getByRole('button', { name: 'Digger' }).click()
    await page.waitForFunction(() => !document.querySelector('details.rank-item[open] .react[aria-pressed=true]'))
    assert.strictEqual(state.feedback.length, 0)
    await page.locator('details.rank-item').first().getByRole('button', { name: 'Digger' }).click()
    await page.waitForFunction(() => document.querySelector('details.rank-item[open] .react[aria-pressed=true]'))
    await page.getByLabel('Kommentar til konkurransen').fill('Dette var gøy!')
    await page.getByRole('button', { name: 'Send' }).click()
    await page.getByText('Dette var gøy!').waitFor()
    assert.strictEqual(state.feedback.at(-1).target, 'result')
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, '05-resultat')
    await page.screenshot({ path: path.join(SHOTS, '05b-resultat-full.png'), fullPage: true })
    const first = await page.locator('details.rank-item .rank').first().innerText()
    assert.strictEqual(first, '1')
    assert.ok((await page.locator('details.rank-item .sum-main').first().innerText()).includes('Glass 3'))
    ok('resultat: rangering (beste først), fasit, kommentarer, reaksjoner (toggle) og resultatkommentar')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, 'horisontal scroll: ' + overflow)
    await ctx.close()
  }
  {
    // --- Live tavle: samlet + ett kontor, oppdaterer seg, skjuler snitt under minimum, ingen fasit ---
    const state = freshState({ status: 'open' })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest/tavle')
    await page.getByRole('heading', { name: 'Live tavle' }).waitFor()
    await page.getByRole('tab', { name: 'Samlet' }).waitFor()
    await page.getByRole('tab', { name: 'Oslo' }).waitFor()
    await page.getByRole('tab', { name: 'Stavanger' }).waitFor()
    // rangering: Glass 2 (8,25) er plass 1, Glass 1 (6,50) er plass 2
    const first = await page.locator('.bar-row strong').first().innerText()
    assert.strictEqual(first, 'Glass 2')
    await page.getByText('Plass 1').first().waitFor()
    assert.strictEqual(await page.locator('.bar-row strong').nth(1).innerText(), '8,25')
    await page.getByText('8,25').first().waitFor()
    await shot(page, '08-live-tavle-samlet')
    await page.getByRole('tab', { name: 'Stavanger' }).click()
    await page.getByText('venter').first().waitFor()
    assert.ok(!(await page.content()).includes('Safteriet'), 'fasit/brusnavn på tavlen')
    await page.getByRole('tab', { name: 'Oslo' }).click()
    await page.getByText('8,50').waitFor()
    await shot(page, '09-live-tavle-oslo')
    // rekkefølgen følger scoren i alle faner: snitt aldri stigende nedover, og uten snitt til slutt
    for (const tab of ['Samlet', 'Oslo', 'Stavanger']) {
      await page.getByRole('tab', { name: tab }).click()
      const avgs = await page.locator('[data-testid="tavle-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-avg')))
      const nums = avgs.filter((a) => a !== '').map(Number)
      assert.deepStrictEqual(nums, [...nums].sort((a, b) => b - a), `rekkefølge følger ikke score i fane ${tab}: ${avgs}`)
      const firstEmpty = avgs.indexOf('')
      if (firstEmpty >= 0) assert.ok(avgs.slice(firstEmpty).every((a) => a === ''), `rader uten snitt skal komme sist i ${tab}`)
    }
    ok('live tavle: samlet og per kontor, rangering, skjuler snitt under minimum, ingen fasit')
    // oppdateres automatisk (polling)
    await page.getByRole('tab', { name: 'Samlet' }).click()
    await page.getByText('7,50').first().waitFor({ timeout: 15000 })
    ok('live tavle: oppdaterer seg automatisk')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, 'horisontal scroll: ' + overflow)
    await ctx.close()
  }
  {
    // --- Live tavle med brusnavn (når admin har slått det på) ---
    const state = freshState({ status: 'open', names: true })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest/tavle')
    await page.getByRole('heading', { name: 'Live tavle' }).waitFor()
    assert.strictEqual(await page.locator('.bar-row strong').first().innerText(), 'Glass 2 – Askim')
    await page.getByText('Glass 1 – Ringnes').first().waitFor()
    await shot(page, '13-live-tavle-brusnavn')
    ok('live tavle: viser brusnavn når admin har slått det på')
    await ctx.close()
  }
  {
    // --- Live tavle: Gjettet riktig (per glass, per kontor, samlet, og beste gjettere) ---
    const state = freshState({ status: 'open' })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest/tavle')
    await page.getByRole('heading', { name: 'Live tavle' }).waitFor()
    await page.getByRole('tab', { name: 'Gjettet riktig' }).click()
    await page.getByRole('heading', { name: 'Gjettet riktig per glass' }).waitFor()
    // rangert etter andel riktige: Glass 2 (50 %) foran Glass 1 (33 %)
    assert.strictEqual(await page.locator('.bar-row strong').first().innerText(), 'Glass 2')
    await page.getByText('50 %').first().waitFor()
    await page.getByText('2 av 4 riktig').first().waitFor()
    await page.getByText('3 av 7 gjetninger riktig').waitFor()
    // beste gjettere, anonyme som «Anonym»
    const names = await page.locator('[data-testid="tavle-person"] strong').evaluateAll((els) => els.map((e) => e.textContent).filter((t) => t && isNaN(Number(t))))
    assert.deepStrictEqual(names, ['Kari', 'Anonym', 'Ola'])
    await shot(page, '15-tavle-gjettet-riktig')
    // kontorfane: bare kontorets egne gjettere og tall
    await page.getByRole('tab', { name: 'Oslo' }).click()
    await page.getByText('Ola').waitFor({ state: 'detached' })
    assert.strictEqual(await page.locator('[data-testid="tavle-person"]').count(), 2)
    await page.getByText('2 av 3 riktig').first().waitFor()
    // rekkefølgen følger andelen i alle faner
    for (const tab of ['Samlet', 'Oslo', 'Stavanger']) {
      await page.getByRole('tab', { name: tab }).click()
      const avgs = await page.locator('[data-testid="tavle-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-avg')))
      const nums = avgs.filter((a) => a !== '').map(Number)
      assert.deepStrictEqual(nums, [...nums].sort((a, b) => b - a), `gjetting: rekkefølge følger ikke andel i ${tab}: ${avgs}`)
    }
    // tilbake til Poeng
    await page.getByRole('tab', { name: 'Poeng' }).click()
    await page.getByRole('heading', { name: 'Snittscore per glass' }).waitFor()
    ok('live tavle: gjettet riktig per glass, kontor og samlet, med beste gjettere (anonyme som Anonym)')
    await ctx.close()
  }
  {
    const state = freshState({ status: 'open', liveOff: true })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest/tavle')
    await page.goto(BASE + '/')
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByText('Julebrustesten 2026').waitFor()
    assert.strictEqual(await page.getByRole('link', { name: /Se live tavle/ }).count(), 0, 'ingen snarvei når tavlen er av')
    await page.goto(BASE + '/k/julebrustest/tavle')
    await page.getByText('Live tavlen er ikke slått på').waitFor()
    ok('live tavle: av gir forklaring')
    await ctx.close()
  }
  {
    const state = freshState({ status: 'open' })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/k/julebrustest/resultat')
    await page.getByText('Resultatene er ikke klare ennå').waitFor()
    ok('resultat: ikke klart når åpen')
    await page.goto(BASE + '/admin'); await page.waitForURL(BASE + '/')
    ok('admin: ikke-admin sendes til forsiden')
    await page.goto(BASE + '/profil')
    await page.getByLabel('Visningsnavn').fill('Kari N')
    await page.getByRole('checkbox', { name: /Vær anonym/ }).check()
    await page.getByRole('button', { name: 'Lagre' }).click()
    await page.getByText('Lagret.').waitFor()
    assert.deepStrictEqual(state.profilePatch, { display_name: 'Kari N', anonymous: true })
    await shot(page, '06-profil')
    // bytt pinkode: feil nåværende, svak kode, ulike koder, og vellykket bytte
    await page.getByLabel('Nåværende pinkode').fill('000000')
    await page.getByLabel('Ny pinkode', { exact: true }).fill('482915')
    await page.getByLabel('Gjenta ny pinkode').fill('482915')
    await page.getByRole('button', { name: 'Bytt pinkode' }).click()
    await page.getByText('Feil nåværende pinkode.').waitFor()
    await page.getByLabel('Nåværende pinkode').fill('123456')
    await page.getByLabel('Ny pinkode', { exact: true }).fill('111111')
    await page.getByLabel('Gjenta ny pinkode').fill('111111')
    await page.getByRole('button', { name: 'Bytt pinkode' }).click()
    await page.getByText(/vanskeligere å gjette/).waitFor()
    await page.getByLabel('Ny pinkode', { exact: true }).fill('482915')
    await page.getByLabel('Gjenta ny pinkode').fill('482916')
    await page.getByRole('button', { name: 'Bytt pinkode' }).click()
    await page.getByText('De to nye kodene er ikke like.').waitFor()
    await page.getByLabel('Gjenta ny pinkode').fill('482915')
    await page.getByRole('button', { name: 'Bytt pinkode' }).click()
    await page.getByText('Pinkoden er byttet.').waitFor()
    assert.deepStrictEqual({ o: state.pinChange.old_pin, n: state.pinChange.new_pin }, { o: '123456', n: '482915' })
    assert.strictEqual(await page.getByLabel('Nåværende pinkode').inputValue(), '', 'felt tømt etter bytte')
    assert.ok(!(await page.content()).includes('482915'), 'ny pin i DOM etter bytte')
    await shot(page, '10-bytt-pin')
    await page.getByRole('button', { name: 'Logg ut' }).click()
    await page.waitForURL('**/login')
    ok('profil: oppdater navn/anonym, bytt pinkode (feil/svak/ulik/ok) og logg ut')
    await ctx.close()
  }

  // --- Admin ---
  {
    const state = freshState({ admin: true })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByRole('link', { name: 'Admin' }).click()
    await page.getByRole('heading', { name: 'Admin' }).waitFor()
    await page.getByText('/julebrustest').waitFor()
    await shot(page, '07-admin')
    ok('admin: lastes for admin')
    await ctx.close()
  }
  {
    // --- Admin: slett svar (enkeltsvar, alle fra bruker, nullstill) ---
    const state = freshState({ admin: true })
    state.entries = {
      i1: { id: 'e1', item_id: 'i1', user_id: 'u1', score: 7, guess_option_id: 'o2', comment: 'Fin brus', hidden: false },
      i2: { id: 'e2', item_id: 'i2', user_id: 'u1', score: 5, guess_option_id: 'o3', comment: null, hidden: false },
    }
    const { ctx, page } = await newPage(browser, state)
    page.on('dialog', (d) => d.accept())
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/admin')
    await page.getByRole('tab', { name: 'Svar' }).click()
    await page.getByText(/Svar i Julebrustesten 2026 \(2\)/).waitFor()
    await page.getByRole('button', { name: /2 svar/ }).click()
    await page.getByText('Fin brus').waitFor()
    await shot(page, '11-admin-svar')
    await page.getByRole('button', { name: 'Slett', exact: true }).first().click()
    await page.getByText('Svaret er slettet.').waitFor()
    assert.deepStrictEqual(state.deletes, ['e1'])
    await page.getByRole('button', { name: 'Slett alle', exact: true }).click()
    await page.getByText(/Slettet 1 svar fra/).waitFor()
    assert.deepStrictEqual(state.deletes, ['e1', 'e2'])
    // nullstill krever at man skriver SLETT
    const btn = page.getByRole('button', { name: 'Slett alle svar', exact: true })
    assert.strictEqual(await btn.isDisabled(), true)
    await page.getByLabel('Skriv SLETT for å bekrefte').fill('SLETT')
    assert.strictEqual(await btn.isDisabled(), false)
    await btn.click()
    await page.getByText(/Nullstilt: slettet/).waitFor()
    ok('admin: slett enkeltsvar, alle fra bruker og nullstill (krever SLETT)')
    // snarvei fra Konkurranser-fanen
    await page.getByRole('tab', { name: 'Konkurranser' }).click()
    await page.getByRole('button', { name: 'Nullstill svar …' }).first().click()
    await page.getByRole('heading', { name: 'Nullstill konkurransen' }).waitFor()
    ok('admin: Nullstill svar-snarvei fra Konkurranser-fanen')
    await ctx.close()
  }

  {
    // --- Admin: brukere (sett pinkode, ny tilfeldig, slett) ---
    const state = freshState({ admin: true })
    state.profileList = [
      { id: 'u1', display_name: 'Kari Nordmann', office_id: 'of1', anonymous: false, is_admin: true },
      { id: 'u2', display_name: 'Ola Hansen', office_id: 'of2', anonymous: true, is_admin: false },
    ]
    const { ctx, page } = await newPage(browser, state)
    page.on('dialog', (d) => d.accept())
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByRole('link', { name: 'Admin' }).click()
    await page.getByRole('tab', { name: 'Brukere' }).click()
    await page.getByText('Ola Hansen').waitFor()
    await page.getByLabel('Søk').fill('ola')
    await page.getByText('Ola Hansen').waitFor()
    assert.strictEqual(await page.getByText('Kari Nordmann').count(), 0, 'søk filtrerer')
    await page.getByLabel('Søk').fill('')
    await page.getByRole('button', { name: 'Sett pinkode' }).nth(1).click()
    await page.getByLabel(/Ny pinkode til Ola Hansen/).fill('123456')
    await page.getByRole('button', { name: 'Lagre pinkode' }).click()
    await page.getByText(/vanskeligere å gjette/).waitFor()
    await page.getByLabel(/Ny pinkode til Ola Hansen/).fill('482915')
    await page.getByRole('button', { name: 'Lagre pinkode' }).click()
    await page.getByText('Ny pinkode er satt for Ola Hansen').waitFor()
    assert.deepStrictEqual(state.adminCalls.at(-1), { action: 'set_pin', user_id: 'u2', pin: '482915' })
    await shot(page, '12-admin-brukere')
    await page.getByRole('button', { name: 'Ny tilfeldig' }).nth(1).click()
    await page.getByTestId('reset-pin').waitFor()
    assert.strictEqual(await page.getByTestId('reset-pin').innerText(), '654123')
    await page.getByRole('button', { name: /Lukk/ }).click()
    await page.getByRole('button', { name: 'Slett', exact: true }).last().click()
    await page.getByText('Ola Hansen er slettet.').waitFor()
    assert.deepStrictEqual(state.adminCalls.at(-1), { action: 'delete_user', user_id: 'u2' })
    assert.strictEqual(await page.getByText('Ola Hansen', { exact: true }).count(), 0)
    ok('admin: se brukere, søk, sett pinkode (svak avvist), ny tilfeldig og slett bruker')
    await ctx.close()
  }

  {
    // --- Admin: glass og fasit som én tabell (lagre alle, skjul fasit, fasitliste, lim inn liste) ---
    const state = freshState({ admin: true })
    state.glass = {
      ops: [],
      items: [1, 2, 3].map((n) => ({ id: 'g' + n, competition_id: 'c1', position: n, label: 'Glass ' + n, image_path: null })),
      answers: { g1: 'o2', g2: 'o3' },
      options: OPTIONS.map((o) => ({ ...o })),
    }
    const G = state.glass
    const { ctx, page } = await newPage(browser, state)
    const dialogs = []
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept() })
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByRole('link', { name: 'Admin' }).click()
    await page.getByRole('tab', { name: 'Glass og fasit' }).click()
    await page.getByRole('heading', { name: /Glass og fasit \(3\)/ }).waitFor()
    const rows = page.locator('[data-testid="glass-rad"]')
    assert.strictEqual(await rows.count(), 3)
    assert.strictEqual(await page.getByRole('button', { name: 'Lagre alle' }).isDisabled(), true, 'Lagre alle er av uten endringer')
    // endre to glass, én lagring
    await page.getByLabel('Fasit for glass 3').selectOption({ label: 'Solo' })
    await page.getByLabel('Fasit for glass 1').selectOption({ label: 'Pepsi Jul' })
    await page.getByRole('button', { name: 'Lagre alle (2 endringer)' }).waitFor()
    assert.strictEqual(await page.locator('[data-dirty="1"]').count(), 2)
    await shot(page, '17-glass-tabell')
    // fasitlista følger tabellen, også ulagrede endringer
    await page.getByText('Fasitliste (for den som heller opp)').click()
    const live = (await page.locator('[data-testid="fasitliste"] li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    assert.ok(live[0].startsWith('Glass 1: Pepsi Jul') && live[0].includes('ulagret'), 'fasitlista viser ulagret endring: ' + live[0])
    assert.ok(live[2].startsWith('Glass 3: Solo') && live[2].includes('ulagret'), 'fasitlista viser ulagret endring: ' + live[2])
    assert.ok(!live[1].includes('ulagret'), 'uendret rad er ikke merket')
    await page.getByText('Fasitliste (for den som heller opp)').click()
    await page.getByRole('button', { name: 'Lagre alle (2 endringer)' }).click()
    await page.getByText('Lagret 2 glass.').waitFor()
    assert.deepStrictEqual(G.answers, { g1: 'o5', g2: 'o3', g3: 'o4' })
    // skjul fasit: ingen select, lagre er av, fasitlista skjult
    await page.getByLabel('Skjul fasit').check()
    assert.strictEqual(await page.locator('select[aria-label^="Fasit for glass"]').count(), 0, 'fasit er skjult')
    assert.ok(!(await page.locator('main, #root').first().innerText()).includes('Solo'), 'brusnavn skjult')
    await page.getByText('Fasitliste (for den som heller opp)').click()
    await page.getByText('Fasiten er skjult. Slå av').waitFor()
    await page.getByLabel('Skjul fasit').uncheck()
    // fasitlista: stor tekst, Glass N: brus
    const lis = await page.locator('[data-testid="fasitliste"] li').allInnerTexts()
    assert.deepStrictEqual(lis.map((t) => t.replace(/\s+/g, ' ').trim()), ['Glass 1: Pepsi Jul', 'Glass 2: Julebrus B', 'Glass 3: Solo'])
    // lim inn hele lista, med nummerering, merknad og et ukjent brusnavn
    await page.getByRole('button', { name: 'Lim inn liste' }).click()
    await page.getByLabel('Lista', { exact: true }).fill('1. Solo\n2. Pepsi Jul (T)\n3. Nytt Brus\n4. julebrus a\n')
    assert.strictEqual(await page.locator('[data-testid="forhandsvisning-rad"]').count(), 4)
    await page.getByText('Ny, ikke i gjettelisten').waitFor()
    const apply = page.getByRole('button', { name: /Bruk lista/ })
    await page.getByRole('checkbox', { name: /Legg til det nye brusnavnet/ }).uncheck()
    assert.strictEqual(await apply.isDisabled(), true, 'ukjent brus uten å legge til blokkerer')
    await page.getByRole('checkbox', { name: /Legg til det nye brusnavnet/ }).check()
    await shot(page, '18-lim-inn-liste')
    await apply.click()
    await page.getByText(/Fasiten er satt for 4 glass/).waitFor()
    assert.ok(G.ops.some((o) => o[0] === 'opt+' && o[1] === 'Nytt Brus'), 'nytt brus lagt til i gjettelisten')
    assert.ok(G.ops.some((o) => o[0] === 'item+' && o[1] === 4), 'glass 4 opprettet')
    const idOf = (label) => G.options.find((o) => o.label === label).id
    const g4 = G.items.find((i) => i.position === 4).id
    assert.deepStrictEqual(G.answers, { g1: idOf('Solo'), g2: idOf('Pepsi Jul'), g3: idOf('Nytt Brus'), [g4]: idOf('Julebrus A') })
    await page.getByRole('heading', { name: /Glass og fasit \(4\)/ }).waitFor()
    assert.strictEqual(await page.getByLabel('Fasit for glass 4').inputValue(), idOf('Julebrus A'))
    // slett glass 4 manuelt, og legg til igjen med knappen
    await page.getByRole('button', { name: 'Slett glass 4' }).click()
    await page.getByRole('heading', { name: /Glass og fasit \(3\)/ }).waitFor()
    assert.ok(G.ops.some((o) => o[0] === 'item-' && o[1] === g4), 'glass 4 slettet')
    await page.getByRole('button', { name: '+ Legg til glass' }).click()
    await page.getByRole('heading', { name: /Glass og fasit \(4\)/ }).waitFor()
    // dynamisk liste: en kortere liste fjerner glass utover lista, med valg om å la dem stå
    await page.getByRole('button', { name: 'Lim inn liste' }).click()
    await page.getByLabel('Lista', { exact: true }).fill('Solo\nPepsi Jul\nNytt Brus')
    await page.locator('[data-testid="forhandsvisning-fjernes"]').waitFor()
    await page.getByRole('checkbox', { name: /Fjern glass 4/ }).uncheck()
    assert.strictEqual(await page.locator('[data-testid="forhandsvisning-fjernes"]').count(), 0, 'uten hake fjernes ingenting')
    await page.getByRole('checkbox', { name: /Fjern glass 4/ }).check()
    dialogs.length = 0
    await page.getByRole('button', { name: /Bruk lista \(3 glass, fjern 1\)/ }).click()
    await page.getByText(/1 glass ble fjernet/).waitFor()
    await page.getByRole('heading', { name: /Glass og fasit \(3\)/ }).waitFor()
    assert.ok(dialogs.some((m) => m.includes('fjerner glass 4')), 'bekreftelsen nevner hva som fjernes: ' + dialogs.join(' | '))
    assert.strictEqual(G.items.length, 3, 'glass 4 er fjernet av lista')
    // en lengre liste oppretter nye glass, og en kortere fjerner dem igjen
    await page.getByRole('button', { name: 'Lim inn liste' }).click()
    await page.getByLabel('Lista', { exact: true }).fill('Solo\nPepsi Jul\nNytt Brus\nMineralvann\nJulebrus A')
    assert.strictEqual(await page.locator('[data-testid="forhandsvisning-fjernes"]').count(), 0)
    await page.getByRole('button', { name: /Bruk lista \(5 glass\)/ }).click()
    await page.getByText(/2 nye glass ble opprettet/).waitFor()
    await page.getByRole('heading', { name: /Glass og fasit \(5\)/ }).waitFor()
    assert.strictEqual(G.items.length, 5)
    assert.strictEqual(await page.getByLabel('Fasit for glass 5').inputValue(), idOf('Julebrus A'))
    // fasitlista vokser med glassene
    const lista = page.locator('details', { hasText: 'Fasitliste (for den som heller opp)' })
    if (!(await lista.evaluate((e) => e.open))) await page.getByText('Fasitliste (for den som heller opp)').click()
    await page.locator('[data-testid="fasitliste"] li').first().waitFor()
    const five = (await page.locator('[data-testid="fasitliste"] li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    assert.deepStrictEqual(five, ['Glass 1: Solo', 'Glass 2: Pepsi Jul', 'Glass 3: Nytt Brus', 'Glass 4: Mineralvann', 'Glass 5: Julebrus A'])
    await page.getByRole('button', { name: 'Lim inn liste' }).click()
    await page.getByLabel('Lista', { exact: true }).fill('Solo\nPepsi Jul\nNytt Brus')
    await page.getByRole('checkbox', { name: /Fjern de 2 glassene utover lista \(4, 5\)/ }).waitFor()
    await page.getByRole('button', { name: /Bruk lista \(3 glass, fjern 2\)/ }).click()
    await page.getByRole('heading', { name: /Glass og fasit \(3\)/ }).waitFor()
    assert.strictEqual(G.items.length, 3)
    // bytte posisjon på to glass via Avansert krever bare én lagring
    await page.getByText('Avansert: navn og posisjon').click()
    await page.getByLabel('Posisjon for glass 1').fill('2')
    await page.getByLabel('Posisjon for glass 2').fill('1')
    await page.getByRole('button', { name: /Lagre alle \(2 endringer\)/ }).click()
    await page.getByText('Lagret 2 glass.').waitFor()
    assert.deepStrictEqual(G.items.map((i) => [i.id, i.position]).sort(), [['g1', 2], ['g2', 1], ['g3', 3]])
    ok('admin: glass og fasit som tabell: lagre alle, skjul fasit, fasitliste, lim inn liste og slett')
    await ctx.close()
  }

  {
    // --- Admin: quiz-spørsmål (import JSON/CSV, forhåndsvisning, søk, redigering, skjul, slett, eksport) ---
    const state = freshState({ admin: true })
    state.quiz = { rows: [], ops: [], n: 0 }
    const Z = state.quiz
    const { ctx, page } = await newPage(browser, state)
    page.on('dialog', (d) => { void d.accept() })
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByRole('link', { name: 'Admin' }).click()
    await page.getByRole('tab', { name: 'Quiz-spørsmål' }).click()
    await page.getByText('Ingen spørsmål ennå.').waitFor()
    // oppdiktede spørsmål (ekte quizer skal ikke ligge i repoet)
    const mk = (nr, over = {}) => ({ nr, kategori: 'Test', vanskelighet: 'Lett', spoersmaal: 'Testspørsmål ' + nr + '?', alternativer: { A: 'Ja', B: 'Nei', C: 'Kanskje', D: 'Vet ikke' }, riktig: 'B', forklaring: 'Forklaring ' + nr, kilde: '', ...over })
    const json1 = JSON.stringify([mk(1, { kilde_nivaa: 1, status: 'OK' }), mk(2, { kategori: 'Mat', kilde_nivaa: 3, status: 'Usikker', merknad: 'Mangler rotkilde' }), mk(3, { riktig: 'F' }), mk(4, { spoersmaal: 'testspørsmål 1?' })])
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await page.getByLabel('Tema for importerte spørsmål', { exact: false }).fill('test')
    await page.getByLabel('Innhold').fill(json1)
    await page.locator('[data-testid="import-oppsummering"]').waitFor()
    const sum = (await page.locator('[data-testid="import-oppsummering"]').innerText()).replace(/\s+/g, ' ')
    assert.ok(sum.includes('2 kan importeres') && sum.includes('1 med feil') && sum.includes('1 dubletter'), 'oppsummering: ' + sum)
    assert.deepStrictEqual(await page.locator('[data-testid="import-rad"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status'))), ['ok', 'ok', 'feil', 'dublett'])
    await page.getByText(/Riktig svar mangler/).waitFor()
    await page.getByRole('checkbox', { name: /Skjul de 1 spørsmålene som er merket Usikker/ }).waitFor()
    await shot(page, '19-quiz-import')
    await page.getByRole('button', { name: 'Importer 2 spørsmål' }).click()
    await page.getByText('Importerte 2 spørsmål (1 usikre er skjult).').waitFor()
    assert.deepStrictEqual(Z.rows.map((r) => [r.hidden, r.review_status, r.source_level, r.review_note]), [[false, 'ok', 1, null], [true, 'usikker', 3, 'Mangler rotkilde']], 'usikre spørsmål skjules, og kvalitetsfeltene lagres')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 2)
    assert.deepStrictEqual(Z.rows.map((r) => [r.theme, r.category, r.correct, r.difficulty]), [['test', 'Test', 1, 'Lett'], ['test', 'Mat', 1, 'Lett']])
    // samme fil igjen: alt finnes i banken, ingenting å importere
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await page.getByLabel('Innhold').fill(JSON.stringify([mk(1), mk(2)]))
    await page.getByText('Finnes i banken').first().waitFor()
    assert.strictEqual(await page.getByRole('button', { name: 'Importer 0 spørsmål' }).isDisabled(), true)
    // CSV (tabulator, som fra et regneark)
    await page.getByLabel('Innhold').fill('spørsmål\tA\tB\tC\tD\triktig\tkategori\tstatus\nTestspørsmål CSV?\tEn\tTo\tTre\tFire\tC\tTall\tUsikker')
    await page.getByRole('checkbox', { name: /Skjul de 1 spørsmålene som er merket Usikker/ }).uncheck()
    await page.getByRole('button', { name: 'Importer 1 spørsmål' }).click()
    await page.getByText('Importerte 1 spørsmål.').waitFor()
    assert.strictEqual(Z.rows.at(-1).correct, 2)
    assert.strictEqual(Z.rows.at(-1).hidden, false, 'uten hake skjules ikke usikre')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 3)
    // filter på kvalitet
    await page.getByLabel('Filter kvalitet').selectOption('usikker')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 2)
    await page.getByLabel('Filter kvalitet').selectOption('ok')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 1)
    await page.getByLabel('Filter kvalitet').selectOption('alle')
    // søk og filter
    await page.getByLabel('Søk', { exact: true }).fill('csv')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 1)
    await page.getByLabel('Søk', { exact: true }).fill('')
    await page.getByLabel('Filter kategori').selectOption('Mat')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 1)
    await page.getByLabel('Filter kategori').selectOption('')
    // rediger: validering, og lagring av nytt riktig svar
    await page.locator('[data-testid="quiz-rad"]').first().getByRole('button').first().click()
    await page.getByText('A. Ja').waitFor()
    await page.getByRole('button', { name: 'Rediger' }).click()
    await page.getByLabel('Alternativ C', { exact: true }).fill('Ja')
    await page.getByRole('button', { name: 'Lagre', exact: true }).click()
    await page.getByText('Alternativene må være ulike').waitFor()
    await page.getByLabel('Alternativ C', { exact: true }).fill('Kanskje')
    await page.getByLabel('Riktig er alternativ D').check()
    await page.getByLabel('Spørsmål', { exact: true }).fill('Redigert spørsmål?')
    await page.getByRole('button', { name: 'Lagre', exact: true }).click()
    await page.getByText('Spørsmålet er lagret.').waitFor()
    assert.strictEqual(Z.rows[0].question, 'Redigert spørsmål?'); assert.strictEqual(Z.rows[0].correct, 3)
    // skjul / vis (raden står fortsatt utvidet etter lagring)
    const forste = page.locator('[data-testid="quiz-rad"]').first().getByRole('button').first()
    if ((await forste.getAttribute('aria-expanded')) !== 'true') await forste.click()
    await page.getByRole('button', { name: 'Skjul', exact: true }).click()
    await page.getByText('2 skjulte').waitFor()
    assert.strictEqual(Z.rows[0].hidden, true)
    await page.getByLabel('Filter skjult').selectOption('skjulte')
    assert.strictEqual(await page.locator('[data-testid="quiz-rad"]').count(), 2)
    await page.getByLabel('Filter skjult').selectOption('alle')
    // nytt spørsmål
    await page.getByRole('button', { name: '+ Nytt spørsmål' }).click()
    await page.getByLabel('Spørsmål', { exact: true }).fill('Nytt manuelt spørsmål?')
    for (const [l, v] of [['A', 'Rød'], ['B', 'Blå'], ['C', 'Grønn'], ['D', 'Gul']]) await page.getByLabel('Alternativ ' + l, { exact: true }).fill(v)
    await page.getByLabel('Riktig er alternativ C').check()
    await page.getByLabel('Tema', { exact: true }).fill('test')
    await page.getByRole('button', { name: 'Lagre', exact: true }).click()
    await page.getByText('Spørsmålet er lagt til.').waitFor()
    assert.strictEqual(Z.rows.length, 4); assert.strictEqual(Z.rows.at(-1).correct, 2)
    // eksport
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Eksporter JSON/ }).click()])
    assert.strictEqual(dl.suggestedFilename(), 'quiz-sporsmal.json')
    const exported = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'))
    assert.strictEqual(exported.length, 4); assert.ok(exported[0].alternativer.A && exported[0].riktig && exported[0].spoersmaal)
    // slett
    await page.locator('[data-testid="quiz-rad"]').last().getByRole('button').first().click()
    await page.getByRole('button', { name: 'Slett', exact: true }).click()
    await page.getByText('Spørsmålet er slettet.').waitFor()
    assert.strictEqual(Z.rows.length, 3)
    ok('admin: quiz-spørsmål: import (JSON/CSV) med forhåndsvisning, søk, redigering, skjul, nytt, eksport og slett')
    await ctx.close()
  }
  {
    // --- Toppraden med navnet «Konkurranser» passer på smale skjermer (også med Admin-lenke) ---
    const state = freshState({ admin: true })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    assert.strictEqual(await page.title(), 'Konkurranser')
    await page.getByRole('link', { name: /Konkurranser/ }).first().waitFor()
    for (const w of [390, 360, 320]) {
      await page.setViewportSize({ width: w, height: 800 })
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      assert.ok(over <= 0, `horisontal scroll i toppraden ved ${w}px: ${over}`)
      const hdr = await page.locator('.app-header').boundingBox()
      assert.ok(hdr.height < (w >= 360 ? 100 : 130), `toppraden er for høy ved ${w}px: ${hdr.height}`)
      if (w === 390) await shot(page, '20-toppraden')
    }
    ok('toppraden: «Konkurranser» passer ved 390, 360 og 320 px, med Admin-lenke')
    await ctx.close()
  }

  {
    // --- Quiz: spiller blir med med kode, svarer, ser fasit og sluttresultat ---
    const base = { code: 'ABCD', theme: 'jul', n_questions: 2, seconds: 30, reveal_seconds: 7 }
    const pl = [{ name: 'Kari', office: 'Oslo', host: false, me: true }, { name: 'Ola', office: 'Stavanger', host: false, me: false }]
    const rk = [{ name: 'Ola', office: 'Stavanger', points: 190, correct: 1, me: false }, { name: 'Kari', office: 'Oslo', points: 100, correct: 1, me: true }]
    const of = [{ office: 'Oslo', players: 1, points: 100, avg: 100, correct: 1 }, { office: 'Stavanger', players: 1, points: 190, avg: 190, correct: 1 }]
    const state = freshState()
    state.qz = { calls: [], answers: [] }
    state.qz.lobby = () => ({ ...base, status: 'lobby', is_host: false, is_player: true, players: pl })
    state.qz.question = () => ({ ...base, status: 'playing', is_host: false, is_player: true, players: pl, nr: 0, phase: 'question', question: 'Hvilket land kommer julenissen fra?', options: ['Norge', 'Finland', 'Island', 'Sverige'], left_ms: 20000, answered: false, n_answered: 1, n_players: 2 })
    state.qz.answer = () => ({ ...base, status: 'playing', is_host: false, is_player: true, players: pl, nr: 0, phase: 'answer', question: 'Hvilket land kommer julenissen fra?', options: ['Norge', 'Finland', 'Island', 'Sverige'], left_ms: 6000, correct_index: 1, explanation: 'Mange mener Korvatunturi i Finland.', mine: { choice: 0, correct: false, points: 0 }, ranking: rk, offices: of, answered: true, n_answered: 2, n_players: 2 })
    state.qz.finished = () => ({ ...base, status: 'finished', is_host: false, is_player: true, players: pl, ranking: rk, offices: of })
    state.qz.state = state.qz.lobby()
    const { ctx, page, errors } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByRole('link', { name: 'Bli med i quiz' }).click()
    await page.getByLabel('Romkode').fill('xxxx')
    await page.getByRole('button', { name: 'Bli med', exact: true }).click()
    await page.getByText('Fant ikke noe rom med den koden.').waitFor()
    await page.getByLabel('Romkode').fill('abcd')
    await page.getByRole('button', { name: 'Bli med', exact: true }).click()
    await page.getByTestId('quiz-kode').waitFor()
    assert.strictEqual(await page.getByTestId('quiz-kode').textContent(), 'ABCD')
    assert.strictEqual(await page.getByRole('button', { name: /Start quizen/ }).count(), 0)
    await shot(page, '30-quiz-lobby')
    state.qz.state = { ...state.qz.question(), phase: 'countdown', left_ms: 8000, question: undefined, options: undefined, answered: undefined }
    await page.getByTestId('quiz-nedtelling').waitFor({ timeout: 5000 })
    assert.strictEqual(await page.getByTestId('quiz-sporsmal').count(), 0, 'ingen spørsmål under nedtellingen')
    assert.ok(Number(await page.getByTestId('quiz-nedtelling-tall').textContent()) <= 8)
    await shot(page, '39-quiz-nedtelling')
    state.qz.state = state.qz.question()
    await page.getByTestId('quiz-sporsmal').waitFor({ timeout: 5000 })
    assert.strictEqual(await page.getByTestId('quiz-nedtelling').count(), 0)
    await page.getByTestId('quiz-valg').nth(0).click()
    await page.getByTestId('quiz-sendt').waitFor()
    assert.deepStrictEqual(state.qz.answers[0], { p_code: 'ABCD', p_nr: 0, p_choice: 0 })
    assert.ok(await page.getByTestId('quiz-valg').nth(1).isDisabled())
    assert.ok(!/Finland/.test(await page.locator('[data-state="riktig"]').first().textContent().catch(() => '')))
    await shot(page, '31-quiz-sporsmal')
    state.qz.state = state.qz.answer()
    await page.getByTestId('quiz-forklaring').waitFor({ timeout: 5000 })
    assert.strictEqual(await page.locator('[data-state="riktig"]').textContent().then((t) => /Finland/.test(t)), true)
    assert.strictEqual(await page.locator('[data-state="feil"]').count(), 1)
    await page.getByTestId('quiz-rang').first().waitFor()
    await shot(page, '32-quiz-fasit')
    state.qz.state = state.qz.finished()
    await page.getByTestId('quiz-ferdig').waitFor({ timeout: 5000 })
    await page.getByText(/Du ble nr\./).waitFor()
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 800 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `horisontal scroll i quiz ved ${w}px`)
    }
    await shot(page, '33-quiz-ferdig')
    assert.deepStrictEqual(errors, [])
    ok('quiz: spiller blir med med kode, svarer, ser fasit først etter svartiden og sluttresultat')
    await ctx.close()
  }
  {
    // --- Quiz: admin lager rom, starter, hopper videre og avslutter ---
    const base = { code: 'ABCD', theme: 'jul', n_questions: 3, seconds: 30, reveal_seconds: 7, is_host: true, is_player: true }
    const pl = [{ name: 'Kari', office: 'Oslo', host: true, me: true }, { name: 'Ola', office: 'Stavanger', host: false, me: false }]
    const state = freshState({ admin: true })
    state.qz = { calls: [], answers: [], myRooms: [{ code: 'WXYZ', status: 'lobby', theme: 'jul', created_at: '2026-12-01T10:00:00Z', players: 1 }] }
    state.qz.lobby = () => ({ ...base, status: 'lobby', players: pl })
    state.qz.question = () => ({ ...base, status: 'playing', players: pl, nr: 0, phase: 'question', question: 'Spørsmål?', options: ['A1', 'B1', 'C1', 'D1'], left_ms: 25000, answered: false, n_answered: 0, n_players: 2 })
    state.qz.answer = () => ({ ...base, status: 'playing', players: pl, nr: 0, phase: 'answer', question: 'Spørsmål?', options: ['A1', 'B1', 'C1', 'D1'], left_ms: 6000, correct_index: 2, mine: { choice: -1, correct: false, points: 0 }, ranking: [], offices: [] })
    state.qz.finished = () => ({ ...base, status: 'finished', players: pl, ranking: [], offices: [] })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('link', { name: 'Lag quiz-rom' }).first().click()
    await page.getByRole('heading', { name: 'Nytt quiz-rom' }).waitFor()
    await page.getByLabel('Antall spørsmål').fill('3')
    await page.getByLabel('Tid per spørsmål').selectOption('30')
    await page.getByRole('button', { name: 'Lag rom' }).click()
    await page.getByTestId('quiz-kode').waitFor()
    assert.ok(state.qz.calls.some((c) => c.startsWith('konk_quiz_room_create') && c.includes('"p_count":3') && c.includes('"p_host_plays":true')))
    assert.ok(await page.getByRole('button', { name: 'Start quizen' }).isEnabled())
    await page.getByRole('button', { name: 'Start quizen' }).click()
    await page.getByTestId('quiz-sporsmal').waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: 'Vis fasit nå' }).click()
    await page.getByTestId('quiz-resultat').waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: 'Hopp til neste' }).click()
    await page.getByTestId('quiz-ferdig').waitFor({ timeout: 5000 })
    await shot(page, '34-quiz-vert')
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /Avslutt og slett/ }).click()
    await page.getByRole('heading', { name: 'Quiz', exact: true }).waitFor()
    assert.ok(state.qz.closed)
    await page.getByText('WXYZ').waitFor()
    ok('quiz: admin lager rom, starter, viser fasit, hopper videre og avslutter')
    await ctx.close()
  }

  {
    // --- Storskjerm: kode + QR i lobbyen, spørsmål uten fasit, fasit + topp 5, pallen ---
    const base = { code: 'ABCD', theme: 'jul', n_questions: 2, seconds: 30, reveal_seconds: 7, is_host: true, is_player: false }
    const pl = [{ name: 'Kari', office: 'Oslo', host: false, me: false }, { name: 'Ola', office: 'Stavanger', host: false, me: false }]
    const rk = [{ name: 'Ola', office: 'Stavanger', points: 190, correct: 1, me: false }, { name: 'Kari', office: 'Oslo', points: 100, correct: 1, me: false }]
    const of = [{ office: 'Oslo', players: 1, points: 100, avg: 100, correct: 1 }, { office: 'Stavanger', players: 1, points: 190, avg: 190, correct: 1 }]
    const state = freshState({ admin: true })
    state.qz = { calls: [], answers: [] }
    state.qz.state = { ...base, status: 'lobby', players: pl }
    const { ctx, page, errors } = await newPage(browser, state, { viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false })
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.goto(BASE + '/quiz/ABCD/skjerm')
    await page.getByTestId('skjerm-kode').waitFor()
    assert.strictEqual(await page.getByTestId('skjerm-kode').textContent(), 'ABCD')
    await page.locator('[data-testid="skjerm-qr"] svg').waitFor()
    assert.strictEqual(await page.getByTestId('skjerm-spillere').locator('li').count(), 2)
    await shot(page, '35-skjerm-lobby'); assert.ok((await page.evaluate(() => document.documentElement.scrollHeight)) <= 722, 'storskjermen må passe på 1280x720 uten rulling: 35-skjerm-lobby')
    state.qz.state = { ...base, status: 'playing', players: pl, nr: 0, phase: 'countdown', left_ms: 9000 }
    await page.getByTestId('quiz-nedtelling').waitFor({ timeout: 5000 })
    assert.strictEqual(await page.getByTestId('skjerm-sporsmal').count(), 0)
    await shot(page, '40-skjerm-nedtelling'); assert.ok((await page.evaluate(() => document.documentElement.scrollHeight)) <= 722, 'nedtellingen passer på 1280x720')
    state.qz.state = { ...base, status: 'playing', players: pl, nr: 0, phase: 'question', question: 'Hvem er størst?', options: ['A1', 'B1', 'C1', 'D1'], left_ms: 20000, n_answered: 1, n_players: 2 }
    await page.getByTestId('skjerm-sporsmal').waitFor({ timeout: 5000 })
    assert.strictEqual(await page.locator('[data-state="riktig"]').count(), 0)
    await page.getByText('1 av 2 har svart').waitFor()
    await shot(page, '36-skjerm-sporsmal'); assert.ok((await page.evaluate(() => document.documentElement.scrollHeight)) <= 722, 'storskjermen må passe på 1280x720 uten rulling: 36-skjerm-sporsmal')
    state.qz.state = { ...base, status: 'playing', players: pl, nr: 0, phase: 'answer', question: 'Hvem er størst?', options: ['A1', 'B1', 'C1', 'D1'], left_ms: 5000, correct_index: 2, explanation: 'Fordi.', ranking: rk, offices: of }
    await page.locator('[data-state="riktig"]').waitFor({ timeout: 5000 })
    assert.ok(/C1/.test(await page.locator('[data-state="riktig"]').textContent()))
    await page.getByText('Stillingen – topp 10').waitFor()
    await shot(page, '37-skjerm-fasit'); assert.ok((await page.evaluate(() => document.documentElement.scrollHeight)) <= 722, 'storskjermen må passe på 1280x720 uten rulling: 37-skjerm-fasit')
    state.qz.state = { ...base, status: 'finished', players: pl, ranking: rk, offices: of }
    await page.getByTestId('skjerm-pall').waitFor({ timeout: 5000 })
    assert.ok(/Ola/.test(await page.getByTestId('skjerm-pall').locator('li').first().textContent())); await page.getByText('Topp 10', { exact: true }).waitFor()
    await shot(page, '38-skjerm-pall'); assert.ok((await page.evaluate(() => document.documentElement.scrollHeight)) <= 722, 'storskjermen må passe på 1280x720 uten rulling: 38-skjerm-pall')
    state.qz.state = { ...base, is_host: false, status: 'lobby', players: pl }
    await page.getByText('Bare verten kan vise storskjerm').waitFor({ timeout: 5000 })
    assert.deepStrictEqual(errors, [])
    ok('storskjerm: kode og QR i lobbyen, spørsmål uten fasit, fasit med topp 5, pall, og nei for ikke-vert')
    await ctx.close()
  }

  {
    // --- QR-flyt: ny bruker og eksisterende bruker kommer rett inn i rommet, uten ekstra trykk ---
    const lobby = { code: 'ABCD', theme: 'jul', n_questions: 5, seconds: 30, reveal_seconds: 7, is_host: false, is_player: true, status: 'lobby', players: [{ name: 'Kari', office: 'Oslo', host: false, me: true }] }
    const mkState = () => { const st = freshState(); st.qz = { calls: [], answers: [], state: lobby }; return st }
    {
      const state = mkState()
      const { ctx, page } = await newPage(browser, state)
      await page.goto(BASE + '/quiz?kode=ABCD')
      await page.waitForURL('**/login')
      await page.getByRole('link', { name: 'Ny bruker' }).click()
      await page.getByRole('heading', { name: 'Ny bruker' }).waitFor()
      await page.getByLabel('Navn', { exact: true }).fill('Ny Kollega')
      await page.getByLabel('Kontor').selectOption('of2')
      await page.getByRole('button', { name: 'Opprett bruker' }).click()
      await page.getByTestId('pin').waitFor()
      assert.ok(/skjermbilde/i.test(await page.getByTestId('pin-advarsel').textContent()), 'tydelig skjermbilde-oppfordring')
      await page.getByRole('button', { name: 'Jeg har lagret koden – til quizen' }).click()
      await page.getByTestId('quiz-kode').waitFor({ timeout: 5000 })
      assert.strictEqual(page.url(), BASE + '/quiz/ABCD')
      assert.strictEqual(state.qz.calls.filter((c) => c.startsWith('konk_quiz_room_join')).length, 1, 'bli med skjer én gang')
      ok('ny bruker via QR: pin med skjermbilde-oppfordring, «Fortsett til quizen» og rett inn i rommet')
      await ctx.close()
    }
    {
      const state = mkState()
      const { ctx, page } = await newPage(browser, state)
      await page.goto(BASE + '/quiz?kode=ABCD'); await page.waitForURL('**/login')
      await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
      await page.getByTestId('quiz-kode').waitFor({ timeout: 5000 })
      assert.strictEqual(page.url(), BASE + '/quiz/ABCD')
      ok('eksisterende bruker via QR: innlogging og rett inn i rommet')
      await ctx.close()
    }
    {
      const state = mkState()
      const { ctx, page } = await newPage(browser, state)
      await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
      await page.getByRole('heading', { name: /God jul/ }).waitFor()
      await page.goto(BASE + '/quiz?kode=ZZZZ')
      await page.getByText('Fant ikke noe rom med den koden.').waitFor({ timeout: 5000 })
      assert.strictEqual(await page.getByLabel('Romkode').inputValue(), 'ZZZZ')
      assert.strictEqual(state.qz.calls.filter((c) => c.startsWith('konk_quiz_room_join')).length, 1, 'feil kode forsøkes bare én gang')
      ok('QR med ugyldig kode: feilmelding og koden står i feltet, ingen gjentatte forsøk')
      await ctx.close()
    }
  }

  {
    // --- Mine svar: alltid redigerbar, hver endring lagres med en gang ---
    const state = freshState({ status: 'open', entries: {
      i1: { id: 'e1', user_id: UID, item_id: 'i1', score: 7, guess_option_id: 'o2', comment: 'Frisk og fin' },
      i3: { id: 'e3', user_id: UID, item_id: 'i3', score: 9, guess_option_id: null, comment: null },
    } })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    // fra forsiden: ett trykk til oversikten, og der kan alt endres
    await page.getByText('Se og endre svarene dine').click()
    const kort = page.getByTestId('rediger-kort')
    await kort.nth(5).waitFor()
    assert.strictEqual(await page.getByRole('button', { name: /Rediger svar/ }).count(), 0, 'ingen Rediger-knapp å trykke først')
    assert.strictEqual(await page.getByRole('link', { name: 'Endre' }).count(), 0, 'ingen Endre-skjerm')
    await shot(page, '41-mine-rediger')
    // gjetning og kommentar lagres også
    await kort.nth(0).getByLabel('Gjetter på').selectOption('o3')
    await page.getByTestId('status-1').getByText('Lagret ✓').waitFor()
    assert.strictEqual(state.saves.at(-1).guess_option_id, 'o3')
    await kort.nth(0).getByLabel(/Kommentar/).fill('Litt for søt')
    for (let k = 0; k < 50 && state.saves.at(-1).comment !== 'Litt for søt'; k++) await page.waitForTimeout(100)   // «Lagret ✓» står fra forrige lagring til ny starter
    assert.strictEqual(state.saves.at(-1).comment, 'Litt for søt')
    await page.getByTestId('status-1').getByText('Lagret ✓').waitFor()
    assert.strictEqual(state.saves.at(-1).score, 7, 'scoren ligger fast når bare kommentaren endres')
    // nytt glass: gjetning uten score lagres ikke, score gjør det
    const before = state.saves.length
    await kort.nth(1).getByLabel('Gjetter på').selectOption('o1')
    await page.getByTestId('status-2').getByText('Velg en score for å lagre.').waitFor()
    assert.strictEqual(state.saves.length, before, 'ingenting lagres uten score')
    await kort.nth(1).locator('.score-grid label:has(input[value="8"])').click()
    await page.getByTestId('status-2').getByText('Lagret ✓').waitFor()
    assert.deepStrictEqual([state.saves.at(-1).item_id, state.saves.at(-1).score, state.saves.at(-1).guess_option_id], ['i2', 8, 'o1'])
    await page.getByText('3 av 6 glass besvart').waitFor()
    // raske trykk: bare siste gjelder, og kortet har aldri to markerte tall
    await kort.nth(2).locator('.score-grid label:has(input[value="1"])').click()
    await kort.nth(2).locator('.score-grid label:has(input[value="2"])').click()
    await kort.nth(2).locator('.score-grid label:has(input[value="3"])').click()
    await page.getByTestId('status-3').getByText('Lagret ✓').waitFor()
    assert.deepStrictEqual(await kort.nth(2).locator('.score-grid span.on').allInnerTexts(), ['3'])
    await page.waitForTimeout(300)
    assert.strictEqual(state.entries.i3.score, 3, 'siste trykk er det som ligger lagret')
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 800 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `horisontal scroll i Mine svar ved ${w}px`)
    }
    ok('mine svar: alltid redigerbar med autolagring (score, gjetning, kommentar), score-vakt og raske trykk')
    await ctx.close()
  }

  {
    // --- Forsiden: admin kan skjule/vise, flytte opp og ned og slette konkurranser ---
    const mkComps = () => [
      { ...COMP, id: 'c1', slug: 'a', title: 'Konkurranse A', visible: true, sort_order: 10 },
      { ...COMP, id: 'c2', slug: 'b', title: 'Konkurranse B', status: 'closed', visible: true, sort_order: 20 },
      { ...COMP, id: 'c3', slug: 'c', title: 'Konkurranse C', visible: false, sort_order: 30 },
    ]
    const titles = (page) => page.locator('[data-testid="konkurranse-kort"] h2').allInnerTexts()
    const state = freshState({ admin: true }); state.comps = mkComps()
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
    await page.getByText('Konkurranse C').waitFor()
    assert.deepStrictEqual(await titles(page), ['Konkurranse A', 'Konkurranse B', 'Konkurranse C'])
    assert.strictEqual(await page.getByTestId('usynlig-merke').count(), 1, 'admin ser at C er usynlig for andre')
    assert.strictEqual(await page.getByRole('button', { name: /Flytt/ }).count(), 0, 'kontrollene vises først i Administrer')
    await page.getByTestId('administrer').click()
    // flytt B opp
    await page.getByRole('button', { name: 'Flytt Konkurranse B opp' }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="konkurranse-kort"] h2')?.textContent === 'Konkurranse B')
    assert.deepStrictEqual(await titles(page), ['Konkurranse B', 'Konkurranse A', 'Konkurranse C'])
    for (let k = 0; k < 30 && state.comps.find((x) => x.id === 'c2').sort_order !== 10; k++) await page.waitForTimeout(100)
    assert.deepStrictEqual(state.comps.map((x) => [x.id, x.sort_order]), [['c1', 20], ['c2', 10], ['c3', 30]], 'rekkefølgen er lagret')
    assert.strictEqual(await page.getByRole('button', { name: 'Flytt Konkurranse B opp' }).isDisabled(), true, 'øverste kan ikke flyttes opp')
    assert.strictEqual(await page.getByRole('button', { name: 'Flytt Konkurranse C ned' }).isDisabled(), true, 'nederste kan ikke flyttes ned')
    await shot(page, '42-forside-administrer')
    // gjør C synlig og A usynlig
    const grp = (t) => page.getByRole('group', { name: `Administrer ${t}` })
    await grp('Konkurranse C').getByRole('button', { name: /Usynlig/ }).click()
    await page.getByText('Konkurransen er synlig for alle.').waitFor()
    await grp('Konkurranse A').getByRole('button', { name: /Synlig/ }).click()
    await page.getByText('Konkurransen er skjult for alle andre enn deg.').waitFor()
    assert.deepStrictEqual(state.comps.map((x) => [x.id, x.visible]), [['c1', false], ['c2', true], ['c3', true]])
    // slett: krever SLETT, og avbryt gjør ingenting
    await grp('Konkurranse B').getByRole('button', { name: /Slett/ }).click()
    const dlg = page.getByRole('alertdialog', { name: 'Slett Konkurranse B' })
    assert.strictEqual(await dlg.getByRole('button', { name: 'Slett for alltid' }).isDisabled(), true)
    await dlg.getByLabel(/Skriv SLETT/).fill('slett')
    assert.strictEqual(await dlg.getByRole('button', { name: 'Slett for alltid' }).isDisabled(), false)
    await dlg.getByRole('button', { name: 'Avbryt' }).click()
    assert.strictEqual(state.comps.length, 3, 'avbrutt sletting rører ingenting')
    await grp('Konkurranse B').getByRole('button', { name: /Slett/ }).click()
    await page.getByRole('alertdialog', { name: 'Slett Konkurranse B' }).getByLabel(/Skriv SLETT/).fill('SLETT')
    await page.getByRole('button', { name: 'Slett for alltid' }).click()
    await page.getByText('«Konkurranse B» er slettet.').waitFor()
    assert.deepStrictEqual(await titles(page), ['Konkurranse A', 'Konkurranse C'])
    assert.deepStrictEqual(state.compCalls.at(-1), ['DELETE', 'c2'])
    // etter reload: lagret rekkefølge og skjul gjelder
    await page.reload(); await page.getByText('Konkurranse C').waitFor()
    assert.strictEqual(await page.getByTestId('usynlig-merke').count(), 1)
    await ctx.close()
    // vanlig bruker: ser bare synlige, ingen administrer-knapp
    const s2 = freshState({ admin: false }); s2.comps = state.comps
    const u = await newPage(browser, s2)
    await u.page.goto(BASE + '/login'); await u.page.locator('#name').fill('Kari'); await u.page.locator('#pin').fill('123456'); await u.page.getByRole('button', { name: 'Logg inn' }).click()
    await u.page.getByRole('heading', { name: /God jul/ }).waitFor()
    await u.page.getByText('Konkurranse C').waitFor()
    assert.deepStrictEqual(await titles(u.page), ['Konkurranse C'])
    assert.strictEqual(await u.page.getByTestId('administrer').count(), 0)
    ok('forsiden: admin skjuler/viser, flytter opp og ned og sletter (med SLETT-bekreftelse); andre ser bare synlige')
    await u.ctx.close()
  }

  // --- Reduced motion ---
  {
    const state = freshState()
    const { ctx, page } = await newPage(browser, state, { reducedMotion: 'reduce' })
    await page.goto(BASE + '/login')
    assert.strictEqual(await page.locator('.snow').evaluate((e) => getComputedStyle(e).display), 'none')
    await ctx.close()
    const m = await newPage(browser, state, { reducedMotion: 'no-preference' })
    await m.page.goto(BASE + '/login')
    assert.notStrictEqual(await m.page.locator('.snow').evaluate((e) => getComputedStyle(e).display), 'none')
    await m.ctx.close()
    ok('snø skjules ved prefers-reduced-motion')
  }

  await browser.close()
  console.log(`\n${results.length} scenarier OK`)
})().catch((e) => { console.error('FEIL', e); process.exit(1) })
