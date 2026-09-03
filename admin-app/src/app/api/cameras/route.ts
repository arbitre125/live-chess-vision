import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** قائمة كل الكاميرات مع الرقعة المرتبطة */
export async function GET() {
  const cameras = await db.camera.findMany({
    include: { board: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ ok: true, cameras })
}

/** إضافة كاميرا جديدة + رقعة مرتبطة تلقائياً */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ ok: false, error: 'اسم الكاميرا مطلوب' }, { status: 400 })

    const camera = await db.camera.create({
      data: {
        name,
        device: String(body.device ?? '0'),
        type: String(body.type ?? 'picamera2'),
        width: Number(body.width ?? 1280),
        height: Number(body.height ?? 720),
        fps: Number(body.fps ?? 2),
        enabled: body.enabled !== false,
      },
    })

    const count = await db.board.count()
    const board = await db.board.create({
      data: {
        label: body.boardLabel?.trim() || `الرقعة ${count + 1}`,
        cameraId: camera.id,
        tournament: 'بطولة النادي',
        roundLabel: `الجولة ${count + 1}`,
      },
    })

    return NextResponse.json({ ok: true, camera, board })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
