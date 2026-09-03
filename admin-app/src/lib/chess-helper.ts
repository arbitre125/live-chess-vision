/**
 * منطق الشطرنج — التحقق من النقلات وتوليد FEN و PGN
 * Chess logic — move validation, FEN/PGN generation
 * يعتمد على chess.js وهو نفس المكتبة المستخدمة في موقع النادي
 */
import { Chess } from 'chess.js'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface MoveResult {
  ok: boolean
  san?: string
  fen?: string
  from?: string
  to?: string
  error?: string
  isCheck?: boolean
  isMate?: boolean
  isCapture?: boolean
  isCastle?: boolean
  isPromotion?: boolean
}

/** تجربة تطبيق نقلة على وضع FEN مع التحقق من شرعيتها */
export function tryMove(fen: string, from: string, to: string, promotion?: string): MoveResult {
  try {
    const game = new Chess(fen)
    const mv = game.move({ from, to, promotion: promotion ?? 'q' })
    if (!mv) {
      return { ok: false, error: 'نقلة غير قانونية' }
    }
    return {
      ok: true,
      san: mv.san,
      fen: game.fen(),
      from: mv.from,
      to: mv.to,
      isCheck: game.isCheck(),
      isMate: game.isCheckmate(),
      isCapture: Boolean(mv.captured),
      isCastle: mv.flags.includes('k') || mv.flags.includes('q'),
      isPromotion: Boolean(mv.promotion),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'خطأ غير معروف' }
  }
}

/** تطبيق نقلة بصيغة SAN (مثلاً "Nf3") */
export function tryMoveSan(fen: string, san: string): MoveResult {
  try {
    const game = new Chess(fen)
    const mv = game.move(san)
    if (!mv) return { ok: false, error: 'نقلة غير قانونية' }
    return {
      ok: true,
      san: mv.san,
      fen: game.fen(),
      from: mv.from,
      to: mv.to,
      isCheck: game.isCheck(),
      isMate: game.isCheckmate(),
      isCapture: Boolean(mv.captured),
      isCastle: mv.flags.includes('k') || mv.flags.includes('q'),
      isPromotion: Boolean(mv.promotion),
    }
  } catch {
    return { ok: false, error: 'نقلة غير قانونية' }
  }
}

/** توليد PGN كامل من قائمة نقلات مع معلومات اللاعبين */
export function buildPgn(opts: {
  moves: string[]
  white: string
  black: string
  result?: string
  event?: string
  site?: string
  round?: string
  date?: Date
  startFen?: string
}): string {
  const { moves, white, black, result = '*', event, site, round, date, startFen } = opts
  const d = date ?? new Date()
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

  const headers = [
    `[Event "${event ?? 'بطولة النادي'}"]`,
    `[Site "${site ?? 'Tunis, Tunisia'}"]`,
    `[Date "${dateStr}"]`,
    `[Round "${round ?? '1'}"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
  ]
  if (startFen && startFen !== START_FEN) {
    headers.push(`[SetUp "1"]`, `[FEN "${startFen}"]`)
  }

  // ترقيم النقلات
  let body = ''
  let moveNo = 1
  let isWhiteTurn = startFen?.split(' ')[1] !== 'b'
  for (const san of moves) {
    if (isWhiteTurn) {
      body += `${moveNo}. ${san} `
    } else {
      body += `${san} `
      moveNo++
    }
    isWhiteTurn = !isWhiteTurn
  }
  body += result
  return headers.join('\n') + '\n\n' + body.trim() + '\n'
}

/** تحليل FEN إلى شبكة 8×8 من المربعات (للعرض) */
export interface SquareInfo {
  square: string
  piece: string | null // 'K','Q','R','B','N','P' (أبيض) أو أحرف صغيرة (أسود)
  color: 'w' | 'b' | null
}

export function parseFen(fen: string): SquareInfo[] {
  const squares: SquareInfo[] = []
  const rows = fen.split(' ')[0].split('/')
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch); i++) {
          const rank = 8 - r
          squares.push({ square: `${files[file]}${rank}`, piece: null, color: null })
          file++
        }
      } else {
        const rank = 8 - r
        squares.push({
          square: `${files[file]}${rank}`,
          piece: ch,
          color: ch === ch.toUpperCase() ? 'w' : 'b',
        })
        file++
      }
    }
  }
  return squares
}

/** من هو الدور الحالي؟ 'w' | 'b' */
export function currentTurn(fen: string): 'w' | 'b' {
  return (fen.split(' ')[1] ?? 'w') as 'w' | 'b'
}

/** نص النتيجة النهائية من وضع FEN */
export function gameResultText(fen: string): string | null {
  try {
    const g = new Chess(fen)
    if (g.isCheckmate()) return currentTurn(fen) === 'w' ? '0-1' : '1-0'
    if (g.isDraw() || g.isStalemate() || g.isInsufficientMaterial() || g.isThreefoldRepetition())
      return '1/2-1/2'
    return null
  } catch {
    return null
  }
}

/** حرف من مربع الترقية المستنتج من اختفاء بيدق في الصف الأخير */
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
