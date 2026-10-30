import type { Ingredient, Lang, RecipeIngredient, Unit } from '../types'
import { INGREDIENTS } from '../ingredients'
import { formatQty } from '../units'
import { matchIngredient } from './search'

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

const UNIT_WORDS: [RegExp, Unit][] = [
  [/^(kg|kilo|kilos|كغ|كيلو)$/i, 'kg'],
  [/^(g|gr|gram|grams|غ|غرام)$/i, 'g'],
  [/^(ml|مل)$/i, 'ml'],
  [/^(l|litre|liter|litres|liters|ل|ليتر)$/i, 'l'],
  [/^(tbsp|tablespoons?|ملعقة كبيرة|ملاعق كبيرة)$/i, 'tbsp'],
  [/^(tsp|teaspoons?|ملعقة صغيرة|ملاعق صغيرة)$/i, 'tsp'],
  [/^(cups?|كوب|أكواب|كباية)$/i, 'cup'],
  [/^(cans?|tins?|علبة|علب)$/i, 'can'],
  [/^(cloves?|فص|فصوص)$/i, 'clove'],
  [/^(bunch|bunches|ضمة|ضمم)$/i, 'bunch'],
  [/^(packs?|packets?|كيس|أكياس)$/i, 'pack'],
  [/^(slices?|شريحة|شرائح)$/i, 'slice'],
]

function toLatinDigits(s: string) {
  return s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/٫/g, '.')
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 40)
}

export interface ParsedLine {
  ingredient: RecipeIngredient
  /** Present when the text didn't match a known ingredient. */
  custom?: Ingredient
}

/** "400 g chicken breast", "2 lemons", "½ bunch parsley", "٢ حامض", "salt (optional)" */
export function parseIngredientLine(line: string): ParsedLine | null {
  let text = toLatinDigits(line.trim()).replace(/½/g, '0.5').replace(/¼/g, '0.25').replace(/¾/g, '0.75')
  if (!text) return null
  const optional = /\(?\s*(optional|اختياري)\s*\)?/i.test(text)
  text = text.replace(/\(?\s*(optional|اختياري)\s*\)?/gi, '').trim()
  let qty: number | undefined
  let unit: Unit | undefined
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (m) {
    qty = Number(m[1].replace(',', '.'))
    text = m[2]
    // two-word Arabic units first ("ملعقة كبيرة"), then one word
    const words = text.split(/\s+/)
    for (const n of [2, 1]) {
      const head = words.slice(0, n).join(' ')
      const hit = UNIT_WORDS.find(([re]) => re.test(head))
      if (hit) {
        unit = hit[1]
        text = words.slice(n).join(' ')
        break
      }
    }
  }
  text = text.replace(/^of\s+/i, '').trim()
  const id = matchIngredient(text)
  const ingredient: RecipeIngredient = { id: id ?? `x_${slug(text)}`, qty, unit: qty != null ? (unit ?? 'pc') : undefined }
  if (optional) ingredient.optional = true
  if (id) return { ingredient }
  return {
    ingredient,
    custom: { id: ingredient.id, name: { en: text, ar: text }, aisle: 'other' },
  }
}

export function ingredientLine(ri: RecipeIngredient, lang: Lang): string {
  const ing = INGREDIENTS[ri.id]
  const name = ing ? ing.name[lang] : ri.id
  const q = ri.qty != null ? formatQty(ri.qty, ri.unit, lang) + ' ' : ''
  return `${q}${name}${ri.optional ? (lang === 'ar' ? ' (اختياري)' : ' (optional)') : ''}`.trim()
}
