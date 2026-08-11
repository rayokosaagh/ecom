import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Store policies.
 *
 * PLACEHOLDER COPY — these describe policies the app does not implement.
 * Edit them to match what the store actually offers before going live.
 */
export const STORE_PROMISES = [
  { icon: "local_shipping", title: "Free shipping", copy: "On orders over $50" },
  { icon: "assignment_return", title: "30-day returns", copy: "No questions asked" },
  { icon: "lock", title: "Secure checkout", copy: "Encrypted end to end" },
  { icon: "support_agent", title: "Real support", copy: "Answers from humans" },
];

/**
 * The four promises, as a bare list.
 *
 * Lifted out of `Footer` so the home page can show them as a band of their own
 * without the markup existing twice. It is deliberately only the list — no
 * heading, no border, no width — because its two callers frame it differently:
 * the footer puts it above the link columns with a rule under it, the home page
 * gives it a section between the social bar and the questions.
 *
 * Reassurance works where a decision is being made, and on a long storefront
 * that is not the very bottom of the page. That is the whole reason this moved:
 * in the footer it sat level with a column of links and read as one more list
 * of them.
 */
export function TrustBadges({ className }: { className?: string }) {
  return (
    <ul className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {STORE_PROMISES.map((promise) => (
        <li key={promise.title} className="flex items-start gap-3">
          <span className="bg-primary-container text-on-primary-container grid size-10 shrink-0 place-items-center rounded-full">
            <Icon name={promise.icon} size={20} />
          </span>
          <span>
            <span className="text-on-surface block text-sm font-medium">
              {promise.title}
            </span>
            <span className="text-on-surface-variant block text-xs">
              {promise.copy}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The same four, framed as a home page section.
 *
 * A separate export rather than a `variant` prop: the two framings share no
 * classes at all, and a component whose every wrapper is conditional is two
 * components wearing one name.
 */
export function TrustBadgesSection({ className }: { className?: string }) {
  return (
    <section
      aria-label="Store policies"
      className={cn("mx-auto max-w-7xl px-4 pb-20 sm:px-6", className)}
    >
      <div className="border-outline-variant/60 bg-surface-container-lowest rounded-3xl border p-6 sm:p-8">
        <TrustBadges />
      </div>
    </section>
  );
}
