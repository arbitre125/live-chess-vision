'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChessBoardMini } from '@/components/chess-board'
import { Camera, Radio, Zap, CloudUpload, Info, CircleCheck, CircleAlert } from 'lucide-react'
import type { BoardInfo, SystemStatus } from '@/lib/types'

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
      <CardContent className="p-5 flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardTab({ status, boards }: DashboardTabProps) {
  const liveBoards = boards.filter((b) => b.status === 'live')
  const shown = liveBoards.length > 0 ? liveBoards : boards

  return (
    <div className="space-y-6">
      {/* بطاقات الإحصاء */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Camera className="h-6 w-6" />}
          label="الكاميرات المتصلة"
          value={`${status?.cameras.online ?? 0} / ${status?.cameras.total ?? 0}`}
          sub="كاميرا راسبيري CSI أو USB"
          accent="#059669"
        />
        <StatCard
          icon={<Radio className="h-6 w-6" />}
          label="الرقع المباشرة الآن"
          value={status?.boards.live ?? 0}
          sub={`من أصل ${status?.boards.total ?? 0} رقعة مهيأة`}
          accent="#b45309"
        />
        <StatCard
          icon={<Zap className="h-6 w-6" />}
          label="النقلات خلال 24 ساعة"
          value={status?.moves24h ?? 0}
          sub="نقلات مكتشفة ومتحقق منها"
          accent="#7c3aed"
        />
        <StatCard
          icon={<CloudUpload className="h-6 w-6" />}
          label="المزامنة مع GitHub"
          value={
            status?.sync.status === 'success' ? 'سليمة' : status?.sync.status === 'error' ? 'خطأ' : '—'
          }
          sub={status?.sync.auto ? 'دفع تلقائي مفعّل' : 'دفع يدوي فقط'}
          accent={status?.sync.status === 'error' ? '#dc2626' : '#0f766e'}
        />
      </div>

      {/* الرقع الحية */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-600" />
            {liveBoards.length > 0 ? 'الألعاب المباشرة' : 'الرقع المهيأة'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              لا توجد رقع بعد — أضف كاميرا من تبويب «الكاميرات» لتبدأ
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((b) => {
                const moves: string[] = JSON.parse(b.moves || '[]')
                return (
                  <div key={b.id} className="rounded-xl border p-3 space-y-2 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{b.label}</span>
                      <Badge
                        variant={b.status === 'live' ? 'default' : 'secondary'}
                        className={b.status === 'live' ? 'bg-emerald-600' : ''}
                      >
                        {b.status === 'live' ? '● مباشر' : 'مستمرة'}
                      </Badge>
                    </div>
                    <ChessBoardMini
                      fen={b.fen}
                      size={210}
                      highlight={b.lastMoveFrom && b.lastMoveTo ? [b.lastMoveFrom, b.lastMoveTo] : null}
                      className="mx-auto"
                    />
                    <div className="text-xs space-y-0.5 text-center">
                      <div className="font-medium truncate">
                        ♔ {b.whitePlayer}
                        {b.whiteRating ? ` (${b.whiteRating})` : ''}
                      </div>
                      <div className="font-medium truncate">
                        ♚ {b.blackPlayer}
                        {b.blackRating ? ` (${b.blackRating})` : ''}
                      </div>
                    </div>
                    {moves.length > 0 && (
                      <div className="text-center text-xs text-muted-foreground">
                        آخر نقلات: {moves.slice(-4).join(' ')}
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
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-emerald-600" />
            كيف يعمل النظام على الراسبيري؟
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              ['١', 'خدمة الرؤية (vision-service) تلتقط صوراً من كل كاميرا بمعدل 2 إطار/ثانية'],
              ['٢', 'تقارن الخدمة الإطار الحالي بالإطار السابق لكل مربع من مربعات الرقعة الـ 64'],
              ['٣', 'عند اكتشاف تغيير، تستنتج المربع المصدر والمربع الهدف وترسل النقلة إلى صفحة الأدمن'],
              ['٤', 'تتحقق الصفحة من شرعية النقلة بمكتبة chess.js ثم تحدّث FEN وقائمة النقلات'],
              ['٥', 'تُدفع البيانات تلقائياً بصيغة JSON إلى مستودع موقع النادي عبر GitHub API'],
              ['٦', 'موقع النادي يعرض النقلات مباشرة على لوح الشطرنج في صفحة الألعاب الحية'],
            ].map(([n, text]) => (
              <li key={n} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {n}
                </span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
            {status?.sync.status === 'error' ? (
              <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <CircleCheck className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>
              {status?.sync.message || 'انتظر — عند تشغيل النظام على الراسبيري ستظهر حالة المزامنة هنا'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
