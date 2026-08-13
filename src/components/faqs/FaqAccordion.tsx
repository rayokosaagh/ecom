import { Icon } from "@/components/ui/Icon";

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

/**
 * The list of questions itself, without any heading around it.
 *
 * Extracted so the home page's short selection and the full `/faq` page render
 * the same thing — one is not a near-copy of the other, which is how two lists
 * of the same content start disagreeing about how they look.
 *
 * Built on `<details>`/`<summary>` rather than React state, and that is the
 * decision worth defending. An accordion assembled from `useState`, a `div` and
 * an `onClick` has to reimplement what those two elements already do: keyboard
 * activation with both Enter and Space, the correct expanded/collapsed
 * announcement to a screen reader, and find-in-page reaching text inside a
 * closed panel. Native gives all three, works before hydration, and keeps this
 * a server component.
 *
 * Answers are plain text — see the note on `Faq.answer` in the schema.
 * `whitespace-pre-line` is what turns the newlines an admin typed into
 * paragraphs without letting any markup through.
 */
export function FaqAccordion({ faqs }: { faqs: FaqEntry[] }) {
  return (
    <ul className="space-y-2">
      {faqs.map((faq) => (
        <li key={faq.id}>
          <details className="group border-outline-variant bg-surface-container-low rounded-2xl border">
            <summary
              className={[
                "flex cursor-pointer items-center justify-between gap-4 rounded-2xl p-4 sm:p-5",
                "text-on-surface text-base font-medium",
                // The default disclosure triangle is replaced by the chevron
                // below, which rotates — so the marker is removed in both the
                // standard and the WebKit-prefixed form.
                "list-none [&::-webkit-details-marker]:hidden",
                "focus-visible:outline-2 focus-visible:-outline-offset-2",
              ].join(" ")}
            >
              {faq.question}
              <Icon
                name="expand_more"
                size={22}
                className="text-on-surface-variant shrink-0 transition-transform duration-200 ease-standard group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>

            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <p className="text-on-surface-variant text-sm leading-relaxed whitespace-pre-line">
                {faq.answer}
              </p>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
