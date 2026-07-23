import type { Metadata } from 'next'
import { Inter, Archivo_Black } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

// The display face for the wordmark and every uppercase headline. Loaded via
// next/font, so Next self-hosts the files at build time: no external request,
// no rip-site demo font, and it renders instantly instead of flashing.
const display = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--font-display', display: 'swap' })

const BASE_URL = 'https://judgemynt.com'

const TITLE = 'Judgemynt: use any AI you want. That is the point.'
const DESCRIPTION =
  'Every screening test broke the day candidates got AI. Judgemynt hands the candidate an AI, ' +
  'plus the documents the AI does not have, and measures whether they read them. Employers put ' +
  'their own policies in the exam and get back a scored session, the traps caught or missed, ' +
  'and the full transcript.'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: TITLE, template: '%s | Judgemynt' },
  description: DESCRIPTION,
  keywords: [
    'judgemynt', 'AI judgment', 'AI literacy certification', 'AI skills assessment',
    'hiring assessment', 'candidate screening', 'AI detection test', 'prompt skills',
    'AI proficiency exam', 'employer assessment', 'AI credential',
  ],
  authors: [{ name: 'Judgemynt', url: BASE_URL }],
  creator: 'Judgemynt',
  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: 'Judgemynt',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  alternates: { canonical: BASE_URL },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} h-full`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
