'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChessBoardMini } from '@/components/chess-board'
import { Camera, Radio, Zap, CloudUpload, Info, CircleCheck, CircleAlert } from 'lucide-react'
import type { BoardInfo, SystemStatus } from '@/lib/types'
import { useI18n } from '@/components/language-provider'

interface DashboardTabProps {
  status: SystemStatus | null
  boards: BoardInfo[]
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent: string
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardTab({ status, boards }: DashboardTabProps) {
  const { t } = useI18n()
  const liveBoards = boards.filter((b) => b.status === 'live')
  const shown = liveBoards.length > 0 ? liveBoards : boards

  return (
    <div className="space-y-6">
      {/* بطاقات الإحصاء */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Camera className="h-6 w-6" />}
          label={t('dash.stat.cameras')}
          value={`${status?.cameras.online ?? 0} / ${status?.cameras.total ?? 0}`}
          sub={t('dash.stat.camerasSub')}
          accent="#059669"
        />
        <StatCard
          icon={<Radio className="h-6 w-6" />}
          label={t('dash.stat.boards')}
          value={status?.boards.live ?? 0}
          sub={t('dash.stat.boardsSub', { n: status?.boards.total ?? 0 })}
          accent="#b45309"
        />
        <StatCard
          icon={<Zap className="h-6 w-6" />}
          label={t('dash.stat.moves')}
          value={status?.moves24h ?? 0}
          sub={t('dash.stat.movesSub')}
          accent="#7c3aed"
        />
        <StatCard
          icon={<CloudUpload className="h-6 w-6" />}
          label={t('dash.stat.sync')}
          value={
            status?.sync.status === 'success' ? t('dash.sync.ok') : status?.sync.status === 'error' ? t('dash.sync.err') : '—'
          }
          sub={status?.sync.auto ? t('dash.sync.autoOn') : t('dash.sync.autoOff')}
          accent={status?.sync.status === 'error' ? '#dc2626' : '#0f766e'}
        />
      </div>

      {/* الرقع الحية */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radio className="h-5 w-5 text-emerald-600" />
            {liveBoards.length > 0 ? t('dash.liveGames') : t('dash.preparedBoards')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              {t('dash.emptyBoards')}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((b) => {
                const moves: string[] = JSON.parse(b.moves || '[]')
                return (
                  <div key={b.id} className="space-y-2 rounded-xl border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{b.label}</span>
                      <Badge
                        variant={b.status === 'live' ? 'default' : 'secondary'}
                        className={b.status === 'live' ? 'bg-emerald-600' : ''}
                      >
                        {b.status === 'live' ? t('dash.live') : t('boardstatus.idle')}
                      </Badge>
                    </div>
                    <ChessBoardMini
                      fen={b.fen}
                      size={210}
                      highlight={b.lastMoveFrom && b.lastMoveTo ? [b.lastMoveFrom, b.lastMoveTo] : null}
                      className="mx-auto"
                    />
                    <div className="space-y-0.5 text-center text-xs">
                      <div className="truncate font-medium">
                        ♔ {b.whitePlayer}
                        {b.whiteRating ? ` (${b.whiteRating})` : ''}
                      </div>
                      <div className="truncate font-medium">
                        ♚ {b.blackPlayer}
                        {b.blackRating ? ` (${b.blackRating})` : ''}
                      </div>
                    </div>
                    {moves.length > 0 && (
                      <div dir="ltr" className="text-center text-xs text-muted-foreground">
                        {t('dash.lastMoves', { m: moves.slice(-4).join(' ') })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* كيف يعمل النظام */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5 text-emerald-600" />
            {t('dash.how.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <li key={n} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {n}
                </span>
                <span className="leading-relaxed">{t(`dash.how.${n}`)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {status?.sync.status === 'error' ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{status?.sync.message || t('dash.waitingSync')}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
