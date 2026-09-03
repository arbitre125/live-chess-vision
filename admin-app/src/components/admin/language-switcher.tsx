'use client'

import { Languages } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/components/language-provider'
import { LANGS, type Lang } from '@/lib/i18n'

/** مبدّل اللغة الثلاثي: العربية / Français / English */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  const current = LANGS.find((l) => l.code === lang)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-1.5 rounded-md border bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        aria-label={t('lang.label')}
      >
        <Languages className="h-4 w-4 text-emerald-700" />
        <span className="hidden sm:inline">{current?.native}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code as Lang)}
            className={`justify-between gap-3 ${l.code === lang ? 'bg-emerald-50 font-semibold text-emerald-900' : ''}`}
          >
            <span>{l.native}</span>
            {l.code === lang && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
