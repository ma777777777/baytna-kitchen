import { addDays, diffDays, weekDates, weekday } from '../dates'
import { INGREDIENTS } from '../ingredients'
import type { Aisle, MealEntry, PantryItem, PlanEntry, Unit } from '../types'
import { compatible, fromBase, toBase } from '../units'
import { visibleIngredients } from './filters'
import { cooksOn, withEntry, type KitchenState } from './state'

export type Trip = 'main' | 'topup'

export type ItemStatus =
  | 'need' // buy it
  | 'need_more' // have some (known qty) but not enough
  | 'check' // pantry says Have without a quantity: check before buying
  | 'covered' // known stock covers it
  | 'basic' // spice/salt: check you have
  | 'restock' // staple marked low/out, not needed by a recipe this week

export interface Amount {
  qty: number
  unit: Unit
}

export interface ListItem {
  key: string
  ingredientId: string
  aisle: Aisle
  trip: Trip
  status: ItemStatus
  /** Total needed by this week's recipes, one entry per incompatible unit family. */
  needed: Amount[]
  /** What to buy after subtracting known stock (empty when unknown/not applicable). */
  toBuy: Amount[]
  uses: { date: string; recipeId: string }[]
  firstUse?: string
  /** Raw meat/fish used 2+ days after the shop: freeze on purchase. */
  freezeUntil?: string
  lowNote?: boolean
}

export interface ListInput {
  state: KitchenState
  weekStart: string
  /** Ignore plan entries before this date (default: today). */
  from?: string
}

export function topUpDate(weekStart: string, topUpDay: number): string | null {
  if (topUpDay < 0) return null
  for (let i = 1; i < 7; i++) {
    const d = addDays(weekStart, i)
    if (weekday(d) === topUpDay) return d
  }
  return null
}

function tripFor(ingredientId: string, useDate: string, weekStart: string, topUp: string | null): Trip {
  const ing = INGREDIENTS[ingredientId]
  if (!topUp || !ing?.fresh || useDate < topUp) return 'main'
  const keeps = ing.keepsDays ?? 7
  return diffDays(useDate, weekStart) >= keeps ? 'topup' : 'main'
}

type Totals = Map<string, number> // family -> base qty

function addTo(t: Totals, qty: number | undefined, unit: Unit | undefined) {
  if (qty == null) return
  const b = toBase(qty, unit)
  t.set(b.family, (t.get(b.family) ?? 0) + b.qty)
}

function amounts(t: Totals): Amount[] {
  return [...t.entries()].filter(([, q]) => q > 0).map(([f, q]) => fromBase(f as never, q))
}

/**
 * Stock counts against this week's list only if it existed before this week's shop.
 * Things ticked off this week's list were bought *for* this list.
 */
function priorStock(p: PantryItem | undefined, weekStart: string): PantryItem | undefined {
  if (!p) return undefined
  if (p.boughtOn && p.boughtOn >= weekStart) return undefined
  return p
}

