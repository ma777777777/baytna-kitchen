import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BookOpen, CalendarDays, CloudOff, Home, Loader2, Settings as Gear, ShoppingBasket } from 'lucide-react'
import { DEMO_ME, DEMO_PARTNER, demoRepo } from './data/demo'
import { KitchenProvider, seedHousehold, useKitchen } from './data/kitchen'
import { Repo } from './data/repo'
import { cloudBackend, cloudEnabled, loadHousehold, supabase, type HouseholdInfo } from './data/supabase'
import { useT } from './i18n'
import { Cook } from './screens/Cook'
import { LanguagePick, SetupHousehold, Shell, SignIn } from './screens/Auth'
import { RecipeDetail } from './screens/RecipeDetail'
import { RecipeForm } from './screens/RecipeForm'
import { Recipes } from './screens/Recipes'
import { Settings } from './screens/Settings'
import { Shop } from './screens/Shop'
import { Today } from './screens/Today'
import { Week } from './screens/Week'
import { cx } from './ui/kit'
import { go, useRoute } from './ui/router'

// Remember an invite code from a shared link until the user has signed in.
const joinParam = new URLSearchParams(window.location.search).get('join')
if (joinParam) {
  try {
    localStorage.setItem('baytna.joinCode', joinParam.toUpperCase())
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.hash)
}

export default function App() {
  const { chosen } = useT()
  if (!chosen) return <LanguagePick />
  return cloudEnabled ? <CloudApp /> : <DemoApp />
}

function DemoApp() {
  const { t, lang } = useT()
  const repo = useMemo(() => demoRepo(), [])
  const members = useMemo(
    () => [
      { id: DEMO_ME, name: lang === 'ar' ? 'أنا' : 'Me' },
      { id: DEMO_PARTNER, name: lang === 'ar' ? 'الشريك' : 'Partner' },
    ],
    [lang],
  )
  return (
    <KitchenProvider repo={repo} me={members[0]} members={members} householdName={t('defaultKitchenName')}>
      <Main />
    </KitchenProvider>
  )
}

const HH_CACHE = (uid: string) => `baytna.household.${uid}`

function CloudApp() {
  const { t } = useT()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [household, setHousehold] = useState<HouseholdInfo | null | undefined>(undefined)
  const [justCreated, setJustCreated] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async (uid: string) => {
    try {
      const h = await loadHousehold(supabase!, uid)
      setHousehold(h)
      if (h) localStorage.setItem(HH_CACHE(uid), JSON.stringify(h))
    } catch (e) {
      // Offline: fall back to the last known household so cached data still shows.
      const cached = localStorage.getItem(HH_CACHE(uid))
      if (cached) setHousehold(JSON.parse(cached))
      else setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (session) void refresh(session.user.id)
    else if (session === null) setHousehold(undefined)
  }, [session, refresh])

  if (session === undefined) return <Loading />
  if (!session) return <SignIn />
  if (household === undefined)
    return error ? (
      <Shell>
        <p className="text-center text-muted">{t('offlineNoData')}</p>
      </Shell>
    ) : (
      <Loading />
    )
  if (!household)
    return (
      <SetupHousehold
        session={session}
        needsName
        onDone={(_hid, created) => {
          setJustCreated(created)
          void refresh(session.user.id)
        }}
      />
    )
  return (
    <CloudKitchen
      key={household.id}
      session={session}
      household={household}
      seed={justCreated}
      onRefresh={() => refresh(session.user.id)}
      onSignOut={async () => {
        localStorage.removeItem(HH_CACHE(session.user.id))
        await supabase!.auth.signOut()
      }}
    />
  )
}

