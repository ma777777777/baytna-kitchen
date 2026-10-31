import type { Lang, Unit } from './types'

// Only physically compatible units convert. Pieces never convert to grams.
type Family = 'mass' | 'volume' | Unit

const TO_BASE: Partial<Record<Unit, [Family, number]>> = {
  g: ['mass', 1],
  kg: ['mass', 1000],
  ml: ['volume', 1],
  l: ['volume', 1000],
  tsp: ['volume', 5],
  tbsp: ['volume', 15],
  cup: ['volume', 240],
}

export function family(unit: Unit | undefined): Family {
  if (!unit) return 'pc'
  return TO_BASE[unit]?.[0] ?? unit
}

export function toBase(qty: number, unit: Unit | undefined): { family: Family; qty: number } {
  const u = unit ?? 'pc'
  const conv = TO_BASE[u]
  return conv ? { family: conv[0], qty: qty * conv[1] } : { family: u, qty }
}

export function compatible(a: Unit | undefined, b: Unit | undefined) {
  return family(a) === family(b)
}

/** Convert a base quantity back to a friendly unit for shopping. */
export function fromBase(family: Family, qty: number): { qty: number; unit: Unit } {
  if (family === 'mass') return qty >= 1000 ? { qty: qty / 1000, unit: 'kg' } : { qty, unit: 'g' }
  if (family === 'volume') {
    if (qty >= 1000) return { qty: qty / 1000, unit: 'l' }
    if (qty < 15) return { qty: qty / 5, unit: 'tsp' }
    if (qty < 120) return { qty: qty / 15, unit: 'tbsp' }
    return { qty, unit: 'ml' }
  }
  return { qty, unit: family as Unit }
}

export function roundQty(qty: number, unit: Unit): number {
  if (unit === 'g' || unit === 'ml') return qty >= 100 ? Math.round(qty / 10) * 10 : Math.round(qty)
  if (unit === 'kg' || unit === 'l') return Math.round(qty * 100) / 100
  // halves for spoons and pieces
  return Math.max(0.5, Math.round(qty * 2) / 2)
}

const UNIT_LABEL: Record<Unit, { en: [string, string]; ar: [string, string] }> = {
  g: { en: ['g', 'g'], ar: ['غ', 'غ'] },
  kg: { en: ['kg', 'kg'], ar: ['كيلو', 'كيلو'] },
  ml: { en: ['ml', 'ml'], ar: ['مل', 'مل'] },
  l: { en: ['L', 'L'], ar: ['ليتر', 'ليتر'] },
  tsp: { en: ['tsp', 'tsp'], ar: ['ملعقة صغيرة', 'ملاعق صغيرة'] },
  tbsp: { en: ['tbsp', 'tbsp'], ar: ['ملعقة كبيرة', 'ملاعق كبيرة'] },
  cup: { en: ['cup', 'cups'], ar: ['كوب', 'أكواب'] },
  pc: { en: ['', ''], ar: ['', ''] },
  clove: { en: ['clove', 'cloves'], ar: ['سن', 'سنان'] },
  bunch: { en: ['bunch', 'bunches'], ar: ['ضمّة', 'ضمّات'] },
  can: { en: ['can', 'cans'], ar: ['علبة', 'علب'] },
  slice: { en: ['slice', 'slices'], ar: ['شريحة', 'شرائح'] },
  handful: { en: ['handful', 'handfuls'], ar: ['كمشة', 'كمشات'] },
  pack: { en: ['pack', 'packs'], ar: ['كيس', 'أكياس'] },
}

function fmtNumber(n: number): string {
  const whole = Math.floor(n)
  const frac = n - whole
  if (Math.abs(frac - 0.5) < 0.01) return whole ? `${whole}½` : '½'
  if (Math.abs(frac - 0.25) < 0.01) return whole ? `${whole}¼` : '¼'
  if (Math.abs(frac - 0.75) < 0.01) return whole ? `${whole}¾` : '¾'
  return String(Math.round(n * 100) / 100)
}

export function formatQty(qty: number | undefined, unit: Unit | undefined, lang: Lang): string {
  if (qty == null) return ''
  const u = unit ?? 'pc'
  const q = roundQty(qty, u)
  const [one, many] = UNIT_LABEL[u][lang]
  const label = q > 1 ? many : one
  return label ? `${fmtNumber(q)} ${label}` : fmtNumber(q)
}
