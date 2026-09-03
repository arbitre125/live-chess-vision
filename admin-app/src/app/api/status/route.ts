import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncToGitHub } from '@/lib/github-sync'

export const dynamic = 'force-dynamic'

/** حالة النظام العامة — تُستدعى كل ثوانٍ من الواجهة */
export async function GET() {
  try {
    const [cameras, boards, settings] = await Promise.all([
      db.camera.findMany({ include: { board: true } }),
      db.board.findMany(),
      db.settings.findUnique({ where: { id: 'main' } }),
    ])

    const online = cameras.filter((c) => c.status === 'online' || c.status === 'detecting').length
    const liveBoards = boards.filter((b) => b.status === 'live').length
    const since = new Date(Date.now() - 24 * 3600 * 1000)
    const moves24h = await db.move.count({ where: { createdAt: { gte: since } } })

    // مزامنة تلقائية إذا فُعّلت وحان وقتها
    let autoSyncNote = ''
    if (settings?.autoPush && settings.githubToken) {
      const last = settings.lastSyncAt?.getTime() ?? 0
      if (Date.now() - last > settings.pushIntervalSec * 1000) {
        const r = await syncToGitHub()
        autoSyncNote = r.ok ? 'مزامنة تلقائية تمت' : `فشل تلقائي: ${r.message}`
      }
    }

    return NextResponse.json({
      ok: true,
      cameras: { total: cameras.length, online },
      boards: { total: boards.length, live: liveBoards },
      moves24h,
      sync: {
        auto: settings?.autoPush ?? false,
        lastSyncAt: settings?.lastSyncAt,
        status: settings?.lastSyncStatus,
        message: autoSyncNote || settings?.lastSyncMessage || '',
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
