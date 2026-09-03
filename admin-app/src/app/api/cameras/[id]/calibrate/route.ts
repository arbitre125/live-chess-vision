import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * حفظ معايرة رقعة داخل كاميرا (v2: عدة رقع لكل كاميرا)
 * body: { corners: [[x,y]×4], boardId?: string, orientation?, diffThreshold? }
 * corners بالترتيب h1, a1, a8, h8 (توافق مع خادم الرؤية) —
 * أو الترتيب القديم TL,TR,BR,BL يُقبل أيضاً (نفس البنية رباعية).
 * إذا لم يُرسل boardId تُعاير أول رقعة للكاميرا.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const corners = body.corners
    if (
      !Array.isArray(corners) ||
      corners.length !== 4 ||
      !corners.every((c: unknown) => Array.isArray(c) && c.length === 2)
    ) {
      return NextResponse.json(
        { ok: false, error: 'يجب إرسال 4 زوايا بصيغة [[x,y],[x,y],[x,y],[x,y]]' },
        { status: 400 }
      )
    }

    const camera = await db.camera.findUnique({ where: { id }, include: { boards: true } })
    if (!camera) {
      return NextResponse.json({ ok: false, error: 'كاميرا غير موجودة' }, { status: 404 })
    }

    const target =
      (body.boardId && camera.boards.find((b) => b.id === body.boardId)) ??
      camera.boards[0]

    if (!target) {
      return NextResponse.json(
        { ok: false, error: 'لا توجد رقعة مرتبطة — أنشئ رقعة أولاً أو استخدم الاكتشاف التلقائي' },
        { status: 404 }
      )
    }

    const board = await db.board.update({
      where: { id: target.id },
      data: {
        corners: JSON.stringify(corners),
        orientation: String(body.orientation ?? target.orientation),
        diffThreshold: Number(body.diffThreshold ?? target.diffThreshold),
      },
    })

    await db.camera.update({ where: { id }, data: { status: 'online', lastSeen: new Date() } })

    return NextResponse.json({ ok: true, board })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}

/** قراءة معايرة كل رقع الكاميرا */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const camera = await db.camera.findUnique({ where: { id }, include: { boards: true } })
  if (!camera) return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 })
  return NextResponse.json({
    ok: true,
    boards: camera.boards.map((b) => ({
      id: b.id,
      label: b.label,
      corners: b.corners ? JSON.parse(b.corners) : null,
      orientation: b.orientation,
      diffThreshold: b.diffThreshold,
    })),
  })
}
