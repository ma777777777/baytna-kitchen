import { diffDays } from '../dates'
import { INGREDIENTS } from '../ingredients'
import type { MealEntry, PantryItem, PlanEntry, Recipe, Settings, Slot } from '../types'
import { cookDates, cooksOn } from './state'
import { visibleIngredients } from './filters'

/** What we honestly know about one ingredient. Unknown is never treated as present. */
export type Stock = 'have' | 'low' | 'out' | 'unknown'

export function stockOf(id: string, pantry: Record<string, PantryItem>, today: string): Stock {
  const p = pantry[id]
  if (!p) return 'unknown'
  if (p.status !== 'have' && p.status !== 'low') return p.status
  const ing = INGREDIENTS[id]
  if (p.boughtOn) {
    // Bought for specific meals: once the last of them has passed, it was most likely used up.
    // Staples are the exception; they're long-lived and managed by hand.
    if (p.usedBy && !p.staple && today > p.usedBy) return 'unknown'
    // Perishables bought long ago are probably gone. Raw meat bought for a later meal was
    // frozen on purchase, so its planned date (above) is what counts.
    const perishable = ing?.fresh || (ing?.raw && !p.usedBy)
    if (perishable && ing?.keepsDays != null && diffDays(today, p.boughtOn) > ing.keepsDays) return 'unknown'
  }
  if (p.bestBy && diffDays(today, p.bestBy) > 0) return 'unknown'
  return p.status
}

export type Availability = 'ready' | 'missing' | 'shopping'

export interface RecipeAvailability {
  status: Availability
  /** Required ingredients known to be out, or with no record. */
  missing: string[]
  low: string[]
}

/** Ingredients that matter for availability: required, not a basic spice, not water. */
export function keyIngredients(recipe: Recipe, settings: Settings) {
  return visibleIngredients(recipe, settings).filter((ri) => {
    const ing = INGREDIENTS[ri.id]
    return !ri.optional && ing && !ing.basic && !ing.free
  })
}

export function recipeAvailability(
  recipe: Recipe,
  pantry: Record<string, PantryItem>,
  settings: Settings,
  today: string,
): RecipeAvailability {
  const missing: string[] = []
  const low: string[] = []
  for (const ri of keyIngredients(recipe, settings)) {
    const s = stockOf(ri.id, pantry, today)
    if (s === 'out' || s === 'unknown') missing.push(ri.id)
    else if (s === 'low') low.push(ri.id)
  }
  const status: Availability = missing.length === 0 ? 'ready' : missing.length <= 2 ? 'missing' : 'shopping'
  return { status, missing, low }
}

export const AVAILABILITY_RANK: Record<Availability, number> = { ready: 0, missing: 1, shopping: 2 }

/**
 * After cooking a dish, which bought-for-the-week ingredients are now probably used up:
 * bought from the list (not staples) and not needed by any later planned dinner.
 * The app then asks about them again instead of offering them as "have".
 */
export function usedUpBy(
  recipe: Recipe,
  state: {
    pantry: Record<string, PantryItem>
    plan: Record<string, PlanEntry>
    meals?: Record<string, Partial<Record<Slot, MealEntry>>>
    recipes: Recipe[]
    settings: Settings
  },
  date: string,
): string[] {
  const later = new Set<string>()
  for (const d of cookDates(state)) {
    if (d <= date) continue
    for (const e of cooksOn(state, d)) {
      const r = state.recipes.find((x) => x.id === e.recipeId)
      if (r) for (const ri of keyIngredients(r, state.settings)) later.add(ri.id)
    }
  }
  return keyIngredients(recipe, state.settings)
    .map((ri) => ri.id)
    .filter((id) => {
      const p = state.pantry[id]
      return p?.boughtOn && !p.staple && (p.status === 'have' || p.status === 'low') && !later.has(id)
    })
}
