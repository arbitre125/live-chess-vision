# الربط مع موقع النادي (arbitre125/Home) 🔗

## نظرة عامة

نظام الكاميرات يكتب النقلات في ملف واحد بمستودع الموقع:

```
live-data/boards.json   ← يُحدَّث بعد كل مزامنة (يدوي أو تلقائي كل 30ث)
live-data/games/*.pgn   ← أرشيف PGN لكل لعبة منتهية
```

على الفرع: `feature/live-chess-games-sporting-ariana`

## صيغة `boards.json`

```json
{
  "source": "live-chess-vision",
  "club": "نادي سبورتينغ أريانة للشطرنج",
  "venue": "النادي — أريانة، تونس",
  "roundLabel": "الجولة 1",
  "updatedAt": "2026-09-03T17:30:00.000Z",
  "gamesCount": 2,
  "games": [
    {
      "id": "cmtlslqj20002pezfwx3tpdvp",
      "board": "الرقعة 1",
      "status": "live",
      "players": [
        { "name": "أنس المرابط", "rating": 2328, "title": "", "photo": "" },
        { "name": "ياسين بن عمر", "rating": 2294, "title": "", "photo": "" }
      ],
      "turn": 0,
      "moves": ["d3", "Nc6", "e4", "g6", "Be2"],
      "fen": "r1bqkbnr/pppppp1p/6p1/8/1n2P3/3P4/PPP1BPPP/RNBQK1NR w KQkq - 2 4",
      "lastMove": ["e2", "e4"],
      "resultText": "",
      "whiteWins": false
    }
  ]
}
```

> الحقول متوافقة عمداً مع `SerializedGame` / `GameSnapshot` في
> `src/data/liveGames.ts` بالمستودع — نفس الأسماء لنفس المعاني.

## قراءة البيانات في موقع Vue

أضف ملف `src/data/liveVision.ts` إلى مستودع الموقع:

```typescript
import { ref } from 'vue'
import type { GameSnapshot } from './liveGames'

const RAW_URL =
  'https://raw.githubusercontent.com/arbitre125/Home/' +
  'feature/live-chess-games-sporting-ariana/live-data/boards.json'

export const visionGames = ref<GameSnapshot[]>([])
export const visionUpdatedAt = ref<string>('')
let timer: number | undefined

/** جلب النقلات الحية من مستودع النادي كل 10 ثوان */
export function startVisionPolling(intervalMs = 10000): void {
  stopVisionPolling()
  const fetchOnce = async () => {
    try {
      const res = await fetch(`${RAW_URL}?t=${Date.now()}`)
      if (!res.ok) return
      const data = await res.json()
      visionGames.value = data.games.map(
        (g: {
          id: string
          status: string
          players: [{ name: string; rating: number }, { name: string; rating: number }]
          moves: string[]
          fen: string
          lastMove: [string, string] | null
          resultText: string
        }) => ({
          id: g.id,
          status: g.status as GameSnapshot['status'],
          players: [
            { name: g.players[0].name, rating: g.players[0].rating, title: '', photo: '/players/p01.png' },
            { name: g.players[1].name, rating: g.players[1].rating, title: '', photo: '/players/p02.png' },
          ],
          clocks: [0, 0],
          format: 'كلاسيكي',
          speed: 'كلاسيكي',
          opening: '',
          viewers: 0,
          turn: g.fen.split(' ')[1] === 'w' ? 0 : 1,
          sanHistory: g.moves,
          fen: g.fen,
          lastMove: g.lastMove,
          checkSquare: null,
          captured: ['', ''],
          evalCp: 0,
          moveKind: null,
          resultText: g.resultText,
          whiteWins: false,
          startsIn: 0,
        })
      )
      visionUpdatedAt.value = data.updatedAt
    } catch {
      /* الشبكة متقطعة — نجرب بعد قليل */
    }
  }
  fetchOnce()
  timer = window.setInterval(fetchOnce, intervalMs)
}

export function stopVisionPolling(): void {
  if (timer) window.clearInterval(timer)
  timer = undefined
}
```

ثم في مكوّن الألعاب الحية:

```typescript
import { visionGames, startVisionPolling } from '@/data/liveVision'

onMounted(() => startVisionPolling())
onUnmounted(() => stopVisionPolling())
```

## بدائل أسرع (اختياري مستقبلاً)

| الطريقة | الميزة | ملاحظة |
|---------|--------|--------|
| **GitHub Pages لملف JSON** | تجنب حدود raw.githubusercontent | كاش ~5 دقائق |
| **Cloudflare Pages/Workers** | تحديثات فورية | يتطلب نشر بسيط |
| **WebSocket مباشر من الراسبيري** | زمن حقيقي 0 | يتطلب فتح منفذ/نفق (Tailscale مثلاً) |

الحل الحالي (دفع عبر GitHub API + جلب خام كل 10 ثوان) هو الأبسط والأنسب لبدء التشغيل في النادي.
