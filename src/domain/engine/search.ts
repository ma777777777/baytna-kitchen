import { INGREDIENTS } from '../ingredients'
import type { Recipe } from '../types'

/** Normalise Arabic and Latin text so "laban", "لبن" and "لَبَن" all match. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // harakat + tatweel
    .replace(/[̀-ͯ]/g, '') // latin accents
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/['’`]/g, '')
    .trim()
}

function recipeHaystack(r: Recipe): string {
  const parts = [r.name.en, r.name.ar, r.blurb.en, r.blurb.ar, ...r.tags]
  for (const ri of r.ingredients) {
    const ing = INGREDIENTS[ri.id]
    if (ing && !ing.basic && !ing.free) parts.push(ing.name.en, ing.name.ar, ...(ing.aliases ?? []))
  }
  return normalize(parts.join(' '))
}

const cache = new WeakMap<Recipe, string>()

export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return recipes
  return recipes.filter((r) => {
    let hay = cache.get(r)
    if (!hay) cache.set(r, (hay = recipeHaystack(r)))
    return terms.every((t) => hay!.includes(t))
  })
}

/** Best ingredient match for free text like "2 cucumbers" or "خيار". */
export function matchIngredient(text: string): string | undefined {
  const t = normalize(text.replace(/[0-9.,½¼¾]+/g, ' '))
  if (!t) return undefined
  let best: { id: string; len: number } | undefined
  for (const ing of Object.values(INGREDIENTS)) {
    if (ing.free) continue
    const names = [ing.name.en, ing.name.ar, ...(ing.aliases ?? [])].map(normalize)
    for (const n of names) {
      const stem = n.replace(/(es|s)$/, '')
      if (stem.length < 3) continue
      if (t.includes(stem) && (!best || stem.length > best.len)) best = { id: ing.id, len: stem.length }
    }
  }
  return best?.id
}
