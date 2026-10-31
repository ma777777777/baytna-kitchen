import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { parse } from '../domain/dates'
import type { Lang, Text } from '../domain/types'
import { STRINGS, type StringKey } from './strings'

const LANG_KEY = 'baytna.lang'

function readLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'ar' || v === 'en' ? v : null
  } catch {
    return null
  }
}

interface I18n {
  lang: Lang
  chosen: boolean
  setLang: (l: Lang) => void
  t: (key: StringKey, vars?: Record<string, string | number>) => string
  /** Pick the current language from a bilingual value. */
  L: (text: Text) => string
  dayName: (iso: string, short?: boolean) => string
  dateLabel: (iso: string) => string
  weekdayName: (weekday: number) => string
  list: (items: string[]) => string
}

const Ctx = createContext<I18n | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const initial = readLang()
  const [lang, setLangState] = useState<Lang>(initial ?? (navigator.language?.startsWith('ar') ? 'ar' : 'en'))
  const [chosen, setChosen] = useState(initial != null)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    setChosen(true)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      /* private mode */
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const locale = lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB'
    const t: I18n['t'] = (key, vars) => {
      // Optional count forms: `ar1`/`ar2` (Arabic singular and dual), `ar11` (11 and up takes a
      // singular noun), `en1`.
      const forms = STRINGS[key] as Record<string, string>
      const n = vars?.n
      const form = typeof n === 'number' ? (n === 1 ? '1' : n === 2 ? '2' : n >= 11 ? '11' : '') : ''
      let s: string = (form && forms[lang + form]) || forms[lang]
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    }
    return {
      lang,
      chosen,
      setLang,
      t,
      L: (text) => text[lang] || text.en,
      dayName: (iso, short) => parse(iso).toLocaleDateString(locale, { weekday: short ? 'short' : 'long' }),
      dateLabel: (iso) => parse(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      weekdayName: (wd) => {
        const d = new Date(2026, 10, 1 + wd, 12) // 1 Nov 2026 is a Sunday
        return d.toLocaleDateString(locale, { weekday: 'long' })
      },
      list: (items) => {
        try {
          return new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(items)
        } catch {
          return items.join(lang === 'ar' ? '، ' : ', ')
        }
      },
    }
  }, [lang, chosen, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useT() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useT outside LangProvider')
  return v
}
