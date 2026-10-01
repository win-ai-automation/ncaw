import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Netfintax Content Desk',
  description: 'Netfintax content review workspace',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
