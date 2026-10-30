import { addDays, todayIso, weekStartFor } from '../domain/dates'
import { generateWeek } from '../domain/engine/planner'
import { DEFAULT_SETTINGS, type KitchenState } from '../domain/engine/state'
import { BUILT_IN_RECIPES } from '../domain/recipes'
import type { PantryItem } from '../domain/types'
import { seedHousehold } from './kitchen'
import { Repo } from './repo'

export const DEMO_ME = 'demo-me'
export const DEMO_PARTNER = 'demo-partner'

/** A local-only repo with a realistic first week, so every screen has something to show. */
export function demoRepo(): Repo {
  const repo = new Repo('baytna.demo.v1', null, DEMO_ME)
  if (repo.get('settings', 'household')) return repo
  seedHousehold(repo)
  const today = todayIso()
  const ws = weekStartFor(today, DEFAULT_SETTINGS.shopDay)
  const pantry: Record<string, PantryItem> = {
    eggs: { id: 'eggs', status: 'have', staple: true },
    olive_oil: { id: 'olive_oil', status: 'have', staple: true },
    labneh: { id: 'labneh', status: 'low', staple: true },
    red_lentils: { id: 'red_lentils', status: 'have', qty: 500, unit: 'g', staple: true },
    canned_fava: { id: 'canned_fava', status: 'have', qty: 2, unit: 'can', staple: true },
    pita: { id: 'pita', status: 'have', staple: true },
    tomato: { id: 'tomato', status: 'have', staple: true },
    lemon: { id: 'lemon', status: 'out', staple: true },
    garlic: { id: 'garlic', status: 'have', staple: true },
    onion: { id: 'onion', status: 'have', staple: true },
    banana: { id: 'banana', status: 'have', staple: true },
    yogurt: { id: 'yogurt', status: 'have', staple: true },
  }
  const ratings = {
    shorbet_adas: { [DEMO_ME]: 'love', [DEMO_PARTNER]: 'love' },
    tawook_skillet: { [DEMO_PARTNER]: 'love' },
    mujaddara: { [DEMO_ME]: 'okay' },
  } as const
  const state: KitchenState = {
    today,
    settings: DEFAULT_SETTINGS,
    recipes: BUILT_IN_RECIPES,
    pantry,
    plan: {},
    ratings: ratings as unknown as KitchenState['ratings'],
    leftovers: [],
    members: [],
  }
  const plan = generateWeek(state, { weekStart: ws, seed: 11 })
  repo.setMany([
    ...Object.values(pantry).map((p) => ({ collection: 'pantry' as const, key: p.id, data: p })),
    ...plan.map((e) => ({ collection: 'plan' as const, key: e.date, data: e })),
    { collection: 'week', key: ws, data: { seed: 11 } },
    ...Object.entries(ratings).flatMap(([recipeId, by]) =>
      Object.entries(by).map(([memberId, rating]) => ({
        collection: 'rating' as const,
        key: `${recipeId}|${memberId}`,
        data: { recipeId, memberId, rating },
      })),
    ),
    {
      collection: 'leftover',
      key: 'demo-soup',
      data: { id: 'demo-soup', label: 'Shorbet adas', recipeId: 'shorbet_adas', madeOn: addDays(today, -1), place: 'fridge', status: 'active' },
    },
  ])
  return repo
}

export function resetDemo() {
  try {
    localStorage.removeItem('baytna.demo.v1')
  } catch {
    /* ignore */
  }
}
