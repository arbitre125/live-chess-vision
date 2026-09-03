/** أنواع مشتركة بين الواجهة وواجهات API — نظام الشطرنج الحي */

export interface BoardInfo {
  id: string
  label: string
  cameraId?: string | null
  corners?: string | null
  orientation: string
  diffThreshold: number
  whitePlayer: string
  whiteRating: number
  blackPlayer: string
  blackRating: number
  tournament: string
  roundLabel: string
  fen: string
  moves: string
  status: string
  lastMoveFrom?: string | null
  lastMoveTo?: string | null
  result?: string | null
  camera?: { id: string; name: string; status: string; type: string } | null
}

/** عقدة كاميرا v2 — قد تغطي عدة رقع */
export interface CameraInfo {
  id: string
  name: string
  device: string
  type: string
  streamUrl?: string | null
  width: number
  height: number
  fps: number
  batteryPct?: number | null
  enabled: boolean
  status: string
  lastSeen?: string | null
  boards?: BoardInfo[]
  board?: BoardInfo | null // توافق خلفي
}

export interface SystemStatus {
  ok: boolean
  cameras: { total: number; online: number }
  boards: { total: number; live: number }
  moves24h: number
  sync: {
    auto: boolean
    lastSyncAt?: string | null
    status: string
    message: string
  }
}

export interface SettingsInfo {
  id: string
  clubName: string
  githubToken: string
  githubRepo: string
  githubBranch: string
  githubDataPath: string
  autoPush: boolean
  pushIntervalSec: number
  lastSyncAt?: string | null
  lastSyncStatus: string
  lastSyncMessage: string
  hasToken?: boolean
}

export interface GameRecord {
  id: string
  boardId: string
  moves: string
  pgn: string
  result?: string | null
  whitePlayer: string
  blackPlayer: string
  startedAt: string
  finishedAt?: string | null
  board?: { label: string }
}

export const CAMERA_TYPE_LABELS: Record<string, string> = {
  esp32: 'عقدة ESP32 (WiFi)',
  picamera2: 'كاميرا راسبيري (CSI)',
  usb: 'ويب كام USB',
  ip: 'كاميرا IP / هاتف',
}

export const STATUS_LABELS: Record<string, string> = {
  offline: 'غير متصلة',
  online: 'متصلة',
  detecting: 'تكتشف النقلات',
  error: 'خطأ',
}

export const BOARD_STATUS_LABELS: Record<string, string> = {
  idle: 'مستمرة',
  live: 'مباشر',
  finished: 'منتهية',
}
