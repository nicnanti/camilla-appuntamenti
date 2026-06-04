import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import Sidebar from '@/components/Sidebar'
import MobileHeader from '@/components/MobileHeader'
import { AppProvider } from '@/contexts/AppContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Studio Legale — Gestione Appuntamenti',
  description: 'Gestionale appuntamenti professionale',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body className="bg-[#FAFAFA] text-[#1A1A1A] antialiased">
        <AppProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <MobileHeader />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </div>
        </AppProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#1A1A1A',
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
              fontSize: '14px',
              fontFamily: "'DM Sans', sans-serif",
            },
            success: {
              iconTheme: { primary: '#10B981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#fff' },
            },
          }}
        />
      </body>
    </html>
  )
}
