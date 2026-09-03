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
import { Slider } from '@/components/ui/slider'
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
} from 'lucide-react'
import type { CameraWithBoard, BoardInfo } from '@/lib/types'
import { CAMERA_TYPE_LABELS, STATUS_LABELS } from '@/lib/types'

interface CamerasTabProps {
  cameras: CameraWithBoard[]
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

/** معاينة إطار الكاميرا مع مضلع الرقعة وشبكة المربعات الـ 64 */
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
    <div dir="ltr" className="rounded-lg overflow-hidden border">
      <svg viewBox="0 0 640 360" className="w-full block bg-[#3b4252]">
        {/* إطار وهمي للكاميرا — على الراسبيري تعرض صورة حقيقية */}
        <rect x="0" y="0" width="640" height="360" fill="#3b4252" />
        <rect x="270" y="150" width="100" height="60" fill="#4c566a" rx="4" />
        <text x="320" y="185" fill="#7b88a1" fontSize="13" textAnchor="middle" fontFamily="sans-serif">
          إطار الكاميرا
        </text>
        {/* مضلع الرقعة */}
        <path d={polygon} fill="rgba(16,185,129,0.10)" stroke="#10b981" strokeWidth="2" />
        {/* شبكة 8×8 */}
        {gridLines.map((d, i) => (
          <path key={i} d={d} stroke="rgba(16,185,129,0.35)" strokeWidth="0.7" fill="none" />
        ))}
        {/* نقاط الزوايا */}
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
  const [setupCam, setSetupCam] = useState<CameraWithBoard | null>(null)

  // نموذج الإضافة
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('picamera2')
  const [newDevice, setNewDevice] = useState('0')
  const [newBoardLabel, setNewBoardLabel] = useState('')
  const [adding, setAdding] = useState(false)

  // نموذج الإعداد والمعايرة
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('picamera2')
  const [formDevice, setFormDevice] = useState('0')
  const [formWidth, setFormWidth] = useState('1280')
  const [formHeight, setFormHeight] = useState('720')
  const [formFps, setFormFps] = useState('2')
  const [formEnabled, setFormEnabled] = useState(true)
  const [corners, setCorners] = useState<CornerInputs>(DEFAULT_CORNERS)
  const [orientation, setOrientation] = useState('white-bottom')
  const [threshold, setThreshold] = useState(18)
  const [savingCal, setSavingCal] = useState(false)

  useEffect(() => {
    if (!setupCam) return
    setFormName(setupCam.name)
    setFormType(setupCam.type)
    setFormDevice(setupCam.device)
    setFormWidth(String(setupCam.width))
    setFormHeight(String(setupCam.height))
    setFormFps(String(setupCam.fps))
    setFormEnabled(setupCam.enabled)
    const board = setupCam.board
    if (board?.corners) {
      try {
        const c = JSON.parse(board.corners) as [number, number][]
        setCorners({
          tl: [String(c[0][0]), String(c[0][1])],
          tr: [String(c[1][0]), String(c[1][1])],
          br: [String(c[2][0]), String(c[2][1])],
          bl: [String(c[3][0]), String(c[3][1])],
        })
      } catch {
        setCorners(DEFAULT_CORNERS)
      }
      setOrientation(board.orientation)
      setThreshold(Math.round((board.diffThreshold ?? 0.18) * 100))
    } else {
      setCorners(DEFAULT_CORNERS)
      setThreshold(18)
    }
  }, [setupCam])

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
          boardLabel: newBoardLabel,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({ title: 'تمت إضافة الكاميرا', description: `أُنشئت ${json.board?.label ?? 'رقعة'} مرتبطة بها` })
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

