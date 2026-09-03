'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardTab } from '@/components/admin/dashboard-tab'
import { CamerasTab } from '@/components/admin/cameras-tab'
import { BoardsTab } from '@/components/admin/boards-tab'
import { SyncTab } from '@/components/admin/sync-tab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Camera,
  Crown,
  CloudUpload,
  RefreshCw,
  Castle,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { BoardInfo, CameraWithBoard, SettingsInfo, SystemStatus } from '@/lib/types'

export default function AdminPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [cameras, setCameras] = useState<CameraWithBoard[]>([])
  const [boards, setBoards] = useState<BoardInfo[]>([])
  const [settings, setSettings] = useState<SettingsInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [s, c, b, st] = await Promise.all([
        fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/cameras', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/boards', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ])
      if (s?.ok) setStatus(s)
      if (c?.ok) setCameras(c.cameras)
      if (b?.ok) setBoards(b.boards)
      if (st?.ok) setSettings(st.settings)
      setLastRefresh(new Date())
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  const online = cameras.filter((c) => c.status === 'online' || c.status === 'detecting').length

  return (
    <div className="min-h-screen bg-[#f4f6f4]">
      {/* الرأس */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Castle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-lg">
                نظام الشطرنج الحي بالكاميرا — صفحة الأدمن
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {settings?.clubName || 'نادي سبورتينغ أريانة للشطرنج'} — أريانة، تونس
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className={`gap-1.5 ${online > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-slate-50 text-slate-600'}`}
            >
              {online > 0 ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online} كاميرا متصلة
            </Badge>
            <button
              onClick={refresh}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              aria-label="تحديث"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="dashboard" dir="rtl" className="space-y-5">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-white p-1 shadow-sm">
            <TabsTrigger value="dashboard" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <LayoutDashboard className="h-4 w-4" />
              لوحة التحكم
            </TabsTrigger>
            <TabsTrigger value="cameras" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Camera className="h-4 w-4" />
              الكاميرات
            </TabsTrigger>
            <TabsTrigger value="boards" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Crown className="h-4 w-4" />
              الرقع والألعاب
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <CloudUpload className="h-4 w-4" />
              المزامنة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab status={status} boards={boards} />
          </TabsContent>
          <TabsContent value="cameras">
            <CamerasTab cameras={cameras} boards={boards} onChange={refresh} />
          </TabsContent>
          <TabsContent value="boards">
            <BoardsTab boards={boards} onChange={refresh} />
          </TabsContent>
          <TabsContent value="sync">
            <SyncTab settings={settings} onChange={refresh} />
          </TabsContent>
        </Tabs>

        <footer className="mt-10 pb-6 text-center text-xs text-muted-foreground">
          Live Chess Vision — يعمل محلياً على الراسبيري عبر
          <code dir="ltr" className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono">http://raspberrypi.local:3000</code>
          {lastRefresh && (
            <span dir="ltr" className="mr-2">
              (آخر تحديث {lastRefresh.toLocaleTimeString()})
            </span>
          )}
        </footer>
      </main>
    </div>
  )
}
