// Real end-to-end test of two spouses on two phones against a running Supabase
// (local: `npx supabase start`). Covers sign-in by email code, household creation,
// invite + join, live sync of list ticks and plan edits, and offline queueing.
// Usage: build with VITE_SUPABASE_* pointing at the instance, serve it, then
//   BASE_URL=http://localhost:4174 MAILPIT_URL=http://127.0.0.1:54324 node e2e/two-phones.cjs
const { chromium } = require('playwright')
const BASE = process.env.BASE_URL || 'http://localhost:4174'
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:54324'
const run = Date.now()
const results = []
const ok = (name) => (results.push(name), console.log('✓', name))

async function codeFor(email) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()
    const msg = list.messages?.[0]
    if (msg) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json()
      const m = (full.Text || full.HTML || '').match(/\b(\d{6,10})\b/)
      if (m) return m[1]
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('no email code for ' + email)
}

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`[${name}] pageerror`, e.message))
  return { ctx, page }
}

async function signIn(page, email, displayName) {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.locator('input[autocomplete="one-time-code"]').fill(await codeFor(email))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Your name').fill(displayName)
}

;(async () => {
  const browser = await chromium.launch()
  const A = await phone(browser, 'A')
  const B = await phone(browser, 'B')
  global.__pages = { A: A.page, B: B.page }
  const emailA = `a${run}@example.com`
  const emailB = `b${run}@example.com`

  // Spouse A creates the kitchen
  await signIn(A.page, emailA, 'Mostafa')
  await A.page.getByRole('button', { name: 'Create our kitchen' }).click()
  await A.page.getByText('What are we eating today?').waitFor()
  ok('A signs in with an email code and creates the kitchen')

  // A drafts and confirms a week (scenario 1: empty pantry)
  await A.page.goto(`${BASE}/#/week`)
  await A.page.getByRole('button', { name: 'Draft this week' }).click()
  await A.page.getByRole('button', { name: /make the shopping list/ }).click()
  await A.page.getByRole('checkbox').first().waitFor()
  const checkAmount = await A.page.getByText('Check amount').count()
  if (checkAmount !== 0) throw new Error('claimed stock with an empty pantry')
  ok('A drafts the week; list is built without claiming any stock')

  // A invites B
  await A.page.goto(`${BASE}/#/settings`)
  await A.page.getByRole('button', { name: 'Invite your partner' }).click()
  const code = (await A.page.locator('p.font-mono').textContent()).trim()
  ok(`A creates invite code ${code}`)

  // B joins via the link
  await B.page.goto(`${BASE}/?join=${code}`)
  await B.page.getByRole('button', { name: 'English' }).click()
  await B.page.getByLabel('Email').fill(emailB)
  await B.page.getByRole('button', { name: 'Email me a code' }).click()
  await B.page.locator('input[autocomplete="one-time-code"]').fill(await codeFor(emailB))
  await B.page.getByRole('button', { name: 'Continue' }).click()
  await B.page.getByLabel('Your name').fill('Partner')
  await B.page.getByRole('button', { name: 'Join' }).click()
  await B.page.getByText('What are we eating today?').waitFor()
  ok('B signs in from the invite link and joins the same kitchen')

  // Scenario 3: B ticks the first item; A sees it without refreshing
  await A.page.goto(`${BASE}/#/shop`)
  await B.page.goto(`${BASE}/#/shop`)
  const firstB = B.page.getByRole('checkbox').first()
  await firstB.waitFor()
  const item = await firstB.getAttribute('aria-label')
  await firstB.click()
  const t0 = Date.now()
  await A.page.getByRole('button', { name: /In the basket \(1\)/ }).waitFor({ timeout: 15000 })
  ok(`B ticks "${item}"; A sees it in the basket after ${Date.now() - t0} ms, no refresh`)

  // Scenario 9: A swaps a night; B's week shows the change and the list follows
  await B.page.goto(`${BASE}/#/week`)
  await A.page.goto(`${BASE}/#/week`)
  const before = await B.page.locator('main').innerText()
  const swap = A.page.getByRole('button', { name: 'Swap' }).first()
  await swap.click()
  await A.page.locator('[role=dialog] button').nth(1).click()
  await B.page.waitForFunction((prev) => document.querySelector('main').innerText !== prev, before, { timeout: 15000 })
  ok('A swaps a dinner; B\'s week updates live')

  // Scenario 11: B goes offline, ticks an item, it queues, then syncs on reconnect
  await B.page.goto(`${BASE}/#/shop`)
  await A.page.goto(`${BASE}/#/shop`)
  await B.page.getByRole('checkbox', { checked: false }).first().waitFor()
  await B.ctx.setOffline(true)
  await B.page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await B.page.getByRole('checkbox', { checked: false }).first().click()
  await B.page.getByText(/waiting|Offline/).first().waitFor()
  ok('B ticks an item offline; the change is kept and shown as waiting')
  await B.ctx.setOffline(false)
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')))
  await A.page.getByRole('button', { name: /In the basket \(2\)/ }).waitFor({ timeout: 20000 })
  ok('B reconnects; A sees the second tick')

  // Leftovers: B records one, A picks that exact leftover for tonight, B marks it finished
  const dish = `Soup ${run % 1000}`
  await B.page.goto(`${BASE}/#/shop/staples`)
  await B.page.getByRole('button', { name: 'Add leftovers' }).first().click()
  await B.page.getByPlaceholder('What is it?').fill(dish)
  await B.page.locator('[role=dialog]').getByRole('button', { name: 'Save' }).click()
  await A.page.goto(`${BASE}/#/today`)
  await A.page.getByRole('button', { name: 'Other ideas' }).first().click()
  const card = A.page.locator('[role=dialog] div').filter({ hasText: dish }).filter({ has: A.page.getByRole('button', { name: 'Eat leftovers' }) }).last()
  await card.getByRole('button', { name: 'Eat leftovers' }).click({ timeout: 15000 })
  await A.page.getByRole('heading', { name: dish }).waitFor()
  ok('A picks the specific leftover B recorded; Today shows that leftover')
  await B.page.goto(`${BASE}/#/today`)
  await B.page.getByRole('heading', { name: dish }).waitFor({ timeout: 15000 })
  await B.page.getByRole('button', { name: 'We finished it' }).click()
  await A.page.goto(`${BASE}/#/shop/staples`)
  await A.page.getByText('Leftovers', { exact: true }).waitFor()
  await A.page.waitForFunction((d) => !document.querySelector('main').innerText.includes(d), dish, { timeout: 15000 })
  ok('B marks it finished; it leaves both phones\' leftovers')

  // Offline reload: cached app + data still render (service worker must be active first)
  await B.page.goto(`${BASE}/#/shop`)
  await B.page.getByRole('button', { name: /In the basket/ }).waitFor()
  await B.page.evaluate(() => navigator.serviceWorker.ready)
  await B.ctx.setOffline(true)
  await B.page.reload().catch(() => {})
  await B.page.getByRole('button', { name: /In the basket/ }).waitFor({ timeout: 15000 })
  ok('B reloads while offline; the last synced list still appears')

  await browser.close()
  console.log(`\nALL ${results.length} TWO-PHONE CHECKS PASSED`)
})().catch(async (e) => {
  console.error('FAILED:', e.message.split('\n')[0])
  for (const [n, p] of Object.entries(global.__pages ?? {})) {
    await p.screenshot({ path: `${process.env.SHOTS || '/tmp'}/fail-${n}.png`, fullPage: true }).catch(() => {})
  }
  process.exit(1)
})
