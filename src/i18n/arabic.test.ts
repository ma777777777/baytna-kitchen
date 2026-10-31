// Guards for the approved Arabic style, so later edits don't drift back.
import { describe, expect, it } from 'vitest'
import { INGREDIENTS } from '../domain/ingredients'
import { BUILT_IN_RECIPES } from '../domain/recipes'
import { STRINGS } from './strings'

const ui = Object.entries(STRINGS).flatMap(([k, v]) =>
  Object.entries(v as Record<string, string>).filter(([l]) => l.startsWith('ar')).map(([, s]) => [k, s] as const),
)
const recipeText = BUILT_IN_RECIPES.flatMap((r) =>
  [r.name, r.blurb, ...r.steps, r.storage, r.safety, r.tips].filter(Boolean).map((t) => [r.id, t!.ar] as const),
)
const all = [...ui, ...recipeText, ...Object.values(INGREDIENTS).map((i) => [i.id, i.name.ar] as const)]

describe('Arabic localization style', () => {
  it('has Arabic for every UI string and recipe text', () => {
    for (const [k, s] of all) expect(s.trim(), k).not.toBe('')
  })
  it('uses Western digits and Arabic punctuation only', () => {
    for (const [k, s] of all) {
      expect(s, k).not.toMatch(/[٠-٩]/)
      expect(s, k).not.toMatch(/[؀-ۿ]\s?[,?;]/)
    }
  })
  it('avoids the words the audit ruled out', () => {
    for (const [k, s] of all) expect(s, k).not.toMatch(/مثلج|مونة|نقرش|فول سوداني|(^|\s)توم(\s|$)/)
  })
  it('writes recipe steps as plural instructions, not "we" narration', () => {
    for (const r of BUILT_IN_RECIPES)
      for (const s of r.steps) expect(s.ar, `${r.id}: ${s.ar}`).not.toMatch(/^(ن|من)(قطّع|زيد|خلط|سلق|طبخ|حط|نسخ|غسل)/)
  })
})
