import { useState } from 'react'
import { AlertTriangle, CalendarPlus, ChefHat, Clock, Leaf, Plus, Shuffle, Snowflake, Sparkles, UtensilsCrossed, Zap } from 'lucide-react'
import { addDays, diffDays } from '../domain/dates'
import { leftoverSource, servingsFor } from '../domain/engine/planner'
import { edibleLeftovers, exhaustedOptions, snackPicks, todayNudges, tonightOptions, type Nudge, type Suggestion } from '../domain/engine/suggest'
import { totalMinutes } from '../domain/recipes'
import type { Leftover } from '../domain/types'
import { useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import { AvailabilityBadge, Monogram, ReasonLine, useAvailability, useIngName } from '../ui/bits'
import { Button, Card, Chip, SectionTitle, Sheet, cx, useToast } from '../ui/kit'
import type { StringKey } from '../i18n/strings'
import { go } from '../ui/router'
import { mainSlot } from '../domain/engine/state'
import { SLOTS } from '../domain/types'
import { MealSheet, MoveMain, SLOT_LABEL, useMealText, type MealTarget } from './Meals'

export function Today() {
  const k = useKitchen()
  const { t, L, dayName, dateLabel, weekdayName } = useT()
  const { state } = k
  const entry = state.plan[state.today]
  const recipe = entry?.recipeId ? state.recipes.find((r) => r.id === entry.recipeId) : undefined
  const [sheet, setSheet] = useState<null | 'options' | 'tired'>(null)
  const mainLabel = mainSlot(entry) === 'lunch' ? t('lunchToday') : t('tonight')
  const nudges = todayNudges(state, k.weekStart)
  const hasPlan = Object.keys(state.plan).some((d) => d >= k.weekStart && d < addDays(k.weekStart, 7))
  // The Friday draft: from two days before the shopping day, nudge to plan next week.
  const nextStart = addDays(k.weekStart, 7)
  const needsNextWeek = diffDays(nextStart, state.today) <= 2 && !Object.keys(state.plan).some((d) => d >= nextStart && d < addDays(nextStart, 7))

  const leftoverName = (l: Leftover) => {
    const r = l.recipeId && state.recipes.find((x) => x.id === l.recipeId)
    return r ? L(r.name) : l.label
  }

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <p className="text-sm text-muted">
          {dayName(state.today)} · {dateLabel(state.today)}
        </p>
        <h1 className="text-2xl font-semibold text-olive">{t('todayTitle')}</h1>
      </header>

      <Nudges nudges={nudges} />

      {needsNextWeek && (
        <button onClick={() => go('week/next')} className="block w-full text-start">
          <Card className="flex items-center gap-3 bg-terra-soft/70 ring-terra/30">
            <CalendarPlus className="shrink-0 text-terra-deep" size={22} />
            <div>
              <p className="font-semibold text-terra-deep">{t('nextWeekTitle')}</p>
              <p className="text-sm text-muted">{t('nextWeekBody', { day: weekdayName(state.settings.shopDay) })}</p>
            </div>
          </Card>
        </button>
      )}

      {!hasPlan ? (
        <Card className="bg-sage-soft/60">
          <h2 className="text-lg font-semibold text-olive">{t('noPlanTitle')}</h2>
          <p className="mt-1 text-muted">{t('noPlanBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => go('week')}>
              <CalendarPlus size={18} /> {t('planTheWeek')}
            </Button>
            <Button onClick={() => setSheet('options')}>
              <Shuffle size={18} /> {t('surprise')}
            </Button>
          </div>
        </Card>
      ) : recipe && entry?.type === 'cook' ? (
        <TonightCard label={mainLabel} recipeId={recipe.id} servings={entry.servings ?? servingsFor(recipe, state)} onChange={() => setSheet('options')} />
      ) : (
        <Card>
          <p className="text-sm font-medium text-terra-deep">{mainLabel}</p>
          <OtherNight type={entry?.type ?? 'free'} leftoverId={entry?.leftoverId} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setSheet('options')}>
              <ChefHat size={18} /> {t('cookAnyway')}
            </Button>
          </div>
        </Card>
      )}

      {hasPlan && <DayPlan />}

      <div className="grid grid-cols-2 gap-3">
        <Button className="min-h-13 whitespace-nowrap" onClick={() => setSheet('options')}>
          <Shuffle size={18} /> {t('surprise')}
        </Button>
        <Button className="min-h-13 whitespace-nowrap" variant="terra" onClick={() => setSheet('tired')}>
          <Zap size={18} /> {t('exhausted')}
        </Button>
      </div>

      <SnackCards />

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'tired' ? t('exhaustedTitle') : t('optionsTitle')}>
        <div className="mb-3 flex gap-2">
          <Chip active={sheet === 'options'} onClick={() => setSheet('options')}>
            {t('surprise')}
          </Chip>
          <Chip active={sheet === 'tired'} onClick={() => setSheet('tired')}>
            {t('exhausted')}
          </Chip>
        </div>
        <Options
          options={sheet === 'tired' ? exhaustedOptions(state) : tonightOptions(state, recipe?.id)}
          onPicked={() => setSheet(null)}
        />
        <p className="mt-3 text-center text-sm text-muted">{L({ en: 'Picking one replaces tonight in the plan; the shopping list updates.', ar: 'يلي بتختاروه بيصير عشا الليلة بالخطة، ولائحة الأغراض بتتحدّث لحالها.' })}</p>
      </Sheet>
    </div>
  )

  function OtherNight({ type, leftoverId }: { type: string; leftoverId?: string }) {
    if (type === 'leftovers') {
      const src = leftoverSource(state, state.today)
      const r = src?.recipeId && state.recipes.find((x) => x.id === src.recipeId)
      const edible = edibleLeftovers(state)
      // The one we picked, else the tracked leftover from the planned batch dish, else the oldest safe one.
      const chosen = leftoverId
        ? edible.find((l) => l.id === leftoverId)
        : (edible.find((l) => src?.recipeId && l.recipeId === src.recipeId) ?? edible[0])
      return (
        <>
          <h2 className="mt-1 text-xl font-semibold text-olive">{chosen ? leftoverName(chosen) : t('leftoversNight')}</h2>
          {chosen ? (
            <>
              <p className="mt-1 text-muted">{t('leftoverMade', { day: dayName(chosen.madeOn) })}</p>
              <Button className="mt-3" variant="primary" onClick={() => k.saveLeftover({ ...chosen, status: 'eaten' })}>
                {t('finishedLeftover')}
              </Button>
            </>
          ) : leftoverId ? (
            <p className="mt-1 text-terra-deep">{t('leftoverGone')}</p>
          ) : (
            r && src && <p className="mt-1 text-muted">{t('leftoversFrom', { day: dayName(src.date), dish: L(r.name) })}</p>
          )}
        </>
      )
    }
    const map: Record<string, [string, string]> = {
      takeout: [t('takeoutNight'), t('takeoutBody')],
      away: [t('awayNight'), t('awayBody')],
      free: [t('freeNight'), t('freeBody')],
    }
    const [title, body] = map[type] ?? map.free
    return (
      <>
        <h2 className="mt-1 text-xl font-semibold text-olive">{title}</h2>
        <p className="mt-1 text-muted">{body}</p>
      </>
    )
  }
}

