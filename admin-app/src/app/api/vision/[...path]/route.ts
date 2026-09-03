import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * وكيل خدمة الرؤية — يمرر الطلبات إلى خادم الرؤية (FastAPI) المحلي.
 * يبقي خادم الرؤية خاصاً على الجهاز ويحل مسائل CORS مع المتصفح.
 *
 * GET  /api/vision/health
 * GET  /api/vision/cameras/{id}/snapshot.jpg
 * GET  /api/vision/cameras/{id}/stream.mjpg
 * POST /api/vision/cameras/{id}
 * POST /api/vision/cameras/{id}/discover
 * POST /api/vision/boards/{id}
 * POST /api/vision/boards/{id}/capture
 * ...
 */

const VISION_URL =
  process.env.VISION_URL ?? process.env.NEXT_PUBLIC_VISION_URL ?? 'http://127.0.0.1:8000'

async function proxy(req: NextRequest, path: string[]) {
  const target = `${VISION_URL}/${path.join('/')}${req.nextUrl.search}`

  try {
    const headers: HeadersInit = {}
    if (req.headers.get('content-type')) {
      headers['Content-Type'] = req.headers.get('content-type') as string
    }

    const body = req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await req.text()

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    })

    // بث MJPEG: نمرر التدفق كما هو
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    if (contentType.includes('multipart')) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
      })
    }

    if (contentType.includes('image/')) {
      const buf = Buffer.from(await upstream.arrayBuffer())
      return new NextResponse(buf, {
        status: upstream.status,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
      })
    }

    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: 'خدمة الرؤية غير متاحة — شغّلها: uvicorn server:app --port 8000',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    )
  }
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { path } = await params
  return proxy(req, path)
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { path } = await params
  return proxy(req, path)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { path } = await params
  return proxy(req, path)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { path } = await params
  return proxy(req, path)
}
