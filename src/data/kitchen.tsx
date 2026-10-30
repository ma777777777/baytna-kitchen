import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { addDays, todayIso, weekStartFor } from '../domain/dates'
import { DEFAULT_STAPLES, INGREDIENTS } from '../domain/ingredients'
import { BUILT_IN_RECIPES } from '../domain/recipes'
import { generateWeek } from '../domain/engine/planner'
import { buildList, type ListItem } from '../domain/engine/shopping'
import { DEFAULT_SETTINGS, type KitchenState } from '../domain/engine/state'
import type {
  DayType, Ingredient, Leftover, Member, PantryItem, PlanEntry, Rating, Recipe, Settings, StockStatus,
} from '../domain/types'
import type { Repo, SyncStatus } from './repo'

export interface ListState {
  checked?: boolean
  by?: string | null
  at?: string
  claimedBy?: string | null
  haveIt?: boolean
}

export interface ListExtra {
  id: string
  weekStart: string
  text: string
  trip: 'main' | 'topup'
  ingredientId?: string
  checked?: boolean
  by?: string | null
  claimedBy?: string | null
}

export interface WeekInfo {
  confirmedAt?: string
  confirmedBy?: string
  seed?: number
}

export type CustomRecipe = Recipe & { customIngredients?: Ingredient[] }

export interface Kitchen {
  state: KitchenState
  me: Member
  members: Member[]
  householdName: string
  status: SyncStatus
  pending: number
  isDemo: boolean
  weekStart: string
  nameOf: (memberId?: string | null) => string
  // plan
  week: (weekStart: string) => WeekInfo | undefined
  draftWeek: (weekStart: string, types: DayType[], keepCooked?: boolean) => void
  setEntry: (entry: PlanEntry) => void
  confirmWeek: (weekStart: string) => void
  // shopping
  listFor: (weekStart: string) => ListItem[]
  listState: (weekStart: string, key: string) => ListState
  setListState: (weekStart: string, key: string, patch: Partial<ListState>) => void
  extras: (weekStart: string) => ListExtra[]
  saveExtra: (extra: ListExtra) => void
  removeExtra: (id: string) => void
  // pantry
  setStock: (id: string, patch: Partial<PantryItem> & { status?: StockStatus }) => void
  untrack: (id: string) => void
  // leftovers
  saveLeftover: (l: Leftover) => void
  // ratings
  rate: (recipeId: string, rating: Rating | null) => void
  // recipes
  saveRecipe: (r: CustomRecipe) => void
  deleteRecipe: (id: string) => void
  // settings
  updateSettings: (patch: Partial<Settings>) => void
}

const Ctx = createContext<Kitchen | null>(null)

