import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ingredientLine, parseIngredientLine } from '../domain/engine/parseLine'
import type { Ingredient, RecipeKind, Tag } from '../domain/types'
import { uid, useKitchen, type CustomRecipe } from '../data/kitchen'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { Button, Chip } from '../ui/kit'
import { go, useBack } from '../ui/router'

const KINDS: [RecipeKind, StringKey][] = [
  ['dinner', 'kindDinner'],
  ['breakfast', 'kindBreakfast'],
  ['snack', 'kindSnack'],
  ['smoothie', 'kindSmoothie'],
]
const TAGS: [Tag, StringKey][] = [
  ['vegetarian', 'fVeg'],
  ['legumes', 'fLegumes'],
  ['chicken', 'fChicken'],
  ['fish', 'fFish'],
  ['meat', 'dayCook'],
  ['lebanese', 'colLebanese'],
  ['prep_ahead', 'fPrep'],
]

export function RecipeForm({ editId }: { editId?: string }) {
  const k = useKitchen()
  const { t, L, lang } = useT()
  const back = useBack()
  const base = editId ? k.state.recipes.find((r) => r.id === editId) : undefined
  const [nameEn, setNameEn] = useState(base?.name.en ?? '')
  const [nameAr, setNameAr] = useState(base?.name.ar ?? '')
  const [kind, setKind] = useState<RecipeKind>(base?.kind ?? 'dinner')
  const [prep, setPrep] = useState(String(base?.prepMin ?? 15))
  const [cookMin, setCookMin] = useState(String(base?.cookMin ?? 20))
  const [servings, setServings] = useState(String(base?.servings ?? 2))
  const [ings, setIngs] = useState(base ? base.ingredients.map((ri) => ingredientLine(ri, lang)).join('\n') : '')
  const [steps, setSteps] = useState(base ? base.steps.map((s) => L(s)).join('\n') : '')
  const [url, setUrl] = useState(base?.sourceUrl ?? '')
  const [tags, setTags] = useState<Set<Tag>>(new Set(base?.tags ?? []))

  const parsed = useMemo(() => ings.split('\n').map(parseIngredientLine).filter((x) => x !== null), [ings])
  const matched = parsed.filter((p) => !p.custom).length

  const save = () => {
    const en = nameEn.trim() || nameAr.trim()
    const ar = nameAr.trim() || nameEn.trim()
    if (!en) return
    const stepLines = steps.split('\n').map((s) => s.trim()).filter(Boolean)
    const keepBilingual = base && stepLines.length === base.steps.length && stepLines.every((s, i) => s === L(base.steps[i]))
    const customIngredients: Ingredient[] = parsed.filter((p) => p.custom).map((p) => p.custom!)
    const total = Number(prep || 0) + Number(cookMin || 0)
    const finalTags = new Set(tags)
    if (total <= 20) finalTags.add('quick')
    else finalTags.delete('quick')
    const recipe: CustomRecipe = {
      ...(base ?? {}),
      id: base?.id ?? `c_${uid()}`,
      kind,
      name: { en, ar },
      blurb: base?.blurb ?? { en: '', ar: '' },
      prepMin: Number(prep || 0),
      cookMin: Number(cookMin || 0),
      servings: Math.max(1, Number(servings || 2)),
      difficulty: base?.difficulty ?? 1,
      cost: base?.cost ?? 1,
      tags: [...finalTags],
      equipment: base?.equipment ?? ['stovetop'],
      ingredients: parsed.map((p) => p.ingredient),
      steps: keepBilingual ? base!.steps : stepLines.map((s) => ({ en: s, ar: s })),
      sourceUrl: url.trim() || undefined,
      custom: true,
      baseId: base && !base.custom ? base.id : base?.baseId,
      customIngredients,
    }
    k.saveRecipe(recipe)
    go(`recipe/${recipe.id}`)
  }

  const field = 'min-h-12 w-full rounded-2xl bg-white px-4 ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage'
  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={back} aria-label={t('back')} className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-sand">
          <ArrowLeft className="flip-rtl" size={20} />
        </button>
        <h1 className="text-xl font-semibold text-olive">{base ? t('editOurVersion') : t('newRecipe')}</h1>
      </div>
      <label className="block text-sm text-muted">
        {t('rfNameEn')}
        <input dir="ltr" className={field} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </label>
      <label className="block text-sm text-muted">
        {t('rfNameAr')}
        <input dir="rtl" className={field} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </label>
      <div>
        <p className="mb-1 text-sm text-muted">{t('rfKind')}</p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([kd, key]) => (
            <Chip key={kd} active={kind === kd} onClick={() => setKind(kd)}>
              {t(key)}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm text-muted">
          {t('prep')}
          <input inputMode="numeric" className={field} value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="block text-sm text-muted">
          {t('cook')}
          <input inputMode="numeric" className={field} value={cookMin} onChange={(e) => setCookMin(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="block text-sm text-muted">
          {t('servings')}
          <input inputMode="numeric" className={field} value={servings} onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <label className="block text-sm text-muted">
        {t('rfIngredients')}
        <textarea rows={8} className={`${field} py-3`} value={ings} onChange={(e) => setIngs(e.target.value)} />
      </label>
      {parsed.length > 0 && <p className="text-xs text-muted">{t('rfMatched', { n: matched, m: parsed.length })}</p>}
      <label className="block text-sm text-muted">
        {t('rfSteps')}
        <textarea rows={6} className={`${field} py-3`} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
      <div>
        <p className="mb-1 text-sm text-muted">{t('rfTags')}</p>
        <div className="flex flex-wrap gap-2">
          {TAGS.map(([tag, key]) => (
            <Chip
              key={tag}
              active={tags.has(tag)}
              onClick={() =>
                setTags((s) => {
                  const n = new Set(s)
                  if (n.has(tag)) n.delete(tag)
                  else n.add(tag)
                  return n
                })
              }
            >
              {tag === 'meat' ? (lang === 'ar' ? 'لحمة' : 'Meat') : t(key)}
            </Chip>
          ))}
        </div>
      </div>
      <label className="block text-sm text-muted">
        {t('rfUrl')}
        <input dir="ltr" type="url" className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </label>
      <Button variant="primary" size="lg" className="w-full" onClick={save} disabled={!nameEn.trim() && !nameAr.trim()}>
        {t('save')}
      </Button>
    </div>
  )
}
