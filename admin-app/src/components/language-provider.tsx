'use client'

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'
import { type Lang, dirOf, translate } from '@/lib/i18n'

interface I18nCtx {
  lang: Lang
  dir: 'rtl' | 'ltr'
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

const STORAGE_KEY = 'lcv-lang'

// ── مخزن اللغة الخارجي (localStorage) عبر useSyncExternalStore ──
// يضمن استرجاع اللغة المحفوظة بعد الترطيب دون setState داخل effect
// ودون اختلاف ترطيب (الخادم يرندر بالعربية ثم يتبدل بعد الترطيب).
const langListeners = new Set<() => void>()

function subscribeLang(cb: () => void): () => void {
  langListeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    langListeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

function getLangSnapshot(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'ar' || saved === 'fr' || saved === 'en') return saved
  } catch {
    /* تجاهل */
  }
  return 'ar'
}

function setStoredLang(l: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, l)
  } catch {
    /* تجاهل */
  }
  langListeners.forEach((fn) => fn())
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, () => 'ar' as Lang)

  // تحديث اتجاه ولغة الصفحة (نظام خارجي) عند التغيير
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dirOf(lang)
  }, [lang])

  const setLang = useCallback((l: Lang) => setStoredLang(l), [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  )

  return <Ctx.Provider value={{ lang, dir: dirOf(lang), setLang, t }}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>')
  return ctx
}
