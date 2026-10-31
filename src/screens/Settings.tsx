import { useState } from 'react'
import { ArrowLeft, Copy, Download, LogOut, Share2, X } from 'lucide-react'
import type { Allergen, DayType, Equipment } from '../domain/types'
import { useKitchen } from '../data/kitchen'
import { cloudEnabled, createInvite, supabase } from '../data/supabase'
import { resetDemo } from '../data/demo'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { useIngName } from '../ui/bits'
import { Button, Card, Chip, SectionTitle, Stepper, cx, useToast } from '../ui/kit'
import { useBack } from '../ui/router'
import { IngredientPicker } from './Shop'
import { DAY_LABEL, DAY_TYPES } from './Week'

const ALLERGENS: Allergen[] = ['peanut', 'tree_nut', 'sesame', 'dairy', 'egg', 'gluten', 'fish', 'soy']

export function Settings({ householdId, onSignOut }: { householdId?: string; onSignOut?: () => void }) {
  const k = useKitchen()
  const { t, lang, setLang, weekdayName } = useT()
  const back = useBack()
  const name = useIngName()
  const s = k.state.settings
  const [picking, setPicking] = useState(false)

  const cycle = (wd: number) => {
    const cur = s.dayPattern[wd]
    const next = DAY_TYPES[(DAY_TYPES.indexOf(cur) + 1) % DAY_TYPES.length] as DayType
    k.updateSettings({ dayPattern: s.dayPattern.map((x, i) => (i === wd ? next : x)) })
  }
  const weekOrder = Array.from({ length: 7 }, (_, i) => (s.shopDay + i) % 7)

  return (
    <div className="space-y-2 pb-10">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={back} aria-label={t('back')} className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-sand">
          <ArrowLeft className="flip-rtl" size={20} />
        </button>
        <h1 className="text-xl font-semibold text-olive">{t('settings')}</h1>
      </div>

      <SectionTitle>{t('language')}</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Chip active={lang === 'en'} onClick={() => setLang('en')} className="min-h-12 text-base">
          English
        </Chip>
        <Chip active={lang === 'ar'} onClick={() => setLang('ar')} className="min-h-12 text-base">
          العربية
        </Chip>
      </div>

      <SectionTitle>{t('household')}</SectionTitle>
      <Card>
        <p className="font-semibold">{k.householdName || t('defaultKitchenName')}</p>
        <p className="mt-1 text-sm text-muted">
          {t('members')}: {k.members.map((m) => m.name || '…').join(' · ')}
        </p>
        {k.isDemo ? (
          <p className="mt-2 text-sm text-terra-deep">{t('demoExplain')}</p>
        ) : (
          householdId && <Invite householdId={householdId} full={k.members.length >= 2} />
        )}
      </Card>

      <SectionTitle>{t('shoppingDay')}</SectionTitle>
      <DayPicker value={s.shopDay} onChange={(d) => k.updateSettings({ shopDay: d })} />
      <SectionTitle>{t('topUpDay')}</SectionTitle>
      <DayPicker value={s.topUpDay} onChange={(d) => k.updateSettings({ topUpDay: d })} allowNone />

      <SectionTitle>{t('usualWeek')}</SectionTitle>
      <Card className="space-y-2">
        <p className="text-sm text-muted">{t('usualWeekHint')}</p>
        {weekOrder.map((wd) => (
          <div key={wd} className="flex items-center justify-between">
            <span>{weekdayName(wd)}</span>
            <Chip active={s.dayPattern[wd] === 'cook'} onClick={() => cycle(wd)}>
              {t(DAY_LABEL[s.dayPattern[wd]])}
            </Chip>
          </div>
        ))}
      </Card>

      <SectionTitle>{t('defaultServings')}</SectionTitle>
      <Stepper label={t('defaultServings')} value={s.servings} onChange={(n) => k.updateSettings({ servings: n })} />

      <SectionTitle>{t('allergies')}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {ALLERGENS.map((a) => (
          <Chip
            key={a}
            active={s.allergies.includes(a)}
            onClick={() => k.updateSettings({ allergies: s.allergies.includes(a) ? s.allergies.filter((x) => x !== a) : [...s.allergies, a] })}
          >
            {t(`al_${a}` as StringKey)}
          </Chip>
        ))}
      </div>

      <SectionTitle>{t('dislikes')}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {s.dislikes.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 ps-3 pe-1 text-sm ring-1 ring-sand">
            {name(id)}
            <button aria-label={t('remove')} className="grid size-7 place-items-center rounded-full" onClick={() => k.updateSettings({ dislikes: s.dislikes.filter((x) => x !== id) })}>
              <X size={14} />
            </button>
          </span>
        ))}
        <Chip onClick={() => setPicking(true)}>+ {t('addDislike')}</Chip>
      </div>
      <IngredientPicker
        open={picking}
        onClose={() => setPicking(false)}
        exclude={s.dislikes}
        onPick={(id) => {
          k.updateSettings({ dislikes: [...s.dislikes, id] })
          setPicking(false)
        }}
      />

      <SectionTitle>{t('equipment')}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {(['oven', 'blender'] as Equipment[]).map((e) => (
          <Chip key={e} active={s.equipment.includes(e)} onClick={() => k.updateSettings({ equipment: s.equipment.includes(e) ? s.equipment.filter((x) => x !== e) : [...s.equipment, e] })}>
            {t(e === 'oven' ? 'needsOven' : 'needsBlender')}
          </Chip>
        ))}
      </div>

      <SectionTitle>{t('exportData')}</SectionTitle>
      <Button className="w-full" onClick={() => exportData(k)}>
        <Download size={18} /> {t('exportData')}
      </Button>

      <SectionTitle>{t('references')}</SectionTitle>
      <Card className="space-y-1 text-sm">
        {[
          ['Harvard Healthy Eating Plate', 'https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/'],
          ['USDA: leftovers and food safety', 'https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely'],
          ['FoodSafety.gov cold storage chart', 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts'],
          ['AHA: healthy snacking', 'https://www.heart.org/en/healthy-living/healthy-eating/add-color/healthy-snacking'],
        ].map(([label, href]) => (
          <a key={href} className="block text-olive underline" href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ))}
        <p className="pt-2 text-muted">{t('disclaimer')}</p>
      </Card>

      <div className="pt-4">
        {k.isDemo ? (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              resetDemo()
              window.location.reload()
            }}
          >
            ↺ {t('resetDemo')}
          </Button>
        ) : (
          cloudEnabled && (
            <Button variant="danger" className="w-full" onClick={onSignOut}>
              <LogOut size={18} /> {t('signOut')}
            </Button>
          )
        )}
      </div>
      <p className="pt-2 text-center text-xs text-muted">{t('installHint')}</p>
    </div>
  )

  function DayPicker({ value, onChange, allowNone }: { value: number; onChange: (d: number) => void; allowNone?: boolean }) {
    return (
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {allowNone && (
          <Chip active={value < 0} onClick={() => onChange(-1)}>
            {t('noTopUp')}
          </Chip>
        )}
        {[6, 0, 1, 2, 3, 4, 5].map((d) => (
          <Chip key={d} active={value === d} onClick={() => onChange(d)}>
            {weekdayName(d)}
          </Chip>
        ))}
      </div>
    )
  }
}

