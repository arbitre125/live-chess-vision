/**
 * مزامنة GitHub — دفع بيانات النقلات الحية إلى مستودع موقع النادي
 * GitHub Sync — push live move data to the club site repository
 *
 * الصيغة المرسومة متوافقة مع أنواع SerializedGame / GameSnapshot
 * في ملف src/data/liveGames.ts بمستودع arbitre125/Home
 */
import { db } from '@/lib/db'
import { buildPgn } from '@/lib/chess-helper'

export interface SyncResult {
  ok: boolean
  message: string
  sha?: string
  commitUrl?: string
}

interface BoardPayloadGame {
  id: string
  board: string
  status: 'live' | 'idle' | 'finished'
  players: { name: string; rating: number; title: string; photo: string }[]
  clocks: [number, number]
  format: string
  speed: string
  opening: string
  viewers: number
  turn: 0 | 1
  moves: string[]
  fen: string
  lastMove: [string, string] | null
  checkSquare: string | null
  captured: [string, string]
  evalCp: number
  moveKind: string | null
  resultText: string
  whiteWins: boolean
}

/** بناء حمولة JSON متوافقة مع موقع النادي */
export async function buildLivePayload(): Promise<Record<string, unknown>> {
  const settings = await db.settings.findUnique({ where: { id: 'main' } })
  const boards = await db.board.findMany({
    include: { camera: true },
    orderBy: { label: 'asc' },
  })

  const games: BoardPayloadGame[] = boards.map((b) => {
    const moves: string[] = JSON.parse(b.moves || '[]')
    const turnIsWhite = b.fen.split(' ')[1] === 'w'
    const finished = b.status === 'finished'
    return {
      id: b.id,
      board: b.label,
      status: finished ? 'finished' : b.status === 'live' ? 'live' : 'idle',
      players: [
        {
          name: b.whitePlayer,
          rating: b.whiteRating,
          title: '',
          photo: '',
        },
        {
          name: b.blackPlayer,
          rating: b.blackRating,
          title: '',
          photo: '',
        },
      ],
      clocks: [0, 0],
      format: 'كلاسيكي',
      speed: 'كلاسيكي',
      opening: '',
      viewers: 0,
      turn: turnIsWhite ? 0 : 1,
      moves,
      fen: b.fen,
      lastMove:
        b.lastMoveFrom && b.lastMoveTo ? ([b.lastMoveFrom, b.lastMoveTo] as [string, string]) : null,
      checkSquare: null,
      captured: ['', ''],
      evalCp: 0,
      moveKind: null,
      resultText: finished ? (b.result ?? '*') : '',
      whiteWins: false,
    }
  })

  return {
    source: 'live-chess-vision',
    club: settings?.clubName ?? 'نادي سبورتينغ أريانة للشطرنج',
    venue: 'النادي — أريانة، تونس',
    roundLabel: boards[0]?.roundLabel ?? 'الجولة 1',
    updatedAt: new Date().toISOString(),
    gamesCount: games.length,
    games,
  }
}

const API = 'https://api.github.com'

/** قراءة SHA للملف الحالي (إن وجد) في الفرع المطلوب */
async function getFileSha(
  token: string,
  repo: string,
  branch: string,
  path: string
): Promise<string | null> {
  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { sha?: string }
  return json.sha ?? null
}

/** إنشاء أو تحديث ملف في المستودع */
async function putFile(
  token: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
  sha: string | null
): Promise<{ sha: string; html_url?: string }> {
  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(path)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { content?: { sha?: string; html_url?: string } }
  return { sha: json.content?.sha ?? '', html_url: json.content?.html_url }
}

/** الدفع الرئيسي: ملف JSON للنقلات الحية + ملفات PGN للألعاب المكتملة */
export async function syncToGitHub(force = false): Promise<SyncResult> {
  const settings = await db.settings.findUnique({ where: { id: 'main' } })
  if (!settings || !settings.githubToken) {
    return { ok: false, message: 'لم يتم ضبط توكن GitHub في الإعدادات بعد' }
  }
  const { githubToken: token, githubRepo: repo, githubBranch: branch, githubDataPath: path } = settings

  try {
    // 1) ملف JSON الحي
    const payload = await buildLivePayload()
    const jsonContent = JSON.stringify(payload, null, 2)
    const sha = await getFileSha(token, repo, branch, path)
    const commitMsg = `♟️ تحديث النقلات الحية — ${payload.gamesCount} رقعة (${new Date().toISOString()})`
    const put = await putFile(token, repo, branch, path, jsonContent, commitMsg, sha)

    // 2) ملفات PGN للألعاب المكتملة التي لم تُدفع بعد
    let pgnPushed = 0
    const finished = await db.game.findMany({
      where: { finishedAt: { not: null }, pgn: { not: '' } },
      include: { board: true },
      orderBy: { finishedAt: 'desc' },
      take: 10,
    })
    for (const g of finished) {
      const pgnPath = `live-data/games/${g.id}.pgn`
      try {
        const pgnSha = await getFileSha(token, repo, branch, pgnPath)
        if (pgnSha) continue // موجودة بالفعل
        await putFile(
          token,
          repo,
          branch,
          pgnPath,
          g.pgn,
          `♟️ أرشيف PGN: ${g.whitePlayer} ضد ${g.blackPlayer} (${g.result ?? '*'})`,
          null
        )
        pgnPushed++
      } catch {
        // لا نوقف الدفع كله بسبب ملف PGN واحد
      }
    }

    await db.settings.update({
      where: { id: 'main' },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncMessage: `تم الدفع بنجاح${pgnPushed ? ` + ${pgnPushed} ملف PGN` : ''}`,
      },
    })

    return {
      ok: true,
      message: `تم دفع البيانات إلى ${repo}@${branch}${pgnPushed ? ` مع ${pgnPushed} ملف PGN` : ''}`,
      sha: put.sha,
      commitUrl: put.html_url,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير معروف'
    await db.settings
      .update({
        where: { id: 'main' },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'error', lastSyncMessage: msg },
      })
      .catch(() => {})
    return { ok: false, message: `فشل الدفع: ${msg}` }
  }
}
