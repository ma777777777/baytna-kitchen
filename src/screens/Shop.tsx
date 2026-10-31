import { useMemo, useState } from 'react'
import { Check, ChevronDown, Hand, MoreHorizontal, Plus, Share2, Snowflake, Trash2 } from 'lucide-react'
import { addDays, diffDays, weekDates } from '../domain/dates'
import { stockOf } from '../domain/engine/availability'
import { leftoverDaysLeft } from '../domain/engine/suggest'
import { matchIngredient, normalize } from '../domain/engine/search'
import { listToText, stillToBuy, topUpDate, type Amount, type ListItem, type Trip } from '../domain/engine/shopping'
import { AISLE_ORDER, INGREDIENTS } from '../domain/ingredients'
import type { Leftover, StockStatus } from '../domain/types'
import { formatQty } from '../domain/units'
import { uid, useKitchen, type ListExtra } from '../data/kitchen'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { useIngName } from '../ui/bits'
import { Badge, Button, Card, Chip, Empty, SectionTitle, Sheet, cx, useToast } from '../ui/kit'
import { go } from '../ui/router'

export function Shop({ route }: { route: string[] }) {
  const { t } = useT()
  const tab = route[1] === 'staples' ? 'staples' : 'list'
  return (
    <div className="space-y-4">
      <div className="flex gap-2 px-1 pt-2">
        <Chip active={tab === 'list'} onClick={() => go('shop')} className="flex-1 text-base">
          {t('list')}
        </Chip>
        <Chip active={tab === 'staples'} onClick={() => go('shop/staples')} className="flex-1 text-base">
          {t('staples')}
        </Chip>
      </div>
      {tab === 'list' ? <ShoppingList route={route} /> : <Staples />}
    </div>
  )
}

// ---------------- list ----------------

type Row =
  | { kind: 'item'; item: ListItem; aisle: string; key: string }
  | { kind: 'extra'; extra: ListExtra; aisle: string; key: string }

function useAmountText() {
  const { lang } = useT()
  return (amounts: Amount[]) => amounts.map((a) => formatQty(a.qty, a.unit, lang)).join(' + ')
}

