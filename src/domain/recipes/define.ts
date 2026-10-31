import type { Equipment, Recipe, RecipeIngredient, RecipeKind, Tag, Text, Unit } from '../types'

type Pair = [string, string]

export interface RecipeSpec {
  id: string
  kind: RecipeKind
  name: Pair
  blurb: Pair
  time: [prep: number, cook: number]
  servings?: number
  difficulty?: 1 | 2 | 3
  cost?: 1 | 2 | 3
  tags: Tag[]
  equipment?: Equipment[]
  /** "id qty unit" separated by ';'. Append '?' to mark optional. Example: "parsley 1 bunch; salt; mint 0.5 bunch ?" */
  ing: string
  steps: Pair[]
  leftoverDays?: number
  freezes?: boolean
  storage?: Pair
  safety?: Pair
  tips?: Pair
}

const text = ([en, ar]: Pair): Text => ({ en, ar })

export function parseIngredients(spec: string): RecipeIngredient[] {
  return spec
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const optional = part.endsWith('?')
      const [id, qty, unit] = part.replace(/\?$/, '').trim().split(/\s+/)
      const item: RecipeIngredient = { id }
      if (qty) item.qty = Number(qty)
      if (unit) item.unit = unit as Unit
      if (optional) item.optional = true
      return item
    })
}

export function define(spec: RecipeSpec): Recipe {
  return {
    id: spec.id,
    kind: spec.kind,
    name: text(spec.name),
    blurb: text(spec.blurb),
    prepMin: spec.time[0],
    cookMin: spec.time[1],
    servings: spec.servings ?? 2,
    difficulty: spec.difficulty ?? 1,
    cost: spec.cost ?? 1,
    tags: spec.tags,
    equipment: spec.equipment ?? ['stovetop'],
    ingredients: parseIngredients(spec.ing),
    steps: spec.steps.map(text),
    leftoverDays: spec.leftoverDays,
    freezes: spec.freezes,
    storage: spec.storage && text(spec.storage),
    safety: spec.safety && text(spec.safety),
    tips: spec.tips && text(spec.tips),
  }
}

export const SAFETY = {
  chicken: [
    'Cook chicken until no pink remains and juices run clear (74°C inside if you have a thermometer). Wash hands and boards after handling raw chicken.',
    'اطبخوا الدجاج لحتى ما يضل فيه ولا لون زهري وتطلع مَيّتو صافية (74 درجة من جوّا إذا عندكم ميزان حرارة). اغسلوا إيديكم واللوح بعد ما تلمسوا الدجاج النيّ.',
  ] as Pair,
  minced: [
    'Cook minced meat through until no pink remains (71°C inside).',
    'اطبخوا اللحمة المفرومة لحتى تستوي منيح وما يضل فيها لون زهري (71 درجة من جوّا).',
  ] as Pair,
  fish: [
    'Fish is done when it turns opaque and flakes easily with a fork (63°C inside).',
    'السمك بيكون استوى لما يصير أبيض مش شفاف ويتفتّت بسهولة بالشوكة (63 درجة من جوّا).',
  ] as Pair,
}

export const LEFTOVERS_3_DAYS: Pair = [
  'Cool within 2 hours in a shallow container, refrigerate, eat within 3 days. Reheat until steaming hot.',
  'بردّوها خلال ساعتين بعلبة واطية وحطّوها بالبراد، وكلوها خلال 3 أيام. سخّنوها منيح لحتى يطلع منها بخار.',
]
