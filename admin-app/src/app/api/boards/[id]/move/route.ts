import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tryMove, gameResultText } from '@/lib/chess-helper'

export const dynamic = 'force-dynamic'

/**
 * استقبال نقلة من خدمة الرؤية (أو من المشرف يدوياً)
 * Body: { from: "e2", to: "e4", promotion?: "q", confidence?: number, source?: "vision"|"manual" }
 * الخدمة على الراسبيري ترسلها تلقائياً بعد اكتشاف الفرق بين الإطارين
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const from = String(body.from ?? '')
    const to = String(body.to ?? '')
    if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
      return NextResponse.json({ ok: false, error: 'مربعات غير صالحة' }, { status: 400 })
    }

    const board = await db.board.findUnique({ where: { id } })
    if (!board) return NextResponse.json({ ok: false, error: 'رقعة غير موجودة' }, { status: 404 })

    const result = tryMove(board.fen, from, to, body.promotion)
    if (!result.ok || !result.san || !result.fen) {
      return NextResponse.json({ ok: false, error: result.error ?? 'نقلة مرفوضة' }, { status: 422 })
    }

    const moves: string[] = JSON.parse(board.moves || '[]')
    moves.push(result.san)

    // رقم النقلة = عدد النقلات + 1
    const moveNumber = moves.length
    const autoResult = gameResultText(result.fen)

    const [updatedBoard, move] = await Promise.all([
      db.board.update({
        where: { id },
        data: {
          fen: result.fen,
          moves: JSON.stringify(moves),
          lastMoveFrom: result.from ?? from,
          lastMoveTo: result.to ?? to,
          status: board.status === 'idle' ? 'live' : board.status,
          result: result.isMate ? (result.fen.split(' ')[1] === 'w' ? '0-1' : '1-0') : board.result,
        },
      }),
      db.move.create({
        data: {
          boardId: id,
          moveNumber,
          san: result.san,
          fromSq: from,
          toSq: to,
          fenAfter: result.fen,
          confidence: Number(body.confidence ?? 1),
          source: String(body.source ?? 'vision'),
        },
      }),
    ])

    return NextResponse.json({
      ok: true,
      move,
      board: updatedBoard,
      flags: {
        check: result.isCheck,
        mate: result.isMate,
        capture: result.isCapture,
        castle: result.isCastle,
        promotion: result.isPromotion,
        autoResult,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
