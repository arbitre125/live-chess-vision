'use client'

/**
 * المعايرة البصرية التفاعلية — Interactive Visual Calibration
 * طبقة SVG فوق المعاينة الحية (بث حقيقي أو كاميرا افتراضية):
 *  - انقر داخل الإطار لإدراج الزوايا الأربع بالترتيب [h1, a1, a8, h8]
 *  - اسحب أي نقطة لضبطها بدقة
 *  - اعرض مضلعات الرقع الأخرى المعايرة سلفاً + شبكة 8×8 المشوّهة
 * الإحداثيات الناتجة بنفس مساحة إطار الكاميرا (بكسل) المتوافقة مع خادم الرؤية.
 */

import { useEffect, useRef, useState } from 'react'

export const CORNER_KEYS = ['h1', 'a1', 'a8', 'h8'] as const
export type CornerKey = (typeof CORNER_KEYS)[number]

export type Pt = [number, number]

export interface OverlayBoard {
  id: string
  label: string
  corners: Pt[] // [h1,a1,a8,h8]
}

interface InteractiveCalibrationProps {
  frameW: number
  frameH: number
  /** رقع أخرى معايرة — تُعرض كمضلعات فقط */
  otherBoards: OverlayBoard[]
  /** نقاط التحرير الحالية (قد تكون أقل من 4 أثناء الإدراج) */
  pts: Pt[]
  onChange: (pts: Pt[]) => void
}

/** ألوان مضلعات الرقع الأخرى */
const BOARD_COLORS = ['#10b981', '#f97316', '#a855f7', '#06b6d4']

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export function InteractiveCalibration({ frameW, frameH, otherBoards, pts, onChange }: InteractiveCalibrationProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const ptsRef = useRef(pts)
  const onChangeRef = useRef(onChange)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // مزامنة المراجع بعد كل رندر (وليس أثناءه)
  useEffect(() => {
    ptsRef.current = pts
    onChangeRef.current = onChange
  })

  const full = pts.length === 4

  // سحب المقبض — مستمعو نافذة عامة لتتبع المؤشر خارج الإطار
  useEffect(() => {
    if (dragIdx === null) return
    function toFrame(e: PointerEvent): Pt {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return [0, 0]
      const x = Math.min(frameW, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * frameW)))
      const y = Math.min(frameH, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * frameH)))
      return [x, y]
    }
    function move(e: PointerEvent) {
      const p = toFrame(e)
      const next = ptsRef.current.map((q, i) => (i === dragIdx ? p : q))
      onChangeRef.current(next)
    }
    function up() {
      setDragIdx(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragIdx, frameW, frameH])

  function handleStageDown(e: React.PointerEvent<SVGSVGElement>) {
    if (ptsRef.current.length >= 4 || dragIdx !== null) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.min(frameW, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * frameW)))
    const y = Math.min(frameH, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * frameH)))
    onChangeRef.current([...ptsRef.current, [x, y]])
  }

  // خطوط الشبكة 8×8 عبر استيفاء أضلاع الرباعية
  const gridLines: string[] = []
  if (full) {
    const [p0, p1, p2, p3] = pts // h1, a1, a8, h8
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      const a = lerp(p0, p1, t) // من h1 إلى a1 (الصف السفلي)
      const b = lerp(p3, p2, t) // من h8 إلى a8 (الصف العلوي)
      gridLines.push(`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`)
      const c = lerp(p1, p2, t) // من a1 إلى a8 (الملف a)
      const d = lerp(p0, p3, t) // من h1 إلى h8 (الملف h)
      gridLines.push(`M ${c[0]} ${c[1]} L ${d[0]} ${d[1]}`)
    }
  }

  const labelSize = Math.max(13, frameW * 0.016)
  const handleR = Math.max(6, frameW * 0.0075)
  const labelOffset = handleR + labelSize * 0.6

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${frameW} ${frameH}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 h-full w-full touch-none ${full ? '' : 'cursor-crosshair'}`}
      onPointerDown={handleStageDown}
      role="application"
      aria-label="Interactive calibration overlay"
    >
      {/* مضلعات الرقع الأخرى المعايرة */}
      {otherBoards.map((b, i) => {
        if (b.corners?.length !== 4) return null
        const color = BOARD_COLORS[i % BOARD_COLORS.length]
        const cx = b.corners.reduce((s, p) => s + p[0], 0) / 4
        const cy = b.corners.reduce((s, p) => s + p[1], 0) / 4
        return (
          <g key={b.id}>
            <polygon
              points={b.corners.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={`${color}22`}
              stroke={color}
              strokeWidth={Math.max(1.5, frameW * 0.002)}
              strokeDasharray={`${frameW * 0.012} ${frameW * 0.006}`}
            />
            <text
              x={cx}
              y={cy}
              fill={color}
              stroke="#000"
              strokeWidth={labelSize * 0.18}
              paintOrder="stroke"
              fontSize={labelSize}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {b.label}
            </text>
          </g>
        )
      })}

      {/* الشبكة المشوّهة 8×8 عند اكتمال الزوايا */}
      {full && (
        <g>
          <polygon
            points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="rgba(245,158,11,0.10)"
            stroke="#f59e0b"
            strokeWidth={Math.max(2, frameW * 0.0025)}
          />
          {gridLines.map((d, i) => (
            <path key={i} d={d} stroke="rgba(245,158,11,0.5)" strokeWidth={Math.max(0.8, frameW * 0.001)} fill="none" />
          ))}
        </g>
      )}

      {/* المضلع الجزئي أثناء الإدراج */}
      {!full && pts.length > 1 && (
        <polyline
          points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={Math.max(2, frameW * 0.0025)}
          strokeDasharray={`${frameW * 0.01} ${frameW * 0.008}`}
        />
      )}

      {/* مقابض الزوايا القابلة للسحب */}
      {pts.map(([x, y], i) => (
        <g
          key={i}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.currentTarget.style.cursor = 'grabbing'
            setDragIdx(i)
          }}
          style={{ cursor: dragIdx === i ? 'grabbing' : 'grab' }}
        >
          <circle cx={x} cy={y} r={handleR * 2} fill="transparent" />
          <circle cx={x} cy={y} r={handleR} fill="#f59e0b" stroke="#fff" strokeWidth={Math.max(1.5, handleR * 0.3)} />
          <text
            x={x + labelOffset}
            y={y - labelOffset * 0.2}
            fill="#fde68a"
            stroke="#000"
            strokeWidth={labelSize * 0.16}
            paintOrder="stroke"
            fontSize={labelSize}
            fontWeight="bold"
          >
            {CORNER_KEYS[i]}
          </text>
          <text
            x={x + labelOffset}
            y={y + labelSize * 0.95}
            fill="#fcd34d"
            stroke="#000"
            strokeWidth={labelSize * 0.14}
            paintOrder="stroke"
            fontSize={labelSize * 0.8}
            fontFamily="ui-monospace, monospace"
          >
            {x},{y}
          </text>
        </g>
      ))}
    </svg>
  )
}
