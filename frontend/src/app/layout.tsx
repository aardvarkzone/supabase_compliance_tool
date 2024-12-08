import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Supabase Compliance Checker',
  description: 'Check Supabase configuration for compliance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-[#0a192f] min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}