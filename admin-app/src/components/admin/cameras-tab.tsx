'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  Camera as CameraIcon,
  Plus,
  Settings2,
  Trash2,
  Crosshair,
  RefreshCw,
  Eye,
  Wifi,
  ScanSearch,
  BatteryMedium,
  Link2,
  MousePointerClick,
  Keyboard,
  Undo2,
  Eraser,
  Info,
} from 'lucide-react'
import type { BoardInfo, CameraInfo } from '@/lib/types'
import { useI18n } from '@/components/language-provider'
import { VirtualCameraView } from '@/components/admin/virtual-camera'
import { InteractiveCalibration, CORNER_KEYS, type Pt } from '@/components/admin/interactive-calibration'

interface CamerasTabProps {
  cameras: CameraInfo[]
  boards: BoardInfo[]
  onChange: () => void
}

/** إدخال رقمي مع مسودة محلية لسلاسة الكتابة */
function CornerNumInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined
  onChange: (n: number) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Input
      dir="ltr"
      className="h-8 text-xs"
      inputMode="numeric"
      value={draft ?? (value != null ? String(value) : '')}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = parseFloat(e.target.value)
        if (!isNaN(n)) onChange(n)
      }}
      onBlur={() => setDraft(null)}
      placeholder={placeholder}
    />
  )
}

/** معاينة ثابتة صغيرة للرباعية (وضع الأرقام) بترتيب [h1,a1,a8,h8] */
function StaticQuadPreview({ pts, frameW, frameH }: { pts: Pt[]; frameW: number; frameH: number }) {
  const s = 640 / Math.max(1, frameW)
  const q = pts.map(([x, y]) => [x * s, y * (360 / Math.max(1, frameH))] as Pt)
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const gridLines: string[] = []
  if (q.length === 4) {
    const [p0, p1, p2, p3] = q
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      gridLines.push(`M ${lerp(p0, p1, t)[0]} ${lerp(p0, p1, t)[1]} L ${lerp(p3, p2, t)[0]} ${lerp(p3, p2, t)[1]}`)
      gridLines.push(`M ${lerp(p1, p2, t)[0]} ${lerp(p1, p2, t)[1]} L ${lerp(p0, p3, t)[0]} ${lerp(p0, p3, t)[1]}`)
    }
  }
  return (
    <div dir="ltr" className="overflow-hidden rounded-lg border">
      <svg viewBox="0 0 640 360" className="block w-full bg-[#3b4252]">
        {q.length === 4 && (
          <>
            <polygon
              points={q.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="rgba(245,158,11,0.10)"
              stroke="#f59e0b"
              strokeWidth="2"
            />
            {gridLines.map((d, i) => (
              <path key={i} d={d} stroke="rgba(245,158,11,0.35)" strokeWidth="0.7" fill="none" />
            ))}
          </>
        )}
        {q.length > 1 && (
          <polyline points={q.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="6 4" />
        )}
        {q.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
            <text x={x + 9} y={y - 7} fill="#fde68a" fontSize="11" fontWeight="bold">
              {CORNER_KEYS[i]}
            </text>
          </g>
        ))}
        {q.length === 0 && (
          <text x="320" y="180" fill="#94a3b8" fontSize="13" textAnchor="middle">
            —
          </text>
        )}
      </svg>
    </div>
  )
}

