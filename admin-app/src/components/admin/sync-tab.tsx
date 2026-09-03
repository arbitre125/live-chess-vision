'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/components/language-provider'
import {
  CloudUpload,
  Save,
  Eye,
  ChevronDown,
  CircleCheck,
  CircleAlert,
  Github,
  KeyRound,
} from 'lucide-react'
import type { SettingsInfo } from '@/lib/types'

interface SyncTabProps {
  settings: SettingsInfo | null
  onChange: () => void
}

export function SyncTab({ settings, onChange }: SyncTabProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [clubName, setClubName] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('')
  const [dataPath, setDataPath] = useState('')
  const [token, setToken] = useState('')
  const [autoPush, setAutoPush] = useState(true)
  const [interval, setIntervalSec] = useState('30')
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [preview, setPreview] = useState<string>('')
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (!settings) return
    setClubName(settings.clubName)
    setRepo(settings.githubRepo)
    setBranch(settings.githubBranch)
    setDataPath(settings.githubDataPath)
    setAutoPush(settings.autoPush)
    setIntervalSec(String(settings.pushIntervalSec))
  }, [settings])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubName,
          githubRepo: repo,
          githubBranch: branch,
          githubDataPath: dataPath,
          autoPush,
          pushIntervalSec: Number(interval),
          githubToken: token,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({ title: t('sync.saved') })
      setToken('')
      onChange()
    } catch (e) {
      toast({ title: t('sync.saveFail'), description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function pushNow() {
    setPushing(true)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const json = await res.json()
      toast({
        title: json.ok ? t('sync.pushOk') : t('sync.pushFail'),
        description: json.message,
        variant: json.ok ? 'default' : 'destructive',
      })
      onChange()
    } catch (e) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setPushing(false)
    }
  }

  async function loadPreview() {
    if (preview) {
      setPreviewOpen((v) => !v)
      return
    }
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()
      setPreview(JSON.stringify(json.payload, null, 2))
      setPreviewOpen(true)
    } catch {
      toast({ title: t('sync.previewFail'), variant: 'destructive' })
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* الإعدادات */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Github className="h-5 w-5" />
            {t('sync.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('sync.club')}</Label>
            <Input value={clubName} onChange={(e) => setClubName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('sync.repo')} <span className="text-xs text-muted-foreground">(owner/name)</span>
            </Label>
            <Input dir="ltr" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('sync.branch')}</Label>
              <Input dir="ltr" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('sync.dataPath')}</Label>
              <Input dir="ltr" value={dataPath} onChange={(e) => setDataPath(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              {t('sync.token')}
            </Label>
            <Input
              dir="ltr"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={settings?.hasToken ? t('sync.token.ph') : 'ghp_...'}
            />
            <p className="text-[11px] text-muted-foreground">{t('sync.token.help')}</p>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{t('sync.autoPush')}</div>
              <div className="text-xs text-muted-foreground">{t('sync.autoPushDesc')}</div>
            </div>
            <Switch checked={autoPush} onCheckedChange={setAutoPush} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('sync.interval')}</Label>
            <Input dir="ltr" value={interval} onChange={(e) => setIntervalSec(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-4 w-4 ml-1" />
              {t('sync.save')}
            </Button>
            <Button onClick={pushNow} disabled={pushing} variant="outline" className="flex-1">
              <CloudUpload className="h-4 w-4 ml-1" />
              {t('sync.pushNow')}
            </Button>
          </div>

          {/* حالة آخر مزامنة */}
          {settings?.lastSyncStatus && (
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                settings.lastSyncStatus === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {settings.lastSyncStatus === 'success' ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <div className="font-semibold">
                  {settings.lastSyncStatus === 'success' ? t('sync.lastOk') : t('sync.lastFail')}
                </div>
                <div>{settings.lastSyncMessage}</div>
                {settings.lastSyncAt && (
                  <div dir="ltr" className="mt-1 opacity-70">
                    {new Date(settings.lastSyncAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* المعاينة والشرح */}
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-emerald-600" />
              {t('sync.preview')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full" onClick={loadPreview}>
                  {previewOpen ? t('sync.hideJson') : t('sync.showJson')} {t('sync.showJsonSuffix')}
                  <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre
                  dir="ltr"
                  className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-200"
                >
                  {preview || '...'}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t('sync.how.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>
              {t('sync.how.p1').split('live-data/boards.json')[0]}
              <code dir="ltr" className="rounded bg-muted px-1 font-mono text-xs">live-data/boards.json</code>
              {t('sync.how.p1').split('live-data/boards.json')[1]}
            </p>
            <p>
              {t('sync.how.p2').split('games')[0]}
              <code dir="ltr" className="mx-1 rounded bg-muted px-1 font-mono text-xs">games</code>
              {t('sync.how.p2').split('games')[1]?.split('GameSnapshot')[0]}
              <code dir="ltr" className="mx-1 rounded bg-muted px-1 font-mono text-xs">GameSnapshot</code>
              {t('sync.how.p2').split('GameSnapshot')[1]}
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {t('sync.how.p3')}
              <span dir="ltr" className="font-mono text-[11px]"> docs/integration-with-home-site.md</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
