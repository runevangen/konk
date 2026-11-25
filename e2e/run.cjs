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
      return single([{ id: UID, display_name: 'Kari Nordmann', office_id: 'of1', anonymous: false, is_admin: !!state.admin }])
    }
    if (p.endsWith('/rest/v1/konk_competitions')) {
      const c = { ...COMP, status: state.status, live_board: state.liveOff ? false : true, live_board_names: !!state.names }
      if (q.get('slug')) return single(eq('slug') === c.slug ? [c] : [])
      return json([c])
    }
    if (p.endsWith('/rest/v1/konk_items')) {
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': `0-0/${ITEMS.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } })
      return json(ITEMS)
    }
    if (p.endsWith('/rest/v1/konk_guess_options')) return json(OPTIONS)
    if (p.endsWith('/rest/v1/konk_entries')) {
      if (req.method() === 'POST') { const b = req.postDataJSON(); state.saves.push(b); state.entries[b.item_id] = { id: 'e' + b.item_id, ...b }; return json([], 201) }
      return json(Object.values(state.entries))
    }
    if (p.endsWith('/rpc/konk_my_progress')) return json(Object.keys(state.entries).length)
    if (p.endsWith('/rpc/konk_live_board')) {
      if (state.liveOff) return json({ message: 'live_off' }, 400)
      state.liveCalls = (state.liveCalls || 0) + 1
      const bump = state.liveCalls > 1 ? 1 : 0
      const off = (id, name, a, n) => ({ office_id: id, name, avg_score: a, n })
      return json({
        status: state.status, min_n: 2, names: !!state.names, updated_at: '2026-12-01T10:00:00Z',
        overall: { n_entries: 7 + bump, participants: 3, avg: 7.2 },
        offices: [{ office_id: 'of1', name: 'Oslo', avg_score: 7.8, n_entries: 4, participants: 2 }, { office_id: 'of2', name: 'Stavanger', avg_score: null, n_entries: 1, participants: 1 }],
        items: [
          { item_id: 'i1', position: 1, label: 'Glass 1', brus: state.names ? 'Ringnes' : null, avg_score: 6.5 + bump, n: 3, by_office: [off('of1', 'Oslo', 7, 2), off('of2', 'Stavanger', null, 1)] },
          { item_id: 'i2', position: 2, label: 'Glass 2', brus: state.names ? 'Askim' : null, avg_score: 8.25, n: 4, by_office: [off('of1', 'Oslo', 8.5, 3), off('of2', 'Stavanger', null, 1)] },
        ],
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
    assert.strictEqual(await page.getByRole('button', { name: 'Fortsett til Konk' }).isDisabled(), true)
    await shot(page, '02-registrer-pin')
    await page.getByLabel('Jeg har lagret pinkoden').check()
    await page.getByRole('button', { name: 'Fortsett til Konk' }).click()
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
    // rangering uten glassnavn: plass 1 = 8,25, plass 2 = 6,50
    const first = await page.locator('.bar-row strong').first().innerText()
    assert.strictEqual(first, 'Plass 1')
    assert.ok(!(await page.locator('main, #root').first().innerText()).includes('Glass 2'), 'glassnavn skal ikke vises på tavlen')
    assert.strictEqual(await page.locator('.bar-row strong').nth(1).innerText(), '8,25')
    await page.getByText('8,25').first().waitFor()
    await shot(page, '08-live-tavle-samlet')
    await page.getByRole('tab', { name: 'Stavanger' }).click()
    await page.getByText('venter').first().waitFor()
    assert.ok(!(await page.content()).includes('Safteriet'), 'fasit/brusnavn på tavlen')
    await page.getByRole('tab', { name: 'Oslo' }).click()
    await page.getByText('8,50').waitFor()
    await shot(page, '09-live-tavle-oslo')
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
    assert.strictEqual(await page.locator('.bar-row strong').first().innerText(), 'Askim')
    await page.getByText('Ringnes').first().waitFor()
    assert.ok(!(await page.locator('main, #root').first().innerText()).includes('Plass 1'), 'plassnavn skal ikke vises når brusnavn finnes')
    await shot(page, '13-live-tavle-brusnavn')
    ok('live tavle: viser brusnavn når admin har slått det på')
    await ctx.close()
  }
  {
    const state = freshState({ status: 'open', liveOff: true })
    const { ctx, page } = await newPage(browser, state)
    await page.goto(BASE + '/login'); await page.locator('#name').fill('Kari'); await page.locator('#pin').fill('123456'); await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.getByRole('heading', { name: /God jul/ }).waitFor()
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
