import { useState } from 'react'
import { ArrowLeft, CalendarPlus, ChefHat, Clock, ExternalLink, Heart, Pencil, ShieldAlert, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { addDays, weekDates } from '../domain/dates'
import { stockOf } from '../domain/engine/availability'
import { conflicts, safeSubs, visibleIngredients } from '../domain/engine/filters'
import { recipeAllergens } from '../domain/recipes'
import { INGREDIENTS } from '../domain/ingredients'
import type { Rating, Recipe, RecipeIngredient } from '../domain/types'
import { formatQty } from '../domain/units'
import { useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { AvailabilityBadge, Monogram, useAvailability, useIngName } from '../ui/bits'
import { Badge, Button, Card, SectionTitle, Sheet, Stepper, cx } from '../ui/kit'
import { go, useBack } from '../ui/router'

export function RecipeDetail({ id }: { id: string }) {
  const k = useKitchen()
  const recipe = k.state.recipes.find((r) => r.id === id)
  const back = useBack()
  if (!recipe)
    return (
      <div className="p-6 text-center">
        <Button onClick={back}>←</Button>
      </div>
    )
  return <Detail recipe={recipe} />
}

const RATING_LABEL: Record<Rating, StringKey> = { love: 'love', okay: 'okay', never: 'never' }

function Detail({ recipe }: { recipe: Recipe }) {
  const k = useKitchen()
  const { t, L, lang, dayName, list } = useT()
  const back = useBack()
  const name = useIngName()
  const av = useAvailability(recipe)
  const [servings, setServings] = useState(recipe.kind === 'dinner' ? Math.max(k.state.settings.servings, recipe.servings) : recipe.servings)
  const [planOpen, setPlanOpen] = useState(false)
  const factor = servings / recipe.servings
  const ingredients = visibleIngredients(recipe, k.state.settings)
  const myRating = k.state.ratings[recipe.id]?.[k.me.id]
  const others = Object.entries(k.state.ratings[recipe.id] ?? {}).filter(([m]) => m !== k.me.id)
  const allergens = recipeAllergens({ ...recipe, ingredients })
  const blocked = conflicts(recipe, k.state.settings).filter((c) => !recipe.ingredients.find((i) => i.id === c.ingredientId)?.optional)
  const never = Object.values(k.state.ratings[recipe.id] ?? {}).includes('never')

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-2">
        <button onClick={back} aria-label={t('back')} className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-sand">
          <ArrowLeft className="flip-rtl" size={20} />
        </button>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => go(`recipe-edit/${recipe.id}`)}>
            <Pencil size={14} /> {recipe.custom ? t('edit') : t('editOurVersion')}
          </Button>
        </div>
      </div>

      <header className="flex items-start gap-3">
        <Monogram recipe={recipe} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-olive">{L(recipe.name)}</h1>
          <p className="text-sm text-muted" dir={lang === 'ar' ? 'ltr' : 'rtl'}>
            {lang === 'ar' ? recipe.name.en : recipe.name.ar}
          </p>
          <p className="mt-2 text-muted">{L(recipe.blurb)}</p>
        </div>
      </header>

      {blocked.length > 0 && (
        <Card className="flex items-start gap-2 bg-terra-soft ring-terra/30">
          <ShieldAlert className="shrink-0 text-terra-deep" size={18} />
          <p className="text-sm text-terra-deep">
            {t('notForYou')}: {list(blocked.map((b) => name(b.ingredientId)))}
          </p>
        </Card>
      )}
      {never && <p className="text-sm text-muted">{t('neverHidden')}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>
          <Clock size={12} /> {t('prep')} {t('min', { n: recipe.prepMin })}
        </Badge>
        {recipe.cookMin > 0 && (
          <Badge>
            {t('cook')} {t('min', { n: recipe.cookMin })}
          </Badge>
        )}
        <Badge>{t(`diff${recipe.difficulty}` as StringKey)}</Badge>
        <Badge>{t(`cost${recipe.cost}` as StringKey)}</Badge>
        {recipe.equipment.includes('oven') && <Badge>{t('needsOven')}</Badge>}
        {recipe.equipment.includes('blender') && <Badge>{t('needsBlender')}</Badge>}
        <AvailabilityBadge av={av} />
      </div>
      {allergens.length > 0 && (
        <p className="text-sm text-muted">
          {t('contains')}: {list(allergens.map((a) => t(`al_${a}` as StringKey)))}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" size="lg" onClick={() => go(`cook/${recipe.id}/${servings}`)}>
          <ChefHat size={20} /> {t('cookNow')}
        </Button>
        <Button size="lg" onClick={() => setPlanOpen(true)}>
          <CalendarPlus size={18} /> {t('addToPlan')}
        </Button>
      </div>

      <SectionTitle action={<Stepper label={t('servings')} value={servings} onChange={setServings} />}>{t('ingredients')}</SectionTitle>
      <Card className="p-2">
        <ul className="divide-y divide-sand/60">
          {ingredients.map((ri, i) => (
            <IngredientLine key={i} ri={ri} factor={factor} />
          ))}
        </ul>
      </Card>

      <SectionTitle>{t('steps')}</SectionTitle>
      <ol className="space-y-3">
        {recipe.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sage-soft text-sm font-semibold text-olive">{i + 1}</span>
            <p className="pt-0.5 leading-relaxed">{L(s)}</p>
          </li>
        ))}
      </ol>

      {recipe.safety && (
        <Card className="bg-terra-soft/60 ring-terra/20">
          <p className="text-sm font-semibold text-terra-deep">{t('safety')}</p>
          <p className="mt-1 text-sm">{L(recipe.safety)}</p>
        </Card>
      )}
      {recipe.storage && (
        <Card>
          <p className="text-sm font-semibold text-olive">{t('storage')}</p>
          <p className="mt-1 text-sm">{L(recipe.storage)}</p>
        </Card>
      )}
      {recipe.tips && (
        <Card>
          <p className="text-sm font-semibold text-olive">{t('tips')}</p>
          <p className="mt-1 text-sm">{L(recipe.tips)}</p>
        </Card>
      )}
      {recipe.sourceUrl && (
        <a href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-olive underline">
          <ExternalLink size={14} /> {recipe.sourceUrl}
        </a>
      )}

      <SectionTitle>{t('yourRating')}</SectionTitle>
      <RatingButtons value={myRating} onChange={(r) => k.rate(recipe.id, r === myRating ? null : r)} />
      {others.map(([m, r]) => (
        <p key={m} className="text-sm text-muted">
          {t('ratedBy', { name: k.nameOf(m) || '…', rating: t(RATING_LABEL[r]) })}
        </p>
      ))}

      {recipe.custom && (
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (window.confirm(t('deleteRecipe') + '?')) {
              k.deleteRecipe(recipe.id)
              back()
            }
          }}
        >
          <Trash2 size={16} /> {t('deleteRecipe')}
        </Button>
      )}

      <Sheet open={planOpen} onClose={() => setPlanOpen(false)} title={t('whichDay')}>
        <div className="grid gap-2">
          {[...weekDates(k.weekStart), ...weekDates(addDays(k.weekStart, 7))]
            .filter((d) => d >= k.state.today)
            .slice(0, 9)
            .map((d) => {
              const cur = k.state.plan[d]
              const curR = cur?.recipeId && k.state.recipes.find((r) => r.id === cur.recipeId)
              return (
                <Button
                  key={d}
                  className="justify-between"
                  onClick={() => {
                    k.setEntry({ date: d, type: 'cook', recipeId: recipe.id, servings })
                    setPlanOpen(false)
                    go('week')
                  }}
                >
                  <span>{d === k.state.today ? t('today') : dayName(d)}</span>
                  <span className="truncate text-sm text-muted">{curR ? L(curR.name) : cur ? t(`day${cap(cur.type)}` as StringKey) : ''}</span>
                </Button>
              )
            })}
        </div>
      </Sheet>
    </div>
  )

  function IngredientLine({ ri, factor }: { ri: RecipeIngredient; factor: number }) {
    const stock = stockOf(ri.id, k.state.pantry, k.state.today)
    const ing = INGREDIENTS[ri.id]
    const missing = (stock === 'out' || stock === 'unknown') && !ing?.basic && !ri.optional
    const subs = missing ? safeSubs(ri.id, k.state.settings) : []
    return (
      <li className="flex items-start gap-3 px-2 py-2.5">
        <span
          aria-hidden
          className={cx('mt-2 size-2 shrink-0 rounded-full', stock === 'have' ? 'bg-sage' : stock === 'low' ? 'bg-terra' : stock === 'out' ? 'bg-ink' : 'bg-sand')}
        />
        <div className="min-w-0 flex-1">
          <span>{name(ri.id)}</span>
          {ri.optional && <span className="ms-1 text-xs text-muted">({t('optional')})</span>}
          {subs.length > 0 && <p className="text-xs text-muted">{t('orUse', { items: list(subs.map(name)) })}</p>}
        </div>
        <span className="shrink-0 text-sm text-muted tabular-nums">{ri.qty != null ? formatQty(ri.qty * factor, ri.unit, lang) : ''}</span>
      </li>
    )
  }
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

export function RatingButtons({ value, onChange }: { value?: Rating; onChange: (r: Rating) => void }) {
  const { t } = useT()
  const opts: [Rating, React.ReactNode][] = [
    ['love', <Heart key="h" size={18} />],
    ['okay', <ThumbsUp key="u" size={18} />],
    ['never', <ThumbsDown key="d" size={18} />],
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map(([r, icon]) => (
        <button
          key={r}
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={cx(
            'flex min-h-12 items-center justify-center gap-1.5 rounded-2xl text-sm font-medium ring-1',
            value === r ? (r === 'never' ? 'bg-ink text-white ring-ink' : r === 'love' ? 'bg-terra text-white ring-terra' : 'bg-sage text-white ring-sage') : 'bg-white ring-sand',
          )}
        >
          {icon} {t(RATING_LABEL[r])}
        </button>
      ))}
    </div>
  )
}
