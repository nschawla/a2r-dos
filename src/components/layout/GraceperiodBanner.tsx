/** Read-only wind-down notice for a tenant in its GRACE_PERIOD. */
export function GraceperiodBanner({ organizationName }: { organizationName: string }) {
  return (
    <div className="sticky top-0 z-[115] bg-warning-soft text-warning text-[12.5px] font-semibold px-4 py-1.5 flex items-center justify-center gap-2 border-b border-warning/30">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
      {organizationName} is in a read-only grace period — editing is disabled. Contact your A2R account team.
    </div>
  );
}
