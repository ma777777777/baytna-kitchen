import { describe, expect, it } from 'vitest'
import { addDays, weekDates } from '../dates'
import { INGREDIENTS } from '../ingredients'
import { BUILT_IN_RECIPES, recipeAllergens } from '../recipes'
import type { PlanEntry, Recipe } from '../types'
import { recipeAvailability } from './availability'
import { isAllowed, safeSubs, visibleIngredients } from './filters'
import { alternativesFor, generateWeek, plannableDinners } from './planner'
import { buildList } from './shopping'
import { exhaustedOptions, snackPicks, todayNudges, tonightOptions } from './suggest'
import { DEFAULT_SETTINGS, type KitchenState } from './state'
import { matchIngredient, searchRecipes } from './search'

const SAT = '2026-10-31' // a Saturday = default shopping day

function state(over: Partial<KitchenState> = {}): KitchenState {
  return {
    today: SAT,
    settings: { ...DEFAULT_SETTINGS },
    recipes: BUILT_IN_RECIPES,
    pantry: {},
    plan: {},
    ratings: {},
    leftovers: [],
    members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    ...over,
  }
}

function withPlan(s: KitchenState, entries: PlanEntry[]): KitchenState {
  return { ...s, plan: Object.fromEntries(entries.map((e) => [e.date, e])) }
}

const recipe = (id: string) => BUILT_IN_RECIPES.find((r) => r.id === id)!

describe('recipe library', () => {
  it('has at least 35 complete recipes, including snacks and smoothies', () => {
    expect(BUILT_IN_RECIPES.length).toBeGreaterThanOrEqual(35)
    expect(BUILT_IN_RECIPES.filter((r) => r.kind === 'smoothie').length).toBeGreaterThanOrEqual(6)
    expect(BUILT_IN_RECIPES.filter((r) => r.kind === 'snack' || r.kind === 'breakfast').length).toBeGreaterThanOrEqual(10)
  })
  it('uses only known ingredients, with steps and names in both languages', () => {
    const ids = new Set<string>()
    for (const r of BUILT_IN_RECIPES) {
      expect(ids.has(r.id), r.id).toBe(false)
      ids.add(r.id)
      expect(r.name.en && r.name.ar, r.id).toBeTruthy()
      expect(r.steps.length, r.id).toBeGreaterThan(0)
      for (const s of r.steps) expect(s.en && s.ar, r.id).toBeTruthy()
      for (const ri of r.ingredients) expect(INGREDIENTS[ri.id], `${r.id}: ${ri.id}`).toBeTruthy()
    }
  })
  it('gives every chicken, minced meat and fish dinner a safety note', () => {
    for (const r of BUILT_IN_RECIPES) {
      const raw = r.ingredients.some((ri) => !ri.optional && INGREDIENTS[ri.id].raw)
      if (raw) expect(r.safety, r.id).toBeTruthy()
    }
  })
})

describe('scenario 1: empty pantry, generate 5 dinners', () => {
  const s = state()
  const week = generateWeek(s, { weekStart: SAT, seed: 3 })
  const s2 = withPlan(s, week)
  it('plans five distinct dinners plus a leftovers night and a free night', () => {
    const cooks = week.filter((e) => e.type === 'cook')
    expect(cooks).toHaveLength(5)
    expect(new Set(cooks.map((c) => c.recipeId)).size).toBe(5)
    expect(week.filter((e) => e.type === 'leftovers')).toHaveLength(1)
    expect(week.filter((e) => e.type === 'free')).toHaveLength(1)
  })
  it('includes at least one legume dinner and no more than two meat/chicken dinners', () => {
    const rs = week.filter((e) => e.recipeId).map((e) => recipe(e.recipeId!))
    expect(rs.some((r) => r.tags.includes('legumes'))).toBe(true)
    expect(rs.filter((r) => r.tags.includes('chicken') || r.tags.includes('meat')).length).toBeLessThanOrEqual(2)
  })
  it('never claims we own ingredients', () => {
    const list = buildList({ state: s2, weekStart: SAT })
    expect(list.length).toBeGreaterThan(5)
    expect(list.filter((i) => i.status === 'covered' || i.status === 'check')).toHaveLength(0)
    for (const e of week.filter((x) => x.recipeId)) {
      expect(recipeAvailability(recipe(e.recipeId!), {}, s.settings, SAT).status).not.toBe('ready')
    }
  })
  it('is deterministic for the same seed', () => {
    expect(generateWeek(s, { weekStart: SAT, seed: 3 })).toEqual(week)
  })
})

