import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Chess } from 'chess.js'

export const dynamic = 'force-dynamic'

/**
 * محاكاة نقلة — للاختبار والتجربة بدون كاميرات حقيقية
 * على الراسبيري الحقيقية تستبدل هذه الوظيفة بخدمة الرؤية (vision-service)
 * التي ترسل النقلات إلى /api/boards/[id]/move
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const boardId = String(body.boardId ?? '')
    const board = await db.board.findUnique({ where: { id: boardId } })
    if (!board) return NextResponse.json({ ok: false, error: 'رقعة غير موجودة' }, { status: 404 })

    // اختيار نقلة قانونية عشوائية (يفضل التقتيل إن وجد)
    const game = new Chess(board.fen)
    const allMoves = game.moves({ verbose: true })
    if (allMoves.length === 0) {
      return NextResponse.json({ ok: false, error: 'لا توجد نقلات ممكنة (انتهت اللعبة)' }, { status: 422 })
    }
    const captures = allMoves.filter((m) => m.captured)
    const pool = captures.length > 0 && Math.random() < 0.4 ? captures : allMoves
    const chosen = pool[Math.floor(Math.random() * pool.length)]

    // تطبيق النقلة عبر نفس مسار API الحقيقي
    const res = await fetch(`${new URL(req.url).origin}/api/boards/${boardId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: chosen.from,
        to: chosen.to,
        promotion: chosen.promotion,
        confidence: 0.85 + Math.random() * 0.14,
        source: 'simulate',
      }),
    })
    const json = await res.json()
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