function ShoppingList({ route }: { route: string[] }) {
  const k = useKitchen()
  const { t, L, lang, dayName, weekdayName } = useT()
  const toast = useToast()
  const name = useIngName()
  const amountText = useAmountText()
  const nextWs = addDays(k.weekStart, 7)
  const nextHasPlan = weekDates(nextWs).some((d) => k.state.plan[d])
  const ws = route[2] && /^\d{4}-\d{2}-\d{2}$/.test(route[2]) ? route[2] : k.weekStart
  const tud = topUpDate(ws, k.state.settings.topUpDay)
  const [trip, setTrip] = useState<Trip>(route[1] === 'topup' && tud ? 'topup' : 'main')
  const [text, setText] = useState('')
  const [menu, setMenu] = useState<Row | null>(null)
  const [showHave, setShowHave] = useState(false)
  const [showBasket, setShowBasket] = useState(false)

  const items = k.listFor(ws)
  const extras = k.extras(ws)
  const rows: Row[] = [
    ...items.filter((i) => i.trip === trip).map((item) => ({ kind: 'item' as const, item, aisle: item.aisle, key: item.key })),
    ...extras
      .filter((x) => x.trip === trip)
      .map((extra) => ({ kind: 'extra' as const, extra, aisle: extra.ingredientId ? INGREDIENTS[extra.ingredientId]?.aisle ?? 'other' : 'other', key: `x:${extra.id}` })),
  ]
  // Ticked earlier, but a dish changed since and now needs more of it.
  const more = (r: Row) => (r.kind === 'item' && k.listState(ws, r.key).checked ? stillToBuy(r.item.needed, k.listState(ws, r.key).bought) : [])
  const st = (r: Row) => {
    if (r.kind === 'extra') return { checked: r.extra.checked, claimedBy: r.extra.claimedBy, haveIt: false }
    const s = k.listState(ws, r.key)
    return more(r).length ? { ...s, checked: false } : s
  }
  const isHave = (r: Row) => r.kind === 'item' && (r.item.status === 'covered' || st(r).haveIt)
  const isBasic = (r: Row) => r.kind === 'item' && r.item.status === 'basic' && !st(r).checked
  const toBuy = rows.filter((r) => !st(r).checked && !isHave(r) && !isBasic(r))
  const basket = rows.filter((r) => st(r).checked)
  const have = rows.filter((r) => isHave(r) && !st(r).checked)
  const basics = rows.filter((r) => isBasic(r) && !isHave(r))

  const changed = toBuy.filter((r) => more(r).length || (r.kind === 'item' && k.listState(ws, r.key).late)).length
  const tripCount = (tr: Trip) =>
    rows.filter((r) => r.kind === 'item' && r.item.trip === tr && r.item.status !== 'covered' && r.item.status !== 'basic' && !st(r).checked && !st(r).haveIt).length +
    extras.filter((x) => x.trip === tr && !x.checked).length

  const label = (r: Row) => (r.kind === 'item' ? name(r.item.ingredientId) : r.extra.text)
  const recipeName = (id: string) => {
    const r = k.state.recipes.find((x) => x.id === id)
    return r ? L(r.name) : id
  }

  const toggle = (r: Row) => {
    const checked = !st(r).checked
    if (r.kind === 'extra') {
      k.saveExtra({ ...r.extra, checked, by: k.me.id })
      if (checked && r.extra.ingredientId) k.setStock(r.extra.ingredientId, { status: 'have', boughtOn: k.state.today, usedBy: undefined, qty: undefined, unit: undefined, bestBy: undefined })
      return
    }
    k.setListState(ws, r.key, { checked, by: k.me.id, at: new Date().toISOString(), bought: checked ? r.item.needed : undefined, late: false })
    if (checked) {
      const lastUse = r.item.uses.at(-1)?.date
      k.setStock(r.item.ingredientId, { status: 'have', boughtOn: k.state.today, usedBy: lastUse, qty: undefined, unit: undefined, bestBy: undefined })
      if (r.item.freezeUntil) toast(t('freezeToast', { item: name(r.item.ingredientId) }))
    }
  }

  const addExtra = (force = false) => {
    const value = text.trim()
    if (!value) return
    const ingredientId = matchIngredient(value)
    const dup = ingredientId && items.find((i) => i.ingredientId === ingredientId && !k.listState(ws, i.key).checked && i.status !== 'covered')
    if (dup && !force) {
      toast(t('alreadyOnList', { what: `${name(dup.ingredientId)} ${amountText(dup.toBuy)}`.trim() }), { label: t('add'), run: () => addExtra(true) })
      return
    }
    k.saveExtra({ id: uid(), weekStart: ws, text: value, trip, ingredientId, by: k.me.id })
    setText('')
  }

  const share = async () => {
    const lines = toBuy.map((r) => ({
      aisle: t(`aisle_${r.aisle}` as StringKey),
      text: r.kind === 'item' ? `${label(r)} ${amountText(more(r).length ? more(r) : r.item.toBuy)}`.trim() : label(r),
    }))
    const title = t('listTitle', { trip: trip === 'main' ? dayName(ws) : tud ? dayName(tud) : '' })
    const body = listToText(lines, title)
    try {
      if (navigator.share) await navigator.share({ text: body })
      else {
        await navigator.clipboard.writeText(body)
        toast(t('copied'))
      }
    } catch {
      /* cancelled */
    }
  }

  const grouped = groupByAisle(toBuy)

  return (
    <>
      {nextHasPlan && (
        <div className="flex gap-2">
          <Chip active={ws === k.weekStart} onClick={() => go('shop')}>
            {t('thisWeek')}
          </Chip>
          <Chip active={ws === nextWs} onClick={() => go(`shop/main/${nextWs}`)}>
            {t('nextWeek')}
          </Chip>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <TripTab active={trip === 'main'} onClick={() => setTrip('main')} label={t('mainShop', { day: weekdayName(k.state.settings.shopDay) })} count={tripCount('main')} />
        {tud && <TripTab active={trip === 'topup'} onClick={() => setTrip('topup')} label={t('topUp', { day: weekdayName(k.state.settings.topUpDay) })} count={tripCount('topup')} />}
      </div>

      {changed > 0 && (
        <Card className="bg-terra-soft/70 text-sm text-terra-deep ring-terra/30">{t('listChanged', { n: changed })}</Card>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addExtra()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('addItemPlaceholder')}
          aria-label={t('addItemPlaceholder')}
          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage"
        />
        <Button type="submit" variant="primary" aria-label={t('add')} className="w-12 px-0">
          <Plus size={20} />
        </Button>
      </form>

      {toBuy.length === 0 && basket.length === 0 ? (
        <Empty>{items.length || extras.length ? t('emptyTrip') : t('emptyList')}</Empty>
      ) : (
        grouped.map(([aisle, list]) => (
          <section key={aisle}>
            <SectionTitle>{t(`aisle_${aisle}` as StringKey)}</SectionTitle>
            <ul className="space-y-1.5">
              {list.map(itemRow)}
            </ul>
          </section>
        ))
      )}

      {basics.length > 0 && (
        <Card className="bg-cream/50">
          <p className="text-sm font-semibold text-olive">{t('basicsCheck')}</p>
          <p className="mt-1 text-sm text-muted">{basics.map(label).join(' · ')}</p>
        </Card>
      )}

      {toBuy.length > 0 && (
        <Button className="w-full" onClick={share}>
          <Share2 size={18} /> {t('share')}
        </Button>
      )}

      {basket.length > 0 && (
        <Collapsible open={showBasket} onToggle={() => setShowBasket((v) => !v)} title={t('inBasket', { n: basket.length })}>
          <ul className="space-y-1.5">
            {basket.map(itemRow)}
          </ul>
        </Collapsible>
      )}

      {have.length > 0 && (
        <Collapsible open={showHave} onToggle={() => setShowHave((v) => !v)} title={t('haveSection', { n: have.length })}>
          <ul className="space-y-1.5">
            {have.map((r) => (
              <li key={r.key} className="flex items-center justify-between rounded-2xl bg-white/60 px-3 py-2 text-muted">
                <span>{label(r)}</span>
                {r.kind === 'item' && st(r).haveIt && (
                  <Button size="sm" variant="ghost" onClick={() => k.setListState(ws, r.key, { haveIt: false })}>
                    {t('undo')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? label(menu) : ''}>
        {menu && (
          <div className="grid gap-2">
            {st(menu).claimedBy === k.me.id ? (
              <Button size="lg" onClick={() => (claim(menu, null), setMenu(null))}>
                {t('unclaim')}
              </Button>
            ) : (
              <Button size="lg" variant="primary" onClick={() => (claim(menu, k.me.id), setMenu(null))}>
                <Hand size={18} /> {t('illGetIt')}
              </Button>
            )}
            {menu.kind === 'item' ? (
              <Button
                size="lg"
                onClick={() => {
                  k.setListState(ws, menu.key, { haveIt: true })
                  setMenu(null)
                }}
              >
                <Check size={18} /> {t('alreadyHave')}
              </Button>
            ) : (
              <Button size="lg" variant="danger" onClick={() => (k.removeExtra(menu.extra.id), setMenu(null))}>
                <Trash2 size={18} /> {t('remove')}
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </>
  )

  function claim(r: Row, who: string | null) {
    if (r.kind === 'item') k.setListState(ws, r.key, { claimedBy: who })
    else k.saveExtra({ ...r.extra, claimedBy: who })
  }

  // A plain render function, not a component: defining a component inside another
  // remounts every row on each render.
  function itemRow(r: Row) {
    const s = st(r)
    const it = r.kind === 'item' ? r.item : null
    const details: React.ReactNode[] = []
    if (it) {
      if (it.uses.length) details.push(t('forDishes', { dishes: it.uses.map((u) => `${recipeName(u.recipeId)} (${dayName(u.date, true)})`).join(lang === 'ar' ? '، ' : ', ') }))
      const extra = more(r)
      if (extra.length) details.push(<Badge key="x" tone="warn">{t('boughtNeedMore', { got: amountText(k.listState(ws, r.key).bought ?? []) })}</Badge>)
      else if (k.listState(ws, r.key).late && !s.checked) details.push(<Badge key="n" tone="warn">{t('newSinceShopping')}</Badge>)
      if (it.status === 'check') details.push(<Badge key="c" tone="warn">{t('checkAmount')}</Badge>)
      if (it.status === 'need_more') {
        const p = k.state.pantry[it.ingredientId]
        details.push(
          <Badge key="m" tone="warn">
            {t('needMore', { have: amountText([{ qty: p?.qty ?? 0, unit: p?.unit ?? 'pc' }]), need: amountText(it.needed) })}
          </Badge>,
        )
      }
      if (it.status === 'restock') details.push(<Badge key="r">{t('restock')}</Badge>)
      if (it.lowNote) details.push(<Badge key="l" tone="warn">{t('runningLow')}</Badge>)
      if (it.freezeUntil)
        details.push(
          <span key="f" className="inline-flex items-center gap-1 text-[#3f6b7d]">
            <Snowflake size={12} /> {t('freezeNote', { day: dayName(addDays(it.freezeUntil, -1)) })}
          </span>,
        )
    }
    if (s.claimedBy) details.push(<Badge key="w" tone="good">{t('willGet', { name: s.claimedBy === k.me.id ? '✋' : k.nameOf(s.claimedBy) })}</Badge>)
    return (
      <li key={r.key} className={cx('flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-sand/70', s.checked && 'opacity-60')}>
        <button
          role="checkbox"
          aria-checked={!!s.checked}
          aria-label={label(r)}
          onClick={() => toggle(r)}
          className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ring-2', s.checked ? 'bg-sage text-white ring-sage' : 'bg-white ring-sand')}
        >
          {s.checked && <Check size={16} />}
        </button>
        <button className="min-w-0 flex-1 text-start" onClick={() => toggle(r)}>
          <span className={cx('font-medium', s.checked && 'line-through')}>{label(r)}</span>
          {it && (more(r).length || it.toBuy.length) > 0 && (
            <span className="ms-2 text-sm text-muted tabular-nums">{amountText(more(r).length ? more(r) : it.toBuy)}</span>
          )}
          {details.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">{details}</div>}
        </button>
        <button aria-label="more" onClick={() => setMenu(r)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted">
          <MoreHorizontal size={18} />
        </button>
      </li>
    )
  }
}

function groupByAisle<T extends { aisle: string }>(rows: T[]): [string, T[]][] {
  const order = AISLE_ORDER
  const m = new Map<string, T[]>()
  for (const r of rows) {
    if (!m.has(r.aisle)) m.set(r.aisle, [])
    m.get(r.aisle)!.push(r)
  }
  return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
}

function TripTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx('rounded-2xl p-3 text-start transition', active ? 'bg-olive text-white' : 'bg-white ring-1 ring-sand')}
    >
      <span className="block text-sm leading-tight">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{count}</span>
    </button>
  )
}

function Collapsible({ open, onToggle, title, children }: { open: boolean; onToggle: () => void; title: string; children: React.ReactNode }) {
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-1 py-2 text-sm font-semibold text-muted">
        {title}
        <ChevronDown size={18} className={cx('transition', open && 'rotate-180')} />
      </button>
      {open && children}
    </div>
  )
}

// ---------------- staples ----------------

const STATUS_LABEL: Record<StockStatus, StringKey> = { have: 'stockHave', low: 'stockLow', out: 'stockOut', unknown: 'stockUnknown' }

function Staples() {
  const k = useKitchen()
  const { t, lang } = useT()
  const name = useIngName()
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const tracked = Object.values(k.state.pantry).filter((p) => p.staple)
  const grouped = groupByAisle(tracked.map((p) => ({ ...p, aisle: INGREDIENTS[p.id]?.aisle ?? 'other' })))

  return (
    <>
      <p className="px-1 text-sm text-muted">{t('staplesIntro')}</p>
      <Leftovers />
      {grouped.map(([aisle, list]) => (
        <section key={aisle}>
          <SectionTitle>{t(`aisle_${aisle}` as StringKey)}</SectionTitle>
          <ul className="space-y-1.5">
            {list
              .sort((a, b) => name(a.id).localeCompare(name(b.id)))
              .map((p) => {
                const effective = stockOf(p.id, k.state.pantry, k.state.today)
                const stale = p.boughtOn && effective === 'unknown' && p.status === 'have'
                return (
                  <li key={p.id} className="rounded-2xl bg-white p-3 ring-1 ring-sand/70">
                    <div className="flex items-center gap-2">
                      <button className="min-w-0 flex-1 text-start font-medium" onClick={() => setOpen(open === p.id ? null : p.id)}>
                        {name(p.id)}
                        {p.qty != null && <span className="ms-2 text-sm text-muted">{formatQty(p.qty, p.unit, lang)}</span>}
                      </button>
                      <div className="flex gap-1">
                        {(['have', 'low', 'out'] as const).map((s) => (
                          <button
                            key={s}
                            aria-pressed={p.status === s}
                            onClick={() => k.setStock(p.id, { status: s })}
                            className={cx(
                              'min-h-9 rounded-full px-2.5 text-xs font-medium',
                              p.status === s
                                ? s === 'have'
                                  ? 'bg-sage text-white'
                                  : s === 'low'
                                    ? 'bg-terra text-white'
                                    : 'bg-ink text-white'
                                : 'bg-cream text-muted',
                            )}
                          >
                            {t(STATUS_LABEL[s])}
                          </button>
                        ))}
                      </div>
                    </div>
                    {stale && <p className="mt-1 text-xs text-terra-deep">{t('boughtDaysAgo', { n: diffDays(k.state.today, p.boughtOn!) })}</p>}
                    {p.status === 'unknown' && <p className="mt-1 text-xs text-muted">{t('stockUnknown')}</p>}
                    {open === p.id && <StapleDetails id={p.id} />}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
      <Button className="w-full" onClick={() => setAdding(true)}>
        <Plus size={18} /> {t('addStaple')}
      </Button>
      <IngredientPicker
        open={adding}
        onClose={() => setAdding(false)}
        exclude={tracked.map((p) => p.id)}
        onPick={(id) => {
          k.setStock(id, { status: k.state.pantry[id]?.status ?? 'unknown', staple: true })
          setAdding(false)
        }}
      />
    </>
  )
}

function StapleDetails({ id }: { id: string }) {
  const k = useKitchen()
  const { t } = useT()
  const p = k.state.pantry[id]
  const [qty, setQty] = useState(p?.qty != null ? String(p.qty) : '')
  const [unit, setUnit] = useState(p?.unit ?? 'pc')
  const [bestBy, setBestBy] = useState(p?.bestBy ?? '')
  const save = () =>
    k.setStock(id, {
      qty: qty ? Number(qty) : undefined,
      unit: qty ? unit : undefined,
      bestBy: bestBy || undefined,
      status: p?.status === 'unknown' || !p ? 'have' : p.status,
    })
  return (
    <div className="mt-3 space-y-2 border-t border-sand pt-3">
      <label className="block text-sm text-muted">
        {t('qtyOptional')}
        <div className="mt-1 flex gap-2">
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} className="min-h-11 w-24 rounded-xl bg-ivory px-3 ring-1 ring-sand" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="min-h-11 rounded-xl bg-ivory px-2 ring-1 ring-sand">
            {(['pc', 'g', 'kg', 'ml', 'l', 'can', 'pack', 'bunch'] as const).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </label>
      <label className="block text-sm text-muted">
        {t('bestByOptional')}
        <input type="date" value={bestBy} onChange={(e) => setBestBy(e.target.value)} className="mt-1 block min-h-11 rounded-xl bg-ivory px-3 ring-1 ring-sand" />
      </label>
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => k.untrack(id)}>
          {t('removeStaple')}
        </Button>
        <Button size="sm" variant="primary" onClick={save}>
          {t('save')}
        </Button>
      </div>
    </div>
  )
}

export function IngredientPicker({ open, onClose, onPick, exclude = [] }: { open: boolean; onClose: () => void; onPick: (id: string) => void; exclude?: string[] }) {
  const { t, L } = useT()
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const n = normalize(q)
    return Object.values(INGREDIENTS)
      .filter((i) => !i.free && !exclude.includes(i.id))
      .filter((i) => !n || [i.name.en, i.name.ar, ...(i.aliases ?? [])].some((s) => normalize(s).includes(n)))
      .slice(0, 40)
  }, [q, exclude])
  return (
    <Sheet open={open} onClose={onClose} title={t('addStaple')}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="…" className="mb-3 min-h-12 w-full rounded-2xl bg-white px-4 ring-1 ring-sand" />
      <ul className="space-y-1">
        {results.map((i) => (
          <li key={i.id}>
            <button className="w-full rounded-xl bg-white px-3 py-2.5 text-start ring-1 ring-sand/60" onClick={() => (onPick(i.id), setQ(''))}>
              {L(i.name)}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function Leftovers() {
  const k = useKitchen()
  const { t, L, dayName } = useT()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const active = k.state.leftovers.filter((l) => l.status === 'active').sort((a, b) => a.madeOn.localeCompare(b.madeOn))
  const nameOf = (l: Leftover) => {
    const r = l.recipeId && k.state.recipes.find((x) => x.id === l.recipeId)
    return r ? L(r.name) : l.label
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-olive">{t('leftoversTitle')}</h2>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t('addLeftover')}
        </Button>
      </div>
      {active.length === 0 ? null : (
        <ul className="mt-2 space-y-2">
          {active.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ivory p-2">
              <div>
                <p className="font-medium">
                  {nameOf(l)} {l.place === 'freezer' && <Snowflake size={14} className="inline text-[#3f6b7d]" />}
                </p>
                <p className="text-xs text-muted">
                  {t('madeOn')}: {dayName(l.madeOn)} · {l.place === 'fridge' ? t('inFridge') : t('inFreezer')}
                </p>
                {leftoverDaysLeft(k.state, l) < 0 && <p className="text-xs font-medium text-terra-deep">{t('leftoverExpired')}</p>}
              </div>
              <div className="flex gap-1">
                {leftoverDaysLeft(k.state, l) >= 0 && (
                  <Button size="sm" onClick={() => k.saveLeftover({ ...l, status: 'eaten' })}>
                    {t('eaten')}
                  </Button>
                )}
                {l.place === 'fridge' && leftoverDaysLeft(k.state, l) >= 0 && (
                  <Button size="sm" onClick={() => k.saveLeftover({ ...l, place: 'freezer' })} aria-label={t('frozen')}>
                    <Snowflake size={14} />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => k.saveLeftover({ ...l, status: 'tossed' })} aria-label={t('tossed')}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">{t('storageGuidance')}</p>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('addLeftover')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!label.trim()) return
            k.saveLeftover({ id: uid(), label: label.trim(), madeOn: k.state.today, place: 'fridge', status: 'active' })
            setLabel('')
            setAdding(false)
          }}
        >
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('leftoverName')} className="min-h-12 w-full rounded-2xl bg-white px-4 ring-1 ring-sand" />
          <Button type="submit" variant="primary" className="w-full">
            {t('save')}
          </Button>
        </form>
      </Sheet>
    </Card>
  )
}
