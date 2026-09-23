import { redirect } from 'next/navigation';

/**
 * Command Center — retired as a standalone route (Sidebar Flattening &
 * Control Tower Merge). Its two capabilities that weren't already
 * duplicated elsewhere — the Impact-Aware Decision Cards feed and the NL
 * Command Bar — now live on the Control Tower (`/portfolio`): the Decision
 * Cards in its Decisions tab (which already rendered the identical
 * `DecisionCard` list off the same engine), and the Command Bar pinned
 * above the tabs. The venture-vitals Pulse strip and the Active Stream
 * feed were retired outright rather than merged — both were superseded by
 * content the Control Tower's Overview/Activity tabs already show within
 * the viewer's real scope (docs/UI_DESIGN_SYSTEM.md §8).
 *
 * This route stays alive as a permanent redirect rather than a 404, for
 * anyone with an old bookmark or a typed-from-memory URL.
 */
export default function CommandCenterRedirect() {
  redirect('/portfolio');
}
