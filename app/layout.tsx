import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { ActivityTracker } from '@/components/activity-tracker'
import { getMetadataBase } from '@/lib/site-url'
import { ThemeProvider } from './theme-provider'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
})

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  // Resolves to https://uresphere.in in production, http://localhost:3000 in
  // development. Never a Vercel preview domain (see lib/site-url.ts).
  metadataBase: getMetadataBase(),
  title: {
    default: 'ÙreSphere — Your College, Connected',
    template: '%s · ÙreSphere',
  },
  description:
    'ÙreSphere is a private, campus-verified community platform. Chat, trade, and organize with people who actually share your college — anonymously.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ÙreSphere — Your College, Connected',
    description:
      'ÙreSphere is a private, campus-verified community platform. Chat, trade, and organize with people who actually share your college — anonymously.',
    type: 'website',
    siteName: 'ÙreSphere',
    url: '/',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ÙreSphere — Your College, Connected',
    description: 'ÙreSphere is a private, campus-verified community platform. Chat, trade, and organize with people who actually share your college — anonymously.',
  },
  // Favicon package lives in /public/favicon/ (favicon.ico, favicon.svg,
  // favicon-96x96.png, apple-touch-icon.png, site.webmanifest).
  icons: {
    icon: [
      { url: '/favicon/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/favicon/apple-touch-icon.png',
  },
  manifest: '/favicon/site.webmanifest',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#10141f' },
  ],
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased font-sans ${fraunces.variable} ${geist.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
        {/* Keeps profiles.last_activity_at fresh (throttled) for the 48-hour
            inactivity logout. Renders nothing and no-ops for signed-out users. */}
        <ActivityTracker />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