describe('scenario 2: shared ingredients merge', () => {
  const s = withPlan(state(), [
    { date: addDays(SAT, 1), type: 'cook', recipeId: 'chickpea_skillet', servings: 2 },
    { date: addDays(SAT, 2), type: 'cook', recipeId: 'tawook_skillet', servings: 2 },
    { date: addDays(SAT, 3), type: 'cook', recipeId: 'tuna_bean_salad', servings: 2 },
  ])
  const list = buildList({ state: s, weekStart: SAT })
  it('lists cucumber once with summed pieces from both recipes', () => {
    const cucumbers = list.filter((i) => i.ingredientId === 'cucumber')
    expect(cucumbers).toHaveLength(1)
    expect(cucumbers[0].needed).toEqual([{ qty: 3, unit: 'pc' }]) // 2 tawook + 1 tuna salad
    expect(cucumbers[0].uses.map((u) => u.recipeId)).toEqual(['tawook_skillet', 'tuna_bean_salad'])
  })
  it('merges lemons and keeps units compatible', () => {
    const lemon = list.find((i) => i.ingredientId === 'lemon')!
    expect(lemon.needed).toEqual([{ qty: 2, unit: 'pc' }])
    const garlic = list.find((i) => i.ingredientId === 'garlic')!
    expect(garlic.needed).toEqual([{ qty: 5, unit: 'clove' }])
  })
  it('converts compatible units (tbsp + ml) but never pieces to grams', () => {
    const s3 = withPlan(state(), [
      { date: addDays(SAT, 1), type: 'cook', recipeId: 'eggs_tomato', servings: 2 }, // tomato 4 pc
      { date: addDays(SAT, 2), type: 'cook', recipeId: 'cauliflower_tray', servings: 2 }, // olive oil 3 tbsp
      { date: addDays(SAT, 3), type: 'cook', recipeId: 'tuna_pasta', servings: 2 }, // olive oil 2 tbsp
    ])
    const l = buildList({ state: s3, weekStart: SAT })
    const oil = l.find((i) => i.ingredientId === 'olive_oil')!
    expect(oil.needed).toEqual([{ qty: 7, unit: 'tbsp' }]) // 2 + 3 + 2 tbsp, summed via ml
  })
})

describe('scenario 4: dislikes and allergies are hard filters', () => {
  const s = state({ settings: { ...DEFAULT_SETTINGS, allergies: ['peanut'], dislikes: ['minced_beef'] } })
  it('never plans or suggests a peanut or disliked dish, including snacks and smoothies', () => {
    for (let seed = 1; seed < 30; seed++) {
      const week = generateWeek(s, { weekStart: SAT, seed })
      for (const e of week.filter((x) => x.recipeId)) {
        const r = recipe(e.recipeId!)
        expect(recipeAllergens(r, false)).not.toContain('peanut')
        expect(visibleIngredients(r, s.settings).map((i) => i.id)).not.toContain('minced_beef')
      }
    }
    const picks = snackPicks(s)
    for (const p of [picks.snack, picks.smoothie]) {
      expect(visibleIngredients(p!.recipe!, s.settings).some((i) => INGREDIENTS[i.id].allergens?.includes('peanut'))).toBe(false)
    }
    for (const o of [...tonightOptions(s), ...exhaustedOptions(s)]) {
      if (o.recipe) expect(isAllowed(o.recipe, s.settings)).toBe(true)
    }
    expect(BUILT_IN_RECIPES.filter((r) => isAllowed(r, s.settings)).some((r) => r.id === 'sm_cocoa_pb')).toBe(false)
  })
  it('never suggests an allergen as a substitute', () => {
    expect(safeSubs('tahini', s.settings)).not.toContain('peanut_butter')
    expect(safeSubs('peanut_butter', { ...s.settings, allergies: ['sesame'] })).toEqual([])
  })
  it('drops "never again" dishes from plans', () => {
    const rated = state({ ratings: { foul: { a: 'never' } } })
    expect(plannableDinners(rated).some((r) => r.id === 'foul')).toBe(false)
  })
})

