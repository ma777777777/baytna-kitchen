import { INGREDIENTS } from '../ingredients'
import type { Recipe, RecipeIngredient, Settings } from '../types'

export type Conflict = { ingredientId: string; reason: 'allergy' | 'dislike' }

function conflictFor(ri: RecipeIngredient, settings: Settings): Conflict | null {
  const ing = INGREDIENTS[ri.id]
  if (!ing) return null
  if (ing.allergens?.some((a) => settings.allergies.includes(a))) return { ingredientId: ri.id, reason: 'allergy' }
  if (settings.dislikes.includes(ri.id)) return { ingredientId: ri.id, reason: 'dislike' }
  return null
}

/**
 * Hard filter. A recipe is excluded if any required ingredient conflicts with an
 * allergy or dislike, or it needs equipment the household doesn't have.
 * Optional conflicting ingredients are dropped instead (see visibleIngredients).
 */
export function isAllowed(recipe: Recipe, settings: Settings): boolean {
  if (!recipe.equipment.every((e) => e === 'stovetop' || settings.equipment.includes(e))) return false
  return recipe.ingredients.every((ri) => ri.optional || !conflictFor(ri, settings))
}

export function conflicts(recipe: Recipe, settings: Settings): Conflict[] {
  return recipe.ingredients.map((ri) => conflictFor(ri, settings)).filter((c): c is Conflict => !!c)
}

/** Ingredients to show and shop for, with conflicting optional ones removed. */
export function visibleIngredients(recipe: Recipe, settings: Settings): RecipeIngredient[] {
  return recipe.ingredients.filter((ri) => !(ri.optional && conflictFor(ri, settings)))
}

/** Substitutes that are themselves safe for this household. */
export function safeSubs(ingredientId: string, settings: Settings): string[] {
  return (INGREDIENTS[ingredientId]?.subs ?? []).filter((id) => {
    const ing = INGREDIENTS[id]
    if (!ing) return false
    if (ing.allergens?.some((a) => settings.allergies.includes(a))) return false
    return !settings.dislikes.includes(id)
  })
}
