// Demo-mode walkthrough on an iPhone-sized viewport; saves screenshots and fails on console errors.
// Usage: npm run build && npx vite preview --port 4173 & node e2e/screens.cjs [outDir]
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const BASE = process.env.BASE_URL || 'http://localhost:4173'
const out = process.argv[2] || path.join(__dirname, 'screens')
fs.mkdirSync(out, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  for (const lang of ['en', 'ar']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(`${lang}: ${m.text()}`))
    await page.goto(BASE)
    await page.getByRole('button', { name: lang === 'ar' ? 'العربية' : 'English' }).first().click()
    const shot = async (name) => {
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(out, `${lang}-${name}.png`), fullPage: true })
    }
    await shot('1-today')
    if (lang === 'ar') {
      const dir = await page.evaluate(() => document.documentElement.dir)
      if (dir !== 'rtl') errors.push('Arabic layout is not RTL')
    }
    await page.goto(`${BASE}/#/week`)
    await shot('2-week')
    await page.goto(`${BASE}/#/shop`)
    await shot('3-shop')
    await page.goto(`${BASE}/#/shop/staples`)
    await shot('4-staples')
    await page.goto(`${BASE}/#/recipes`)
    await shot('5-recipes')
    await page.goto(`${BASE}/#/recipe/tawook_skillet`)
    await shot('6-recipe')
    await page.goto(`${BASE}/#/cook/shorbet_adas/2`)
    await shot('7-cook')
    await page.goto(`${BASE}/#/settings`)
    await shot('8-settings')
    await page.goto(`${BASE}/#/today`)
    await page.getByRole('button', { name: lang === 'ar' ? /تعبانين/ : /too tired/i }).first().click()
    await shot('9-exhausted')
    await ctx.close()
  }
  await browser.close()
  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'))
    process.exit(1)
  }
  console.log('screens saved to', out)
})()
