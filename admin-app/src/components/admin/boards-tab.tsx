'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { ChessBoardMini } from '@/components/chess-board'
import { useI18n } from '@/components/language-provider'
import {
  Play,
  Square,
  RotateCcw,
  Dices,
  Copy,
  Flag,
  Loader2,
  Crown,
} from 'lucide-react'
import type { BoardInfo } from '@/lib/types'

interface BoardsTabProps {
  boards: BoardInfo[]
  onChange: () => void
}

/** تجميع النقلات في أزواج: 1. e4 e5 */
function movePairs(moves: string[]): { no: number; white: string; black?: string }[] {
  const pairs: { no: number; white: string; black?: string }[] = []
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ no: i / 2 + 1, white: moves[i], black: moves[i + 1] })
  }
  return pairs
}

export function BoardsTab({ boards, onChange }: BoardsTabProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [autoSim, setAutoSim] = useState(false)

  useEffect(() => {
    if (!selectedId && boards.length > 0) setSelectedId(boards[0].id)
  }, [boards, selectedId])

  const board = useMemo(
    () => boards.find((b) => b.id === selectedId) ?? boards[0],
    [boards, selectedId]
  )

  // محاكاة تلقائية للعرض التجريبي (بدون كاميرات حقيقية)
  useEffect(() => {
    if (!autoSim || !board) return
    const iv = setInterval(async () => {
      if (document.hidden) return
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id }),
      }).catch(() => {})
      onChange()
    }, 2500)
    return () => clearInterval(iv)
  }, [autoSim, board?.id, onChange])

  if (!board) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">{t('bd.noBoards')}</CardContent>
      </Card>
    )
  }

  const moves: string[] = JSON.parse(board.moves || '[]')
  const pairs = movePairs(moves)

  async function patchBoard(payload: Record<string, unknown>, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({ title: successMsg })
      onChange()
    } catch (e) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function simulateOnce() {
    setBusy(true)
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast({
        title: t('bd.simMove', { m: json.move?.san ?? '' }),
        description: t('bd.testMoveDesc'),
      })
      onChange()
    } catch (e) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function copyPgn() {
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()
      const game = json.payload?.games?.find((g: { id: string }) => g.id === board.id)
      const movesList: string[] = game?.moves ?? moves
      let pgn = ''
      movesList.forEach((m, i) => {
        if (i % 2 === 0) pgn += `${i / 2 + 1}. `
        pgn += `${m} `
      })
      await navigator.clipboard.writeText(pgn.trim() || t('bd.noMovesYet'))
      toast({ title: t('bd.pgnCopied') })
    } catch {
      toast({ title: t('bd.copyFail'), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      {/* اختيار الرقعة */}
      {boards.length > 1 && (
        <Tabs value={selectedId} onValueChange={setSelectedId}>
          <TabsList className="h-auto flex-wrap">
            {boards.map((b) => (
              <TabsTrigger key={b.id} value={b.id} className="gap-1.5">
                {b.label}
                {b.status === 'live' && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
        {/* اللوح واللاعبون */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-emerald-600" />
                {board.label}
              </span>
              <Badge
                variant={board.status === 'live' ? 'default' : 'secondary'}
                className={board.status === 'live' ? 'bg-emerald-600' : ''}
              >
                {t(`boardstatus.${board.status}`)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChessBoardMini
              fen={board.fen}
              size={300}
              highlight={board.lastMoveFrom && board.lastMoveTo ? [board.lastMoveFrom, board.lastMoveTo] : null}
              className="mx-auto"
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('bd.white')}</Label>
                <Input
                  className="h-8 text-sm"
                  defaultValue={board.whitePlayer}
                  onBlur={(e) => e.target.value !== board.whitePlayer && patchBoard({ whitePlayer: e.target.value }, t('bd.playerUpdated'))}
                />
                <Input
                  className="h-8 text-xs"
                  dir="ltr"
                  defaultValue={board.whiteRating || ''}
                  placeholder={t('bd.rating')}
                  onBlur={(e) => patchBoard({ whiteRating: Number(e.target.value) || 0 }, t('bd.ratingUpdated'))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('bd.black')}</Label>
                <Input
                  className="h-8 text-sm"
                  defaultValue={board.blackPlayer}
                  onBlur={(e) => e.target.value !== board.blackPlayer && patchBoard({ blackPlayer: e.target.value }, t('bd.playerUpdated'))}
                />
                <Input
                  className="h-8 text-xs"
                  dir="ltr"
                  defaultValue={board.blackRating || ''}
                  placeholder={t('bd.rating')}
                  onBlur={(e) => patchBoard({ blackRating: Number(e.target.value) || 0 }, t('bd.ratingUpdated'))}
                />
              </div>
            </div>

            <Separator />

            {/* أزرار التحكم */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={busy}
                onClick={() => patchBoard({ action: 'start', resetGame: true }, t('bd.started'))}
              >
                <Play className="h-4 w-4 ml-1" />
                {t('bd.start')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const r = prompt(t('bd.finishPrompt'), '1-0')
                  if (r) patchBoard({ action: 'finish', result: r }, t('bd.archived'))
                }}
              >
                <Flag className="h-4 w-4 ml-1" />
                {t('bd.finish')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => patchBoard({ action: 'reset' }, t('bd.resetDone'))}>
                <RotateCcw className="h-4 w-4 ml-1" />
                {t('bd.reset')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={simulateOnce}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Dices className="h-4 w-4 ml-1" />}
                {t('bd.testMove')}
              </Button>
            </div>

            <Button
              size="sm"
              variant={autoSim ? 'default' : 'outline'}
              className={`w-full ${autoSim ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
              onClick={() => setAutoSim((v) => !v)}
            >
              <Square className="h-4 w-4 ml-1" />
              {autoSim ? t('bd.stopAutoSim') : t('bd.autoSim')}
            </Button>
          </CardContent>
        </Card>

        {/* النقلات والتفاصيل */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('bd.movesLog', { n: moves.length })}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 rounded-md border p-3">
                {pairs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t('bd.noMoves')}</p>
                ) : (
                  <div dir="ltr" className="grid grid-cols-[3rem_1fr_1fr] gap-y-1 font-mono text-sm">
                    {pairs.map((p) => (
                      <div key={p.no} className="contents">
                        <span className="text-muted-foreground">{p.no}.</span>
                        <span className="font-semibold">{p.white}</span>
                        <span className="font-semibold">{p.black ?? ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={copyPgn}>
                  <Copy className="h-4 w-4 ml-1" />
                  {t('bd.copyPgn')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('bd.fen')}</CardTitle>
            </CardHeader>
            <CardContent>
              <code dir="ltr" className="block break-all rounded-md bg-muted p-3 font-mono text-xs">
                {board.fen}
              </code>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <span className="text-muted-foreground">{t('bd.tournament')}</span>
                  <Input
                    className="h-8 w-40 text-sm"
                    defaultValue={board.tournament}
                    onBlur={(e) => e.target.value !== board.tournament && patchBoard({ tournament: e.target.value }, t('bd.tournamentUpdated'))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <span className="text-muted-foreground">{t('bd.round')}</span>
                  <Input
                    className="h-8 w-32 text-sm"
                    defaultValue={board.roundLabel}
                    onBlur={(e) => e.target.value !== board.roundLabel && patchBoard({ roundLabel: e.target.value }, t('bd.roundUpdated'))}
                  />
                </div>
              </div>
              {board.result && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center font-bold text-emerald-800">
                  {t('bd.result', { r: board.result })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
