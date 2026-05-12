import { NextRequest, NextResponse } from 'next/server'
import { inviaReminderWhatsApp, formatDataItaliano } from '@/lib/sendpulse'

// GET /api/cron/test-reminder?secret=...&phone=+393331234567
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const secret = searchParams.get('secret') ?? request.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const phone = searchParams.get('phone')
  if (!phone) {
    return NextResponse.json({ errore: 'Parametro phone mancante (es: ?phone=+393331234567)' }, { status: 400 })
  }

  if (!process.env.SENDPULSE_CLIENT_ID || !process.env.SENDPULSE_CLIENT_SECRET) {
    return NextResponse.json({ errore: 'Credenziali SendPulse non configurate' }, { status: 500 })
  }

  try {
    const oggi = new Date().toISOString().slice(0, 10)
    await inviaReminderWhatsApp({
      phone,
      nomeCliente: 'Cliente Test',
      dataFormattata: formatDataItaliano(oggi),
      oraInizio: '10:00',
    })
    return NextResponse.json({ success: true, phone, messaggio: 'Messaggio di test inviato' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[TestReminder] Errore:', msg)
    return NextResponse.json({ success: false, errore: msg }, { status: 500 })
  }
}
