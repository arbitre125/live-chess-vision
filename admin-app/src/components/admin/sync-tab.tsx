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
      toast({ title: 'حُفظت الإعدادات' })
      setToken('')
      onChange()
    } catch (e) {
      toast({ title: 'فشل الحفظ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
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
        title: json.ok ? 'تم الدفع بنجاح' : 'فشل الدفع',
        description: json.message,
        variant: json.ok ? 'default' : 'destructive',
      })
      onChange()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
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
      toast({ title: 'فشل توليد المعاينة', variant: 'destructive' })
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* الإعدادات */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Github className="h-5 w-5" />
            إعدادات المزامنة مع مستودع موقع النادي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>اسم النادي</Label>
            <Input value={clubName} onChange={(e) => setClubName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              المستودع <span className="text-xs text-muted-foreground">(owner/name)</span>
            </Label>
            <Input dir="ltr" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <Input dir="ltr" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>مسار ملف البيانات</Label>
              <Input dir="ltr" value={dataPath} onChange={(e) => setDataPath(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              توكن GitHub
            </Label>
            <Input
              dir="ltr"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={settings?.hasToken ? 'محفوظ — أدخل توكن جديد للاستبدال' : 'ghp_...'}
            />
            <p className="text-[11px] text-muted-foreground">
              أنشئ توكن من إعدادات GitHub بصلاحية Contents (قراءة/كتابة) على المستودع فقط — يُخزن محلياً على الراسبيري
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">دفع تلقائي</div>
              <div className="text-xs text-muted-foreground">يُدفع ملف JSON بعد كل فترة زمنية</div>
            </div>
            <Switch checked={autoPush} onCheckedChange={setAutoPush} />
          </div>
          <div className="space-y-1.5">
            <Label>فاصل المزامنة (ثانية، الحد الأدنى 10)</Label>
            <Input dir="ltr" value={interval} onChange={(e) => setIntervalSec(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-4 w-4 ml-1" />
              حفظ الإعدادات
            </Button>
            <Button onClick={pushNow} disabled={pushing} variant="outline" className="flex-1">
              <CloudUpload className="h-4 w-4 ml-1" />
              دفع الآن
            </Button>
          </div>

          {/* حالة آخر مزامنة */}
          {settings?.lastSyncStatus && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-xs border ${
                settings.lastSyncStatus === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {settings.lastSyncStatus === 'success' ? (
                <CircleCheck className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">
                  {settings.lastSyncStatus === 'success' ? 'آخر مزامنة: نجحت' : 'آخر مزامنة: فشلت'}
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
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" />
              معاينة البيانات المرسلة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full" onClick={loadPreview}>
                  {previewOpen ? 'إخفاء' : 'عرض'} حمولة JSON
                  <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre
                  dir="ltr"
                  className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-200 font-mono"
                >
                  {preview || '...'}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">كيف يقرأ موقع النادي هذه البيانات؟</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3 leading-relaxed">
            <p>
              يُدفع ملف <code dir="ltr" className="rounded bg-muted px-1 font-mono text-xs">live-data/boards.json</code> إلى
              فرع <Badge variant="outline" dir="ltr" className="mx-1 text-[11px]">feature/live-chess-games-sporting-ariana</Badge>
              في مستودع <span dir="ltr" className="font-mono text-xs">arbitre125/Home</span> بعد كل مزامنة.
            </p>
            <p>
              في موقع Vue الحالي، أضف دالة جلب (fetch) تقرأ الرابط الخام
              <code dir="ltr" className="mx-1 rounded bg-muted px-1 font-mono text-[11px]">
                https://raw.githubusercontent.com/arbitre125/Home/feature/live-chess-games-sporting-ariana/live-data/boards.json
              </code>
              كل 10 ثوانٍ، ثم حوّل كل عنصر في <code dir="ltr" className="font-mono text-xs">games</code> إلى
              <code dir="ltr" className="mx-1 font-mono text-xs">GameSnapshot</code> الموجود مسبقاً في
              <code dir="ltr" className="mx-1 font-mono text-xs">liveGames.ts</code>.
            </p>
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              ملف شرح الربط الكامل مع مثال الكود موجود في المستودع:
              <span dir="ltr" className="font-mono text-[11px]"> docs/integration-with-home-site.md</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
