'use client'

/**
 * الكاميرا الافتراضية — Virtual Camera
 * تولّد إطار «بث» اصطناعياً على Canvas: رقعة شطرنج بمنظور خفيف + علامات ×
 * حول الزوايا (نمط xcorners) + شريط معلومات OSD كأنها عقدة ESP32.
 * تلعب نقلات قانونية عبر chess.js ويمكنها دفع النقلات إلى الرقعة المرتبطة
 * عبر نفس مسار API الحقيقي (/api/boards/{id}/move) — تجربة كاملة بدون عتاد.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Play, Pause, RotateCcw, FlaskConical } from 'lucide-react'
import { useI18n } from '@/components/language-provider'

/** رباعية الرقعة الافتراضية (نسب من الإطار) بترتيب [h1, a1, a8, h8] */
const QUAD_REL: [number, number][] = [
  [0.742, 0.810], // h1 — أسفل يمين
  [0.336, 0.771], // a1 — أسفل يسار
  [0.367, 0.293], // a8 — أعلى يسار
  [0.773, 0.332], // h8 — أعلى يمين
]

type Pt = [number, number]

function quadAt(w: number, h: number): Pt[] {
  return QUAD_REL.map(([x, y]) => [x * w, y * h] as Pt)
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** نقطة على الرقعة: u من a→h، v من الرتبة 8 (أعلى) → 1 (أسفل) */
function boardPoint(quad: Pt[], u: number, v: number): Pt {
  // quad = [h1,a1,a8,h8] → أعلى-يسار = a8، أعلى-يمين = h8، أسفل-يسار = a1، أسفل-يمين = h1
  const tl = quad[2]
  const tr = quad[3]
  const bl = quad[1]
  const br = quad[0]
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v)
}

const GLYPHS: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

interface VirtualCameraViewProps {
  name: string
  width: number
  height: number
  /** عناصر فوق الإطار (مثل طبقة المعايرة التفاعلية) */
  overlay?: React.ReactNode
  /** الرقعة المرتبطة لدفع النقلات إليها (اختياري) */
  linkedBoardId?: string
}

const SPEEDS = { fast: 1100, normal: 2400, slow: 4500 } as const
type SpeedKey = keyof typeof SPEEDS

