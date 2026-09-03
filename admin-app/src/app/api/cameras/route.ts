import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** قائمة كل الكاميرات مع الرقع المرتبطة (v2: عدة رقع لكل كاميرا) */
export async function GET() {
  const cameras = await db.camera.findMany({
    include: { boards: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ ok: true, cameras })
}

/**
 * إضافة كاميرا (عقدة) جديدة.
 * في v2: boardLabel اختياري — اتركه فارغاً لإنشاء كاميرا بدون رقعة
 * (الرقع ستُكتشف تلقائياً لاحقاً أو تُضاف يدوياً).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ ok: false, error: 'اسم الكاميرا مطلوب' }, { status: 400 })

    const camera = await db.camera.create({
      data: {
        name,
        device: String(body.device ?? '0'),
        type: String(body.type ?? 'esp32'),
        streamUrl: body.streamUrl ? String(body.streamUrl) : null,
        width: Number(body.width ?? 1280),
        height: Number(body.height ?? 1024),
        fps: Number(body.fps ?? 2),
        enabled: body.enabled !== false,
      },
    })

    let board: unknown = null
    if (body.boardLabel?.trim()) {
      const count = await db.board.count()
      board = await db.board.create({
        data: {
          label: body.boardLabel.trim(),
          cameraId: camera.id,
          tournament: 'بطولة النادي',
          roundLabel: `الجولة ${count + 1}`,
        },
      })
    }

    return NextResponse.json({ ok: true, camera, board })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
