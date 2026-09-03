/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under this Terms of
 * Service & EULA document itself.
 */

/**
 * WP8 — Terms of Service & End-User License Agreement. Static content —
 * no data fetch, no auth requirement (see middleware.ts) — since this has
 * to be readable by a prospective customer who has no account yet, and be
 * the thing a signed-in user's account is actually bound by.
 *
 * Placeholder legal terms for a fictional company ("A2R Ventures LLC")
 * that this build has used consistently since WP3's export footers and
 * WP7's SteerCo/Audit Certificate documents — not a real entity's actual
 * legal terms. A real deployment must have qualified counsel review this
 * before it governs a real customer relationship.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — A2R Delivery OS™',
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

export default function TermsPage() {
  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Legal</div>
        <h1 className="text-2xl font-display font-bold">Terms of Service &amp; End-User License Agreement</h1>
        <p className="text-ink-faint text-xs mt-2">Effective {EFFECTIVE_DATE} &middot; A2R Delivery OS™, a product of A2R Ventures LLC</p>
      </div>

      <Section id="acceptance" title="1. Acceptance of these Terms">
        <p>
          These Terms of Service, together with any order form, statement of work, or subscription agreement referencing
          them (collectively, the &ldquo;Agreement&rdquo;), govern access to and use of A2R Delivery OS™ (the
          &ldquo;Service&rdquo;) provided by A2R Ventures LLC (&ldquo;A2R,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By
          creating an organization, signing in, or otherwise accessing the Service, the individual doing so, and the
          professional services organization they represent (&ldquo;Customer,&rdquo; &ldquo;you&rdquo;), agree to be
          bound by this Agreement. If you do not agree, do not access or use the Service.
        </p>
      </Section>

      <Section id="definitions" title="2. Definitions">
        <p>
          <strong className="text-ink">&ldquo;Customer Data&rdquo;</strong> means all data, content, and information
          that Customer or its authorized users submit to, or generate within, the Service — including but not limited
          to engagement records, deal sizing and Phase-Effort Matrix inputs, RAID entries, financial actuals and
          forecasts, schedule and milestone data, audit-control evidence and verification notes, SteerCo decisions, and
          any files uploaded through the CSV ingestion pipeline or Workspace Backup export.
        </p>
        <p>
          <strong className="text-ink">&ldquo;A2R IP&rdquo;</strong> means the Service itself and everything that makes
          it work: the underlying software, source code, calculation engines (including the Commercial Baseline sizing,
          EAC/Financial Realization, Audit Compliance, Schedule Pace-Risk, Portfolio Rollup, and Executive Reporting
          engines), user
          interface designs, workflows, documentation, and the A2R Delivery OS™ name, logo, and trademarks — whether or
          not registered. A2R IP does not include Customer Data, even where Customer Data is displayed within, or
          exported from, the Service.
        </p>
      </Section>

      <Section id="license" title="3. License Grant">
        <p>
          Subject to this Agreement and payment of applicable fees, A2R grants Customer a limited, non-exclusive,
          non-transferable, non-sublicensable, revocable license to access and use the Service during the applicable
          subscription term, solely for Customer&rsquo;s own internal professional-services delivery operations. The
          Service is licensed, not sold. A2R and its licensors retain all right, title, and interest in and to the A2R
          IP, including all intellectual property rights therein. No rights are granted to Customer other than those
          expressly set out in this Agreement.
        </p>
      </Section>

      <Section id="ownership" title="4. Customer Data Ownership vs. A2R IP Ownership">
        <p>
          <strong className="text-ink">Customer Data belongs to Customer.</strong> As between the parties, Customer
          owns all right, title, and interest in and to Customer Data, including any intellectual property rights
          therein. A2R claims no ownership interest in Customer Data. Customer grants A2R a limited license to host,
          process, transmit, and display Customer Data solely as necessary to provide, maintain, secure, and support
          the Service (including generating the exports described in Section 5), and as otherwise described in the
          Privacy Policy.
        </p>
        <p>
          <strong className="text-ink">A2R IP belongs to A2R.</strong> Customer acquires no ownership interest in the
          Service, the A2R IP, or any derivative works, improvements, or feedback-driven enhancements to either, even
          where such improvements were suggested by or developed in consultation with Customer. Any suggestions,
          enhancement requests, or feedback Customer provides (including via the in-app Support &amp; Ticket
          Submission feature) may be used by A2R without restriction or obligation to Customer.
        </p>
        <p>
          On termination or expiration of the Agreement, Customer may export Customer Data via the Service&rsquo;s
          Workspace Backup export for a period of 30 days, after which A2R may delete Customer Data from active
          systems in accordance with its data retention practices, subject to standard backup-cycle retention.
        </p>
      </Section>

      <Section id="restrictions" title="5. Restrictions">
        <p>Customer shall not, and shall not permit any third party to:</p>
        <p>
          (a) reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, underlying
          ideas, algorithms, file formats, or non-public interfaces of the Service, including its calculation engines,
          except to the extent such restriction is prohibited by applicable law notwithstanding this limitation;
          (b) copy, modify, translate, or create derivative works based on the Service or any A2R IP; (c) sell,
          resell, sublicense, rent, lease, or otherwise make the Service available to any third party outside
          Customer&rsquo;s own organization, including as part of a managed or outsourced service offering, without
          A2R&rsquo;s prior written consent; (d) remove, obscure, or alter any proprietary notices (including
          copyright and trademark notices) on or within the Service or any exports it generates (such as the
          confidentiality footer on SteerCo Status Decks and Audit Verification Certificates); (e) use the Service to
          build, or assist a third party in building, a competitive product or service; or (f) access the Service to
          benchmark or publish performance or comparison results without A2R&rsquo;s prior written consent.
        </p>
      </Section>

      <Section id="support-sla" title="6. Support &amp; Service Level">
        <p>
          A2R provides standard support to active subscribers via the Service&rsquo;s in-app Support &amp; Ticket
          Submission feature, described further at Section 6.1 of the Admin Onboarding guide.
        </p>
        <p>
          <strong className="text-ink">Support hours:</strong> Monday through Friday, 8:00 AM &ndash; 6:00 PM Eastern
          Time (US), excluding A2R-observed holidays (&ldquo;Support Hours&rdquo;). Tickets submitted outside Support
          Hours are queued and addressed at the start of the next Support Hours window.
        </p>
        <p>
          <strong className="text-ink">Target initial response times</strong> (business hours, from ticket
          submission), by the priority Customer selects at submission: Urgent (Service materially unavailable for the
          whole organization) &mdash; 2 business hours; High (a core workflow is broken with no reasonable workaround)
          &mdash; 1 business day; Medium (a non-blocking defect or a question with a workaround available) &mdash; 2
          business days; Low (a general question, cosmetic issue, or enhancement request) &mdash; 3 business days.
          These are target response times, not guaranteed resolution times, and do not constitute a financially backed
          service-level agreement unless separately agreed in an order form.
        </p>
      </Section>

      <Section id="term" title="7. Term, Suspension &amp; Termination">
        <p>
          This Agreement remains in effect for as long as Customer maintains an active subscription or account. A2R
          may suspend or terminate access immediately if Customer materially breaches this Agreement (including
          Section 5) and fails to cure within 15 days of notice, or immediately where necessary to prevent harm to the
          Service, other customers, or third parties. Either party may terminate for convenience in accordance with
          the applicable order form or, absent one, upon 30 days&rsquo; written notice.
        </p>
      </Section>

      <Section id="warranty" title="8. Warranty Disclaimer">
        <p>
          Except as expressly stated in an applicable order form, the Service is provided &ldquo;as is&rdquo; and
          &ldquo;as available,&rdquo; without warranties of any kind, whether express, implied, or statutory, including
          implied warranties of merchantability, fitness for a particular purpose, and non-infringement. A2R does not
          warrant that the Service will be uninterrupted, error-free, or that calculated outputs (margin, EAC,
          compliance scores, schedule risk, or any other computed figure) will be free of defect arising from
          inaccurate or incomplete Customer Data input.
        </p>
      </Section>

      <Section id="liability" title="9. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, neither party will be liable for indirect, incidental, special,
          consequential, or punitive damages, or for loss of profits, revenue, data, or business opportunity, arising
          out of or related to this Agreement, even if advised of the possibility of such damages. Each party&rsquo;s
          total aggregate liability arising out of or related to this Agreement will not exceed the fees paid by
          Customer to A2R in the 12 months preceding the event giving rise to the claim.
        </p>
      </Section>

      <Section id="governing-law" title="10. Governing Law">
        <p>
          This Agreement is governed by the laws of the State of Delaware, without regard to its conflict-of-laws
          principles, and the parties consent to the exclusive jurisdiction of the state and federal courts located in
          Delaware for any dispute arising out of or relating to this Agreement.
        </p>
      </Section>

      <Section id="changes" title="11. Changes to these Terms">
        <p>
          A2R may update this Agreement from time to time. Material changes will be notified via the Service or by
          email to the organization&rsquo;s registered administrator at least 30 days before taking effect. Continued
          use of the Service after the effective date of a change constitutes acceptance of the revised Agreement.
        </p>
      </Section>

      <Section id="contact" title="12. Contact">
        <p>
          Questions about this Agreement can be directed through the in-app Support &amp; Ticket Submission feature
          (Help &rarr; Contact Support), available to any signed-in user of the Service.
        </p>
      </Section>
    </>
  );
}
