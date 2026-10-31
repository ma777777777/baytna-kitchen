import { addDays, diffDays } from '../dates'
import { INGREDIENTS } from '../ingredients'
import { totalMinutes } from '../recipes'
import type { Leftover, Recipe, RecipeKind } from '../types'
import { AVAILABILITY_RANK, recipeAvailability, type RecipeAvailability } from './availability'
import { isAllowed, visibleIngredients } from './filters'
import { householdRating, type KitchenState } from './state'
import { topUpDate } from './shopping'

export type Reason =
  | { code: 'ready' }
  | { code: 'missing'; ids: string[] }
  | { code: 'shopping'; count: number }
  | { code: 'minutes'; n: number }
  | { code: 'love' }
  | { code: 'pantry' }
  | { code: 'leftovers'; label: string; madeOn: string }

export interface Suggestion {
  slot: 'ready' | 'one_missing' | 'emergency' | 'quick' | 'leftovers'
  recipe?: Recipe
  leftover?: Leftover
  availability?: RecipeAvailability
  reasons: Reason[]
}

function candidates(state: KitchenState, kind: RecipeKind = 'dinner') {
  return state.recipes.filter(
    (r) => r.kind === kind && isAllowed(r, state.settings) && !householdRating(state, r.id).never,
  )
}

function ranked(state: KitchenState, list: Recipe[], seed: number) {
  return list
    .map((r) => {
      const av = recipeAvailability(r, state.pantry, state.settings, state.today)
      const rating = householdRating(state, r.id)
      // deterministic daily rotation so the same three don't show every day
      const rot = ((hash(r.id) + seed) % 97) / 97
      const score = -AVAILABILITY_RANK[av.status] * 3 + rating.loves * 1.5 + rating.okays * 0.5 - totalMinutes(r) / 30 + rot
      return { r, av, rating, score }
    })
    .sort((a, b) => b.score - a.score)
}

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

function reasonsFor(r: Recipe, av: RecipeAvailability, loves: number): Reason[] {
  const out: Reason[] = []
  if (av.status === 'ready') out.push({ code: 'ready' })
  else if (av.status === 'missing') out.push({ code: 'missing', ids: av.missing })
  else out.push({ code: 'shopping', count: av.missing.length })
  out.push({ code: 'minutes', n: totalMinutes(r) })
  if (loves) out.push({ code: 'love' })
  if (r.tags.includes('pantry')) out.push({ code: 'pantry' })
  return out
}

export function activeLeftovers(state: KitchenState): Leftover[] {
  return state.leftovers
    .filter((l) => l.status === 'active')
    .sort((a, b) => a.madeOn.localeCompare(b.madeOn))
}

/**
 * Leftovers we can honestly offer as dinner: in the fridge and still inside their safe window.
 * Expired ones are never suggested (only shown with a "throw it out" nudge); freezer
 * portions need thawing first, so they aren't "ready" tonight either.
 */
export function edibleLeftovers(state: KitchenState): Leftover[] {
  return activeLeftovers(state).filter((l) => l.place === 'fridge' && leftoverDaysLeft(state, l) >= 0)
}

function leftoverSuggestions(state: KitchenState): Suggestion[] {
  return edibleLeftovers(state).map((l) => ({ slot: 'leftovers', leftover: l, reasons: [{ code: 'leftovers', label: l.label, madeOn: l.madeOn }] }))
}

/**
 * "Change tonight": three realistic options.
 * (a) make with what we have, (b) one or two missing items, (c) 15-minute emergency dinner.
 * Leftovers in the fridge come first when present.
 */
export function tonightOptions(state: KitchenState, excludeId?: string): Suggestion[] {
  const seed = diffDays(state.today, '2024-01-01')
  const pool = candidates(state).filter((r) => r.id !== excludeId)
  const all = ranked(state, pool, seed)
  const used = new Set<string>()
  const out: Suggestion[] = []

  out.push(...leftoverSuggestions(state))

  const take = (slot: Suggestion['slot'], pred: (x: (typeof all)[number]) => boolean) => {
    const hit = all.find((x) => !used.has(x.r.id) && pred(x))
    if (!hit) return
    used.add(hit.r.id)
    out.push({ slot, recipe: hit.r, availability: hit.av, reasons: reasonsFor(hit.r, hit.av, hit.rating.loves) })
  }
  take('emergency', (x) => totalMinutes(x.r) <= 15)
  take('ready', (x) => x.av.status === 'ready' && totalMinutes(x.r) <= 35)
  take('one_missing', (x) => x.av.status === 'missing' && totalMinutes(x.r) <= 35)
  // With no pantry data, fill the remaining slots honestly (tagged "needs shopping").
  while (out.filter((s) => s.recipe).length < 3) {
    const before = out.length
    take('quick', (x) => totalMinutes(x.r) <= 35)
    if (out.length === before) break
  }
  // emergency option last so the order reads: have / one missing / emergency
  return out.sort((a, b) => order(a.slot) - order(b.slot))
}

