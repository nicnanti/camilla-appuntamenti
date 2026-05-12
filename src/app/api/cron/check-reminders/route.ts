import { NextRequest, NextResponse } from 'next/server'
import { eseguiCheckReminders } from '@/lib/reminders'

// GET /api/cron/check-reminders?secret=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret') ?? request.headers.get('x-cron-secret')
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
    }

    if (!process.env.SENDPULSE_CLIENT_ID || !process.env.SENDPULSE_CLIENT_SECRET) {
      return NextResponse.json({ errore: 'Credenziali SendPulse non configurate' }, { status: 500 })
    }

    const risultato = await eseguiCheckReminders()
    return NextResponse.json(risultato)
  } catch (error) {
    console.error('Errore cron check-reminders:', error)
    return NextResponse.json({ errore: 'Errore durante il controllo dei reminder' }, { status: 500 })
  }
}