function CloudKitchen({ session, household, seed, onSignOut, onRefresh }: { session: Session; household: HouseholdInfo; seed: boolean; onSignOut: () => void; onRefresh: () => void }) {
  const uid = session.user.id
  const repo = useMemo(() => {
    const r = new Repo(`baytna.data.${household.id}.${uid}`, cloudBackend(supabase!, household.id), uid)
    // Only the person who creates the household writes the defaults; a joining partner
    // must never overwrite shared settings with defaults from an empty cache.
    if (seed) seedHousehold(r)
    return r
  }, [household.id, uid, seed])
  const me = household.members.find((m) => m.id === uid) ?? { id: uid, name: '' }

  // Pick up a partner who joined while this phone was open.
  useEffect(() => {
    if (household.members.length >= 2) return
    const t = window.setInterval(onRefresh, 30_000)
    return () => window.clearInterval(t)
  }, [household.members.length, onRefresh])

  return (
    <KitchenProvider repo={repo} me={me} members={household.members} householdName={household.name}>
      <Main householdId={household.id} onSignOut={onSignOut} />
    </KitchenProvider>
  )
}

function Loading() {
  const { t } = useT()
  return (
    <div className="grid min-h-dvh place-items-center text-muted" role="status">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="animate-spin" size={18} /> {t('loading')}
      </span>
    </div>
  )
}

function Main({ householdId, onSignOut }: { householdId?: string; onSignOut?: () => void }) {
  const route = useRoute()
  const [screen, a, b] = route
  const fullScreen = screen === 'cook'
  let content: React.ReactNode
  switch (screen) {
    case 'week':
      content = <Week key={a ?? ''} initial={a} />
      break
    case 'shop':
      content = <Shop route={route} />
      break
    case 'recipes':
      content = <Recipes />
      break
    case 'recipe':
      content = <RecipeDetail id={a} />
      break
    case 'recipe-new':
      content = <RecipeForm />
      break
    case 'recipe-edit':
      content = <RecipeForm editId={a} />
      break
    case 'cook':
      content = <Cook id={a} servingsParam={b} />
      break
    case 'settings':
      content = <Settings householdId={householdId} onSignOut={onSignOut} />
      break
    default:
      content = <Today />
  }
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {!fullScreen && <TopBar />}
      <main className={cx('px-4', fullScreen ? 'pt-2' : 'pb-28')}>{content}</main>
      {!fullScreen && <TabBar active={screen === 'recipe' || screen?.startsWith('recipe-') ? 'recipes' : screen} />}
    </div>
  )
}

function TopBar() {
  const k = useKitchen()
  const { t } = useT()
  const label =
    k.status === 'demo'
      ? t('syncDemo')
      : k.status === 'offline'
        ? t('syncOffline')
        : k.status === 'pending'
          ? t('syncPending', { n: k.pending })
          : k.status === 'syncing'
            ? t('syncSyncing')
            : t('syncSynced')
  const tone = k.status === 'demo' ? 'bg-terra-soft text-terra-deep' : k.status === 'synced' ? 'bg-sage-soft text-olive' : 'bg-cream text-muted'
  return (
    <div className="safe-top sticky top-0 z-30 bg-ivory/95 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <button onClick={() => go('today')} className="flex min-w-0 items-center gap-2 whitespace-nowrap font-semibold text-olive">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="size-7 rounded-lg" />
          {t('appName')}
        </button>
        <div className="flex items-center gap-2">
          <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', tone)} role="status" title={k.status === 'demo' ? t('demoExplain') : k.status === 'offline' ? t('offlineExplain') : undefined}>
            {(k.status === 'offline' || k.status === 'demo') && <CloudOff size={12} />}
            {label}
          </span>
          <button aria-label={t('settings')} onClick={() => go('settings')} className="grid size-10 place-items-center rounded-full text-olive">
            <Gear size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}

function TabBar({ active }: { active: string }) {
  const { t } = useT()
  const tabs = [
    { id: 'today', label: t('tabToday'), icon: Home },
    { id: 'week', label: t('tabWeek'), icon: CalendarDays },
    { id: 'shop', label: t('tabShop'), icon: ShoppingBasket },
    { id: 'recipes', label: t('tabRecipes'), icon: BookOpen },
  ]
  const current = tabs.some((x) => x.id === active) ? active : 'today'
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-ivory/95 backdrop-blur" aria-label="Main">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => go(id)}
            aria-current={current === id ? 'page' : undefined}
            className={cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium', current === id ? 'text-olive' : 'text-muted')}
          >
            <span className={cx('grid h-8 w-14 place-items-center rounded-full transition', current === id && 'bg-sage-soft')}>
              <Icon size={22} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
