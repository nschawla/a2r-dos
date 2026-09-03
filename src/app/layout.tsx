import type { Metadata } from 'next';
import { Sora, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

const sora = Sora({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sora' });
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono' });

// WP8 — global IP branding: the browser tab/title bar is real estate every
// page shares, so the ™ mark and copyright line live here once rather than
// being duplicated per-page.
export const metadata: Metadata = {
  title: 'A2R Delivery OS™',
  description:
    'A2R Delivery OS™ — Delivery Operating System for Professional Services organizations. © 2026 A2R Ventures LLC. All rights reserved.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`} style={{ colorScheme: 'dark' }}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
