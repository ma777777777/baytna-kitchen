// Core domain types. Built-in recipes and ingredients ship with the app as data;
// everything a household changes is stored as synced rows (see data/rows.ts).

export type Lang = 'en' | 'ar'
export type Text = { en: string; ar: string }

export type Unit =
  | 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup'
  | 'pc' | 'clove' | 'bunch' | 'can' | 'slice' | 'handful' | 'pack'

export type Aisle = 'produce' | 'butcher' | 'dairy' | 'bakery' | 'pantry' | 'frozen' | 'snacks' | 'other'

export type Allergen = 'peanut' | 'tree_nut' | 'sesame' | 'dairy' | 'egg' | 'gluten' | 'fish' | 'soy'

/** Raw animal proteins get freeze/thaw guidance. */
export type RawProtein = 'poultry' | 'minced' | 'meat' | 'fish'

export interface Ingredient {
  id: string
  name: Text
  /** Extra search terms: transliterations, synonyms, brand-free variants. */
  aliases?: string[]
  aisle: Aisle
  /** Fresh produce/herbs/fresh dairy: bought in the midweek top-up when needed late in the week. */
  fresh?: boolean
  /** Rough days it stays good after purchase, used only to ask "still have it?", never as an expiry. */
  keepsDays?: number
  allergens?: Allergen[]
  /** Salt, pepper, spices, water: assumed in most kitchens, listed under "check you have". */
  basic?: boolean
  /** Never shown on lists (water). */
  free?: boolean
  raw?: RawProtein
  /** Plausible, food-safe substitutes. */
  subs?: string[]
}

export interface RecipeIngredient {
  id: string
  qty?: number
  unit?: Unit
  optional?: boolean
  note?: Text
}

export type RecipeKind = 'dinner' | 'breakfast' | 'snack' | 'smoothie'

export type Tag =
  | 'quick' | 'vegetarian' | 'legumes' | 'chicken' | 'meat' | 'fish' | 'eggs'
  | 'no_oven' | 'prep_ahead' | 'leftover_friendly' | 'pantry' | 'budget' | 'lebanese' | 'fresh'

export type Equipment = 'oven' | 'blender' | 'stovetop'

export interface Recipe {
  id: string
  kind: RecipeKind
  name: Text
  /** One-line description shown on cards. */
  blurb: Text
  prepMin: number
  cookMin: number
  servings: number
  difficulty: 1 | 2 | 3
  cost: 1 | 2 | 3
  tags: Tag[]
  equipment: Equipment[]
  ingredients: RecipeIngredient[]
  steps: Text[]
  /** Leftovers keep this many days in the fridge (default guidance 3). 0 = eat fresh. */
  leftoverDays?: number
  freezes?: boolean
  storage?: Text
  safety?: Text
  tips?: Text
  /** Custom household recipe or "our version" of a built-in. */
  custom?: boolean
  baseId?: string
  sourceUrl?: string
}

export type DayType = 'cook' | 'leftovers' | 'takeout' | 'away' | 'free'

export interface PlanEntry {
  date: string // YYYY-MM-DD
  type: DayType
  recipeId?: string
  servings?: number
  note?: string
  /** On a leftovers night: the specific leftover we chose. */
  leftoverId?: string
}

export type StockStatus = 'have' | 'low' | 'out' | 'unknown'

export interface PantryItem {
  id: string // ingredient id
  status: StockStatus
  qty?: number
  unit?: Unit
  /** User-entered best-by date only. */
  bestBy?: string
  /** Set when ticked off the shopping list. */
  boughtOn?: string
  /**
   * Last planned use when it was bought. After that date the purchase no longer counts
   * as "have" (it was probably eaten); the app asks again instead of assuming.
   */
  usedBy?: string
  /** Show on the staples screen even when not used this week. */
  staple?: boolean
}

export interface Leftover {
  id: string
  label: string
  recipeId?: string
  madeOn: string
  portions?: number
  place: 'fridge' | 'freezer'
  status: 'active' | 'eaten' | 'tossed'
}

export type Rating = 'love' | 'okay' | 'never'

export interface Settings {
  shopDay: number // 0 Sunday ... 6 Saturday
  topUpDay: number
  servings: number
  /** Default day type per weekday (0 = Sunday). */
  dayPattern: DayType[]
  allergies: Allergen[]
  dislikes: string[] // ingredient ids
  equipment: Equipment[]
  /** Share of each week drawn from loved dishes, 0..1. */
  favouriteShare: number
}

export interface Member {
  id: string
  name: string
}