export function uid() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function KitchenProvider(props: {
  repo: Repo
  me: Member
  members: Member[]
  householdName: string
  children: ReactNode
}) {
  const { repo, me } = props
  const snap = useSyncExternalStore(repo.subscribe, repo.getSnapshot)

  useEffect(() => {
    void repo.start()
    return () => repo.stop()
  }, [repo])

  // Keep "today" fresh if the app stays open past midnight.
  const today = useSyncExternalStore(subscribeMinute, todayIso)

  const value = useMemo<Kitchen>(() => {
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(repo.get<Partial<Settings>>('settings', 'household') ?? {}) }
    const custom = repo.all<CustomRecipe>('recipe').map((r) => r.data)
    for (const r of custom) for (const ing of r.customIngredients ?? []) INGREDIENTS[ing.id] = ing
    const customIds = new Set(custom.map((r) => r.id))
    const recipes = [...BUILT_IN_RECIPES.filter((r) => !customIds.has(r.id)), ...custom]
    const ratings: KitchenState['ratings'] = {}
    for (const { data } of repo.all<{ recipeId: string; memberId: string; rating: Rating }>('rating')) {
      ;(ratings[data.recipeId] ??= {})[data.memberId] = data.rating
    }
    const members = props.members.length ? props.members : [me]
    const state: KitchenState = {
      today,
      settings,
      recipes,
      pantry: Object.fromEntries(repo.all<PantryItem>('pantry').map((r) => [r.key, r.data])),
      plan: Object.fromEntries(repo.all<PlanEntry>('plan').map((r) => [r.key, r.data])),
      ratings,
      leftovers: repo.all<Leftover>('leftover').map((r) => r.data),
      members,
    }
    const weekStart = weekStartFor(today, settings.shopDay)
    const nameOf = (id?: string | null) => members.find((m) => m.id === id)?.name ?? ''

    const listCache = new Map<string, ListItem[]>()

    return {
      state,
      me,
      members,
      householdName: props.householdName,
      status: repo.status,
      pending: repo.pendingCount(),
      isDemo: repo.status === 'demo',
      weekStart,
      nameOf,

      week: (ws) => repo.get<WeekInfo>('week', ws),
      draftWeek: (ws, types, keepCooked = false) => {
        const prev = repo.get<WeekInfo>('week', ws)
        const seed = (prev?.seed ?? 0) + 1 + Math.floor(Math.random() * 1000)
        const locked: Record<string, PlanEntry> = {}
        // Never rewrite the past.
        for (let i = 0; i < 7; i++) {
          const d = addDays(ws, i)
          const e = state.plan[d]
          if (e && (d < today || (keepCooked && e.type !== 'cook'))) locked[d] = e
        }
        const entries = generateWeek(state, { weekStart: ws, types, seed, locked })
        repo.setMany([
          ...entries.map((e) => ({ collection: 'plan' as const, key: e.date, data: e })),
          { collection: 'week', key: ws, data: { seed } satisfies WeekInfo },
        ])
      },
      setEntry: (e) => repo.set('plan', e.date, e),
      confirmWeek: (ws) => {
        const prev = repo.get<WeekInfo>('week', ws) ?? {}
        repo.set('week', ws, { ...prev, confirmedAt: new Date().toISOString(), confirmedBy: me.id })
      },

      listFor: (ws) => {
        let l = listCache.get(ws)
        if (!l) listCache.set(ws, (l = buildList({ state, weekStart: ws, from: today })))
        return l
      },
      listState: (ws, key) => repo.get<ListState>('list_state', `${ws}|${key}`) ?? {},
      setListState: (ws, key, patch) => {
        const prev = repo.get<ListState>('list_state', `${ws}|${key}`) ?? {}
        repo.set('list_state', `${ws}|${key}`, { ...prev, ...patch })
      },
      extras: (ws) => repo.all<ListExtra>('list_extra').map((r) => r.data).filter((x) => x.weekStart === ws),
      saveExtra: (x) => repo.set('list_extra', x.id, x),
      removeExtra: (id) => repo.set('list_extra', id, null),

      setStock: (id, patch) => {
        const prev = repo.get<PantryItem>('pantry', id)
        const next: PantryItem = { id, status: 'have', ...prev, ...patch }
        // A manual status change replaces purchase-derived info.
        if (patch.status && !('boughtOn' in patch)) delete next.boughtOn
        repo.set('pantry', id, next)
      },
      untrack: (id) => repo.set('pantry', id, null),

      saveLeftover: (l) => repo.set('leftover', l.id, l),

      rate: (recipeId, rating) =>
        repo.set('rating', `${recipeId}|${me.id}`, rating ? { recipeId, memberId: me.id, rating } : null),

      saveRecipe: (r) => repo.set('recipe', r.id, { ...r, custom: true }),
      deleteRecipe: (id) => repo.set('recipe', id, null),

      updateSettings: (patch) => repo.set('settings', 'household', { ...settings, ...patch }),
    }
    // snap captures repo.version + status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, today, repo, me, props.members, props.householdName])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

function subscribeMinute(cb: () => void) {
  const t = window.setInterval(cb, 60_000)
  return () => window.clearInterval(t)
}

export function useKitchen() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useKitchen outside KitchenProvider')
  return v
}

/** First-run household data: default staples so the Staples screen isn't empty. */
export function seedHousehold(repo: Repo) {
  if (repo.get('settings', 'household')) return
  repo.setMany([
    { collection: 'settings', key: 'household', data: DEFAULT_SETTINGS },
    ...DEFAULT_STAPLES.filter((id) => !repo.get('pantry', id)).map((id) => ({
      collection: 'pantry' as const,
      key: id,
      data: { id, status: 'unknown', staple: true },
    })),
  ])
}
