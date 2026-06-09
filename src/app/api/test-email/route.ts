import { NextRequest, NextResponse } from 'next/server'
import { verificaSmtp, inviaEmailTest } from '@/lib/email'

// GET /api/test-email?secret=camilla2026secret[&to=destinatario@example.com]
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') ?? request.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const destinatario = searchParams.get('to') ?? process.env.GMAIL_USER ?? ''
  if (!destinatario) {
    return NextResponse.json({ errore: 'Nessun destinatario (passa ?to=... o configura GMAIL_USER)' }, { status: 400 })
  }

  console.log(`[/api/test-email] Test SMTP + invio a ${destinatario}`)

  const smtp = await verificaSmtp()
  console.log(`[/api/test-email] smtp.verify(): ${smtp.ok ? 'OK' : 'FAIL — ' + smtp.error}`)

  let send: { ok: boolean; error?: string } = { ok: false, error: 'verify fallito, send saltato' }
  if (smtp.ok) {
    send = await inviaEmailTest(destinatario)
    console.log(`[/api/test-email] sendMail(): ${send.ok ? 'OK' : 'FAIL — ' + send.error}`)
  }

  return NextResponse.json({
    smtp_ok: smtp.ok,
    send_ok: send.ok,
    destinatario,
    smtp_error: smtp.error ?? null,
    send_error: send.error ?? null,
    user_configured: Boolean(process.env.GMAIL_USER),
    pass_configured: Boolean(process.env.GMAIL_APP_PASSWORD),
  })
}
