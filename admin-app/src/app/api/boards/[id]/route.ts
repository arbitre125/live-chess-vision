import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildPgn } from '@/lib/chess-helper'

export const dynamic = 'force-dynamic'

/** تفاصيل رقعة مع نقلاتها */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const board = await db.board.findUnique({
    where: { id },
    include: {
      camera: { select: { id: true, name: true, status: true } },
      movesHistory: { orderBy: { moveNumber: 'asc' }, take: 100 },
    },
  })
  if (!board) return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 })
  return NextResponse.json({ ok: true, board })
}

/** تحديث بيانات الرقعة: اللاعبون، البطولة، الحالة، أو تصفير */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.label !== undefined) data.label = String(body.label)
    if (body.whitePlayer !== undefined) data.whitePlayer = String(body.whitePlayer)
    if (body.whiteRating !== undefined) data.whiteRating = Number(body.whiteRating)
    if (body.blackPlayer !== undefined) data.blackPlayer = String(body.blackPlayer)
    if (body.blackRating !== undefined) data.blackRating = Number(body.blackRating)
    if (body.tournament !== undefined) data.tournament = String(body.tournament)
    if (body.roundLabel !== undefined) data.roundLabel = String(body.roundLabel)
    if (body.diffThreshold !== undefined) data.diffThreshold = Number(body.diffThreshold)
    if (body.orientation !== undefined) data.orientation = String(body.orientation)
    if (body.result !== undefined) data.result = String(body.result)

    if (body.action === 'reset') {
      data.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      data.moves = '[]'
      data.status = 'idle'
      data.lastMoveFrom = null
      data.lastMoveTo = null
      data.result = null
    }

    if (body.action === 'finish') {
      const board = await db.board.findUnique({ where: { id } })
      if (!board) return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 })
      const moves: string[] = JSON.parse(board.moves || '[]')
      const result = body.result ?? board.result ?? '*'
      data.status = 'finished'
      data.result = result
      // أرشفة اللعبة
      await db.game.create({
        data: {
          boardId: id,
          moves: board.moves,
          pgn: buildPgn({
            moves,
            white: board.whitePlayer,
            black: board.blackPlayer,
            result,
            event: board.tournament,
            round: board.roundLabel,
          }),
          result,
          whitePlayer: board.whitePlayer,
          blackPlayer: board.blackPlayer,
          finishedAt: new Date(),
        },
      })
    }

    if (body.action === 'start') {
      data.status = 'live'
      if (body.resetGame) {
        data.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        data.moves = '[]'
        data.lastMoveFrom = null
        data.lastMoveTo = null
        data.result = null
      }
    }

    const board = await db.board.update({ where: { id }, data })
    return NextResponse.json({ ok: true, board })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.board.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'غير موجودة' }, { status: 404 })
  }
}
