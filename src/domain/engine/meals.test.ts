// Meals of the day: extra meals (breakfast, snack, the other of lunch/dinner) feed the
// shopping list, the defrost reminders, and the "used up" check like the main meal does.
import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { BUILT_IN_RECIPES } from '../recipes'
import type { MealEntry, PantryItem, PlanEntry } from '../types'
import { usedUpBy } from './availability'
import { buildList, changesAfterShopping, type Amount } from './shopping'
import { todayNudges } from './suggest'
import { DEFAULT_SETTINGS, cooksOn, mainSlot, withEntry, type KitchenState } from './state'

const SAT = '2026-10-31'
const SUN = addDays(SAT, 1)

function state(over: Partial<KitchenState> = {}): KitchenState {
  return {
    today: SAT,
    settings: { ...DEFAULT_SETTINGS },
    recipes: BUILT_IN_RECIPES,
    pantry: {},
    plan: {},
    meals: {},
    ratings: {},
    leftovers: [],
    members: [{ id: 'a', name: 'A' }],
    ...over,
  }
}
const plan = (entries: PlanEntry[]) => Object.fromEntries(entries.map((e) => [e.date, e]))
const meals = (entries: MealEntry[]) => {
  const out: NonNullable<KitchenState['meals']> = {}
  for (const m of entries) (out[m.date] ??= {})[m.slot] = m
  return out
}

describe('meals of the day', () => {
  it('the main meal is dinner unless moved to lunch', () => {
    expect(mainSlot(undefined)).toBe('dinner')
    expect(mainSlot({ date: SUN, type: 'cook', meal: 'lunch' })).toBe('lunch')
  })

  it('lists every dish of the day: main meal plus extras with a recipe', () => {
    const s = state({
      plan: plan([{ date: SUN, type: 'cook', recipeId: 'shorbet_adas' }]),
      meals: meals([
        { date: SUN, slot: 'breakfast', type: 'cook', recipeId: 'labneh_zaatar_triangles', servings: 2 },
        { date: SUN, slot: 'snack', type: 'note', note: 'fruit' },
        { date: SUN, slot: 'lunch', type: 'out' },
      ]),
    })
    expect(cooksOn(s, SUN).map((c) => c.recipeId)).toEqual(['shorbet_adas', 'labneh_zaatar_triangles'])
  })

  it('ignores a stray extra sitting in the main meal slot', () => {
    const s = state({
      plan: plan([{ date: SUN, type: 'cook', recipeId: 'shorbet_adas', meal: 'lunch' }]),
      meals: meals([{ date: SUN, slot: 'lunch', type: 'cook', recipeId: 'tawook_skillet' }]),
    })
    expect(cooksOn(s, SUN).map((c) => c.recipeId)).toEqual(['shorbet_adas'])
  })

  it('puts breakfast ingredients on the shopping list, scaled to servings', () => {
    const one = state({ meals: meals([{ date: SUN, slot: 'breakfast', type: 'cook', recipeId: 'labneh_zaatar_triangles', servings: 1 }]) })
    const two = state({ meals: meals([{ date: SUN, slot: 'breakfast', type: 'cook', recipeId: 'labneh_zaatar_triangles', servings: 2 }]) })
    const labneh = (s: KitchenState) => buildList({ state: s, weekStart: SAT, from: SAT }).find((i) => i.ingredientId === 'labneh')
    expect(labneh(one)?.needed).toEqual([{ qty: 60, unit: 'g' }])
    expect(labneh(two)?.needed).toEqual([{ qty: 120, unit: 'g' }])
    expect(labneh(two)?.uses).toEqual([{ date: SUN, recipeId: 'labneh_zaatar_triangles' }])
  })

  it('adds up an ingredient shared by the main meal and an extra', () => {
    const s = state({
      plan: plan([{ date: SUN, type: 'cook', recipeId: 'labneh_zaatar_triangles', servings: 1 }]),
      meals: meals([{ date: SUN, slot: 'breakfast', type: 'cook', recipeId: 'labneh_zaatar_triangles', servings: 1 }]),
    })
    const item = buildList({ state: s, weekStart: SAT, from: SAT }).find((i) => i.ingredientId === 'labneh')
    expect(item?.needed).toEqual([{ qty: 120, unit: 'g' }])
  })

  it('leaves notes, leftovers and eating out off the list', () => {
    const s = state({
      meals: meals([
        { date: SUN, slot: 'breakfast', type: 'note', note: 'labneh' },
        { date: SUN, slot: 'lunch', type: 'leftovers' },
        { date: SUN, slot: 'snack', type: 'out' },
      ]),
    })
    expect(buildList({ state: s, weekStart: SAT, from: SAT })).toEqual([])
  })

  it('flags a breakfast added after shopping started as new on the list', () => {
    const s = state({ plan: plan([{ date: SUN, type: 'cook', recipeId: 'shorbet_adas', servings: 2 }]) })
    const ticked: Record<string, { checked: boolean; bought: Amount[] }> = {}
    for (const it of buildList({ state: s, weekStart: SAT, from: SAT })) ticked[it.key] = { checked: true, bought: it.needed }
    const r = changesAfterShopping(s, { date: SUN, slot: 'breakfast', type: 'cook', recipeId: 'labneh_zaatar_triangles', servings: 2 }, SAT, (k) => ticked[k] ?? {})
    expect(r.started).toBe(true)
    expect(r.newKeys).toContain('labneh@main')
  })

  it('withEntry replaces only the meal it is given', () => {
    const s = state({ plan: plan([{ date: SUN, type: 'cook', recipeId: 'shorbet_adas' }]) })
    const next = withEntry(s, { date: SUN, slot: 'snack', type: 'out' })
    expect(next.plan).toBe(s.plan)
    expect(next.meals?.[SUN]?.snack?.type).toBe('out')
  })

  it('keeps a bought ingredient when a later extra meal still needs it', () => {
    const pantry: Record<string, PantryItem> = { chicken_breast: { id: 'chicken_breast', status: 'have', boughtOn: SAT } }
    const tawook = BUILT_IN_RECIPES.find((r) => r.id === 'tawook_skillet')!
    const s = state({
      pantry,
      plan: plan([{ date: SAT, type: 'cook', recipeId: 'tawook_skillet' }]),
      meals: meals([{ date: addDays(SAT, 2), slot: 'lunch', type: 'cook', recipeId: 'chicken_fattoush' }]),
    })
    expect(usedUpBy(tawook, s, SAT)).not.toContain('chicken_breast')
    expect(usedUpBy(tawook, { ...s, meals: {} }, SAT)).toContain('chicken_breast')
  })

  it('reminds to defrost meat for an extra lunch tomorrow', () => {
    const day = addDays(SAT, 3)
    const s = state({ today: addDays(day, -1), meals: meals([{ date: day, slot: 'lunch', type: 'cook', recipeId: 'tawook_skillet' }]) })
    expect(todayNudges(s, SAT).some((n) => n.code === 'defrost')).toBe(true)
  })
})