export function buildList({ state, weekStart, from }: ListInput): ListItem[] {
  const start = from && from > weekStart ? from : weekStart
  const topUp = topUpDate(weekStart, state.settings.topUpDay)
  const groups = new Map<string, { trip: Trip; id: string; totals: Totals; uses: ListItem['uses']; hasQty: boolean }>()

  for (const date of weekDates(weekStart)) {
    if (date < start) continue
    for (const e of cooksOn(state, date)) {
      const r = state.recipes.find((x) => x.id === e.recipeId)
      if (!r) continue
      const factor = (e.servings ?? r.servings) / r.servings
      for (const ri of visibleIngredients(r, state.settings)) {
        const ing = INGREDIENTS[ri.id]
        if (!ing || ing.free || ri.optional) continue
        const trip = tripFor(ri.id, date, weekStart, topUp)
        const key = `${ri.id}@${trip}`
        let g = groups.get(key)
        if (!g) groups.set(key, (g = { trip, id: ri.id, totals: new Map(), uses: [], hasQty: false }))
        if (ri.qty != null) {
          addTo(g.totals, ri.qty * factor, ri.unit)
          g.hasQty = true
        }
        if (!g.uses.some((u) => u.date === date && u.recipeId === r.id)) g.uses.push({ date, recipeId: r.id })
      }
    }
  }

  const items: ListItem[] = []
  for (const [key, g] of groups) {
    const ing = INGREDIENTS[g.id]
    const needed = amounts(g.totals)
    const firstUse = g.uses.map((u) => u.date).sort()[0]
    const item: ListItem = {
      key,
      ingredientId: g.id,
      aisle: ing.aisle,
      trip: g.trip,
      status: 'need',
      needed,
      toBuy: needed,
      uses: g.uses.sort((a, b) => a.date.localeCompare(b.date)),
      firstUse,
    }
    if (ing.raw && firstUse && diffDays(firstUse, weekStart) >= (ing.keepsDays ?? 2) && g.trip === 'main') {
      item.freezeUntil = firstUse
    }
    // Top-up items are bought fresh midweek; earlier stock doesn't count.
    const p = g.trip === 'topup' ? undefined : priorStock(state.pantry[g.id], weekStart)
    if (ing.basic) {
      item.status = p?.status === 'out' ? 'need' : p?.status === 'have' ? 'covered' : 'basic'
    } else if (p?.status === 'have' || p?.status === 'low') {
      if (p.status === 'low') item.lowNote = true
      if (p.status === 'have' && p.qty != null && needed.length === 1 && compatible(p.unit, needed[0].unit)) {
        const have = toBase(p.qty, p.unit).qty
        const need = toBase(needed[0].qty, needed[0].unit)
        const rest = need.qty - have
        if (rest <= 0) {
          item.status = 'covered'
          item.toBuy = []
        } else {
          item.status = 'need_more'
          item.toBuy = [fromBase(need.family as never, rest)]
        }
      } else if (p.status === 'have') {
        // Have, but no comparable quantity: never subtract a made-up number.
        item.status = 'check'
      }
    }
    items.push(item)
  }

  // Staples marked low/out that no recipe needs this week.
  for (const p of Object.values(state.pantry)) {
    if (!p.staple || (p.status !== 'low' && p.status !== 'out')) continue
    if (items.some((it) => it.ingredientId === p.id && it.trip === 'main')) continue
    const ing = INGREDIENTS[p.id]
    if (!ing) continue
    items.push({
      key: `${p.id}@main`,
      ingredientId: p.id,
      aisle: ing.aisle,
      trip: 'main',
      status: 'restock',
      needed: [],
      toBuy: [],
      uses: [],
      lowNote: p.status === 'low',
    })
  }
  return items
}

/**
 * What's still to buy for an item already ticked off, if the plan changed afterwards.
 * Compares what was ticked (snapshot at the time) with what's needed now, per unit family.
 * Small rounding drift (under 10%) is ignored so a servings tweak doesn't nag.
 */
export function stillToBuy(now: Amount[], bought: Amount[] | undefined): Amount[] {
  if (!bought) return []
  const got = new Map<string, number>()
  for (const a of bought) {
    const b = toBase(a.qty, a.unit)
    got.set(b.family, (got.get(b.family) ?? 0) + b.qty)
  }
  const out: Amount[] = []
  for (const a of now) {
    const b = toBase(a.qty, a.unit)
    const rest = b.qty - (got.get(b.family) ?? 0)
    if (rest > b.qty * 0.1 && rest > 1e-9) out.push(fromBase(b.family, rest))
  }
  return out
}

/**
 * A plan change after shopping began: which list items are brand new (to flag "new since you
 * shopped"), and how many things now need buying that weren't covered by what was ticked.
 * `ticked` gives the saved tick state per list key.
 */
export function changesAfterShopping(
  state: KitchenState,
  entry: PlanEntry | MealEntry,
  weekStart: string,
  ticked: (key: string) => { checked?: boolean; bought?: Amount[] },
): { started: boolean; newKeys: string[]; count: number } {
  const from = state.today
  const before = buildList({ state, weekStart, from })
  const started = before.some((i) => ticked(i.key).checked)
  if (!started) return { started, newKeys: [], count: 0 }
  const after = buildList({ state: withEntry(state, entry), weekStart, from })
  const known = new Set(before.map((i) => i.key))
  const newKeys: string[] = []
  let count = 0
  for (const it of after) {
    if (it.status === 'covered' || it.status === 'basic') continue
    const s = ticked(it.key)
    if (!known.has(it.key) && !s.checked) {
      newKeys.push(it.key)
      count++
    } else if (s.checked && stillToBuy(it.needed, s.bought).length) count++
  }
  return { started, newKeys, count }
}

/** Plain-text list for WhatsApp, grouped by aisle. */
export function listToText(
  lines: { aisle: string; text: string }[],
  title: string,
): string {
  const byAisle = new Map<string, string[]>()
  for (const l of lines) {
    if (!byAisle.has(l.aisle)) byAisle.set(l.aisle, [])
    byAisle.get(l.aisle)!.push(l.text)
  }
  const parts = [title]
  for (const [aisle, texts] of byAisle) parts.push('', `*${aisle}*`, ...texts.map((t) => `- ${t}`))
  return parts.join('\n')
}
