import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** قائمة الرقع مع حالتها الحالية */
export async function GET() {
  const boards = await db.board.findMany({
    include: { camera: { select: { id: true, name: true, status: true, type: true } } },
    orderBy: { label: 'asc' },
  })
  return NextResponse.json({ ok: true, boards })
}

/** تطبيع الزوايا: مصفوفة ← JSON string، نص ← كما هو، null ← null */
function normalizeCorners(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (Array.isArray(v)) return JSON.stringify(v)
  return String(v)
}

/** إنشاء رقعة جديدة (بدون كاميرا مؤقتاً) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const count = await db.board.count()
    const board = await db.board.create({
      data: {
        label: body.label?.trim() || `الرقعة ${count + 1}`,
        cameraId: body.cameraId ?? null,
        corners: normalizeCorners(body.corners),
        tournament: body.tournament ?? 'بطولة النادي',
        roundLabel: body.roundLabel ?? `الجولة ${count + 1}`,
      },
    })
    return NextResponse.json({ ok: true, board })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
