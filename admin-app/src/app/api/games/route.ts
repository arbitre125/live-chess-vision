import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** أرشيف الألعاب المكتملة والجارية */
export async function GET() {
  const games = await db.game.findMany({
    include: { board: { select: { label: true } } },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ ok: true, games })
}