/** The whole day at a glance: breakfast, lunch, dinner, snack. Extras open the meal picker. */
function DayPlan() {
  const { state } = useKitchen()
  const { t, L } = useT()
  const text = useMealText()
  const [meal, setMeal] = useState<MealTarget | null>(null)
  const date = state.today
  const entry = state.plan[date]
  const main = mainSlot(entry)
  const mainText = () => {
    const r = entry?.recipeId && state.recipes.find((x) => x.id === entry.recipeId)
    if (r && entry?.type === 'cook') return L(r.name)
    return t(`day${(entry?.type ?? 'free').replace(/^./, (c) => c.toUpperCase())}` as StringKey)
  }
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-olive">{t('todaysPlan')}</p>
        <MoveMain date={date} />
      </div>
      <ul className="mt-2 divide-y divide-sand/60">
        {SLOTS.map((slot) => {
          const isMain = slot === main
          const m = state.meals?.[date]?.[slot]
          return (
            <li key={slot}>
              <button
                disabled={isMain}
                onClick={() => setMeal({ date, slot })}
                className="flex min-h-11 w-full items-center gap-3 text-start"
              >
                <span className={cx('w-14 shrink-0 text-sm', isMain ? 'font-semibold text-terra-deep' : 'text-muted')}>{t(SLOT_LABEL[slot])}</span>
                {isMain ? (
                  <span className="truncate font-medium">{mainText()}</span>
                ) : m ? (
                  <span className="truncate">{text(m)}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm text-muted">
                    <Plus size={14} /> {t('add')}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <MealSheet target={meal} onClose={() => setMeal(null)} />
    </Card>
  )
}

function TonightCard({ label, recipeId, servings, onChange }: { label: string; recipeId: string; servings: number; onChange: () => void }) {
  const { state } = useKitchen()
  const { t, L, list } = useT()
  const recipe = state.recipes.find((r) => r.id === recipeId)!
  const av = useAvailability(recipe)
  const name = useIngName()
  const noData = Object.values(state.pantry).every((p) => p.status === 'unknown')
  return (
    <Card>
      <p className="text-sm font-medium text-terra-deep">{label}</p>
      <div className="mt-2 flex items-start gap-3">
        <Monogram recipe={recipe} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold leading-tight text-olive">{L(recipe.name)}</h2>
          <p className="mt-1 text-sm text-muted">{L(recipe.blurb)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock size={14} /> {t('min', { n: totalMinutes(recipe) })}
            </span>
            <span>· {t('servingsN', { n: servings })}</span>
            <AvailabilityBadge av={av} />
          </div>
        </div>
      </div>
      {av.missing.length > 0 && !noData && (
        <p className="mt-3 text-sm text-terra-deep">{t('missingList', { items: list(av.missing.map(name)) })}</p>
      )}
      {noData && <p className="mt-3 text-sm text-muted">{t('avUnknownHint')}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="primary" className="min-h-13 whitespace-nowrap" onClick={() => go(`cook/${recipe.id}/${servings}`)}>
          <ChefHat size={18} /> {t('startCooking')}
        </Button>
        <Button className="min-h-13 whitespace-nowrap" onClick={onChange}>
          <Shuffle size={18} /> {t('changeTonight')}
        </Button>
      </div>
    </Card>
  )
}

function Options({ options, onPicked }: { options: Suggestion[]; onPicked: () => void }) {
  const k = useKitchen()
  const { t, L, dayName } = useT()
  const toast = useToast()
  const { state } = k

  const pickRecipe = (s: Suggestion) => {
    const r = s.recipe!
    const late = k.setEntry({ date: state.today, type: 'cook', recipeId: r.id, servings: servingsFor(r, state) })
    if (late || (s.availability && s.availability.missing.length)) toast(t('addedMissing'), { label: t('tabShop'), run: () => go('shop') })
    onPicked()
  }
  const pickLeftover = (l: Leftover) => {
    k.setEntry({ date: state.today, type: 'leftovers', leftoverId: l.id })
    onPicked()
  }

  return (
    <div className="space-y-3">
      {options.map((s, i) =>
        s.leftover ? (
          <Card key={`l${i}`} className="bg-sage-soft/50">
            <div className="flex items-center gap-2 text-sm font-medium text-olive">
              <Leaf size={16} /> {t('eatLeftovers')}
            </div>
            <p className="mt-1 text-lg font-semibold">{leftoverLabel(s.leftover)}</p>
            <p className="text-sm text-muted">
              {t('madeOn')}: {dayName(s.leftover.madeOn)}
            </p>
            <Button className="mt-3 w-full" variant="primary" onClick={() => pickLeftover(s.leftover!)}>
              {t('eatLeftovers')}
            </Button>
          </Card>
        ) : (
          <Card key={s.recipe!.id}>
            <div className="flex items-start gap-3">
              <Monogram recipe={s.recipe!} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{L(s.recipe!.name)}</h3>
                  {s.slot === 'emergency' && (
                    <span className="text-xs font-medium text-terra-deep">
                      <Sparkles size={12} className="inline" /> {t('backupPantry')}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} /> {t('min', { n: totalMinutes(s.recipe!) })}
                  </span>
                  {s.availability && <AvailabilityBadge av={s.availability} />}
                </div>
                <ReasonLine reasons={s.reasons} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={() => pickRecipe(s)}>
                <UtensilsCrossed size={16} /> {t('pickThis')}
              </Button>
              <Button onClick={() => go(`recipe/${s.recipe!.id}`)}>{t('steps')}</Button>
            </div>
          </Card>
        ),
      )}
    </div>
  )

  function leftoverLabel(l: Leftover) {
    const r = l.recipeId && state.recipes.find((x) => x.id === l.recipeId)
    return r ? L(r.name) : l.label
  }
}

function Nudges({ nudges }: { nudges: Nudge[] }) {
  const k = useKitchen()
  const { t, L, dateLabel } = useT()
  const name = useIngName()
  const { state } = k
  if (!nudges.length) return null
  const recipeName = (id: string) => {
    const r = state.recipes.find((x) => x.id === id)
    return r ? L(r.name) : ''
  }
  return (
    <div className="space-y-2">
      {nudges.map((n, i) => {
        if (n.code === 'defrost')
          return (
            <Card key={i} className="flex items-start gap-3 bg-[#eaf1f4] ring-[#cfdde3]">
              <Snowflake className="mt-0.5 shrink-0 text-[#3f6b7d]" size={20} />
              <p>{t('nudgeDefrost', { item: name(n.ingredientId), dish: recipeName(n.recipeId) })}</p>
            </Card>
          )
        if (n.code === 'thaw_now')
          return (
            <Card key={i} className="flex items-start gap-3 bg-[#eaf1f4] ring-[#cfdde3]">
              <Snowflake className="mt-0.5 shrink-0 text-[#3f6b7d]" size={20} />
              <p className="text-sm">{t('nudgeThawNow', { item: name(n.ingredientId) })}</p>
            </Card>
          )
        if (n.code === 'leftover') {
          const l = n.leftover
          const r = l.recipeId && state.recipes.find((x) => x.id === l.recipeId)
          const label = r ? L(r.name) : l.label
          const old = n.daysLeft < 0
          return (
            <Card key={l.id} className={old ? 'bg-terra-soft ring-terra/30' : 'bg-sage-soft/50'}>
              <div className="flex items-start gap-3">
                {old ? <AlertTriangle className="mt-0.5 shrink-0 text-terra-deep" size={20} /> : <Leaf className="mt-0.5 shrink-0 text-olive" size={20} />}
                <div className="flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{t('useFirst')}</p>
                  <p className="font-medium">
                    {old
                      ? t('nudgeLeftoverOld', { label })
                      : n.daysLeft === 0
                        ? t('nudgeLeftoverToday', { label })
                        : t('nudgeLeftover', { label, n: n.daysLeft })}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {old ? (
                  // Past its safe window: the only offered action is throwing it out.
                  <Button size="sm" variant="primary" onClick={() => k.saveLeftover({ ...l, status: 'tossed' })}>
                    {t('tossed')}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => k.saveLeftover({ ...l, status: 'eaten' })}>
                      {t('eaten')}
                    </Button>
                    <Button size="sm" onClick={() => k.saveLeftover({ ...l, place: 'freezer' })}>
                      <Snowflake size={14} /> {t('frozen')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => k.saveLeftover({ ...l, status: 'tossed' })}>
                      {t('tossed')}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )
        }
        if (n.code === 'best_by')
          return (
            <Card key={i} className="flex items-center gap-3">
              <AlertTriangle className="shrink-0 text-terra" size={18} />
              <p className="text-sm">{t('nudgeBestBy', { item: name(n.ingredientId), date: dateLabel(n.bestBy) })}</p>
            </Card>
          )
        if (n.code === 'topup') {
          const count = k.listFor(k.weekStart).filter((x) => x.trip === 'topup' && !k.listState(k.weekStart, x.key).checked).length
          if (!count) return null
          return (
            <button key={i} onClick={() => go('shop/topup')} className="block w-full text-start">
              <Card className="flex items-center gap-3">
                <Leaf className="shrink-0 text-sage" size={18} />
                <p className="text-sm">{t('nudgeTopup', { n: count })}</p>
              </Card>
            </button>
          )
        }
        return null
      })}
    </div>
  )
}

function SnackCards() {
  const { state } = useKitchen()
  const { t, L } = useT()
  const { snack, smoothie } = snackPicks(state)
  const tiles = [
    { label: t('snackNow'), s: snack },
    { label: t('smoothieNow'), s: smoothie },
  ].filter((x) => x.s?.recipe)
  if (!tiles.length) return null
  return (
    <div>
      <SectionTitle>{t('snackNow')}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ label, s }) => (
          <button key={label} onClick={() => go(`recipe/${s!.recipe!.id}`)} className="text-start">
            <Card className="h-full">
              <p className="text-xs font-medium text-terra-deep">{label}</p>
              <p className="mt-1 font-medium leading-snug">{L(s!.recipe!.name)}</p>
              <div className="mt-2">{s!.availability && <AvailabilityBadge av={s!.availability} />}</div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  )
}
