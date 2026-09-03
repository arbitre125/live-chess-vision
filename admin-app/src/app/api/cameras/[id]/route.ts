import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** تحديث إعدادات كاميرا */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = String(body.name)
    if (body.device !== undefined) data.device = String(body.device)
    if (body.type !== undefined) data.type = String(body.type)
    if (body.streamUrl !== undefined) data.streamUrl = body.streamUrl ? String(body.streamUrl) : null
    if (body.width !== undefined) data.width = Number(body.width)
    if (body.height !== undefined) data.height = Number(body.height)
    if (body.fps !== undefined) data.fps = Number(body.fps)
    if (body.batteryPct !== undefined) data.batteryPct = body.batteryPct === null ? null : Number(body.batteryPct)
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled)
    if (body.status !== undefined) data.status = String(body.status)

    const camera = await db.camera.update({ where: { id }, data })
    return NextResponse.json({ ok: true, camera })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}

/** حذف كاميرا (تبقى الرقعة بدون كاميرا) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.board.updateMany({ where: { cameraId: id }, data: { cameraId: null } })
    await db.camera.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
