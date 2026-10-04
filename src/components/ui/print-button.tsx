'use client';

/**
 * A generic "print the current screen" trigger — `window.print()` behind a
 * styled button. Deliberately dumb: it doesn't know or care what's being
 * printed, since that's entirely driven by the page's own `@media print`
 * CSS (hide chrome, show the document, `printKey`/`printAll` on
 * `<ModuleTabs>` for which panel(s) stay in the printed output). Extracted
 * so any page's print action can sit in a `<ModuleTabs actions>` slot
 * without re-declaring the same onClick + button classes.
 */
export function PrintButton({ label = 'Print / Export' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary !w-auto px-5 whitespace-nowrap flex-none"
    >
      {label}
    </button>
  );
}