function order(slot: Suggestion['slot']) {
  return { leftovers: 0, ready: 1, one_missing: 2, quick: 3, emergency: 4 }[slot]
}

/** "I'm exhausted": dinners of 15 minutes or less, best availability first, plus one pantry backup. */
export function exhaustedOptions(state: KitchenState, n = 3): Suggestion[] {
  const seed = diffDays(state.today, '2024-01-01')
  const quick = ranked(state, candidates(state).filter((r) => totalMinutes(r) <= 15), seed)
  const out: Suggestion[] = quick.slice(0, n).map((x) => ({
    slot: 'quick',
    recipe: x.r,
    availability: x.av,
    reasons: reasonsFor(x.r, x.av, x.rating.loves),
  }))
  const backup = ranked(state, candidates(state).filter((r) => r.tags.includes('pantry') && totalMinutes(r) <= 25), seed).find(
    (x) => !out.some((o) => o.recipe?.id === x.r.id),
  )
  if (backup) out.push({ slot: 'emergency', recipe: backup.r, availability: backup.av, reasons: reasonsFor(backup.r, backup.av, backup.rating.loves) })
  return [...leftoverSuggestions(state), ...out]
}

/** One snack and one smoothie for right now, preferring what's in stock. */
export function snackPicks(state: KitchenState): { snack?: Suggestion; smoothie?: Suggestion } {
  const seed = diffDays(state.today, '2024-01-01')
  const pick = (kinds: RecipeKind[]) => {
    const pool = state.recipes.filter((r) => kinds.includes(r.kind) && isAllowed(r, state.settings) && !householdRating(state, r.id).never)
    const top = ranked(state, pool, seed)[0]
    return top && { slot: 'quick' as const, recipe: top.r, availability: top.av, reasons: reasonsFor(top.r, top.av, top.rating.loves) }
  }
  return { snack: pick(['snack', 'breakfast']), smoothie: pick(['smoothie']) }
}

// ---------- nudges ----------

export type Nudge =
  | { code: 'defrost'; ingredientId: string; recipeId: string; forDate: string }
  | { code: 'thaw_now'; ingredientId: string; recipeId: string }
  | { code: 'leftover'; leftover: Leftover; daysLeft: number }
  | { code: 'best_by'; ingredientId: string; bestBy: string }
  | { code: 'topup'; date: string }

const LEFTOVER_DAYS = 3

/** Days of safe fridge life left: 0 = last day, negative = past it. Never more than 4 days in total. */
export function leftoverDaysLeft(state: Pick<KitchenState, 'recipes' | 'today'>, l: Leftover) {
  if (l.place === 'freezer') return Infinity
  const r = l.recipeId ? state.recipes.find((x) => x.id === l.recipeId) : undefined
  // "Eat fresh" dishes (0) still get one day; nothing gets more than 4.
  const keep = Math.min(Math.max(r?.leftoverDays ?? LEFTOVER_DAYS, 1), 4)
  return keep - diffDays(state.today, l.madeOn)
}

function rawUses(state: KitchenState, date: string, weekStart: string) {
  const e = state.plan[date]
  if (e?.type !== 'cook' || !e.recipeId) return []
  const r = state.recipes.find((x) => x.id === e.recipeId)
  if (!r) return []
  return visibleIngredients(r, state.settings)
    .filter((ri) => {
      const ing = INGREDIENTS[ri.id]
      // Frozen-from-shop items: raw protein used 2+ days after the shopping day.
      return ing?.raw && !ri.optional && diffDays(date, weekStart) >= (ing.keepsDays ?? 2) && ri.id !== 'frozen_fish'
    })
    .map((ri) => ({ ingredientId: ri.id, recipeId: r.id }))
}

export function todayNudges(state: KitchenState, weekStart: string): Nudge[] {
  const out: Nudge[] = []
  const tomorrow = addDays(state.today, 1)
  const nextWeekStart = addDays(weekStart, 7)
  for (const u of rawUses(state, tomorrow, tomorrow >= nextWeekStart ? nextWeekStart : weekStart)) {
    out.push({ code: 'defrost', ...u, forDate: tomorrow })
  }
  for (const u of rawUses(state, state.today, weekStart)) out.push({ code: 'thaw_now', ...u })
  for (const l of activeLeftovers(state)) {
    if (l.place !== 'fridge') continue
    out.push({ code: 'leftover', leftover: l, daysLeft: leftoverDaysLeft(state, l) })
  }
  for (const p of Object.values(state.pantry)) {
    if (p.bestBy && p.status !== 'out' && diffDays(p.bestBy, state.today) <= 2) {
      out.push({ code: 'best_by', ingredientId: p.id, bestBy: p.bestBy })
    }
  }
  if (topUpDate(weekStart, state.settings.topUpDay) === state.today) out.push({ code: 'topup', date: state.today })
  return out
}