export function CamerasTab({ cameras, boards, onChange }: CamerasTabProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [setupCam, setSetupCam] = useState<CameraInfo | null>(null)

  // نموذج الإضافة
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('esp32')
  const [newDevice, setNewDevice] = useState('0')
  const [newStreamUrl, setNewStreamUrl] = useState('http://chesscam-1.local/stream')
  const [newBoardLabel, setNewBoardLabel] = useState('')
  const [adding, setAdding] = useState(false)

  // نموذج الإعداد
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('esp32')
  const [formDevice, setFormDevice] = useState('0')
  const [formStreamUrl, setFormStreamUrl] = useState('')
  const [formWidth, setFormWidth] = useState('1280')
  const [formHeight, setFormHeight] = useState('1024')
  const [formFps, setFormFps] = useState('2')
  const [formEnabled, setFormEnabled] = useState(true)

  // المعايرة — مصدر واحد للحقيقة: مصفوفة نقاط رقمية [h1,a1,a8,h8]
  const [pts, setPts] = useState<Pt[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [savingCal, setSavingCal] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [previewOn, setPreviewOn] = useState(false)
  const [streamState, setStreamState] = useState<'idle' | 'ok' | 'error'>('idle')
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null)
  const [calMode, setCalMode] = useState<'visual' | 'numbers'>('visual')

  const camBoards = useMemo(
    () => (setupCam ? boards.filter((b) => b.cameraId === setupCam.id) : []),
    [setupCam, boards]
  )

  const wNum = Math.max(64, parseInt(formWidth) || 1280)
  const hNum = Math.max(64, parseInt(formHeight) || 1024)

  useEffect(() => {
    if (!setupCam) return
    setFormName(setupCam.name)
    setFormType(setupCam.type)
    setFormDevice(setupCam.device)
    setFormStreamUrl(setupCam.streamUrl ?? '')
    setFormWidth(String(setupCam.width))
    setFormHeight(String(setupCam.height))
    setFormFps(String(setupCam.fps))
    setFormEnabled(setupCam.enabled)
    setPreviewOn(setupCam.type === 'virtual')
    setStreamState('idle')
    setFrameSize(null)
    setCalMode('visual')
  }, [setupCam])

  // اختيار أول رقعة تلقائياً — دون التمسّ بالاختيار الحالي مع كل استقصاء دوري
  useEffect(() => {
    if (!setupCam) return
    const first = boards.find((b) => b.cameraId === setupCam.id)
    setSelectedBoardId((prev) => (prev && boards.some((b) => b.id === prev) ? prev : (first?.id ?? '')))
  }, [setupCam, boards])

  // زوايا الرقعة المحددة — قيمة نصية فقط حتى لا تُصفّر النقاط مع التحديثات الدورية
  const selectedCornersRaw = useMemo(
    () => camBoards.find((x) => x.id === selectedBoardId)?.corners ?? null,
    [camBoards, selectedBoardId]
  )
  useEffect(() => {
    if (!selectedCornersRaw) {
      setPts([])
      return
    }
    try {
      const c = JSON.parse(selectedCornersRaw) as Pt[]
      if (Array.isArray(c) && c.length === 4) {
        setPts(c.map(([x, y]) => [Number(x), Number(y)] as Pt))
        return
      }
    } catch {
      /* تجاهل */
    }
    setPts([])
  }, [selectedCornersRaw])

  /** رقع أخرى معايرة لعرضها في طبقة المعايرة */
  const otherBoards = useMemo(() => {
    return camBoards
      .filter((b) => b.id !== selectedBoardId && b.corners)
      .map((b) => {
        try {
          const c = JSON.parse(b.corners as string) as Pt[]
          return { id: b.id, label: b.label, corners: c }
        } catch {
          return null
        }
      })
      .filter((x): x is { id: string; label: string; corners: Pt[] } => x !== null && x.corners.length === 4)
  }, [camBoards, selectedBoardId])

  async function handleAdd() {
    if (!newName.trim()) {
      toast({ title: t('cam.add.failName'), variant: 'destructive' })
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: newType,
          device: newType === 'esp32' || newType === 'virtual' ? '0' : newDevice,
          streamUrl: newType === 'esp32' ? newStreamUrl : undefined,
          boardLabel: newBoardLabel,
          width: newType === 'usb' ? undefined : 1280,
          height: newType === 'usb' ? undefined : 1024,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({
        title: t('cam.added.title'),
        description: json.board
          ? t('cam.added.desc', { b: json.board.label })
          : t('cam.added.desc2'),
      })
      setAddOpen(false)
      setNewName('')
      setNewBoardLabel('')
      onChange()
    } catch (e) {
      toast({ title: t('cam.add.fail'), description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  /** تسجيل الكاميرا في خدمة الرؤية (لا ينطبق على الافتراضية) */
  async function registerInVision(cam: CameraInfo, url: string) {
    if (cam.type === 'virtual' && !url) return
    await fetch(`/api/vision/cameras/${cam.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: cam.type === 'esp32' ? 'esp32' : cam.type === 'usb' ? 'usb' : 'file',
        url,
      }),
    })
  }

  async function saveBasics() {
    if (!setupCam) return
    const isVirtual = formType === 'virtual'
    await fetch(`/api/cameras/${setupCam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        type: formType,
        device: isVirtual ? '0' : formDevice,
        streamUrl: formType === 'esp32' ? formStreamUrl : null,
        width: isVirtual ? 1280 : Number(formWidth),
        height: isVirtual ? 1024 : Number(formHeight),
        fps: Number(formFps),
        enabled: formEnabled,
      }),
    })
    if (!isVirtual) await registerInVision(setupCam, formStreamUrl)
    toast({ title: t('cam.savedRegistered') })
    onChange()
  }

  /** الاكتشاف التلقائي: يكشف كل الرقع في الإطار وينشئها في قاعدة البيانات */
  async function autoDiscover() {
    if (!setupCam) return
    setDiscovering(true)
    try {
      await registerInVision(setupCam, formStreamUrl)
      const res = await fetch(`/api/vision/cameras/${setupCam.id}/discover`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail ?? t('cam.discover.fail'))
      const found = json.boards as { corners: Pt[]; score: number }[]
      if (!found.length) {
        toast({ title: t('cam.discover.none'), description: t('cam.discover.noneDesc') })
        return
      }
      const existing = boards.filter((b) => b.cameraId === setupCam.id).length
      let created = 0
      for (let i = 0; i < found.length; i++) {
        const res2 = await fetch('/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: t('cam.discover.boardLabel', { cam: setupCam.name, n: existing + i + 1 }),
            cameraId: setupCam.id,
            corners: JSON.stringify(found[i].corners),
          }),
        })
        const j2 = await res2.json()
        if (j2.ok) {
          created++
          await fetch(`/api/vision/boards/${j2.board.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ camera_id: setupCam.id, corners: found[i].corners }),
          }).catch(() => {})
        }
      }
      toast({
        title: t('cam.discover.done', { n: found.length }),
        description: t('cam.discover.doneDesc', { c: created }),
      })
      onChange()
    } catch (e) {
      toast({
        title: t('cam.discover.fail'),
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setDiscovering(false)
    }
  }

  async function saveCalibration() {
    if (!setupCam) return
    if (pts.length !== 4) {
      toast({ title: t('cam.cal.need4'), variant: 'destructive' })
      return
    }
    setSavingCal(true)
    try {
      let boardId = selectedBoardId
      if (!boardId) {
        const resB = await fetch('/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: t('cam.discover.boardLabel', { cam: setupCam.name, n: camBoards.length + 1 }),
            cameraId: setupCam.id,
            corners: JSON.stringify(pts),
          }),
        })
        const jB = await resB.json()
        if (!jB.ok) throw new Error(jB.error)
        boardId = jB.board.id
      } else {
        const res = await fetch(`/api/boards/${boardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ corners: JSON.stringify(pts) }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(json.error)
      }
      if (formType !== 'virtual') {
        await fetch(`/api/vision/boards/${boardId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: setupCam.id, corners: pts }),
        }).catch(() => {})
      }
      toast({ title: t('cam.cal.saved'), description: t('cam.cal.savedDesc') })
      setSelectedBoardId(boardId)
      onChange()
    } catch (e) {
      toast({
        title: t('cam.cal.fail'),
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSavingCal(false)
    }
  }

  async function deleteCamera(cam: CameraInfo) {
    const n = boards.filter((b) => b.cameraId === cam.id).length
    if (!confirm(t('cam.deleteConfirm', { name: cam.name, n: n > 0 ? t('cam.deleteConfirmBoards', { n }) : '' }))) return
    await fetch(`/api/cameras/${cam.id}`, { method: 'DELETE' })
    toast({ title: t('cam.deleted') })
    onChange()
  }

  function statusBadge(status: string) {
    const color =
      status === 'online' || status === 'detecting'
        ? 'bg-emerald-600'
        : status === 'error'
          ? 'bg-red-600'
          : 'bg-slate-400'
    return <Badge className={color}>{t(`status.${status}`)}</Badge>
  }

  function updatePtSlot(i: number, axis: 0 | 1, n: number) {
    const seeds: Pt[] = [
      [Math.round(wNum * 0.742), Math.round(hNum * 0.81)],
      [Math.round(wNum * 0.336), Math.round(hNum * 0.771)],
      [Math.round(wNum * 0.367), Math.round(hNum * 0.293)],
      [Math.round(wNum * 0.773), Math.round(hNum * 0.332)],
    ]
    const next: Pt[] = CORNER_KEYS.map((_, k) => pts[k] ?? seeds[k])
    next[i] = axis === 0 ? [n, next[i][1]] : [next[i][0], n]
    setPts(next)
  }

  const cornerLabels: Record<string, string> = {
    h1: t('cam.corner.h1'),
    a1: t('cam.corner.a1'),
    a8: t('cam.corner.a8'),
    h8: t('cam.corner.h8'),
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('cam.hint')}</p>
        <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 ml-1" />
          {t('cam.add')}
        </Button>
      </div>

      {cameras.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-10 text-center text-muted-foreground">
            <CameraIcon className="mx-auto h-10 w-10 opacity-40" />
            <p className="font-medium">{t('cam.empty.title')}</p>
            <p className="text-sm">{t('cam.empty.sub')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cameras.map((cam) => {
            const camB = boards.filter((b) => b.cameraId === cam.id)
            return (
              <Card key={cam.id} className="border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                      <CameraIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="truncate">{cam.name}</span>
                    </CardTitle>
                    {statusBadge(cam.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className={cam.type === 'virtual' ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800' : ''}>
                      {t(`camtype.${cam.type}`)}
                    </Badge>
                    <Badge variant="outline">
                      {cam.width}×{cam.height}
                    </Badge>
                    {cam.type === 'esp32' && cam.streamUrl && (
                      <Badge variant="outline" dir="ltr" className="max-w-[180px] truncate font-mono text-[10px]">
                        <Wifi className="ml-1 h-3 w-3" />
                        {cam.streamUrl}
                      </Badge>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('cam.boardsLinked')}</span>
                    <Badge className={camB.length ? 'bg-emerald-600' : 'bg-slate-400'}>
                      <Link2 className="ml-1 h-3 w-3" />
                      {camB.length} / 4
                    </Badge>
                  </div>
                  {camB.length > 0 && (
                    <div className="space-y-1">
                      {camB.map((b) => (
                        <div key={b.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs">
                          <span className="truncate">{b.label}</span>
                          {b.corners ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-700">{t('cam.calibrated')}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">{t('cam.notCalibrated')}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setSetupCam(cam)}>
                      <Settings2 className="h-4 w-4 ml-1" />
                      {t('cam.setup')}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => deleteCamera(cam)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* حوار الإضافة */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('cam.add.title')}</DialogTitle>
            <DialogDescription>{t('cam.add.desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('cam.name')}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('cam.name.ph')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('cam.type')}</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esp32">{t('camtype.esp32')}</SelectItem>
                  <SelectItem value="usb">{t('camtype.usb')}</SelectItem>
                  <SelectItem value="picamera2">{t('camtype.picamera2')}</SelectItem>
                  <SelectItem value="ip">{t('camtype.ip')}</SelectItem>
                  <SelectItem value="virtual">{t('camtype.virtual')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newType === 'esp32' && (
              <div className="space-y-1.5">
                <Label>
                  {t('cam.streamUrl')} <span className="text-xs text-muted-foreground">({t('cam.streamUrl.hint')})</span>
                </Label>
                <Input dir="ltr" value={newStreamUrl} onChange={(e) => setNewStreamUrl(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{t('cam.streamUrl.help')}</p>
              </div>
            )}
            {newType !== 'esp32' && newType !== 'virtual' && (
              <div className="space-y-1.5">
                <Label>{t('cam.device')}</Label>
                <Input dir="ltr" value={newDevice} onChange={(e) => setNewDevice(e.target.value)} />
              </div>
            )}
            {newType === 'virtual' && (
              <p className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs leading-relaxed text-fuchsia-900">
                {t('virt.desc')}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                {t('cam.firstBoard')} <span className="text-xs text-muted-foreground">({t('cam.firstBoard.hint')})</span>
              </Label>
              <Input value={newBoardLabel} onChange={(e) => setNewBoardLabel(e.target.value)} placeholder={t('cam.firstBoard.ph')} />
            </div>
            <Button onClick={handleAdd} disabled={adding} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {adding ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <Plus className="h-4 w-4 ml-1" />}
              {t('common.add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار الإعداد والمعايرة */}
      <Dialog open={!!setupCam} onOpenChange={(open) => !open && setSetupCam(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-emerald-600" />
              {t('cam.setup.title', { name: setupCam?.name ?? '' })}
            </DialogTitle>
            <DialogDescription>{t('cam.setup.desc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* الإعدادات الأساسية */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('cam.settings.name')}</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('cam.settings.type')}</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="esp32">{t('camtype.esp32')}</SelectItem>
                    <SelectItem value="usb">{t('camtype.usb')}</SelectItem>
                    <SelectItem value="picamera2">{t('camtype.picamera2')}</SelectItem>
                    <SelectItem value="ip">{t('camtype.ip')}</SelectItem>
                    <SelectItem value="virtual">{t('camtype.virtual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formType === 'esp32' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t('cam.settings.stream')}</Label>
                  <Input dir="ltr" value={formStreamUrl} onChange={(e) => setFormStreamUrl(e.target.value)} />
                </div>
              )}
              {formType !== 'esp32' && formType !== 'virtual' && (
                <div className="space-y-1.5">
                  <Label>{t('cam.settings.device')}</Label>
                  <Input dir="ltr" value={formDevice} onChange={(e) => setFormDevice(e.target.value)} />
                </div>
              )}
              {formType !== 'virtual' && (
                <div className="space-y-1.5">
                  <Label>{t('cam.settings.res')}</Label>
                  <div className="flex gap-2" dir="ltr">
                    <Input value={formWidth} onChange={(e) => setFormWidth(e.target.value)} />
                    <Input value={formHeight} onChange={(e) => setFormHeight(e.target.value)} />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>{t('common.enabled')}</Label>
                <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              </div>
            </div>
            {formType === 'virtual' && (
              <p className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs leading-relaxed text-fuchsia-900">
                {t('virt.note')}
              </p>
            )}
            {formType !== 'virtual' && (
              <div className="flex gap-2">
                <Button onClick={saveBasics} variant="outline" className="flex-1">
                  {t('cam.saveRegister')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStreamState('idle')
                    setFrameSize(null)
                    setPreviewOn(true)
                  }}
                >
                  <Eye className="h-4 w-4 ml-1" />
                  {t('cam.liveStream')}
                </Button>
              </div>
            )}

            <Separator />

            {/* الاكتشاف التلقائي (لا يعمل مع الافتراضية) */}
            {formType !== 'virtual' && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2">
                  <ScanSearch className="h-4 w-4 text-emerald-700" />
                  <h3 className="font-semibold text-emerald-900">{t('cam.discover.title')}</h3>
                  <Badge variant="outline" className="text-[10px]">{t('cam.discover.badge')}</Badge>
                </div>
                <p className="text-xs leading-relaxed text-emerald-800">{t('cam.discover.desc')}</p>
                <Button onClick={autoDiscover} disabled={discovering} className="w-full bg-emerald-700 hover:bg-emerald-800">
                  {discovering ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <ScanSearch className="h-4 w-4 ml-1" />}
                  {t('cam.discover.btn')}
                </Button>
              </div>
            )}

            {/* المعايرة البصرية التفاعلية */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-emerald-600" />
                <h3 className="font-semibold">{t('vc.title')}</h3>
                <Badge className="bg-emerald-600 text-[10px] text-white">{t('vc.badge')}</Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('vc.desc')}</p>

              <div className="space-y-1.5">
                <Label>{t('cam.manual.select')}</Label>
                <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('cam.manual.newBoard')} />
                  </SelectTrigger>
                  <SelectContent>
                    {camBoards.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* المسرح: كاميرا افتراضية أو بث حي أو عنصر نائب */}
              {formType === 'virtual' ? (
                <VirtualCameraView
                  name={formName || 'ChessCam-VIRTUAL'}
                  width={wNum}
                  height={hNum}
                  linkedBoardId={selectedBoardId || undefined}
                  overlay={
                    <InteractiveCalibration
                      frameW={wNum}
                      frameH={hNum}
                      otherBoards={otherBoards}
                      pts={pts}
                      onChange={setPts}
                    />
                  }
                />
              ) : previewOn && setupCam ? (
                <div dir="ltr" className="relative overflow-hidden rounded-lg border bg-[#0f172a]">
                  <img
                    key={setupCam.id}
                    src={`/api/vision/cameras/${setupCam.id}/stream.mjpg`}
                    alt={t('cam.liveStream')}
                    className={`block w-full ${streamState === 'error' ? 'hidden' : ''}`}
                    onLoad={(e) => {
                      const el = e.currentTarget
                      setStreamState('ok')
                      if (el.naturalWidth > 0) setFrameSize({ w: el.naturalWidth, h: el.naturalHeight })
                    }}
                    onError={() => setStreamState('error')}
                  />
                  {streamState === 'error' && (
                    <div className="flex aspect-video w-full items-center justify-center p-6 text-center text-sm text-slate-400">
                      {t('cam.preview.noStream')}
                    </div>
                  )}
                  {streamState === 'ok' && frameSize && (
                    <InteractiveCalibration
                      frameW={frameSize.w}
                      frameH={frameSize.h}
                      otherBoards={otherBoards}
                      pts={pts}
                      onChange={setPts}
                    />
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <Eye className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  {t('vc.needFrame')}
                </div>
              )}

              {/* شريط التلميح خطوة بخطوة */}
              {pts.length < 4 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t('vc.step', {
                      i: pts.length + 1,
                      c: CORNER_KEYS[pts.length],
                      d: cornerLabels[CORNER_KEYS[pts.length]],
                    })}
                  </span>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  {t('vc.done')}
                </div>
              )}

              {/* أدوات + مبدّل الوضع */}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={pts.length === 0} onClick={() => setPts((p) => p.slice(0, -1))}>
                  <Undo2 className="h-4 w-4 ml-1" />
                  {t('vc.undo')}
                </Button>
                <Button size="sm" variant="outline" disabled={pts.length === 0} onClick={() => setPts([])}>
                  <Eraser className="h-4 w-4 ml-1" />
                  {t('vc.clear')}
                </Button>
                <div className="ms-auto flex overflow-hidden rounded-lg border text-xs">
                  <button
                    type="button"
                    onClick={() => setCalMode('visual')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${calMode === 'visual' ? 'bg-emerald-600 text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                  >
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {t('vc.mode.visual')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalMode('numbers')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${calMode === 'numbers' ? 'bg-emerald-600 text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                    {t('vc.mode.numbers')}
                  </button>
                </div>
              </div>

              {/* وضع الأرقام */}
              {calMode === 'numbers' && (
                <div className="space-y-3 rounded-lg border p-3">
                  <StaticQuadPreview pts={pts} frameW={wNum} frameH={hNum} />
                  <div className="grid grid-cols-2 gap-3">
                    {CORNER_KEYS.map((key, i) => (
                      <div key={key} className="space-y-1.5 rounded-lg border p-2">
                        <Label className="text-xs">{cornerLabels[key]}</Label>
                        <div className="flex gap-2" dir="ltr">
                          <CornerNumInput
                            value={pts[i]?.[0]}
                            onChange={(n) => updatePtSlot(i, 0, n)}
                            placeholder="x"
                          />
                          <CornerNumInput
                            value={pts[i]?.[1]}
                            onChange={(n) => updatePtSlot(i, 1, n)}
                            placeholder="y"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t('cam.corner.orderNote')}</p>
                </div>
              )}

              <Button onClick={saveCalibration} disabled={savingCal} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {savingCal ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <Crosshair className="h-4 w-4 ml-1" />}
                {t('cam.saveCal')}
              </Button>
            </div>

            {/* حالة عقدة ESP32 */}
            {setupCam?.type === 'esp32' && (
              <div className="flex items-center gap-3 rounded-lg border p-3 text-xs text-muted-foreground">
                <BatteryMedium className="h-4 w-4" />
                {t('cam.battery.note')}
                {setupCam.batteryPct != null && <Badge variant="outline">{setupCam.batteryPct}%</Badge>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
