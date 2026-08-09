import type { ReactNode } from "react";

/**
 * Route transition.
 *
 * A template rather than a layout because that is precisely the difference
 * between them: Next.js mounts a *new* instance of a template on every
 * navigation, which is what makes the enter animation replay. A layout
 * persists, so its animation would run once on first load and never again.
 *
 * This element only fades. A transform here would make it the containing block
 * for `position: fixed` descendants and strand the dashboard's mobile drawer
 * mid-screen — so the movement is delegated to `main`, which every layout here
 * keeps as a sibling of its fixed chrome. `globals.css` drives that from this
 * class; there is nothing to wire up per page.
 *
 * The wrapper div is harmless to the layouts below it: they size themselves
 * with `min-h-dvh`, which is viewport-relative and does not care what it is
 * nested in.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
