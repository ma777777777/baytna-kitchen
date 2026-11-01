// Meals of the day: the small pieces shared by the Week and Today screens.
// The day's main (cooked) meal is the plan entry; breakfast, snack and the other of
// lunch/dinner are optional extras picked by hand.
import { useMemo, useState } from 'react'
import { ArrowUpDown, BookOpen, Leaf, Plus, Store, Trash2 } from 'lucide-react'
import { isAllowed } from '../domain/engine/filters'
import { servingsFor } from '../domain/engine/planner'
import { searchRecipes } from '../domain/engine/search'
import { householdRating, mainSlot } from '../domain/engine/state'
import { SLOTS, type MealEntry, type RecipeKind, type Slot } from '../domain/types'
import { useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { RecipeRow, useLateNotice } from '../ui/bits'
import { Button, Chip, Sheet, cx } from '../ui/kit'
import { go } from '../ui/router'

export const SLOT_LABEL: Record<Slot, StringKey> = {
  breakfast: 'slot_breakfast',
  lunch: 'slot_lunch',
  dinner: 'slot_dinner',
  snack: 'slot_snack',
}

const KINDS: Record<Slot, RecipeKind[]> = {
  breakfast: ['breakfast', 'smoothie'],
  lunch: ['dinner'],
  dinner: ['dinner'],
  snack: ['snack', 'smoothie'],
}

export type MealTarget = { date: string; slot: Slot }

/** The extra meals of a day, in day order, without the main meal's slot. */
export function useExtras(date: string) {
  const { state } = useKitchen()
  const main = mainSlot(state.plan[date])
  const extras = state.meals?.[date] ?? {}
  return SLOTS.filter((s) => s !== main).map((slot) => ({ slot, entry: extras[slot] }))
}

/** One line of text for an extra meal. */
export function useMealText() {
  const { state } = useKitchen()
  const { t, L } = useT()
  return (m: MealEntry) => {
    if (m.type === 'leftovers') return t('dayLeftovers')
    if (m.type === 'out') return t('mealOut')
    if (m.type === 'note') return m.note ?? ''
    const r = state.recipes.find((x) => x.id === m.recipeId)
    return r ? L(r.name) : ''
  }
}

/** Small "Make it lunch / dinner" switch for the main meal. */
export function MoveMain({ date }: { date: string }) {
  const k = useKitchen()
  const { t } = useT()
  const main = mainSlot(k.state.plan[date])
  return (
    <button
      onClick={() => k.moveMain(date, main === 'dinner' ? 'lunch' : 'dinner')}
      className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs text-muted ring-1 ring-sand"
    >
      <ArrowUpDown size={12} /> {t(main === 'dinner' ? 'makeItLunch' : 'makeItDinner')}
    </button>
  )
}

/**
 * Filled extras as rows, empty ones as "+ Breakfast" chips. `part` splits them around the
 * main meal so the day reads in order: 'before' (e.g. breakfast) or 'after' (with the chips).
 */
export function ExtraMeals({
  date,
  onOpen,
  readOnly,
  part,
}: {
  date: string
  onOpen: (t: MealTarget) => void
  readOnly?: boolean
  part: 'before' | 'after'
}) {
  const { t } = useT()
  const { state } = useKitchen()
  const text = useMealText()
  const at = SLOTS.indexOf(mainSlot(state.plan[date]))
  const extras = useExtras(date)
  const filled = extras.filter((x) => x.entry && (SLOTS.indexOf(x.slot) < at) === (part === 'before'))
  const empty = part === 'after' && !readOnly ? extras.filter((x) => !x.entry) : []
  if (!filled.length && !empty.length) return null
  return (
    <div className="mt-2 space-y-1">
      {filled.map(({ slot, entry }) => (
        <button
          key={slot}
          disabled={readOnly}
          onClick={() => onOpen({ date, slot })}
          className="flex min-h-9 w-full items-center gap-2 rounded-xl bg-cream/60 px-3 text-start text-sm"
        >
          <span className="w-14 shrink-0 text-muted">{t(SLOT_LABEL[slot])}</span>
          <span className="truncate font-medium">{text(entry!)}</span>
        </button>
      ))}
      {empty.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {empty.map(({ slot }) => (
            <button
              key={slot}
              onClick={() => onOpen({ date, slot })}
              className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs text-muted border border-dashed border-sand"
            >
              <Plus size={12} /> {t(SLOT_LABEL[slot])}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Pick or change one extra meal: a recipe, leftovers, eating out, a few words, or nothing. */
export function MealSheet({ target, onClose }: { target: MealTarget | null; onClose: () => void }) {
  const k = useKitchen()
  const notice = useLateNotice()
  const { t, dayName } = useT()
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const pool = useMemo(
    () => k.state.recipes.filter((r) => isAllowed(r, k.state.settings) && !householdRating(k.state, r.id).never),
    [k.state],
  )
  if (!target) return null
  const { date, slot } = target
  const cur = k.state.meals?.[date]?.[slot]
  const recipes = q ? searchRecipes(pool, q) : pool.filter((r) => KINDS[slot].includes(r.kind))
  const close = () => {
    setQ('')
    setNote('')
    onClose()
  }
  const set = (m: Omit<MealEntry, 'date' | 'slot'> | null) => {
    notice(k.setMeal(date, slot, m))
    close()
  }
  const pick = (id: string) => {
    const r = k.state.recipes.find((x) => x.id === id)!
    set({ type: 'cook', recipeId: id, servings: servingsFor(r, k.state) })
  }
  return (
    <Sheet open onClose={close} title={`${t(SLOT_LABEL[slot])} · ${dayName(date)}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Chip active={cur?.type === 'leftovers'} onClick={() => set({ type: 'leftovers' })}>
            <Leaf size={14} className="me-1 inline" /> {t('dayLeftovers')}
          </Chip>
          <Chip active={cur?.type === 'out'} onClick={() => set({ type: 'out' })}>
            <Store size={14} className="me-1 inline" /> {t('mealOut')}
          </Chip>
          {cur?.type === 'cook' && cur.recipeId && (
            <Chip
              onClick={() => {
                close()
                go(`recipe/${cur.recipeId}`)
              }}
            >
              <BookOpen size={14} className="me-1 inline" /> {t('openRecipe')}
            </Chip>
          )}
          {cur && (
            <Chip onClick={() => set(null)}>
              <Trash2 size={14} className="me-1 inline" /> {t('remove')}
            </Chip>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim()) set({ type: 'note', note: note.trim() })
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={cur?.type === 'note' ? cur.note : t('mealNoteHint')}
            className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage"
          />
          <Button type="submit" disabled={!note.trim()}>
            {t('save')}
          </Button>
        </form>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchRecipes')}
          className="min-h-12 w-full rounded-2xl bg-white px-4 ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage"
        />
        {!q && <p className="px-1 text-sm font-semibold text-olive">{t('mealIdeas')}</p>}
        <div className="space-y-2">
          {recipes.map((r) => (
            <div key={r.id} className={cx(cur?.recipeId === r.id && 'rounded-2xl ring-2 ring-sage')}>
              <RecipeRow recipe={r} onClick={() => pick(r.id)} right={<span />} />
            </div>
          ))}
        </div>
        {(slot === 'breakfast' || slot === 'snack') && <p className="text-center text-xs text-muted">{t('extraMealsHint')}</p>}
      </div>
    </Sheet>
  )
}
