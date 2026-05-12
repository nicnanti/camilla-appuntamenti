import { NextRequest, NextResponse } from 'next/server'
import { eliminaProssimiAppuntamentiPassati } from '@/lib/airtable'

// GET /api/cron/cleanup-past-appointments?secret=CRON_SECRET
// Elimina dalla tabella "Prossimi Appuntamenti" i record con data passata.
// La tabella "Appuntamenti" principale NON viene toccata.
// Chiamare una volta al giorno da un cron esterno.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
    }

    const eliminati = await eliminaProssimiAppuntamentiPassati()

    console.log(`[Cron Cleanup] Eliminati ${eliminati} appuntamenti passati da "Prossimi Appuntamenti"`)

    return NextResponse.json({ success: true, deleted: eliminati })
  } catch (error) {
    console.error('Errore cron cleanup-past-appointments:', error)
    return NextResponse.json(
      { errore: 'Errore durante la pulizia degli appuntamenti passati' },
      { status: 500 }
    )
  }
}
