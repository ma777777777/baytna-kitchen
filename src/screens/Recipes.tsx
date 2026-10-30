import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { AVAILABILITY_RANK, recipeAvailability } from '../domain/engine/availability'
import { isAllowed } from '../domain/engine/filters'
import { searchRecipes } from '../domain/engine/search'
import { householdRating } from '../domain/engine/state'
import { totalMinutes } from '../domain/recipes'
import type { Recipe } from '../domain/types'
import { useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { RecipeRow } from '../ui/bits'
import { Button, Chip, Empty, SectionTitle } from '../ui/kit'
import { go } from '../ui/router'

type Collection = 'all' | 'quick' | 'lebanese' | 'snacks' | 'smoothies' | 'loved'
type Filter = 'u15' | 'u30' | 'veg' | 'legumes' | 'chicken' | 'fish' | 'noOven' | 'ready' | 'prep'

const COLLECTIONS: [Collection, StringKey][] = [
  ['all', 'colAll'],
  ['quick', 'colQuick'],
  ['lebanese', 'colLebanese'],
  ['snacks', 'colSnacks'],
  ['smoothies', 'colSmoothies'],
  ['loved', 'colLoved'],
]
const FILTERS: [Filter, StringKey][] = [
  ['ready', 'fReady'],
  ['u15', 'fUnder15'],
  ['u30', 'fUnder30'],
  ['veg', 'fVeg'],
  ['legumes', 'fLegumes'],
  ['chicken', 'fChicken'],
  ['fish', 'fFish'],
  ['noOven', 'fNoOven'],
  ['prep', 'fPrep'],
]

export function Recipes() {
  const k = useKitchen()
  const { t } = useT()
  const { state } = k
  const [q, setQ] = useState('')
  const [col, setCol] = useState<Collection>('all')
  const [filters, setFilters] = useState<Set<Filter>>(new Set())

  const av = (r: Recipe) => recipeAvailability(r, state.pantry, state.settings, state.today)

  const list = useMemo(() => {
    let rs = state.recipes.filter((r) => isAllowed(r, state.settings))
    if (col === 'quick') rs = rs.filter((r) => r.kind === 'dinner' && totalMinutes(r) <= 25)
    if (col === 'lebanese') rs = rs.filter((r) => r.tags.includes('lebanese'))
    if (col === 'snacks') rs = rs.filter((r) => r.kind === 'snack' || r.kind === 'breakfast')
    if (col === 'smoothies') rs = rs.filter((r) => r.kind === 'smoothie')
    if (col === 'loved') rs = rs.filter((r) => householdRating(state, r.id).loves > 0)
    for (const f of filters) {
      rs = rs.filter((r) => {
        switch (f) {
          case 'u15':
            return totalMinutes(r) <= 15
          case 'u30':
            return totalMinutes(r) <= 30
          case 'veg':
            return r.tags.includes('vegetarian')
          case 'legumes':
            return r.tags.includes('legumes')
          case 'chicken':
            return r.tags.includes('chicken')
          case 'fish':
            return r.tags.includes('fish')
          case 'noOven':
            return !r.equipment.includes('oven')
          case 'ready':
            return av(r).status === 'ready'
          case 'prep':
            return r.tags.includes('prep_ahead')
        }
      })
    }
    return searchRecipes(rs, q).sort((a, b) => {
      const ra = householdRating(state, a.id)
      const rb = householdRating(state, b.id)
      if (ra.never !== rb.never) return ra.never ? 1 : -1
      return AVAILABILITY_RANK[av(a).status] - AVAILABILITY_RANK[av(b).status] || rb.loves - ra.loves || totalMinutes(a) - totalMinutes(b)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, q, col, filters])

  const browsing = !q && col === 'all' && filters.size === 0
  const picks = browsing ? list.filter((r) => r.kind === 'dinner' && !householdRating(state, r.id).never).slice(0, 3) : []

  return (
    <div className="space-y-3">
      <div className="relative pt-2">
        <Search size={18} className="pointer-events-none absolute start-4 top-1/2 mt-1 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchRecipes')}
          aria-label={t('searchRecipes')}
          className="min-h-12 w-full rounded-2xl bg-white ps-11 pe-4 ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage"
        />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {COLLECTIONS.map(([c, key]) => (
          <Chip key={c} active={col === c} onClick={() => setCol(c)}>
            {t(key)}
          </Chip>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map(([f, key]) => (
          <Chip
            key={f}
            active={filters.has(f)}
            className="text-xs"
            onClick={() =>
              setFilters((s) => {
                const n = new Set(s)
                if (n.has(f)) n.delete(f)
                else n.add(f)
                return n
              })
            }
          >
            {t(key)}
          </Chip>
        ))}
      </div>

      {picks.length > 0 && (
        <>
          <SectionTitle>{t('topPicks')}</SectionTitle>
          <div className="space-y-2">
            {picks.map((r) => (
              <RecipeRow key={r.id} recipe={r} />
            ))}
          </div>
        </>
      )}

      <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => go('recipe-new')}><Plus size={16} /> {t('newRecipe')}</Button>}>
        {t('allRecipes', { n: list.length })}
      </SectionTitle>
      {list.length === 0 ? (
        <Empty>{t('noResults')}</Empty>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <RecipeRow key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  )
}