function Invite({ householdId, full }: { householdId: string; full: boolean }) {
  const { t } = useT()
  const toast = useToast()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (full) return <p className="mt-2 text-sm text-olive">{t('householdFull')}</p>
  const link = code ? `${window.location.origin}${window.location.pathname}?join=${code}` : ''
  const message = code ? t('inviteMessage', { link, code }) : ''
  return (
    <div className="mt-3 space-y-2">
      {!code ? (
        <Button
          variant="primary"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setErr('')
            try {
              setCode(await createInvite(supabase!, householdId))
            } catch (e) {
              setErr((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('invitePartner')}
        </Button>
      ) : (
        <>
          <p className="text-sm text-muted">{t('inviteExplain')}</p>
          <p className="rounded-2xl bg-cream py-3 text-center font-mono text-2xl tracking-[0.3em]" dir="ltr">
            {code}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ text: message })
                  else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
                } catch {
                  /* cancelled */
                }
              }}
            >
              <Share2 size={16} /> WhatsApp
            </Button>
            <Button
              onClick={async () => {
                await navigator.clipboard?.writeText(message)
                toast(t('copied'))
              }}
            >
              <Copy size={16} /> {t('share')}
            </Button>
          </div>
        </>
      )}
      {err && <p className={cx('text-sm text-terra-deep')}>{t('errorGeneric', { msg: err })}</p>}
    </div>
  )
}

function exportData(k: ReturnType<typeof useKitchen>) {
  const data = {
    exportedAt: new Date().toISOString(),
    household: k.householdName,
    settings: k.state.settings,
    plan: k.state.plan,
    pantry: k.state.pantry,
    ratings: k.state.ratings,
    leftovers: k.state.leftovers,
    customRecipes: k.state.recipes.filter((r) => r.custom),
  }
  const csv = [
    'date,type,recipe,servings',
    ...Object.values(k.state.plan)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => `${e.date},${e.type},${e.recipeId ?? ''},${e.servings ?? ''}`),
  ].join('\n')
  download('baytna-kitchen.json', JSON.stringify(data, null, 2), 'application/json')
  download('baytna-plan.csv', csv, 'text/csv')
}

function download(name: string, body: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
