'use client'

/**
 * لوح شطرنج مصغر — يعرض وضع FEN كشبكة 8×8
 * يستخدم رموز القطع يونيكود (لا يحتاج صور خارجية — يعمل على الراسبيري بدون إنترنت)
 */

export const PIECE_GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

interface ChessBoardMiniProps {
  fen: string
  size?: number
  flipped?: boolean // عرض من منظور الأسود
  highlight?: [string, string] | null // [from, to]
  className?: string
}

export function parseFenToMap(fen: string): Record<string, string> {
  const map: Record<string, string> = {}
  const rows = fen.split(' ')[0]?.split('/') ?? []
  rows.forEach((row, r) => {
    let file = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += parseInt(ch)
      } else {
        const rank = 8 - r
        map[`${FILES[file]}${rank}`] = ch
        file++
      }
    }
  })
  return map
}

export function ChessBoardMini({
  fen,
  size = 260,
  flipped = false,
  highlight = null,
  className = '',
}: ChessBoardMiniProps) {
  const pieces = parseFenToMap(fen)
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]
  const files = flipped ? [...FILES].reverse() : FILES

  const squareColor = (file: string, rank: number) =>
    (FILES.indexOf(file) + rank) % 2 === 0 ? '#f0d9b5' : '#b58863'

  return (
    <div
      dir="ltr"
      className={`select-none rounded-md overflow-hidden shadow-md ring-1 ring-black/20 ${className}`}
      style={{ width: size, height: size, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}
      role="img"
      aria-label="لوح الشطرنج الحالي"
    >
      {ranks.map((rank) =>
        files.map((file) => {
          const sq = `${file}${rank}`
          const piece = pieces[sq]
          const isHighlight = highlight && (highlight[0] === sq || highlight[1] === sq)
          return (
            <div
              key={sq}
              className="relative flex items-center justify-center"
              style={{ background: squareColor(file, rank) }}
            >
              {isHighlight && (
                <div className="absolute inset-0" style={{ background: 'rgba(255, 213, 79, 0.55)' }} />
              )}
              {piece && (
                <span
                  className="relative z-10 leading-none"
                  style={{
                    fontSize: size / 11,
                    color: piece === piece.toUpperCase() ? '#fff' : '#1a1a1a',
                    textShadow:
                      piece === piece.toUpperCase()
                        ? '0 0 2px #000, 0 1px 1px #000'
                        : '0 0 1px rgba(255,255,255,0.4)',
                    transform: 'translateY(-4%)',
                  }}
                >
                  {PIECE_GLYPHS[piece]}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
