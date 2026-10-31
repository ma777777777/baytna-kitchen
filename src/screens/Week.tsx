import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Clock, RefreshCw, Search, Shuffle, Snowflake } from 'lucide-react'
import { addDays, diffDays, weekDates } from '../domain/dates'
import { alternativesFor, defaultTypes, leftoverSource, plannableDinners, servingsFor, sharedIngredients } from '../domain/engine/planner'
import { searchRecipes } from '../domain/engine/search'
import { INGREDIENTS } from '../domain/ingredients'
import { totalMinutes } from '../domain/recipes'
import type { DayType, PlanEntry } from '../domain/types'
import { useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { Monogram, RecipeRow, WhyLine, useIngName, useLateNotice } from '../ui/bits'
import { Badge, Button, Card, Chip, Sheet, Stepper, cx } from '../ui/kit'
import { go } from '../ui/router'

export const DAY_TYPES: DayType[] = ['cook', 'leftovers', 'takeout', 'away', 'free']
export const DAY_LABEL: Record<DayType, StringKey> = {
  cook: 'dayCook',
  leftovers: 'dayLeftovers',
  takeout: 'dayTakeout',
  away: 'dayAway',
  free: 'dayFree',
}

export function Week({ initial }: { initial?: string }) {
  const k = useKitchen()
  const { t, dateLabel } = useT()
  const [offset, setOffset] = useState(initial === 'next' ? 1 : 0)
  const ws = addDays(k.weekStart, offset * 7)
  const dates = weekDates(ws)
  const entries = dates.map((d) => k.state.plan[d])
  const hasPlan = entries.some(Boolean)
  const info = k.week(ws)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between px-1 pt-2">
        <button aria-label="previous week" className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-sand" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft className="flip-rtl" size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-olive">{offset === 0 ? t('thisWeek') : offset === 1 ? t('nextWeek') : t('weekOf', { date: dateLabel(ws) })}</h1>
          <p className="text-sm text-muted">
            {dateLabel(ws)} – {dateLabel(addDays(ws, 6))}
          </p>
        </div>
        <button aria-label="next week" className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-sand" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight className="flip-rtl" size={20} />
        </button>
      </header>

      {!hasPlan ? <Draft ws={ws} /> : <Plan ws={ws} entries={entries} dates={dates} />}

      {hasPlan && (
        <div className="sticky bottom-20 z-10">
          {info?.confirmedAt ? (
            <Button className="w-full" size="lg" onClick={() => go('shop')}>
              <Check size={18} /> {t('confirmedBy', { name: k.nameOf(info.confirmedBy) || '✓' })} · {t('tabShop')}
            </Button>
          ) : (
            <Button
              className="w-full shadow-lg"
              size="lg"
              variant="primary"
              onClick={() => {
                k.confirmWeek(ws)
                go(offset === 0 ? 'shop' : `shop/main/${ws}`)
              }}
            >
              <Check size={18} /> {t('confirmWeek')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Draft({ ws }: { ws: string }) {
  const k = useKitchen()
  const { t, dayName } = useT()
  const [types, setTypes] = useState<DayType[]>(() => defaultTypes(ws, k.state.settings.dayPattern))
  const dates = weekDates(ws)
  const n = types.filter((x) => x === 'cook').length
  return (
    <Card>
      <h2 className="text-lg font-semibold text-olive">{t('draftWeek')}</h2>
      <p className="mt-1 text-sm text-muted">{t('draftIntro', { n })}</p>
      <div className="mt-4 space-y-2">
        {dates.map((d, i) => (
          <div key={d} className="flex items-center justify-between gap-2">
            <span className={cx('w-24 shrink-0', d < k.state.today && 'text-muted line-through')}>{dayName(d)}</span>
            <div className="flex gap-1 overflow-x-auto">
              {DAY_TYPES.map((dt) => (
                <Chip key={dt} active={types[i] === dt} onClick={() => setTypes((ts) => ts.map((x, j) => (j === i ? dt : x)))} className="px-2.5 text-xs">
                  {t(DAY_LABEL[dt])}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button className="mt-4 w-full" size="lg" variant="primary" onClick={() => k.draftWeek(ws, types)}>
        <Shuffle size={18} /> {t('draftWeek')}
      </Button>
    </Card>
  )
}

function Plan({ ws, entries, dates }: { ws: string; entries: (PlanEntry | undefined)[]; dates: string[] }) {
  const k = useKitchen()
  const notice = useLateNotice()
  const { t, L, dayName } = useT()
  const name = useIngName()
  const [swapDate, setSwapDate] = useState<string | null>(null)
  const [typeDate, setTypeDate] = useState<string | null>(null)
  const shared = sharedIngredients(k.state, dates).filter((s) => !INGREDIENTS[s.id]?.basic).slice(0, 6)

  return (
    <>
      <div className="space-y-2">
        {dates.map((d, i) => {
          const e = entries[i] ?? { date: d, type: 'free' as DayType }
          const r = e.recipeId ? k.state.recipes.find((x) => x.id === e.recipeId) : undefined
          const past = d < k.state.today
          const isToday = d === k.state.today
          const frozen = r && r.ingredients.some((ri) => INGREDIENTS[ri.id]?.raw && !ri.optional && diffDays(d, ws) >= (INGREDIENTS[ri.id].keepsDays ?? 2) && ri.id !== 'frozen_fish')
          return (
            <Card key={d} className={cx('p-3', past && 'opacity-60', isToday && 'ring-2 ring-sage')}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{dayName(d)}</span>
                  {isToday && <Badge tone="good">{t('today')}</Badge>}
                </div>
                <button onClick={() => setTypeDate(d)} disabled={past} className="rounded-full bg-cream px-3 py-1 text-sm text-olive">
                  {t(DAY_LABEL[e.type])}
                </button>
              </div>
              {r ? (
                <div className="mt-2 flex items-center gap-3">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => go(`recipe/${r.id}`)}>
                    <Monogram recipe={r} />
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{L(r.name)}</p>
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> {t('min', { n: totalMinutes(r) })}
                        </span>
                        {frozen && (
                          <span className="inline-flex items-center gap-1 text-[#3f6b7d]">
                            <Snowflake size={12} /> {t('freezeFirst')}
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                  {!past && (
                    <Button size="sm" onClick={() => setSwapDate(d)} aria-label={t('swap')}>
                      <RefreshCw size={16} /> {t('swap')}
                    </Button>
                  )}
                </div>
              ) : e.type === 'leftovers' ? (
                <LeftoverHint date={d} />
              ) : e.type === 'cook' && !past ? (
                <Button size="sm" className="mt-2" onClick={() => setSwapDate(d)}>
                  {t('pickADish')}
                </Button>
              ) : null}
              {r && !past && (
                <div className="mt-2 flex items-center justify-end gap-2 text-sm text-muted">
                  {t('servings')}
                  <Stepper label={t('servings')} value={e.servings ?? r.servings} onChange={(n) => notice(k.setEntry({ ...e, servings: n }))} />
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {shared.length > 0 && (
        <Card className="bg-cream/60">
          <p className="text-sm font-semibold text-olive">{t('sharedThisWeek')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {shared.map((s) => (
              <li key={s.id} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-sand">
                {name(s.id)} · {t('inNDishes', { n: s.recipes.length })}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button
        variant="ghost"
        className="w-full"
        onClick={() =>
          k.draftWeek(
            ws,
            dates.map((d) => k.state.plan[d]?.type ?? 'free'),
            true,
          )
        }
      >
        <Shuffle size={16} /> {t('redraft')}
      </Button>

      <SwapSheet ws={ws} date={swapDate} onClose={() => setSwapDate(null)} />

      <Sheet open={!!typeDate} onClose={() => setTypeDate(null)} title={typeDate ? t('setDayType', { day: dayName(typeDate) }) : ''}>
        <div className="grid gap-2">
          {DAY_TYPES.map((dt) => (
            <Button
              key={dt}
              size="lg"
              variant={k.state.plan[typeDate ?? '']?.type === dt ? 'primary' : 'secondary'}
              onClick={() => {
                const d = typeDate!
                const cur = k.state.plan[d]
                if (dt === 'cook') {
                  const alt = cur?.recipeId ? undefined : alternativesFor(k.state, ws, d, 1)[0]
                  notice(k.setEntry({ date: d, type: 'cook', recipeId: cur?.recipeId ?? alt?.recipe.id, servings: alt ? servingsFor(alt.recipe, k.state) : cur?.servings }))
                } else k.setEntry({ date: d, type: dt })
                setTypeDate(null)
              }}
            >
              {t(DAY_LABEL[dt])}
            </Button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

function LeftoverHint({ date }: { date: string }) {
  const k = useKitchen()
  const { t, L, dayName } = useT()
  const src = leftoverSource(k.state, date)
  const r = src?.recipeId && k.state.recipes.find((x) => x.id === src.recipeId)
  if (!r || !src) return <p className="mt-1 text-sm text-muted">{t('leftoversNight')}</p>
  return <p className="mt-1 text-sm text-muted">{t('leftoversFrom', { day: dayName(src.date), dish: L(r.name) })}</p>
}

function SwapSheet({ ws, date, onClose }: { ws: string; date: string | null; onClose: () => void }) {
  const k = useKitchen()
  const notice = useLateNotice()
  const { t, L, dayName } = useT()
  const [q, setQ] = useState('')
  const [browse, setBrowse] = useState(false)
  const alts = useMemo(() => (date ? alternativesFor(k.state, ws, date, 3, Date.now() % 1000) : []), [date, k.state, ws])
  const all = useMemo(() => searchRecipes(plannableDinners(k.state), q), [k.state, q])
  if (!date) return null
  const pick = (id: string) => {
    const r = k.state.recipes.find((x) => x.id === id)!
    notice(k.setEntry({ date, type: 'cook', recipeId: id, servings: servingsFor(r, k.state) }))
    setQ('')
    setBrowse(false)
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={`${t('swap')} · ${dayName(date)}`}>
      {!browse ? (
        <div className="space-y-2">
          {alts.map((a) => (
            <button key={a.recipe.id} onClick={() => pick(a.recipe.id)} className="flex w-full items-start gap-3 rounded-2xl bg-white p-3 text-start ring-1 ring-sand">
              <Monogram recipe={a.recipe} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{L(a.recipe.name)}</p>
                <p className="text-xs text-muted">{t('min', { n: totalMinutes(a.recipe) })}</p>
                <WhyLine why={a.why} />
              </div>
            </button>
          ))}
          <Button className="w-full" onClick={() => setBrowse(true)}>
            <Search size={16} /> {t('chooseFromRecipes')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchRecipes')}
            className="min-h-12 w-full rounded-2xl bg-white px-4 ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage"
          />
          {all.map((r) => (
            <RecipeRow key={r.id} recipe={r} onClick={() => pick(r.id)} right={<span />} />
          ))}
        </div>
      )}
    </Sheet>
  )
}
