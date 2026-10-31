// Regression tests for the four pre-deploy review issues.
import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { BUILT_IN_RECIPES } from '../recipes'
import type { Leftover, PantryItem, PlanEntry } from '../types'
import { stockOf, usedUpBy } from './availability'
import { buildList, changesAfterShopping, stillToBuy, type Amount } from './shopping'
import { edibleLeftovers, exhaustedOptions, leftoverDaysLeft, todayNudges, tonightOptions } from './suggest'
import { DEFAULT_SETTINGS, type KitchenState } from './state'

const SAT = '2026-10-31'

function state(over: Partial<KitchenState> = {}): KitchenState {
  return {
    today: SAT,
    settings: { ...DEFAULT_SETTINGS },
    recipes: BUILT_IN_RECIPES,
    pantry: {},
    plan: {},
    ratings: {},
    leftovers: [],
    members: [{ id: 'a', name: 'A' }],
    ...over,
  }
}
const plan = (entries: PlanEntry[]) => Object.fromEntries(entries.map((e) => [e.date, e]))
const recipe = (id: string) => BUILT_IN_RECIPES.find((r) => r.id === id)!
const soup = (madeOn: string, over: Partial<Leftover> = {}): Leftover => ({
  id: `soup-${madeOn}`,
  label: 'Shorbet adas',
  recipeId: 'shorbet_adas',
  madeOn,
  place: 'fridge',
  status: 'active',
  ...over,
})

describe('1. expired leftovers are never suggested', () => {
  it('offers a leftover inside its window but not one past it', () => {
    const fresh = soup(addDays(SAT, -1))
    const old = soup(addDays(SAT, -5))
    const s = state({ leftovers: [old, fresh] })
    expect(leftoverDaysLeft(s, old)).toBeLessThan(0)
    for (const opts of [tonightOptions(s), exhaustedOptions(s)]) {
      const offered = opts.filter((o) => o.leftover).map((o) => o.leftover!.id)
      expect(offered).toEqual([fresh.id])
    }
  })
  it('never offers freezer portions as ready tonight, nor eaten or tossed ones', () => {
    const s = state({
      leftovers: [soup(SAT, { id: 'f', place: 'freezer' }), soup(SAT, { id: 'e', status: 'eaten' }), soup(SAT, { id: 't', status: 'tossed' })],
    })
    expect(edibleLeftovers(s)).toEqual([])
    expect(tonightOptions(s).some((o) => o.leftover)).toBe(false)
  })
  it('gives "eat fresh" dishes one day at most, and nothing more than 4 days', () => {
    const eggs = { ...soup(addDays(SAT, -2)), recipeId: 'ijjeh' }
    expect(leftoverDaysLeft(state(), eggs)).toBeLessThan(0)
    const custom: Leftover = { ...soup(addDays(SAT, -4)), recipeId: undefined }
    expect(leftoverDaysLeft(state(), custom)).toBeLessThan(0)
  })
  it('still raises a nudge for the expired one (so it can be thrown out)', () => {
    const old = soup(addDays(SAT, -5))
    const n = todayNudges(state({ leftovers: [old] }), SAT)
    expect(n.some((x) => x.code === 'leftover' && x.daysLeft < 0)).toBe(true)
  })
})