export function VirtualCameraView({ name, width, height, overlay, linkedBoardId }: VirtualCameraViewProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Chess>(new Chess())
  const lastMoveRef = useRef<{ from: string; to: string } | null>(null)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>('normal')
  const [push, setPush] = useState(false)
  const [tick, setTick] = useState(0) // لإعادة الرسم عند كل نقلة

  const W = Number.isFinite(width) && width > 0 ? width : 1280
  const H = Number.isFinite(height) && height > 0 ? height : 1024

  /** رسم إطار كامل */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = W
    canvas.height = H
    const quad = quadAt(W, H)

    // خلفية القاعة
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#20301f')
    bg.addColorStop(1, '#0b120c')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const cx = quad.reduce((s, p) => s + p[0], 0) / 4
    const cy = quad.reduce((s, p) => s + p[1], 0) / 4

    // ظل الطاولة
    ctx.save()
    ctx.filter = 'blur(18px)'
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    quad.forEach(([x, y], i) => {
      const dx = (x - cx) * 1.18
      const dy = (y - cy) * 1.22
      if (i === 0) ctx.moveTo(cx + dx, cy + dy)
      else ctx.lineTo(cx + dx, cy + dy)
    })
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // إطار خشبي حول الرقعة
    const expand = (p: Pt, f: number): Pt => [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]
    const wood = quad.map((p) => expand(p, 1.09))
    ctx.beginPath()
    wood.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = '#5d4331'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = Math.max(2, H * 0.004)
    ctx.stroke()

    // مربعات الرقعة
    const boardArea = Math.abs(
      (quad[1][0] - quad[0][0]) * (quad[2][1] - quad[0][1]) -
      (quad[2][0] - quad[0][0]) * (quad[1][1] - quad[0][1])
    ) / 2
    const sq = Math.max(18, Math.sqrt(boardArea) / 8) // حجم المربع التقريبي

    const fenRows = gameRef.current.fen().split(' ')[0].split('/')
    for (let r = 0; r < 8; r++) {
      let f = 0
      for (const ch of fenRows[r] ?? '8') {
        if (/\d/.test(ch)) {
          f += parseInt(ch)
          continue
        }
        // المربع (الملف f، الصف r من الأعلى)
        const u0 = f / 8
        const u1 = (f + 1) / 8
        const v0 = r / 8
        const v1 = (r + 1) / 8
        const p00 = boardPoint(quad, u0, v0)
        const p10 = boardPoint(quad, u1, v0)
        const p11 = boardPoint(quad, u1, v1)
        const p01 = boardPoint(quad, u0, v1)

        ctx.beginPath()
        ctx.moveTo(p00[0], p00[1])
        ctx.lineTo(p10[0], p10[1])
        ctx.lineTo(p11[0], p11[1])
        ctx.lineTo(p01[0], p01[1])
        ctx.closePath()
        ctx.fillStyle = (f + r) % 2 === 0 ? '#e6d3b0' : '#8a5a34'
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'
        ctx.lineWidth = 1
        ctx.stroke()

        // تظليل آخر نقلة
        const squareName = `${'abcdefgh'[f]}${8 - r}`
        const lm = lastMoveRef.current
        if (lm && (lm.from === squareName || lm.to === squareName)) {
          ctx.fillStyle = 'rgba(250,204,21,0.35)'
          ctx.fill()
        }

        // القطعة
        const glyph = GLYPHS[ch.toLowerCase()]
        if (glyph) {
          const center = boardPoint(quad, (u0 + u1) / 2, (v0 + v1) / 2)
          const white = ch === ch.toUpperCase()
          ctx.font = `${Math.round(sq * 0.92)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineWidth = Math.max(1.5, sq * 0.05)
          ctx.strokeStyle = white ? '#1c1917' : '#f5f5f4'
          ctx.fillStyle = white ? '#fafaf9' : '#1c1917'
          ctx.strokeText(glyph, center[0], center[1])
          ctx.fillText(glyph, center[0], center[1])
        }
        f++
      }
    }

    // علامات × حول الرقعة (نمط xcorners): الزوايا + منتصفات الأضلاع
    const marks: Pt[] = []
    for (let i = 0; i < 4; i++) {
      marks.push(quad[i])
      marks.push(lerp(quad[i], quad[(i + 1) % 4], 0.5))
    }
    const ms = Math.max(6, Math.min(W, H) * 0.013)
    for (const m of marks) {
      const dx = m[0] - cx
      const dy = m[1] - cy
      const len = Math.hypot(dx, dy) || 1
      const ox = (dx / len) * Math.min(W, H) * 0.045
      const oy = (dy / len) * Math.min(W, H) * 0.045
      const x = m[0] + ox
      const y = m[1] + oy
      ctx.strokeStyle = '#f43f5e'
      ctx.lineWidth = Math.max(2.5, H * 0.0035)
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(255,255,255,0.8)'
      ctx.shadowBlur = 4
      ctx.beginPath()
      ctx.moveTo(x - ms, y - ms)
      ctx.lineTo(x + ms, y + ms)
      ctx.moveTo(x + ms, y - ms)
      ctx.lineTo(x - ms, y + ms)
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // OSD — شريط معلومات كأنه عقدة ESP32
    const fs = Math.max(13, Math.round(H * 0.026))
    ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 6

    ctx.fillStyle = '#34d399'
    ctx.beginPath()
    ctx.arc(W * 0.025, fs * 0.85 + H * 0.03, fs * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'left'
    ctx.fillText(`LIVE · ${name || 'ChessCam-VIRTUAL'}`, W * 0.04, H * 0.03)
    ctx.textAlign = 'right'
    ctx.fillText(`${W}×${H} · 12 fps`, W * 0.97, H * 0.03)
    ctx.textAlign = 'left'
    ctx.fillText(new Date().toLocaleTimeString('en-GB'), W * 0.025, H * 0.935)

    // أيقونة بطارية
    const bx = W * 0.9
    const by = H * 0.945
    const bw = W * 0.045
    const bh = fs * 0.85
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(bx, by, bw, bh)
    ctx.fillRect(bx + bw + 2, by + bh * 0.25, 4, bh * 0.5)
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(bx + 3, by + 3, (bw - 6) * 0.82, bh - 6)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText('96%', bx - fs * 0.4, by - fs * 0.12)
    ctx.shadowBlur = 0
  }, [W, H, name, tick])

  // إعادة الرسم عند أي تغيير
  useEffect(() => {
    draw()
  }, [draw])

  /** لقطة نقلة قانونية عشوائية (يفضّل الأخذ أحياناً) */
  useEffect(() => {
    if (!playing) return
    const iv = setInterval(() => {
      const game = gameRef.current
      const moves = game.moves({ verbose: true })
      if (moves.length === 0) {
        // انتهت اللعبة — أعد وضع البداية تلقائياً
        gameRef.current = new Chess()
        lastMoveRef.current = null
        setTick((v) => v + 1)
        return
      }
      const captures = moves.filter((m) => m.captured)
      const pool =
        captures.length > 0 && Math.random() < 0.35 ? captures : moves
      const chosen = pool[Math.floor(Math.random() * pool.length)]
      try {
        game.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion ?? 'q' })
        lastMoveRef.current = { from: chosen.from, to: chosen.to }
        setTick((v) => v + 1)
        // دفع النقلة إلى الرقعة المرتبطة بنفس مسار النظام الحقيقي
        if (push && linkedBoardId) {
          fetch(`/api/boards/${linkedBoardId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: chosen.from,
              to: chosen.to,
              promotion: chosen.promotion,
              confidence: 0.99,
              source: 'virtual',
            }),
          }).catch(() => {})
        }
      } catch {
        /* تجاهل */
      }
    }, SPEEDS[speed])
    return () => clearInterval(iv)
  }, [playing, speed, push, linkedBoardId])

  function resetPosition() {
    gameRef.current = new Chess()
    lastMoveRef.current = null
    setTick((v) => v + 1)
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-black">
      <div dir="ltr" className="relative">
        <canvas ref={canvasRef} className="block h-auto w-full select-none" aria-label="Virtual camera frame" />
        {overlay}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-slate-900 px-3 py-2">
        <Badge className="gap-1 bg-fuchsia-700 text-white hover:bg-fuchsia-700">
          <FlaskConical className="h-3 w-3" />
          {t('virt.badge')}
        </Badge>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? t('virt.pause') : t('virt.play')}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={resetPosition}>
          <RotateCcw className="h-4 w-4" />
          {t('virt.reset')}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{t('virt.speed')}</span>
          <Select value={speed} onValueChange={(v) => setSpeed(v as SpeedKey)}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slow">{t('virt.speedSlow')}</SelectItem>
              <SelectItem value="normal">{t('virt.speedNormal')}</SelectItem>
              <SelectItem value="fast">{t('virt.speedFast')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {linkedBoardId && (
          <div className="flex items-center gap-2">
            <Switch checked={push} onCheckedChange={setPush} id="virt-push" />
            <Label htmlFor="virt-push" className="text-xs text-slate-300">
              {push ? t('virt.pushOn') : t('virt.pushOff')}
            </Label>
          </div>
        )}
      </div>
    </div>
  )
}
