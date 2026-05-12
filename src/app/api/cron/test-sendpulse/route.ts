import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, getWabaId } from '@/lib/sendpulse'

// GET /api/cron/test-sendpulse?secret=camilla2026secret
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret') ?? request.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const credenziali = {
    client_id_set:        Boolean(process.env.SENDPULSE_CLIENT_ID),
    client_secret_set:    Boolean(process.env.SENDPULSE_CLIENT_SECRET),
    template_name:        process.env.SENDPULSE_WA_TEMPLATE_NAME ?? '(default)',
    template_lang:        process.env.SENDPULSE_WA_TEMPLATE_LANG ?? '(default)',
    phone_number_id:      process.env.SENDPULSE_PHONE_NUMBER_ID ?? '(non impostato)',
    waba_id_in_env:       process.env.SENDPULSE_WABA_ID ?? '(non impostato — verrà recuperato via API)',
  }

  console.log('[TestSendpulse] Credenziali:', credenziali)

  try {
    const token  = await getAccessToken()
    const wabaId = await getWabaId()

    console.log('[TestSendpulse] Token OK (lunghezza:', token.length, ')')
    console.log('[TestSendpulse] waba_id:', wabaId)

    return NextResponse.json({
      success: true,
      auth_ok: true,
      waba_id: wabaId,
      token_length: token.length,
      credenziali,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[TestSendpulse] Errore:', msg)
    return NextResponse.json({
      success: false,
      auth_ok: false,
      errore: msg,
      credenziali,
    }, { status: 500 })
  }
}
