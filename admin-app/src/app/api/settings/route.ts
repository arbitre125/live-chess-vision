import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** قراءة الإعدادات (مع إخفاء التوكن جزئياً للعرض) */
export async function GET() {
  let settings = await db.settings.findUnique({ where: { id: 'main' } })
  if (!settings) {
    settings = await db.settings.create({ data: { id: 'main' } })
  }
  const token = settings.githubToken
  return NextResponse.json({
    ok: true,
    settings: {
      ...settings,
      githubToken: token ? `${token.slice(0, 4)}••••••••${token.slice(-4)}` : '',
      hasToken: Boolean(token),
    },
  })
}

/** حفظ الإعدادات */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.clubName !== undefined) data.clubName = String(body.clubName)
    if (body.githubRepo !== undefined) data.githubRepo = String(body.githubRepo).trim()
    if (body.githubBranch !== undefined) data.githubBranch = String(body.githubBranch).trim()
    if (body.githubDataPath !== undefined) data.githubDataPath = String(body.githubDataPath).trim()
    if (body.autoPush !== undefined) data.autoPush = Boolean(body.autoPush)
    if (body.pushIntervalSec !== undefined)
      data.pushIntervalSec = Math.max(10, Number(body.pushIntervalSec))

    // التوكن: يُحدث فقط إذا أُرسل قيمة جديدة غير مقنّعة
    if (
      body.githubToken !== undefined &&
      body.githubToken !== '' &&
      !String(body.githubToken).includes('••')
    ) {
      data.githubToken = String(body.githubToken).trim()
    }

    await db.settings.upsert({ where: { id: 'main' }, update: data, create: { id: 'main', ...data } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'خطأ' },
      { status: 500 }
    )
  }
}
