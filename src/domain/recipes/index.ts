import type { Allergen, Recipe } from '../types'
import { INGREDIENTS } from '../ingredients'
import { DINNERS } from './dinners'
import { SMOOTHIES, SNACKS } from './snacks'

export const BUILT_IN_RECIPES: Recipe[] = [...DINNERS, ...SNACKS, ...SMOOTHIES]

export function recipeAllergens(recipe: Recipe, includeOptional = true): Allergen[] {
  const set = new Set<Allergen>()
  for (const ri of recipe.ingredients) {
    if (ri.optional && !includeOptional) continue
    for (const a of INGREDIENTS[ri.id]?.allergens ?? []) set.add(a)
  }
  return [...set]
}

export function totalMinutes(r: Recipe) {
  return r.prepMin + r.cookMin
}
