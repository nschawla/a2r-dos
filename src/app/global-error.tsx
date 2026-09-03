'use client';

/**
 * REL-1 (GA-readiness audit) — root error boundary.
 *
 * `global-error.tsx` replaces the ENTIRE document (including the root
 * layout) when an error escapes every nested boundary, so it renders its
 * own <html>/<body> and cannot rely on globals.css, fonts, or providers
 * being present. Styling is therefore inline, using the app's palette so
 * it still reads as A2R Delivery OS rather than Next.js's raw fallback.
 *
 * Only errors thrown while rendering the root layout itself, or ones that
 * bubble past `src/app/(dashboard)/error.tsx` / other segment boundaries,
 * reach here.
 */

import { useEffect } from 'react';
import { captureException } from '@/lib/observability';

// Mirrors the design tokens in tailwind.config.ts — this file replaces the
// whole document, so it can't use Tailwind and inlines the palette instead.
const palette = {
  bg: '#08090B',
  surface: '#121316',
  border: '#26262A',
  ink: '#F5F5F7',
  inkMuted: '#8E8E93',
  inkFaint: '#636369',
  brand: '#0A84FF',
  brandFg: '#FFFFFF',
  critical: '#FF453A',
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { scope: 'global-error', digest: error.digest });
  }, [error]);

  const systemFont =
    '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif';

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: palette.bg,
          color: palette.ink,
          fontFamily: systemFont,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <main
          role="alert"
          style={{
            width: '100%',
            maxWidth: '440px',
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            padding: '28px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: palette.critical,
              marginBottom: '10px',
            }}
          >
            Something went wrong
          </div>

          <h1 style={{ fontSize: '20px', lineHeight: 1.25, margin: '0 0 10px', fontWeight: 700 }}>
            A2R Delivery OS hit an unexpected error
          </h1>

          <p style={{ fontSize: '14px', lineHeight: 1.6, color: palette.inkMuted, margin: '0 0 20px' }}>
            The page couldn&rsquo;t be displayed. Your data hasn&rsquo;t been lost — try again, and if it
            keeps happening, send the reference below to support.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                flex: '1 1 auto',
                minWidth: '120px',
                border: 'none',
                borderRadius: '6px',
                padding: '11px 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: palette.brandFg,
                cursor: 'pointer',
                background: palette.brand,
              }}
            >
              Try again
            </button>
            <a
              href={`mailto:support@a2rventures.com?subject=${encodeURIComponent(
                'A2R Delivery OS error' + (error.digest ? ` (ref ${error.digest})` : '')
              )}`}
              style={{
                flex: '1 1 auto',
                minWidth: '120px',
                textAlign: 'center',
                borderRadius: '6px',
                padding: '11px 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: palette.ink,
                textDecoration: 'none',
                background: '#181B22',
                border: `1px solid ${palette.border}`,
              }}
            >
              Contact support
            </a>
          </div>

          {error.digest ? (
            <p
              style={{
                marginTop: '18px',
                fontSize: '12px',
                fontFamily: 'SFMono-Regular, Consolas, monospace',
                color: palette.inkFaint,
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