describe('scenario 5: raw chicken bought days before cooking', () => {
  const thu = addDays(SAT, 5)
  const s = withPlan(state(), [{ date: thu, type: 'cook', recipeId: 'tawook_skillet', servings: 2 }])
  it('marks the chicken "freeze on purchase" on the main list', () => {
    const chicken = buildList({ state: s, weekStart: SAT }).find((i) => i.ingredientId === 'chicken_breast')!
    expect(chicken.trip).toBe('main')
    expect(chicken.freezeUntil).toBe(thu)
  })
  it('nudges to move it to the fridge the evening before', () => {
    const wed = { ...s, today: addDays(thu, -1) }
    expect(todayNudges(wed, SAT)).toContainEqual({ code: 'defrost', ingredientId: 'chicken_breast', recipeId: 'tawook_skillet', forDate: thu })
  })
  it('does not ask to freeze chicken cooked the day after shopping', () => {
    const s2 = withPlan(state(), [{ date: addDays(SAT, 1), type: 'cook', recipeId: 'tawook_skillet', servings: 2 }])
    const chicken = buildList({ state: s2, weekStart: SAT }).find((i) => i.ingredientId === 'chicken_breast')!
    expect(chicken.freezeUntil).toBeUndefined()
  })
})

describe('scenario 6: exhausted night', () => {
  it('offers ≤15-minute dishes first, using known stock, plus a pantry backup', () => {
    const s = state({
      pantry: {
        eggs: { id: 'eggs', status: 'have' },
        labneh: { id: 'labneh', status: 'have' },
        canned_fava: { id: 'canned_fava', status: 'have' },
      },
    })
    const opts = exhaustedOptions(s)
    const quick = opts.filter((o) => o.slot === 'quick')
    expect(quick.length).toBeGreaterThan(0)
    for (const o of quick) expect(o.recipe!.prepMin + o.recipe!.cookMin).toBeLessThanOrEqual(15)
    expect(opts.some((o) => o.slot === 'emergency' && o.recipe!.tags.includes('pantry'))).toBe(true)
  })
})

describe('scenario 7: "have" without quantity', () => {
  it('shows "check amount" instead of subtracting', () => {
    const s = withPlan(state({ pantry: { tomato: { id: 'tomato', status: 'have' } } }), [
      { date: addDays(SAT, 1), type: 'cook', recipeId: 'eggs_tomato', servings: 2 },
    ])
    const tomato = buildList({ state: s, weekStart: SAT }).find((i) => i.ingredientId === 'tomato')!
    expect(tomato.status).toBe('check')
    expect(tomato.toBuy).toEqual([{ qty: 4, unit: 'pc' }])
  })
  it('subtracts a known compatible quantity', () => {
    const s = withPlan(state({ pantry: { red_lentils: { id: 'red_lentils', status: 'have', qty: 0.5, unit: 'kg' } } }), [
      { date: addDays(SAT, 1), type: 'cook', recipeId: 'shorbet_adas', servings: 2 },
    ])
    const lentils = buildList({ state: s, weekStart: SAT }).find((i) => i.ingredientId === 'red_lentils')!
    expect(lentils.status).toBe('covered')
  })
  it('never subtracts incompatible units', () => {
    const s = withPlan(state({ pantry: { onion: { id: 'onion', status: 'have', qty: 500, unit: 'g' } } }), [
      { date: addDays(SAT, 1), type: 'cook', recipeId: 'eggs_tomato', servings: 2 },
    ])
    const onion = buildList({ state: s, weekStart: SAT }).find((i) => i.ingredientId === 'onion')!
    expect(onion.status).toBe('check')
  })
  it('does not count items bought from this week\'s list against it', () => {
    const s = withPlan(state({ pantry: { tomato: { id: 'tomato', status: 'have', boughtOn: SAT } } }), [
      { date: addDays(SAT, 1), type: 'cook', recipeId: 'eggs_tomato', servings: 2 },
    ])
    expect(buildList({ state: s, weekStart: SAT }).find((i) => i.ingredientId === 'tomato')!.status).toBe('need')
  })
})

describe('scenario 8: scaling servings', () => {
  it('doubles quantities and subtracts owned stock once', () => {
    const base = state({ pantry: { red_lentils: { id: 'red_lentils', status: 'have', qty: 300, unit: 'g' } } })
    const two = buildList({ state: withPlan(base, [{ date: addDays(SAT, 1), type: 'cook', recipeId: 'shorbet_adas', servings: 2 }]), weekStart: SAT })
    const four = buildList({ state: withPlan(base, [{ date: addDays(SAT, 1), type: 'cook', recipeId: 'shorbet_adas', servings: 4 }]), weekStart: SAT })
    expect(two.find((i) => i.ingredientId === 'red_lentils')!.status).toBe('covered') // 200 g ≤ 300 g
    const l4 = four.find((i) => i.ingredientId === 'red_lentils')!
    expect(l4.needed).toEqual([{ qty: 400, unit: 'g' }])
    expect(l4.status).toBe('need_more')
    expect(l4.toBuy).toEqual([{ qty: 100, unit: 'g' }])
    expect(four.find((i) => i.ingredientId === 'carrot')!.needed).toEqual([{ qty: 2, unit: 'pc' }])
  })
})

