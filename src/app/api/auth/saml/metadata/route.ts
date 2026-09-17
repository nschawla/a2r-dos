/**
 * Enterprise SAML SSO — Service Provider metadata, v1.19.0.
 *
 *   GET /api/auth/saml/metadata
 *
 * The SP-side EntityDescriptor XML an IdP admin can feed straight into
 * their side of the trust setup (entity ID + ACS location), instead of
 * typing both by hand. One SP identity is shared across every tenant (see
 * src/lib/identity/saml-config.ts) — this document has nothing
 * tenant-specific in it, so it needs no auth and no tenant parameter.
 */
import { NextResponse } from 'next/server';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { buildSpMetadataClient } from '@/lib/identity/saml-config';

export const dynamic = 'force-dynamic';

export const GET = withRouteHandler('auth/saml/metadata', async () => {
  const client = buildSpMetadataClient();
  const xml = client.generateServiceProviderMetadata(null, null);
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
