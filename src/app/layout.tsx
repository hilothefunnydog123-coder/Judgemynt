import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const BASE_URL = 'https://judgemynt.com'

const TITLE = 'Judgemynt: prove you can tell when AI is wrong.'
const DESCRIPTION =
  'AI can write anything. Judgemynt tests the part it cannot do for you: knowing when it is wrong. ' +
  'Three levels — detect the flaw, correct the work, direct the AI — graded against a hidden answer key, ' +
  'across real career tracks. Earn a credential employers can actually check.'

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
    <html lang="en" className={`${inter.variable} h-full`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
