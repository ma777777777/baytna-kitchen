import { addDays, diffDays, weekDates, weekday } from '../dates'
import { INGREDIENTS } from '../ingredients'
import type { DayType, PlanEntry, Recipe } from '../types'
import { totalMinutes } from '../recipes'
import { isAllowed, visibleIngredients } from './filters'
import { householdRating, type KitchenState } from './state'

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Group = 'chicken' | 'meat' | 'fish' | 'eggs' | 'legumes' | 'veg'

export function proteinGroup(r: Recipe): Group {
  for (const g of ['chicken', 'meat', 'fish', 'eggs', 'legumes'] as const) if (r.tags.includes(g)) return g
  return 'veg'
}

/** Dinners the planner may use: allowed for the household and not rated "never" by anyone. */
export function plannableDinners(state: KitchenState): Recipe[] {
  return state.recipes.filter(
    (r) => r.kind === 'dinner' && isAllowed(r, state.settings) && !householdRating(state, r.id).never,
  )
}

function freshIds(r: Recipe, state: KitchenState) {
  return visibleIngredients(r, state.settings)
    .filter((ri) => INGREDIENTS[ri.id]?.fresh)
    .map((ri) => ri.id)
}

export interface Why {
  code: 'love' | 'okay' | 'new' | 'shares' | 'legumes' | 'variety' | 'quick' | 'early_fresh' | 'batch'
  detail?: string[]
}

export interface ScoredPick {
  recipe: Recipe
  score: number
  why: Why[]
}

interface Ctx {
  state: KitchenState
  weekStart: string
  picked: { date: string; recipe: Recipe }[]
  recent: Set<string>
  cookSlots: number
  rand: () => number
  /** Day type by date, to favour a batch dish the night before a leftovers night. */
  typeOf: (date: string) => DayType | undefined
}

function score(r: Recipe, date: string, ctx: Ctx): ScoredPick {
  const { state, picked } = ctx
  const why: Why[] = []
  let s = 0
  const rating = householdRating(state, r.id)
  const lovedSoFar = picked.filter((p) => householdRating(state, p.recipe.id).loves > 0).length
  const wantLoved = lovedSoFar < Math.round(ctx.cookSlots * state.settings.favouriteShare)

  if (rating.loves > 0) {
    s += 3 + rating.loves + (wantLoved ? 1.5 : 0)
    why.push({ code: 'love' })
  } else if (rating.okays > 0) {
    s += 1.2
    why.push({ code: 'okay' })
  } else {
    s += 0.8 + (wantLoved ? 0 : 1)
    why.push({ code: 'new' })
  }

  if (ctx.recent.has(r.id)) s -= 3
  if (picked.some((p) => p.recipe.id === r.id)) s -= 100

  const group = proteinGroup(r)
  const groups = picked.map((p) => proteinGroup(p.recipe))
  const prev = picked[picked.length - 1]
  if (prev && proteinGroup(prev.recipe) === group) s -= 1.5
  const sameGroup = groups.filter((g) => g === group).length
  if (sameGroup >= 2) s -= 2.5
  if ((group === 'chicken' || group === 'meat') && groups.filter((g) => g === 'chicken' || g === 'meat').length >= 2) s -= 2

  const remaining = ctx.cookSlots - picked.length
  if (group === 'legumes' && !groups.includes('legumes')) {
    s += remaining <= 2 ? 2.5 : 0.8
    why.push({ code: 'legumes' })
  }
  if ((group === 'fish' || group === 'eggs' || group === 'veg') && !groups.some((g) => g === 'fish' || g === 'eggs' || g === 'veg')) {
    s += remaining <= 2 ? 1.5 : 0.5
    why.push({ code: 'variety' })
  }

  // Share fresh ingredients across meals so a bunch of parsley gets used up.
  const mine = new Set(freshIds(r, state))
  const shared = new Set<string>()
  for (const p of picked) for (const id of freshIds(p.recipe, state)) if (mine.has(id)) shared.add(id)
  if (shared.size) {
    s += Math.min(1.2, shared.size * 0.4)
    why.push({ code: 'shares', detail: [...shared] })
  }

  // Delicate fresh meals early in the week; fresh fish only in the first two days.
  const dayIndex = diffDays(date, ctx.weekStart)
  const hasFreshFish = visibleIngredients(r, state.settings).some((ri) => ri.id === 'white_fish')
  if (hasFreshFish && dayIndex > 1) s -= 1
  if (r.tags.includes('fresh') && dayIndex <= 2) {
    s += 0.4
    why.push({ code: 'early_fresh' })
  }
  if (totalMinutes(r) <= 20) why.push({ code: 'quick' })

  // At most one no-cook plate a week; it should feel like dinner.
  if (r.cookMin === 0 && picked.some((p) => p.recipe.cookMin === 0)) s -= 2.5
  if (ctx.typeOf(addDays(date, 1)) === 'leftovers' && r.tags.includes('leftover_friendly')) {
    s += 1.5
    why.push({ code: 'batch' })
  }

  s += ctx.rand() * 1.2
  return { recipe: r, score: s, why }
}

