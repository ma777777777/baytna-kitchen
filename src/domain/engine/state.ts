import type { Leftover, MealEntry, Member, PantryItem, PlanEntry, Rating, Recipe, Settings, Slot } from '../types'

/** Everything the deterministic engine needs, independent of storage. */
export interface KitchenState {
  today: string
  settings: Settings
  recipes: Recipe[]
  pantry: Record<string, PantryItem>
  plan: Record<string, PlanEntry>
  /** Extra meals per day (breakfast, snack, and whichever of lunch/dinner isn't the main meal). */
  meals?: Record<string, Partial<Record<Slot, MealEntry>>>
  /** recipeId -> memberId -> rating */
  ratings: Record<string, Record<string, Rating>>
  leftovers: Leftover[]
  members: Member[]
}

export const DEFAULT_SETTINGS: Settings = {
  shopDay: 6, // Saturday
  topUpDay: 3, // Wednesday
  servings: 2,
  // Sun..Sat. Five cooking nights, one leftovers night, Saturday free (shopping, family, takeout).
  dayPattern: ['cook', 'cook', 'cook', 'leftovers', 'cook', 'cook', 'free'],
  allergies: [],
  dislikes: [],
  equipment: ['stovetop', 'oven', 'blender'],
  favouriteShare: 0.7,
}

export function householdRating(state: KitchenState, recipeId: string) {
  const byMember = state.ratings[recipeId] ?? {}
  const values = Object.values(byMember)
  return {
    never: values.includes('never'),
    loves: values.filter((v) => v === 'love').length,
    okays: values.filter((v) => v === 'okay').length,
    rated: values.length > 0,
  }
}

/** The slot the day's main meal sits in. */
export function mainSlot(e: PlanEntry | undefined): Slot {
  return e?.meal ?? 'dinner'
}

/** Every dish to cook on a date: the main meal plus any extra meals with a recipe. */
export function cooksOn(state: Pick<KitchenState, 'plan' | 'meals'>, date: string): { recipeId: string; servings?: number }[] {
  const out: { recipeId: string; servings?: number }[] = []
  const e = state.plan[date]
  if (e?.type === 'cook' && e.recipeId) out.push({ recipeId: e.recipeId, servings: e.servings })
  const extras = state.meals?.[date] ?? {}
  for (const m of Object.values(extras)) {
    if (m && m.type === 'cook' && m.recipeId && m.slot !== mainSlot(e)) out.push({ recipeId: m.recipeId, servings: m.servings })
  }
  return out
}

/** Dates (any week) with at least one dish to cook. */
export function cookDates(state: Pick<KitchenState, 'plan' | 'meals'>): string[] {
  return [...new Set([...Object.keys(state.plan), ...Object.keys(state.meals ?? {})])]
}

/** State with one entry replaced (main meal or an extra), for "what if" comparisons. */
export function withEntry(state: KitchenState, entry: PlanEntry | MealEntry): KitchenState {
  if ('slot' in entry) {
    return { ...state, meals: { ...state.meals, [entry.date]: { ...state.meals?.[entry.date], [entry.slot]: entry } } }
  }
  return { ...state, plan: { ...state.plan, [entry.date]: entry } }
}
