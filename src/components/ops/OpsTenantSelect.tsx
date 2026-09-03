'use client';

import { useRouter } from 'next/navigation';

/** Ops Console tenant picker — navigates to `?org=<id>` on change. */
export function OpsTenantSelect({
  tenants,
  selected,
  basePath,
}: {
  tenants: { id: string; name: string; slug: string }[];
  selected: string | null;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      className="input !w-auto min-w-[240px]"
      value={selected ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `${basePath}?org=${v}` : basePath);
      }}
    >
      <option value="">Select a tenant…</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.slug})
        </option>
      ))}
    </select>
  );
}
