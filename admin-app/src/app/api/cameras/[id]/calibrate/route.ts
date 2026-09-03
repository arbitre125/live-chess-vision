import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * حفظ معايرة الكاميرا: زوايا الرقعة الأربع
 * corners: [[x,y]×4] بالترتيب TL, TR, BR, BL (أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار)
 * تُحوَّل لاحقاً إلى homography في خدمة الرؤية على الراسبيري
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

    const camera = await db.camera.findUnique({ where: { id }, include: { board: true } })
    if (!camera || !camera.board) {
      return NextResponse.json({ ok: false, error: 'كاميرا غير موجودة أو بلا رقعة' }, { status: 404 })
    }

    const board = await db.board.update({
      where: { id: camera.board.id },
      data: {
        corners: JSON.stringify(corners),
        orientation: String(body.orientation ?? 'white-bottom'),
        diffThreshold: Number(body.diffThreshold ?? 0.18),
      },
    })

    // الكاميرا أصبحت جاهزة
    await db.camera.update({ where: { id }, data: { status: 'online', lastSeen: new Date() } })

    return NextResponse.json({ ok: true, board })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}

/** قراءة المعايرة الحالية */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const camera = await db.camera.findUnique({ where: { id }, include: { board: true } })
  if (!camera) return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 })
  return NextResponse.json({
    ok: true,
    corners: camera.board?.corners ? JSON.parse(camera.board.corners) : null,
    orientation: camera.board?.orientation ?? 'white-bottom',
    diffThreshold: camera.board?.diffThreshold ?? 0.18,
  })
}
