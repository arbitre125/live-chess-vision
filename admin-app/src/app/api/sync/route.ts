import { NextResponse } from 'next/server'
import { syncToGitHub, buildLivePayload } from '@/lib/github-sync'

export const dynamic = 'force-dynamic'

/** الدفع الآن إلى GitHub + معاينة الحمولة */
export async function POST() {
  const result = await syncToGitHub(true)
  return NextResponse.json({ ...result })
}

/** معاينة ما سيُدفع (بدون دفع فعلي) */
export async function GET() {
  const payload = await buildLivePayload()
  return NextResponse.json({ ok: true, payload })
}
