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
} from 'lucide-react'
import type { BoardInfo, CameraInfo } from '@/lib/types'
import { CAMERA_TYPE_LABELS, STATUS_LABELS } from '@/lib/types'

interface CamerasTabProps {
  cameras: CameraInfo[]
  boards: BoardInfo[]
  onChange: () => void
}

interface CornerInputs {
  tl: [string, string]
  tr: [string, string]
  br: [string, string]
  bl: [string, string]
}

const DEFAULT_CORNERS: CornerInputs = {
  tl: ['120', '80'],
  tr: ['520', '80'],
  br: ['520', '300'],
  bl: ['120', '300'],
}

/** معاينة حية من خادم الرؤية + مضلعات الرقع المعايرة */
function LivePreview({ cameraId, cornersList }: { cameraId: string; cornersList: [number, number][] }) {
  return (
    <div dir="ltr" className="relative overflow-hidden rounded-lg border bg-[#0f172a]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/vision/cameras/${cameraId}/stream.mjpg`}
        alt="بث حي"
        className="block w-full"
        onError={(e) => {
          const el = e.currentTarget
          el.style.display = 'none'
          const fb = el.nextElementSibling as HTMLElement | null
          if (fb) fb.style.display = 'block'
        }}
      />
      <div className="hidden aspect-video w-full items-center justify-center text-sm text-slate-400">
        لا بث متاح — تأكد أن خدمة الرؤية تعمل وأن الكاميرا مسجلة فيها
      </div>
      {cornersList.length === 4 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <polygon
            points={cornersList.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="rgba(16,185,129,0.12)"
            stroke="#10b981"
            strokeWidth="0.6"
          />
        </svg>
      )}
    </div>
  )
}

