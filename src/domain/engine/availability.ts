import { diffDays } from '../dates'
import { INGREDIENTS } from '../ingredients'
import type { PantryItem, Recipe, Settings } from '../types'
import { visibleIngredients } from './filters'

/** What we honestly know about one ingredient. Unknown is never treated as present. */
export type Stock = 'have' | 'low' | 'out' | 'unknown'

export function stockOf(id: string, pantry: Record<string, PantryItem>, today: string): Stock {
  const p = pantry[id]
  if (!p) return 'unknown'
  if (p.status !== 'have' && p.status !== 'low') return p.status
  // A fresh item bought long ago is probably gone; ask rather than assume.
  const ing = INGREDIENTS[id]
  if (p.boughtOn && ing?.fresh && ing.keepsDays != null && diffDays(today, p.boughtOn) > ing.keepsDays) return 'unknown'
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
