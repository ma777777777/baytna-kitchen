import { ChevronRight, Clock, Heart } from 'lucide-react'
import { recipeAvailability, type RecipeAvailability } from '../domain/engine/availability'
import type { Why } from '../domain/engine/planner'
import type { Reason } from '../domain/engine/suggest'
import { householdRating } from '../domain/engine/state'
import { INGREDIENTS } from '../domain/ingredients'
import { totalMinutes } from '../domain/recipes'
import type { Recipe } from '../domain/types'
import { useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import { Badge, cx } from './kit'
import { go } from './router'

export function useIngName() {
  const { L } = useT()
  return (id: string) => {
    const ing = INGREDIENTS[id]
    return ing ? L(ing.name) : id
  }
}

export function AvailabilityBadge({ av }: { av: RecipeAvailability }) {
  const { t } = useT()
  if (av.status === 'ready') return <Badge tone="good">{t('avReady')}</Badge>
  if (av.status === 'missing') return <Badge tone="warn">{t('avMissing', { n: av.missing.length })}</Badge>
  return <Badge>{t('avShopping')}</Badge>
}

export function useAvailability(recipe: Recipe) {
  const { state } = useKitchen()
  return recipeAvailability(recipe, state.pantry, state.settings, state.today)
}

export function ReasonLine({ reasons }: { reasons: Reason[] }) {
  const { t, list } = useT()
  const name = useIngName()
  const parts = reasons
    .map((r) => {
      switch (r.code) {
        case 'missing':
          return t('missingList', { items: list(r.ids.map(name)) })
        case 'love':
          return t('whyLove')
        case 'pantry':
          return t('whyPantry')
        default:
          return null
      }
    })
    .filter(Boolean)
  if (!parts.length) return null
  return <p className="mt-1 text-sm text-muted">{parts.join(' · ')}</p>
}

export function WhyLine({ why }: { why: Why[] }) {
  const { t, list } = useT()
  const name = useIngName()
  const map: Record<Why['code'], (w: Why) => string> = {
    love: () => t('whyLove'),
    okay: () => t('whyOkay'),
    new: () => t('whyNew'),
    shares: (w) => t('whyShares', { items: list((w.detail ?? []).slice(0, 2).map(name)) }),
    legumes: () => t('whyLegumes'),
    variety: () => t('whyVariety'),
    quick: () => t('whyQuick'),
    early_fresh: () => t('whyEarlyFresh'),
    batch: () => t('whyBatch'),
  }
  return <p className="mt-1 text-sm text-muted">{why.slice(0, 3).map((w) => map[w.code](w)).join(' · ')}</p>
}

export function RecipeRow({ recipe, onClick, right }: { recipe: Recipe; onClick?: () => void; right?: React.ReactNode }) {
  const { t, L, lang } = useT()
  const { state } = useKitchen()
  const av = useAvailability(recipe)
  const loved = householdRating(state, recipe.id).loves > 0
  return (
    <button
      onClick={onClick ?? (() => go(`recipe/${recipe.id}`))}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-start ring-1 ring-sand/70 active:bg-cream"
    >
      <Monogram recipe={recipe} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium text-ink">
          <span className="truncate">{L(recipe.name)}</span>
          {loved && <Heart size={14} className="shrink-0 fill-terra text-terra" aria-label={t('whyLove')} />}
        </div>
        <div className="truncate text-xs text-muted" dir={lang === 'ar' ? 'ltr' : 'rtl'}>
          {lang === 'ar' ? recipe.name.en : recipe.name.ar}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {t('min', { n: totalMinutes(recipe) })}
          </span>
          <AvailabilityBadge av={av} />
          {recipe.custom && <Badge>{t('custom')}</Badge>}
        </div>
      </div>
      {right ?? <ChevronRight size={18} className="flip-rtl shrink-0 text-muted" />}
    </button>
  )
}

const KIND_TONE: Record<string, string> = {
  dinner: 'bg-sage-soft text-olive',
  breakfast: 'bg-terra-soft text-terra-deep',
  snack: 'bg-terra-soft text-terra-deep',
  smoothie: 'bg-[#efe3ea] text-[#7a4b63]',
}

/** Tasteful placeholder instead of stock food photos: first letter of the Arabic name. */
export function Monogram({ recipe, size = 'md' }: { recipe: Recipe; size?: 'md' | 'lg' }) {
  const letter = recipe.name.ar.replace(/^(ال)/, '').trim()[0] ?? '•'
  return (
    <div
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center rounded-2xl font-semibold',
        KIND_TONE[recipe.kind],
        size === 'md' ? 'size-12 text-xl' : 'size-16 text-3xl',
      )}
    >
      {letter}
    </div>
  )
}

export function minutesLabel(r: Recipe) {
  return totalMinutes(r)
}
