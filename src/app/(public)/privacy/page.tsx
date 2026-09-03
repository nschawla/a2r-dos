/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 */

/**
 * WP8 — Privacy Policy. Static content, no auth requirement (see
 * middleware.ts) — same reasoning as terms/page.tsx. The multi-tenant
 * isolation and encryption claims below describe this app's actual
 * architecture (organizationId-scoped queries throughout — see
 * src/lib/db/scoped-portfolio.ts and every WP4+ server action/query — and
 * standard managed-Postgres-provider encryption at rest/in transit), not
 * aspirational marketing copy; keep this page honest if either changes.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — A2R Delivery OS™',
};

const EFFECTIVE_DATE = 'January 1, 2026';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card flex flex-col gap-3">
      <h2 className="text-[15.5px] font-display font-bold">{title}</h2>
      <div className="flex flex-col gap-3 text-[13.5px] text-ink-muted leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Legal</div>
        <h1 className="text-2xl font-display font-bold">Privacy Policy</h1>
        <p className="text-ink-faint text-xs mt-2">Effective {EFFECTIVE_DATE} &middot; A2R Delivery OS™, a product of A2R Ventures LLC</p>
      </div>

      <Section id="overview" title="1. Overview">
        <p>
          This Privacy Policy describes how A2R Ventures LLC (&ldquo;A2R,&rdquo; &ldquo;we&rdquo;) collects, uses,
          stores, and protects information in connection with A2R Delivery OS™ (the &ldquo;Service&rdquo;). It applies
          to the organizations and individual users (&ldquo;Customer,&rdquo; &ldquo;you&rdquo;) who access the
          Service. Capitalized terms not defined here have the meaning given in the Terms of Service.
        </p>
      </Section>

      <Section id="data-we-collect" title="2. Information We Collect">
        <p>
          <strong className="text-ink">Account &amp; authentication data:</strong> name, email address, and a hashed
          (never plaintext) password for credential-based sign-in, plus organization membership and role assignment.
        </p>
        <p>
          <strong className="text-ink">Customer Data:</strong> the engagement, financial, RAID, schedule, audit, and
          reporting information Customer and its users enter into or import into the Service, as defined in the Terms
          of Service. This is Customer&rsquo;s data, held by A2R solely to provide the Service — see Section 4 of the
          Terms of Service for the full ownership treatment.
        </p>
        <p>
          <strong className="text-ink">Usage &amp; support data:</strong> basic application telemetry needed to
          operate the Service (e.g. which organization and route a support ticket was raised from, so we can route and
          reproduce issues), and the content of any support ticket submitted through the in-app Support &amp; Ticket
          Submission feature.
        </p>
        <p>We do not collect payment card data directly — billing, where applicable, is handled by a PCI-compliant third-party payment processor that never shares full card numbers with A2R systems.</p>
      </Section>

      <Section id="isolation" title="3. Multi-Tenant Data Isolation">
        <p>
          A2R Delivery OS™ is a multi-tenant application: every organization (&ldquo;tenant&rdquo;) that signs up
          shares the same application infrastructure, but tenant data is logically isolated at the database layer.
          Every record in the system — every project, deal, RAID entry, financial actual, audit entry, and report — is
          tagged with the owning organization&rsquo;s identifier, and every server-side query used to read or write
          that data is scoped to the identifier of the organization the requesting user is actively a member of, as
          resolved from that user&rsquo;s own authenticated session (never from client-supplied input). Role-based
          access control further scopes what any individual user within a tenant can see to their own portfolio,
          practice, or engagement assignment, depending on their delivery role. One tenant&rsquo;s Customer Data is
          never visible to another tenant through the Service.
        </p>
      </Section>

      <Section id="encryption" title="4. Encryption">
        <p>
          Customer Data is encrypted in transit using TLS 1.3 (or the strongest protocol version supported by the
          connecting client where TLS 1.3 is unavailable) for every connection to the Service, including API and
          export/download traffic. Customer Data is encrypted at rest using AES-256 at the database and storage layer.
          Passwords are never stored in plaintext or in a reversible form — they are hashed using a salted,
          industry-standard hashing algorithm before storage.
        </p>
      </Section>

      <Section id="no-selling" title="5. We Do Not Sell Your Data">
        <p>
          A2R does not sell, rent, or trade Customer Data or personal information to third parties for their own
          marketing purposes, and never has. We do not share Customer Data with third parties except: (a) with
          subprocessors who provide infrastructure the Service runs on (e.g. cloud hosting and managed database
          providers), bound by confidentiality and data-protection obligations at least as protective as this policy;
          (b) when required by law, subpoena, or valid legal process, after notifying Customer where legally
          permitted; or (c) with Customer&rsquo;s explicit direction (for example, an export Customer chooses to
          download and share themselves).
        </p>
      </Section>

      <Section id="retention" title="6. Data Retention &amp; Deletion">
        <p>
          Customer Data is retained for as long as the organization maintains an active subscription, plus the 30-day
          post-termination export window described in the Terms of Service. After that window, Customer Data is
          deleted from active systems, subject to standard backup-cycle retention (backups are rotated out, not
          retained indefinitely). Customer may export a full copy of its own workspace at any time via the
          Service&rsquo;s Workspace Backup export.
        </p>
      </Section>

      <Section id="your-rights" title="7. Your Rights">
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, export, or request deletion of your
          personal information. Account-level information (name, email) can be corrected by an organization
          administrator; a full Customer Data export is available at any time via Workspace Backup. To exercise any
          other privacy right, contact us through the in-app Support &amp; Ticket Submission feature (Help &rarr;
          Contact Support).
        </p>
      </Section>

      <Section id="cookies" title="8. Cookies &amp; Similar Technologies">
        <p>
          The Service uses a session cookie strictly necessary for authentication (to keep you signed in) and a small
          cookie to remember which organization is currently active when you belong to more than one. Neither is used
          for advertising or cross-site tracking, and the Service does not embed third-party advertising trackers.
        </p>
      </Section>

      <Section id="children" title="9. Children&rsquo;s Privacy">
        <p>
          The Service is a business tool intended for use by professional services organizations and their employees.
          It is not directed to, and A2R does not knowingly collect personal information from, individuals under the
          age of 18.
        </p>
      </Section>

      <Section id="changes" title="10. Changes to this Policy">
        <p>
          A2R may update this Privacy Policy from time to time. Material changes will be notified via the Service or
          by email to the organization&rsquo;s registered administrator at least 30 days before taking effect.
        </p>
      </Section>

      <Section id="contact" title="11. Contact">
        <p>
          Questions about this Privacy Policy can be directed through the in-app Support &amp; Ticket Submission
          feature (Help &rarr; Contact Support), available to any signed-in user of the Service.
        </p>
      </Section>
    </>
  );
}