describe('scenario 9: plan edits update the list', () => {
  it('rebuilds from the plan, so swapping a night changes the list', () => {
    const d = addDays(SAT, 1)
    const a = buildList({ state: withPlan(state(), [{ date: d, type: 'cook', recipeId: 'foul', servings: 2 }]), weekStart: SAT })
    const b = buildList({ state: withPlan(state(), [{ date: d, type: 'cook', recipeId: 'tuna_pasta', servings: 2 }]), weekStart: SAT })
    expect(a.some((i) => i.ingredientId === 'canned_fava')).toBe(true)
    expect(b.some((i) => i.ingredientId === 'canned_fava')).toBe(false)
  })
})

describe('scenario 10: leftovers use-first', () => {
  it('shows leftover soup with days left and offers it first tonight', () => {
    const s = state({
      today: addDays(SAT, 2),
      leftovers: [{ id: 'l1', label: 'Lentil soup', recipeId: 'shorbet_adas', madeOn: SAT, place: 'fridge', status: 'active' }],
    })
    const nudge = todayNudges(s, SAT).find((n) => n.code === 'leftover')
    expect(nudge).toMatchObject({ code: 'leftover', daysLeft: 1 })
    expect(tonightOptions(s)[0].slot).toBe('leftovers')
  })
})

describe('fresh top-up', () => {
  it('moves late-week fresh herbs to the midweek top-up and keeps early ones on the main shop', () => {
    const s = withPlan(state(), [
      { date: addDays(SAT, 1), type: 'cook', recipeId: 'chicken_fattoush', servings: 2 },
      { date: addDays(SAT, 6), type: 'cook', recipeId: 'kafta_patties', servings: 2 },
    ])
    const parsley = buildList({ state: s, weekStart: SAT }).filter((i) => i.ingredientId === 'parsley')
    expect(parsley.map((p) => p.trip).sort()).toEqual(['main', 'topup'])
  })
})

describe('planning helpers', () => {
  it('keeps locked nights and offers different alternatives for one night', () => {
    const s = state()
    const locked = { [addDays(SAT, 1)]: { date: addDays(SAT, 1), type: 'cook' as const, recipeId: 'mujaddara', servings: 2 } }
    const week = generateWeek(s, { weekStart: SAT, locked, seed: 9 })
    expect(week[1].recipeId).toBe('mujaddara')
    const s2 = withPlan(s, week)
    const alts = alternativesFor(s2, SAT, addDays(SAT, 2))
    expect(alts).toHaveLength(3)
    expect(alts.map((a) => a.recipe.id)).not.toContain(week[2].recipeId)
    expect(weekDates(SAT)).toHaveLength(7)
  })
  it('respects "away" days', () => {
    const types = ['free', 'cook', 'cook', 'away', 'cook', 'cook', 'away'] as const
    const week = generateWeek(state(), { weekStart: SAT, types: [...types] })
    expect(week.filter((e) => e.type === 'cook')).toHaveLength(4)
    expect(week[3]).toEqual({ date: addDays(SAT, 3), type: 'away' })
  })
})

describe('search', () => {
  it('finds dishes by Arabic, English and transliteration', () => {
    const names = (q: string) => searchRecipes(BUILT_IN_RECIPES, q).map((r: Recipe) => r.id)
    expect(names('عدس')).toContain('shorbet_adas')
    expect(names('adas')).toContain('mujaddara')
    expect(names('khiyar')).toContain('tawook_skillet')
    expect(names('tawook')).toContain('tawook_skillet')
    expect(names('لبنة')).toContain('labneh_plate')
  })
  it('matches free-text list items to ingredients', () => {
    expect(matchIngredient('2 cucumbers')).toBe('cucumber')
    expect(matchIngredient('خيار ٢')).toBe('cucumber')
    expect(matchIngredient('labneh')).toBe('labneh')
    expect(matchIngredient('dish soap')).toBeUndefined()
  })
})
