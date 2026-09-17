import clsx from 'clsx';
import { SEVERITY_CLASS, SEVERITY_LABEL, type Severity } from '@/lib/ui/severity';

/**
 * The canonical Critical/High/Medium/Low chip — reads its color from the
 * shared src/lib/ui/severity.ts map, so every table/card/dashboard that
 * uses it automatically stays on the one standard (docs/UI_DESIGN_SYSTEM.md
 * §4). No client-side state — safe in a Server Component.
 */
export function SeverityBadge({
  severity,
  className,
  /** Some existing surfaces show the raw enum text (e.g. "CRITICAL") — set
   * this to keep that instead of the nicer "Critical" label. */
  rawText,
}: {
  severity: Severity;
  className?: string;
  rawText?: boolean;
}) {
  return (
    <span className={clsx('badge !border-0', SEVERITY_CLASS[severity], className)}>
      {rawText ? severity : SEVERITY_LABEL[severity]}
    </span>
  );
}
