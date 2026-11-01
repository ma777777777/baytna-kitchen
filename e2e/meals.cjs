// Meals of the day, demo mode: add a breakfast from the Week screen, move a main meal to
// lunch, check Today shows the day slot by slot and the list picks up breakfast ingredients.
// Usage: npm run build && npx vite preview --port 4173 & node e2e/meals.cjs [outDir]
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const BASE = process.env.BASE_URL || 'http://localhost:4173'
const out = process.argv[2] || path.join(__dirname, 'screens')
fs.mkdirSync(out, { recursive: true })

const L = {
  en: { lang: 'English', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', makeLunch: 'Make it lunch', plan: "Today's plan", lunchToday: 'Lunch today', tonight: 'Tonight', out: 'Eating out', remove: 'Remove', yogurt: 'Yogurt with fruit & walnuts', walnuts: 'Walnuts', labneh: "Labneh & za'atar pita triangles" },
  ar: { lang: 'العربية', breakfast: 'ترويقة', lunch: 'غدا', dinner: 'عشا', makeLunch: 'خلّوها غدا', plan: 'خطة اليوم', lunchToday: 'غدا اليوم', tonight: 'عشا الليلة', out: 'أكل برّا', remove: 'حذف', yogurt: 'لبن مع فواكه وجوز', walnuts: 'جوز', labneh: 'خبز محمّص مع لبنة وزعتر' },
}

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const checks = []
  const check = (name, ok) => {
    checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`)
    if (!ok) errors.push(name)
  }
  for (const lang of ['en', 'ar']) {
    const s = L[lang]
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(`${lang}: ${m.text()}`))
    const shot = async (name, full = true) => {
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(out, `${lang}-meals-${name}.png`), fullPage: full })
    }
    await page.goto(BASE)
    await page.getByRole('button', { name: s.lang }).first().click()

    // Today: the seeded breakfast and snack show in the day plan.
    check(`${lang}: today shows the day plan`, await page.getByText(s.plan, { exact: true }).isVisible())
    const todayText = await page.locator('main').innerText()
    check(`${lang}: today lists the seeded breakfast`, todayText.includes(s.breakfast) && todayText.includes(s.labneh))
    await shot('1-today')

    // Week: tomorrow's card. Add a breakfast from the chip.
    await page.goto(`${BASE}/#/week`)
    await page.waitForTimeout(300)
    await shot('2-week')
    const cards = page.locator('main .space-y-2 > div')
    let target = null
    for (let i = 0; i < (await cards.count()); i++) {
      const c = cards.nth(i)
      if ((await c.getByRole('button', { name: s.breakfast, exact: true }).count()) && (await c.getByRole('button', { name: s.makeLunch }).count())) {
        target = c
        break
      }
    }
    check(`${lang}: a future day offers + breakfast`, !!target)
    if (target) {
      await target.getByRole('button', { name: s.breakfast, exact: true }).click()
      await page.waitForTimeout(250)
      await shot('3-sheet', false)
      await page.getByRole('button', { name: new RegExp(s.yogurt) }).first().click()
      await page.waitForTimeout(250)
      check(`${lang}: picked breakfast shows on the day`, (await target.innerText()).includes(s.yogurt))

      // Move the main meal to lunch: label flips and the button offers dinner back.
      await target.getByRole('button', { name: s.makeLunch }).click()
      await page.waitForTimeout(250)
      const txt = await target.innerText()
      check(`${lang}: main meal moved to lunch`, txt.includes(s.lunch) && (await target.getByRole('button', { name: s.makeLunch }).count()) === 0)
      await shot('4-week-after')

      // Shopping list picks up the breakfast ingredient.
      await page.goto(`${BASE}/#/shop`)
      await page.waitForTimeout(300)
      check(`${lang}: list has walnuts for the breakfast`, (await page.locator('main').innerText()).includes(s.walnuts))

      // Remove it again.
      await page.goto(`${BASE}/#/week`)
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: new RegExp(s.yogurt) }).first().click()
      await page.getByRole('button', { name: s.remove }).click()
      await page.waitForTimeout(250)
      check(`${lang}: removed breakfast is gone`, (await page.getByRole('button', { name: new RegExp(s.yogurt) }).count()) === 0)
    }

    // Today: move today's main meal to lunch and back.
    await page.goto(`${BASE}/#/today`)
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: s.makeLunch }).first().click()
    await page.waitForTimeout(250)
    check(`${lang}: today's main card says lunch`, await page.getByText(s.lunchToday, { exact: true }).isVisible())
    await shot('5-today-lunch')
    await ctx.close()
  }
  await browser.close()
  console.log(checks.join('\n'))
  if (errors.length) {
    console.error('FAILED:\n' + errors.join('\n'))
    process.exit(1)
  }
  console.log(`OK, screenshots in ${out}`)
})()
