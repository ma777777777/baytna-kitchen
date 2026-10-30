import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { visibleIngredients } from '../domain/engine/filters'
import type { Rating } from '../domain/types'
import { formatQty } from '../domain/units'
import { uid, useKitchen } from '../data/kitchen'
import { useT } from '../i18n'
import { useIngName } from '../ui/bits'
import { Button, Card, Sheet, Stepper, cx } from '../ui/kit'
import { go } from '../ui/router'
import { RatingButtons } from './RecipeDetail'

export function Cook({ id, servingsParam }: { id: string; servingsParam?: string }) {
  const k = useKitchen()
  const { t, L, lang } = useT()
  const name = useIngName()
  const recipe = k.state.recipes.find((r) => r.id === id)
  const [servings, setServings] = useState(Number(servingsParam) || recipe?.servings || 2)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [got, setGot] = useState<Set<number>>(new Set())
  const [finish, setFinish] = useState(false)
  const [rating, setRating] = useState<Rating | undefined>(recipe ? k.state.ratings[recipe.id]?.[k.me.id] : undefined)

  // Keep the screen awake while cooking, where supported.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [])

  if (!recipe) return null
  const factor = servings / recipe.servings
  const ingredients = visibleIngredients(recipe, k.state.settings)
  const toggle = (set: Set<number>, i: number) => {
    const n = new Set(set)
    if (n.has(i)) n.delete(i)
    else n.add(i)
    return n
  }

  const close = (leftovers: boolean) => {
    if (rating) k.rate(recipe.id, rating)
    if (leftovers && recipe.kind === 'dinner') {
      k.saveLeftover({ id: uid(), label: L(recipe.name), recipeId: recipe.id, madeOn: k.state.today, place: 'fridge', status: 'active' })
    }
    go('today')
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-terra-deep">{t('cookingMode')}</p>
          <h1 className="text-2xl font-semibold leading-tight text-olive">{L(recipe.name)}</h1>
        </div>
        <button onClick={() => history.back()} aria-label={t('close')} className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-sand">
          <X size={20} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted">{t('servings')}</span>
        <Stepper label={t('servings')} value={servings} onChange={setServings} />
      </div>

      <Card className="p-2">
        <ul>
          {ingredients.map((ri, i) => (
            <li key={i}>
              <button onClick={() => setGot((s) => toggle(s, i))} className="flex w-full items-center gap-3 px-2 py-2 text-start">
                <span className={cx('grid size-6 shrink-0 place-items-center rounded-md ring-2', got.has(i) ? 'bg-sage text-white ring-sage' : 'ring-sand')}>
                  {got.has(i) && <Check size={14} />}
                </span>
                <span className={cx('flex-1', got.has(i) && 'text-muted line-through')}>
                  {name(ri.id)}
                  {ri.optional && <span className="text-xs text-muted"> ({t('optional')})</span>}
                </span>
                <span className="text-sm text-muted tabular-nums">{ri.qty != null ? formatQty(ri.qty * factor, ri.unit, lang) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <ol className="space-y-3">
        {recipe.steps.map((s, i) => (
          <li key={i}>
            <button
              onClick={() => setDone((d) => toggle(d, i))}
              className={cx('w-full rounded-3xl p-4 text-start text-lg leading-relaxed ring-1 transition', done.has(i) ? 'bg-sage-soft/60 text-muted ring-sage/30' : 'bg-white ring-sand')}
            >
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-terra-deep">{t('stepOf', { n: i + 1, m: recipe.steps.length })}</span>
              {L(s)}
            </button>
          </li>
        ))}
      </ol>

      {recipe.safety && (
        <Card className="bg-terra-soft/60 ring-terra/20">
          <p className="text-sm font-semibold text-terra-deep">{t('safety')}</p>
          <p className="mt-1 text-sm">{L(recipe.safety)}</p>
        </Card>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg bg-gradient-to-t from-ivory via-ivory to-transparent px-4 pt-6">
        <Button variant="primary" size="lg" className="w-full" onClick={() => setFinish(true)}>
          <Check size={20} /> {t('doneCooking')}
        </Button>
      </div>

      <Sheet open={finish} onClose={() => setFinish(false)} title={t('yourRating')}>
        <RatingButtons value={rating} onChange={setRating} />
        {recipe.kind === 'dinner' ? (
          <>
            <p className="mb-2 mt-5 font-semibold text-olive">{t('anyLeftovers')}</p>
            <div className="grid gap-2">
              <Button size="lg" variant="primary" onClick={() => close(true)}>
                {t('yesLeftovers')}
              </Button>
              <Button size="lg" onClick={() => close(false)}>
                {t('noLeftovers')}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">{t('storageGuidance')}</p>
          </>
        ) : (
          <Button size="lg" variant="primary" className="mt-4 w-full" onClick={() => close(false)}>
            {t('done')}
          </Button>
        )}
      </Sheet>
    </div>
  )
}
