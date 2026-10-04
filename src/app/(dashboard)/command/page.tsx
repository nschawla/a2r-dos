import { redirect } from 'next/navigation';

/**
 * Command Center — retired as a standalone route (Sidebar Flattening &
 * Control Tower Merge). Its one capability that wasn't already duplicated
 * elsewhere — the Impact-Aware Decision Cards feed — now lives on the
 * Control Tower's (`/portfolio`) Decisions tab (which already rendered
 * the identical `DecisionCard` list off the same engine). The
 * venture-vitals Pulse strip and the Active Stream feed were retired
 * outright rather than merged — both were superseded by content the
 * Control Tower's Overview/Activity tabs already show within the
 * viewer's real scope (docs/UI_DESIGN_SYSTEM.md §8).
 *
 * The NL Command Bar that briefly lived pinned above the Control Tower's
 * tabs (this page's own, before it retired) was itself removed in
 * v1.53.0 — it was a plain keyword/regex/fuzzy-match resolver
 * (`resolveCommand`), not AI, and strictly redundant with the header's
 * own "Search… ⌘K" box, which opens the global ⌘K palette — a superset
 * of the Command Bar's own suggestions (`buildCommandKItems` calls the
 * same `resolveCommand` and adds people/risk search on top). See
 * docs/UI_DESIGN_SYSTEM.md §19.
 *
 * This route stays alive as a permanent redirect rather than a 404, for
 * anyone with an old bookmark or a typed-from-memory URL.
 */
export default function CommandCenterRedirect() {
  redirect('/portfolio');
}