/** معاينة SVG تفاعلية للزوايا المُدخلة يدوياً */
function CalibrationPreview({ corners }: { corners: CornerInputs }) {
  const pts = useMemo(() => {
    const p = (v: string, fallback: number) => {
      const n = parseFloat(v)
      return isNaN(n) ? fallback : n
    }
    return {
      tl: [p(corners.tl[0], 120), p(corners.tl[1], 80)],
      tr: [p(corners.tr[0], 520), p(corners.tr[1], 80)],
      br: [p(corners.br[0], 520), p(corners.br[1], 300)],
      bl: [p(corners.bl[0], 120), p(corners.bl[1], 300)],
    }
  }, [corners])

  const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

  const gridLines: string[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const top = lerp(pts.tl, pts.tr, t)
    const bottom = lerp(pts.bl, pts.br, t)
    gridLines.push(`M ${top[0]} ${top[1]} L ${bottom[0]} ${bottom[1]}`)
    const left = lerp(pts.tl, pts.bl, t)
    const right = lerp(pts.tr, pts.br, t)
    gridLines.push(`M ${left[0]} ${left[1]} L ${right[0]} ${right[1]}`)
  }

  const polygon = `M ${pts.tl[0]} ${pts.tl[1]} L ${pts.tr[0]} ${pts.tr[1]} L ${pts.br[0]} ${pts.br[1]} L ${pts.bl[0]} ${pts.bl[1]} Z`

  return (
    <div dir="ltr" className="overflow-hidden rounded-lg border">
      <svg viewBox="0 0 640 360" className="block w-full bg-[#3b4252]">
        <path d={polygon} fill="rgba(16,185,129,0.10)" stroke="#10b981" strokeWidth="2" />
        {gridLines.map((d, i) => (
          <path key={i} d={d} stroke="rgba(16,185,129,0.35)" strokeWidth="0.7" fill="none" />
        ))}
        {Object.entries(pts).map(([k, p]) => (
          <g key={k}>
            <circle cx={p[0]} cy={p[1]} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
            <text x={p[0] + 10} y={p[1] - 8} fill="#fbbf24" fontSize="11" fontWeight="bold">
              {k.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export function CamerasTab({ cameras, boards, onChange }: CamerasTabProps) {
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

  // نموذج الإعداد والمعايرة
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('esp32')
  const [formDevice, setFormDevice] = useState('0')
  const [formStreamUrl, setFormStreamUrl] = useState('')
  const [formWidth, setFormWidth] = useState('1280')
  const [formHeight, setFormHeight] = useState('1024')
  const [formFps, setFormFps] = useState('2')
  const [formEnabled, setFormEnabled] = useState(true)
  const [corners, setCorners] = useState<CornerInputs>(DEFAULT_CORNERS)
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [savingCal, setSavingCal] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [previewOn, setPreviewOn] = useState(false)

  const camBoards = useMemo(
    () => (setupCam ? boards.filter((b) => b.cameraId === setupCam.id) : []),
    [setupCam, boards]
  )

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
    const first = boards.find((b) => b.cameraId === setupCam.id)
    setSelectedBoardId(first?.id ?? '')
  }, [setupCam, boards])

  // عند تغيير الرقعة المحددة حمّل زواياها
  useEffect(() => {
    const b = camBoards.find((x) => x.id === selectedBoardId)
    if (b?.corners) {
      try {
        const c = JSON.parse(b.corners) as [number, number][]
        // التخزين: h1,a1,a8,h8 (خادم الرؤية) أو TL,TR,BR,BL (قديم)
        setCorners({
          tl: [String(c[0][0]), String(c[0][1])],
          tr: [String(c[1][0]), String(c[1][1])],
          br: [String(c[2][0]), String(c[2][1])],
          bl: [String(c[3][0]), String(c[3][1])],
        })
      } catch {
        setCorners(DEFAULT_CORNERS)
      }
    } else {
      setCorners(DEFAULT_CORNERS)
    }
  }, [selectedBoardId, camBoards])

  async function handleAdd() {
    if (!newName.trim()) {
      toast({ title: 'أدخل اسماً للكاميرا', variant: 'destructive' })
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
          device: newDevice,
          streamUrl: newType === 'esp32' ? newStreamUrl : undefined,
          boardLabel: newBoardLabel,
          width: newType === 'esp32' ? 1280 : undefined,
          height: newType === 'esp32' ? 1024 : undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({
        title: 'تمت إضافة الكاميرا',
        description: json.board ? `أُنشئت ${json.board.label} مرتبطة بها` : 'سجّلها في خدمة الرؤية ثم اكتشف الرقع تلقائياً',
      })
      setAddOpen(false)
      setNewName('')
      setNewBoardLabel('')
      onChange()
    } catch (e) {
      toast({ title: 'فشلت الإضافة', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  /** تسجيل الكاميرا في خدمة الرؤية مع زر حديث */
  async function registerInVision(cam: CameraInfo, url: string) {
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
    await fetch(`/api/cameras/${setupCam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        type: formType,
        device: formDevice,
        streamUrl: formType === 'esp32' ? formStreamUrl : null,
        width: Number(formWidth),
        height: Number(formHeight),
        fps: Number(formFps),
        enabled: formEnabled,
      }),
    })
    // سجّلها في خدمة الرؤية
    await registerInVision(setupCam, formStreamUrl)
    toast({ title: 'حُفظت الإعدادات وسُجّلت الكاميرا في خدمة الرؤية' })
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
      if (!res.ok) throw new Error(json.detail ?? 'فشل الاكتشاف')
      const found = json.boards as { corners: [number, number][]; score: number }[]
      if (!found.length) {
        toast({
          title: 'لم تُكتشف رقع',
          description: 'تأكد من ظهور رقع بعلامات × كاملة في الإطار ومن الإضاءة',
        })
        return
      }
      // أنشئ رقعة جديدة لكل رقعة غير مرتبطة أصلاً بهذه الكاميرا
      const existing = boards.filter((b) => b.cameraId === setupCam.id).length
      let created = 0
      for (let i = 0; i < found.length; i++) {
        const res2 = await fetch('/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: `${setupCam.name} — رقعة ${existing + i + 1}`,
            cameraId: setupCam.id,
            corners: JSON.stringify(found[i].corners),
          }),
        })
        const j2 = await res2.json()
        if (j2.ok) {
          created++
          // سجلها في خادم الرؤية للتتبع الفوري
          await fetch(`/api/vision/boards/${j2.board.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ camera_id: setupCam.id, corners: found[i].corners }),
          }).catch(() => {})
        }
      }
      toast({
        title: `اكتُشفت ${found.length} رقعة`,
        description: `أُنشئت ${created} رقعة معايرة تلقائياً — عدّل أسماءها وبيانات اللاعبين`,
      })
      onChange()
    } catch (e) {
      toast({
        title: 'فشل الاكتشاف التلقائي',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setDiscovering(false)
    }
  }

  async function saveCalibration() {
    if (!setupCam) return
    setSavingCal(true)
    try {
      const cornersArr: [number, number][] = [
        [parseFloat(corners.tl[0]), parseFloat(corners.tl[1])],
        [parseFloat(corners.tr[0]), parseFloat(corners.tr[1])],
        [parseFloat(corners.br[0]), parseFloat(corners.br[1])],
        [parseFloat(corners.bl[0]), parseFloat(corners.bl[1])],
      ]
      if (!selectedBoardId) {
        // لا رقعة محددة: احفظ على أول رقعة للكاميرا أو أنشئ واحدة
        const resB = await fetch('/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: `${setupCam.name} — رقعة 1`,
            cameraId: setupCam.id,
            corners: JSON.stringify(cornersArr),
          }),
        })
        const jB = await resB.json()
        if (!jB.ok) throw new Error(jB.error)
      } else {
        const res = await fetch(`/api/boards/${selectedBoardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ corners: JSON.stringify(cornersArr) }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(json.error)
      }
      // سجل في خادم الرؤية
      const bid = selectedBoardId || undefined
      if (bid) {
        await fetch(`/api/vision/boards/${bid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: setupCam.id, corners: cornersArr }),
        }).catch(() => {})
      }
      toast({
        title: 'تمت المعايرة',
        description: 'خُزنت زوايا الرقعة وسُجلت في خدمة الرؤية',
      })
      onChange()
    } catch (e) {
      toast({
        title: 'فشلت المعايرة',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSavingCal(false)
    }
  }

  async function deleteCamera(cam: CameraInfo) {
    const n = boards.filter((b) => b.cameraId === cam.id).length
    if (!confirm(`حذف «${cam.name}»؟ ${n > 0 ? `${n} رقعة ستبقى بدون كاميرا.` : ''}`)) return
    await fetch(`/api/cameras/${cam.id}`, { method: 'DELETE' })
    toast({ title: 'حُذفت الكاميرا' })
    onChange()
  }

  function statusBadge(status: string) {
    const color =
      status === 'online' || status === 'detecting'
        ? 'bg-emerald-600'
        : status === 'error'
          ? 'bg-red-600'
          : 'bg-slate-400'
    return <Badge className={color}>{STATUS_LABELS[status] ?? status}</Badge>
  }

  const selectedCornersForPreview: [number, number][] | null = useMemo(() => {
    const b = camBoards.find((x) => x.id === selectedBoardId)
    if (!b?.corners) return null
    try {
      return JSON.parse(b.corners) as [number, number][]
    } catch {
      return null
    }
  }, [camBoards, selectedBoardId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          v2: عقدة ESP32 واحدة تغطي حتى 4 رقع — ضع الكاميرا عالياً بزاوية واسعة واكتشف الرقع تلقائياً
        </p>
        <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 ml-1" />
          إضافة عقدة كاميرا
        </Button>
      </div>

      {cameras.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-10 text-center text-muted-foreground">
            <CameraIcon className="mx-auto h-10 w-10 opacity-40" />
            <p className="font-medium">لا توجد كاميرات بعد</p>
            <p className="text-sm">أضف عقدة ESP32 الأولى واربطها بشبكة النادي</p>
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
                    <Badge variant="outline">{CAMERA_TYPE_LABELS[cam.type] ?? cam.type}</Badge>
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
                    <span className="text-muted-foreground">الرقع المرتبطة</span>
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
                            <Badge variant="outline" className="text-[10px] text-emerald-700">معايرة ✓</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">غير معايرة</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setSetupCam(cam)}>
                      <Settings2 className="h-4 w-4 ml-1" />
                      إعداد ومعايرة
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
            <DialogTitle>إضافة عقدة كاميرا</DialogTitle>
            <DialogDescription>
              عقدة ESP32 تعمل بالبطارية وتبث عبر WiFi — رقعة أو أربع لكل عقدة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>اسم العقدة</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: الكاميرا 1 — الجهة اليمنى"
              />
            </div>
            <div className="space-y-1.5">
              <Label>النوع</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esp32">عقدة ESP32 (WiFi + بطارية)</SelectItem>
                  <SelectItem value="usb">ويب كام USB</SelectItem>
                  <SelectItem value="picamera2">كاميرا راسبيري (CSI)</SelectItem>
                  <SelectItem value="ip">كاميرا IP / هاتف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newType === 'esp32' && (
              <div className="space-y-1.5">
                <Label>
                  رابط البث <span className="text-xs text-muted-foreground">(من شاشة العقدة)</span>
                </Label>
                <Input dir="ltr" value={newStreamUrl} onChange={(e) => setNewStreamUrl(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  شغّل العقدة واتصل بشبكتها ChessCam-XXXX لضبط WiFi — ثم سيظهر الرابط
                </p>
              </div>
            )}
            {newType !== 'esp32' && (
              <div className="space-y-1.5">
                <Label>الجهاز</Label>
                <Input dir="ltr" value={newDevice} onChange={(e) => setNewDevice(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                رقعة أولى <span className="text-xs text-muted-foreground">(اختياري — يمكن الاكتشاف التلقائي لاحقاً)</span>
              </Label>
              <Input value={newBoardLabel} onChange={(e) => setNewBoardLabel(e.target.value)} placeholder="اتركه فارغاً للاكتشاف التلقائي" />
            </div>
            <Button onClick={handleAdd} disabled={adding} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {adding ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <Plus className="h-4 w-4 ml-1" />}
              إضافة
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
              إعداد: {setupCam?.name}
            </DialogTitle>
            <DialogDescription>
              سجّل العقدة في خدمة الرؤية، شاهد البث الحي، ثم اكتشف الرقع تلقائياً أو عاير يدوياً
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* الإعدادات الأساسية */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الاسم</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>النوع</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="esp32">عقدة ESP32 (WiFi + بطارية)</SelectItem>
                    <SelectItem value="usb">ويب كام USB</SelectItem>
                    <SelectItem value="picamera2">كاميرا راسبيري (CSI)</SelectItem>
                    <SelectItem value="ip">كاميرا IP / هاتف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formType === 'esp32' ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>رابط البث من العقدة</Label>
                  <Input dir="ltr" value={formStreamUrl} onChange={(e) => setFormStreamUrl(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>الجهاز</Label>
                  <Input dir="ltr" value={formDevice} onChange={(e) => setFormDevice(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>الدقة</Label>
                <div className="flex gap-2" dir="ltr">
                  <Input value={formWidth} onChange={(e) => setFormWidth(e.target.value)} />
                  <Input value={formHeight} onChange={(e) => setFormHeight(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>مفعّلة</Label>
                <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveBasics} variant="outline" className="flex-1">
                حفظ وتسجيل في خدمة الرؤية
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPreviewOn(true)
                }}
              >
                <Eye className="h-4 w-4 ml-1" />
                بث حي
              </Button>
            </div>

            {previewOn && setupCam && (
              <LivePreview
                cameraId={setupCam.id}
                cornersList={selectedCornersForPreview ?? []}
              />
            )}

            <Separator />

            {/* الاكتشاف التلقائي */}
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2">
                <ScanSearch className="h-4 w-4 text-emerald-700" />
                <h3 className="font-semibold text-emerald-900">الاكتشاف التلقائي للرقع</h3>
                <Badge variant="outline" className="text-[10px]">v2 — ميزة جديدة</Badge>
              </div>
              <p className="text-xs leading-relaxed text-emerald-800">
                ضع الكاميرا بحيث تظهر كل الرقع بعلامات × كاملة، ثم اضغط الزر — سيكتشف النظام كل رقعة
                ويعايرها تلقائياً بدون إدخال يدوي (يحتاج نموذجي ONNX على الخادم).
              </p>
              <Button onClick={autoDiscover} disabled={discovering} className="w-full bg-emerald-700 hover:bg-emerald-800">
                {discovering ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <ScanSearch className="h-4 w-4 ml-1" />}
                اكتشاف الرقع في الإطار الحالي
              </Button>
            </div>

            <Separator />

            {/* المعايرة اليدوية */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-emerald-600" />
                <h3 className="font-semibold">معايرة يدوية لرقعة</h3>
              </div>

              <div className="space-y-1.5">
                <Label>اختر رقعة (أو أنشئ عند الحفظ)</Label>
                <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="رقعة جديدة" />
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

              <CalibrationPreview corners={corners} />

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['tl', 'h1 — أسفل يمين الرقعة'],
                    ['tr', 'a1 — أسفل يسار الرقعة'],
                    ['br', 'a8 — أعلى يسار الرقعة'],
                    ['bl', 'h8 — أعلى يمين الرقعة'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1.5 rounded-lg border p-2">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex gap-2" dir="ltr">
                      <Input
                        className="h-8 text-xs"
                        value={corners[key][0]}
                        onChange={(e) => setCorners((c) => ({ ...c, [key]: [e.target.value, c[key][1]] }))}
                        placeholder="x"
                      />
                      <Input
                        className="h-8 text-xs"
                        value={corners[key][1]}
                        onChange={(e) => setCorners((c) => ({ ...c, [key]: [c[key][0], e.target.value] }))}
                        placeholder="y"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                ترتيب الزوايا لمحور خادم الرؤية: h1 ثم a1 ثم a8 ثم h8 (عكس عقارب الساعة بدءاً من أسفل يمين).
                عند الاكتشاف التلقائي تُخزن بهذا الترتيب تلقائياً.
              </p>

              <Button onClick={saveCalibration} disabled={savingCal} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {savingCal ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <Crosshair className="h-4 w-4 ml-1" />}
                حفظ المعايرة
              </Button>
            </div>

            {/* حالة عقدة ESP32 */}
            {setupCam?.type === 'esp32' && (
              <div className="flex items-center gap-3 rounded-lg border p-3 text-xs text-muted-foreground">
                <BatteryMedium className="h-4 w-4" />
                حالة البطارية تُقرأ من العقدة عند عمل خدمة الرؤية (‎/status‎ في العقدة)
                {setupCam.batteryPct != null && (
                  <Badge variant="outline">{setupCam.batteryPct}%</Badge>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
