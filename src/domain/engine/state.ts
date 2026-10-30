import type { Leftover, Member, PantryItem, PlanEntry, Rating, Recipe, Settings } from '../types'

/** Everything the deterministic engine needs, independent of storage. */
export interface KitchenState {
  today: string
  settings: Settings
  recipes: Recipe[]
  pantry: Record<string, PantryItem>
  plan: Record<string, PlanEntry>
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