  async function saveBasics() {
    if (!setupCam) return
    await fetch(`/api/cameras/${setupCam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        type: formType,
        device: formDevice,
        width: Number(formWidth),
        height: Number(formHeight),
        fps: Number(formFps),
        enabled: formEnabled,
      }),
    })
    toast({ title: 'حُفظت إعدادات الكاميرا' })
    onChange()
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
      const res = await fetch(`/api/cameras/${setupCam.id}/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corners: cornersArr, orientation, diffThreshold: threshold / 100 }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({
        title: 'تمت المعايرة بنجاح',
        description: 'خزّنت زوايا الرقعة — خدمة الرؤية ستستخدمها لحساب المربعات',
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

  async function deleteCamera(cam: CameraWithBoard) {
    if (!confirm(`حذف «${cam.name}»؟ الرقعة المرتبطة ستبقى بدون كاميرا.`)) return
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          كل كاميرا تغطي رقعة واحدة — مثبتة فوق الطاولة على ارتفاع 80-120 سم
        </p>
        <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 ml-1" />
          إضافة كاميرا
        </Button>
      </div>

      {cameras.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <CameraIcon className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-medium">لا توجد كاميرات بعد</p>
            <p className="text-sm">أضف أول كاميرا لتُهيّأ للرقعة الأولى في القاعة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cameras.map((cam) => (
            <Card key={cam.id} className="border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
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
                    {cam.width}×{cam.height} @ {cam.fps}fps
                  </Badge>
                  <Badge variant="outline" dir="ltr">
                    {cam.device}
                  </Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الرقعة المرتبطة</span>
                  <span className="font-medium">{cam.board?.label ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">المعايرة</span>
                  {cam.board?.corners ? (
                    <Badge className="bg-emerald-600">معايرة ✓</Badge>
                  ) : (
                    <Badge variant="secondary">غير معايرة</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">مفعّلة</span>
                  <Badge variant={cam.enabled ? 'default' : 'secondary'} className={cam.enabled ? 'bg-emerald-600' : ''}>
                    {cam.enabled ? 'نعم' : 'لا'}
                  </Badge>
                </div>
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
          ))}
        </div>
      )}

      {/* حوار الإضافة */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة كاميرا جديدة</DialogTitle>
            <DialogDescription>
              ستُنشأ رقعة مرتبطة بها تلقائياً — عدّل اسمها لاحقاً إن أردت
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>اسم الكاميرا</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: كاميرا الطاولة 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>نوع الكاميرا</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="picamera2">كاميرا راسبيري (CSI)</SelectItem>
                  <SelectItem value="usb">ويب كام USB</SelectItem>
                  <SelectItem value="ip">كاميرا IP / هاتف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                الجهاز <span className="text-xs text-muted-foreground">(فهرس أو مسار أو رابط)</span>
              </Label>
              <Input dir="ltr" value={newDevice} onChange={(e) => setNewDevice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>اسم الرقعة</Label>
              <Input
                value={newBoardLabel}
                onChange={(e) => setNewBoardLabel(e.target.value)}
                placeholder="الرقعة 1"
              />
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-emerald-600" />
              إعداد: {setupCam?.name}
            </DialogTitle>
            <DialogDescription>
              إعدادات التصوير ثم معايرة زوايا الرقعة الأربع (TL أعلى-يسار، TR أعلى-يمين، BR أسفل-يمين، BL أسفل-يسار)
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
                    <SelectItem value="picamera2">كاميرا راسبيري (CSI)</SelectItem>
                    <SelectItem value="usb">ويب كام USB</SelectItem>
                    <SelectItem value="ip">كاميرا IP / هاتف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>الجهاز</Label>
                <Input dir="ltr" value={formDevice} onChange={(e) => setFormDevice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>الدقة</Label>
                <div className="flex gap-2" dir="ltr">
                  <Input value={formWidth} onChange={(e) => setFormWidth(e.target.value)} />
                  <Input value={formHeight} onChange={(e) => setFormHeight(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>الإطارات في الثانية (يكفي 1-2)</Label>
                <Input dir="ltr" value={formFps} onChange={(e) => setFormFps(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>مفعّلة</Label>
                <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              </div>
            </div>
            <Button onClick={saveBasics} variant="outline" className="w-full">
              حفظ الإعدادات الأساسية
            </Button>

            <Separator />

            {/* المعايرة */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-emerald-600" />
                <h3 className="font-semibold">معايرة زوايا الرقعة</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                أدخل إحداثيات زوايا الرقعة داخل إطار الصورة (بالبكسل). على الراسبيري استخدم أداة
                <code dir="ltr" className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">calibrate.py</code>
                لالتقاط صورة والنقر على الزوايا ثم انسخ القيم هنا. يجب أن يكون ترتيب الرقعة: الأبيض أسفل (white-bottom) افتراضياً.
              </p>

              <CalibrationPreview corners={corners} />

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['tl', 'TL — أعلى يسار'],
                    ['tr', 'TR — أعلى يمين'],
                    ['br', 'BR — أسفل يمين'],
                    ['bl', 'BL — أسفل يسار'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="rounded-lg border p-2 space-y-1.5">
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>اتجاه الرقعة</Label>
                  <Select value={orientation} onValueChange={setOrientation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="white-bottom">الأبيض أسفل (افتراضي)</SelectItem>
                      <SelectItem value="white-top">الأبيض أعلى</SelectItem>
                      <SelectItem value="rotated90">مائلة 90°</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    حساسية الكشف: <span dir="ltr" className="font-mono">{threshold}%</span>
                  </Label>
                  <Slider
                    dir="ltr"
                    value={[threshold]}
                    onValueChange={(v) => setThreshold(v[0])}
                    min={5}
                    max={50}
                    step={1}
                  />
                  <p className="text-[11px] text-muted-foreground">قيمة أقل = كشف أدق للاختلافات الصغيرة</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={saveCalibration} disabled={savingCal} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  {savingCal ? <RefreshCw className="h-4 w-4 animate-spin ml-1" /> : <Crosshair className="h-4 w-4 ml-1" />}
                  حفظ المعايرة
                </Button>
                <Button variant="outline" onClick={saveCalibration} disabled={savingCal}>
                  <Eye className="h-4 w-4 ml-1" />
                  معاينة الاختبار
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
