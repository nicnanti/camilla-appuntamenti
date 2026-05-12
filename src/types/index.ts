export interface Appuntamento {
  id: string
  cliente_nome: string
  cliente_telefono: string
  cliente_dettagli?: string
  data: string            // formato YYYY-MM-DD
  ora_inizio: string      // formato HH:MM
  ora_fine: string        // formato HH:MM
  tipo?: string           // legacy, non più usato nei nuovi record
  note?: string
  google_calendar_event_id?: string  // JSON: {professionista, calendarId, eventId}
  professionista?: string            // "Camilla" | "Giacomo" — per UI/colori
  host?: string                      // email del professionista — colonna Airtable "host"
  guests?: string                    // email dei guest comma-separated — colonna Airtable "guests"
  reminder_sent: boolean
  reminder_sent_at?: string
  stato: StatoAppuntamento
  ics_uid?: string
  ics_sequence?: number
  created_at?: string
}

export type StatoAppuntamento = 'Confermato' | 'Cancellato' | 'Spostato'

export interface Contatto {
  id: string
  nome: string
  cognome: string
  dettagli?: string
  telefono: string
  email?: string
  nota?: string
  created_at?: string
}