export function defaultTypes(weekStart: string, pattern: DayType[]): DayType[] {
  return weekDates(weekStart).map((d) => pattern[weekday(d)] ?? 'cook')
}

function recentRecipeIds(state: KitchenState, before: string, days = 14) {
  const ids = new Set<string>()
  for (const e of Object.values(state.plan)) {
    const d = diffDays(before, e.date)
    if (e.recipeId && d > 0 && d <= days) ids.add(e.recipeId)
  }
  return ids
}

export interface GenerateOptions {
  weekStart: string
  types?: DayType[]
  seed?: number
  /** Entries to keep as they are (e.g. nights the user already chose). */
  locked?: Record<string, PlanEntry>
}

export function servingsFor(r: Recipe, state: KitchenState) {
  return Math.max(state.settings.servings, r.servings)
}

/** Draft a week: fills cook nights, links leftover nights to the previous batch. */
export function generateWeek(state: KitchenState, opts: GenerateOptions): PlanEntry[] {
  const dates = weekDates(opts.weekStart)
  const types = opts.types ?? defaultTypes(opts.weekStart, state.settings.dayPattern)
  const candidates = plannableDinners(state)
  const ctx: Ctx = {
    state,
    weekStart: opts.weekStart,
    picked: [],
    recent: recentRecipeIds(state, opts.weekStart),
    cookSlots: types.filter((t) => t === 'cook').length,
    rand: rng(opts.seed ?? 1),
    typeOf: (d) => types[dates.indexOf(d)],
  }
  const entries: PlanEntry[] = []
  dates.forEach((date, i) => {
    const locked = opts.locked?.[date]
    if (locked) {
      entries.push(locked)
      const lr = locked.recipeId && state.recipes.find((r) => r.id === locked.recipeId)
      if (lr) ctx.picked.push({ date, recipe: lr })
      return
    }
    const type = types[i]
    if (type !== 'cook') {
      entries.push({ date, type })
      return
    }
    const best = candidates.map((r) => score(r, date, ctx)).sort((a, b) => b.score - a.score)[0]
    if (!best) {
      entries.push({ date, type: 'free' })
      return
    }
    ctx.picked.push({ date, recipe: best.recipe })
    entries.push({ date, type: 'cook', recipeId: best.recipe.id, servings: servingsFor(best.recipe, state) })
  })
  return entries
}

/** Up to `n` alternatives for one night, keeping the rest of the week. */
export function alternativesFor(state: KitchenState, weekStart: string, date: string, n = 3, seed = 7): ScoredPick[] {
  const others = weekDates(weekStart)
    .filter((d) => d !== date)
    .map((d) => state.plan[d])
    .filter((e): e is PlanEntry => !!e?.recipeId)
    .map((e) => ({ date: e.date, recipe: state.recipes.find((r) => r.id === e.recipeId)! }))
    .filter((p) => p.recipe)
  const current = state.plan[date]?.recipeId
  const ctx: Ctx = {
    state,
    weekStart,
    picked: others,
    recent: recentRecipeIds(state, weekStart),
    cookSlots: others.length + 1,
    rand: rng(seed),
    typeOf: (d) => state.plan[d]?.type,
  }
  return plannableDinners(state)
    .filter((r) => r.id !== current)
    .map((r) => score(r, date, ctx))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

/** For a leftovers night, the most recent cooked dish before it that keeps. */
export function leftoverSource(state: KitchenState, date: string): PlanEntry | undefined {
  for (let i = 1; i <= 3; i++) {
    const e = state.plan[addDays(date, -i)]
    if (e?.type === 'cook' && e.recipeId) {
      const r = state.recipes.find((x) => x.id === e.recipeId)
      if (r && (r.leftoverDays ?? 3) >= i) return e
    }
  }
  return undefined
}

/** Fresh ingredients each recipe in the week shares with another. */
export function sharedIngredients(state: KitchenState, dates: string[]): { id: string; recipes: string[] }[] {
  const map = new Map<string, Set<string>>()
  for (const d of dates) {
    const e = state.plan[d]
    const r = e?.recipeId && state.recipes.find((x) => x.id === e.recipeId)
    if (!r) continue
    for (const ri of visibleIngredients(r, state.settings)) {
      const ing = INGREDIENTS[ri.id]
      if (!ing || ing.basic || ing.free || ri.optional) continue
      if (!map.has(ri.id)) map.set(ri.id, new Set())
      map.get(ri.id)!.add(r.id)
    }
  }
  return [...map.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([id, s]) => ({ id, recipes: [...s] }))
    .sort((a, b) => b.recipes.length - a.recipes.length)
}