describe('2. bought items stop counting once their meals are past', () => {
  const chicken: PantryItem = { id: 'chicken_breast', status: 'have', boughtOn: SAT, usedBy: addDays(SAT, 3) }
  it('counts a bought item as "have" until its last planned use, then asks again', () => {
    expect(stockOf('chicken_breast', { chicken_breast: chicken }, addDays(SAT, 3))).toBe('have')
    expect(stockOf('chicken_breast', { chicken_breast: chicken }, addDays(SAT, 4))).toBe('unknown')
  })
  it('lets non-fresh pantry goods bought without a planned use stay "have"', () => {
    const lentils: PantryItem = { id: 'red_lentils', status: 'have', boughtOn: SAT }
    expect(stockOf('red_lentils', { red_lentils: lentils }, addDays(SAT, 30))).toBe('have')
  })
  it('decays raw meat bought off-plan after its keep days', () => {
    const extra: PantryItem = { id: 'chicken_breast', status: 'have', boughtOn: SAT }
    expect(stockOf('chicken_breast', { chicken_breast: extra }, addDays(SAT, 5))).toBe('unknown')
  })
  it('never expires staples by plan date (they are managed by hand)', () => {
    const rice: PantryItem = { id: 'rice', status: 'have', boughtOn: SAT, usedBy: addDays(SAT, 1), staple: true }
    expect(stockOf('rice', { rice }, addDays(SAT, 10))).toBe('have')
  })
  it('after cooking, releases bought ingredients that no later dinner needs', () => {
    const r = recipe('tawook_skillet')
    const pantry: Record<string, PantryItem> = {
      chicken_breast: { id: 'chicken_breast', status: 'have', boughtOn: SAT, usedBy: addDays(SAT, 5) },
      garlic: { id: 'garlic', status: 'have', boughtOn: SAT, staple: true },
    }
    const s = state({ pantry, plan: plan([{ date: SAT, type: 'cook', recipeId: r.id }]) })
    const used = usedUpBy(r, s, SAT)
    expect(used).toContain('chicken_breast')
    expect(used).not.toContain('garlic')
    // ...but keeps it when another planned dinner still needs it
    const later = state({ pantry, plan: plan([{ date: SAT, type: 'cook', recipeId: r.id }, { date: addDays(SAT, 2), type: 'cook', recipeId: 'chicken_fattoush' }]) })
    expect(usedUpBy(r, later, SAT)).not.toContain('chicken_breast')
  })
})

describe('3. a meal change after shopping flags what is newly needed', () => {
  it('reports the extra amount beyond what was ticked, ignoring tiny drift', () => {
    const bought: Amount[] = [{ qty: 500, unit: 'g' }]
    expect(stillToBuy([{ qty: 1, unit: 'kg' }], bought)).toEqual([{ qty: 500, unit: 'g' }])
    expect(stillToBuy([{ qty: 520, unit: 'g' }], bought)).toEqual([])
    expect(stillToBuy([{ qty: 3, unit: 'pc' }], bought)).toEqual([{ qty: 3, unit: 'pc' }])
    expect(stillToBuy([{ qty: 1, unit: 'kg' }], undefined)).toEqual([])
  })
  it('finds new items and bigger quantities once anything on the list was ticked', () => {
    const s = state({ plan: plan([{ date: addDays(SAT, 1), type: 'cook', recipeId: 'shorbet_adas', servings: 2 }]) })
    const list = buildList({ state: s, weekStart: SAT, from: SAT })
    const ticked: Record<string, { checked: boolean; bought: Amount[] }> = {}
    for (const it of list) ticked[it.key] = { checked: true, bought: it.needed }
    const look = (k: string) => ticked[k] ?? {}

    // Double the soup and add a chicken dinner the next night.
    const bigger = changesAfterShopping(s, { date: addDays(SAT, 1), type: 'cook', recipeId: 'shorbet_adas', servings: 4 }, SAT, look)
    expect(bigger.started).toBe(true)
    expect(bigger.count).toBeGreaterThan(0)
    expect(bigger.newKeys).toEqual([])

    const swapped = changesAfterShopping(s, { date: addDays(SAT, 2), type: 'cook', recipeId: 'tawook_skillet' }, SAT, look)
    expect(swapped.newKeys).toContain('chicken_breast@main')
  })
  it('does nothing before shopping has started', () => {
    const s = state({ plan: plan([{ date: addDays(SAT, 1), type: 'cook', recipeId: 'shorbet_adas' }]) })
    const r = changesAfterShopping(s, { date: addDays(SAT, 2), type: 'cook', recipeId: 'tawook_skillet' }, SAT, () => ({}))
    expect(r).toEqual({ started: false, newKeys: [], count: 0 })
  })
})

describe('4. a chosen leftover is the one offered and tracked', () => {
  it('offers every safe leftover separately, each with its own id', () => {
    const a = soup(addDays(SAT, -1), { id: 'a' })
    const b = { ...soup(SAT, { id: 'b' }), recipeId: 'mujaddara', label: 'Mujaddara' }
    const ids = tonightOptions(state({ leftovers: [a, b] }))
      .filter((o) => o.leftover)
      .map((o) => o.leftover!.id)
    expect(ids).toEqual(['a', 'b'])
  })
  it('stops offering a leftover once it is marked eaten', () => {
    const a = soup(SAT, { id: 'a' })
    expect(edibleLeftovers(state({ leftovers: [{ ...a, status: 'eaten' }] }))).toEqual([])
  })
})
