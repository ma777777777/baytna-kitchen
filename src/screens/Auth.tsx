import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createHousehold, joinHousehold, saveProfileName, supabase } from '../data/supabase'
import { useT } from '../i18n'
import { Button, Card } from '../ui/kit'

type T = ReturnType<typeof useT>['t']

/** Server errors arrive in English; show the common ones in the user's language. */
function friendly(msg: string, t: T) {
  const m = msg.toLowerCase()
  if (m.includes('expired') || m.includes('invalid')) return t('errCode')
  if (m.includes('rate limit') || m.includes('security purposes') || m.includes('too many')) return t('errTooMany')
  if (m.includes('fetch') || m.includes('network')) return t('errNetwork')
  return t('errorGeneric', { msg })
}

const field = 'min-h-12 w-full rounded-2xl bg-white px-4 text-lg ring-1 ring-sand outline-none focus:ring-2 focus:ring-sage'

export function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useT()
  return (
    <div className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="mx-auto mb-3 size-20 rounded-3xl" />
        <h1 className="text-3xl font-semibold text-olive">
          {t('appName')}
        </h1>
        <p className="mt-2 text-muted">{t('welcome')}</p>
      </div>
      {children}
    </div>
  )
}

export function LanguagePick() {
  const { t, setLang } = useT()
  return (
    <Shell>
      <Card className="space-y-3">
        <p className="text-center font-medium">{t('chooseLanguage')} · اختاروا اللغة</p>
        <Button size="lg" variant="primary" className="w-full text-xl" onClick={() => setLang('ar')}>
          العربية
        </Button>
        <Button size="lg" className="w-full text-xl" onClick={() => setLang('en')}>
          English
        </Button>
      </Card>
    </Shell>
  )
}

export function SignIn() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const send = async () => {
    setBusy(true)
    setErr('')
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) setErr(friendly(error.message, t))
    else setSent(true)
  }
  const verify = async () => {
    setBusy(true)
    setErr('')
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(friendly(error.message, t))
  }

  return (
    <Shell>
      <Card>
        {!sent ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <label className="block text-sm text-muted">
              {t('email')}
              <input dir="ltr" type="email" autoComplete="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <Button type="submit" size="lg" variant="primary" className="w-full" disabled={busy || !email.includes('@')}>
              {t('sendCode')}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void verify()
            }}
          >
            <p className="text-sm text-muted">{t('enterCode', { email })}</p>
            <input
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={`${field} text-center font-mono text-2xl tracking-[0.4em]`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
            <Button type="submit" size="lg" variant="primary" className="w-full" disabled={busy || code.length < 6}>
              {t('verify')}
            </Button>
            <p className="text-xs text-muted">{t('codeSentHint')}</p>
            <Button type="button" variant="ghost" className="w-full" onClick={() => (setSent(false), setCode(''))}>
              {t('differentEmail')}
            </Button>
          </form>
        )}
        {err && <p className="mt-3 text-sm text-terra-deep">{err}</p>}
      </Card>
    </Shell>
  )
}

export function SetupHousehold({ session, needsName, onDone }: { session: Session; needsName: boolean; onDone: (householdId: string, created: boolean) => void }) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [kitchen, setKitchen] = useState(t('defaultKitchenName'))
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem('baytna.joinCode') ?? ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => Promise<[string, boolean]>) => {
    if (needsName && !name.trim()) return
    setBusy(true)
    setErr('')
    try {
      if (needsName) await saveProfileName(supabase!, session.user.id, name)
      const [hid, created] = await fn()
      try {
        localStorage.removeItem('baytna.joinCode')
      } catch {
        /* ignore */
      }
      onDone(hid, created)
    } catch (e) {
      const msg = (e as Error).message ?? ''
      setErr(msg.includes('invalid_or_expired') ? t('errInvite') : msg.includes('household_full') ? t('errFull') : friendly(msg, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-olive">{t('setupTitle')}</h2>
        {needsName && (
          <label className="block text-sm text-muted">
            {t('yourName')}
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </label>
        )}
        {!code && (
          <>
            <label className="block text-sm text-muted">
              {t('kitchenName')}
              <input className={field} value={kitchen} onChange={(e) => setKitchen(e.target.value)} />
            </label>
            <Button size="lg" variant="primary" className="w-full" disabled={busy || (needsName && !name.trim())} onClick={() => run(async () => [await createHousehold(supabase!, kitchen), true])}>
              {t('createKitchen')}
            </Button>
          </>
        )}
        <div className="border-t border-sand pt-4">
          <p className="mb-2 text-sm text-muted">{t('orJoin')}</p>
          <div className="flex gap-2">
            <input
              dir="ltr"
              aria-label={t('inviteCode')}
              placeholder={t('inviteCode')}
              className={`${field} font-mono uppercase tracking-widest`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button size="lg" variant={code ? 'primary' : 'secondary'} disabled={busy || code.length < 6 || (needsName && !name.trim())} onClick={() => run(async () => [await joinHousehold(supabase!, code), false])}>
              {t('join')}
            </Button>
          </div>
        </div>
        {err && <p className="text-sm text-terra-deep">{err}</p>}
      </Card>
    </Shell>
  )
}
