import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Compositions a promo tile can take.
 *
 * `stacked`, `art-first` and `split` are the tinted trio the Laptops section
 * uses — three shapes across a three-up row, each on its own container colour.
 *
 * `panel` is the paired-section tile: a fixed image column beside the copy, on
 * the neutral surface. It sits in a half-width cell, so the image is a defined
 * panel rather than a stretched half of a very wide card.
 */
export type PromoVariant =
  | "stacked"
  | "art-first"
  | "split"
  // Two heights of the same side-panel tile. Both are declared rather than
  // inherited from the image — that is what the source used to decide.
  | "panel" // compact, 12rem
  | "panel-tall"; // 19.5rem, room for an upright subject

/** Layouts the tinted three-up row cycles through, in order. */
export const TRIO_VARIANTS: PromoVariant[] = ["stacked", "art-first", "split"];

export interface PromoCardProps {
  imageUrl: string;
  heading: string;
  subtext?: string | null;
  ctaLabel: string;
  ctaLink: string;
  variant?: PromoVariant;
}

/** Container tints for the trio, cycled by heading so a card keeps its colour. */
const TINTS = [
  "from-primary-container/70 to-primary-container/20 text-on-primary-container",
  "from-secondary-container/70 to-secondary-container/20 text-on-secondary-container",
  "from-tertiary-container/70 to-tertiary-container/20 text-on-tertiary-container",
] as const;

/**
 * FNV-1a with a final xor-shift rather than the usual `hash * 31`: with three
 * buckets, a multiplier of 31 (≡ 1 mod 3) collapses to a plain sum of
 * character codes and visibly favours one tint over the others.
 */
function tintFor(heading: string): string {
  let hash = 2166136261;
  for (let i = 0; i < heading.length; i++) {
    hash ^= heading.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  return TINTS[(hash >>> 0) % TINTS.length];
}

const SHELL = cn(
  "relative h-full overflow-hidden ring-1 ring-inset",
  "transition-[box-shadow,transform] duration-300 ease-[var(--ease-emphasized)]",
  "motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
);

/** The tinted trio: larger radius, gradient wash, a touch more lift. */
const SHELL_TINTED = cn(
  SHELL,
  "rounded-3xl bg-gradient-to-br ring-on-surface/[0.06]",
  "group-hover:shadow-elevation-3 group-hover:-translate-y-1",
);

/** The paired tile: neutral surface, tighter radius. */
const SHELL_PANEL = cn(
  SHELL,
  "bg-surface-container ring-outline-variant/60 rounded-2xl",
  "group-hover:shadow-elevation-2 group-hover:-translate-y-0.5",
);

/**
 * The box an image sits in.
 *
 * The neutral fill matters for images other than the ones seeded here: a
 * transparent PNG, a source that fails to load, and the moment before a slow
 * one arrives all show this instead of the card's gradient bleeding through.
 * `overflow-hidden` is what lets the frame crop rather than be pushed out of
 * shape by its contents.
 */
const FRAME = "relative bg-surface-container-highest overflow-hidden";

/**
 * The image is taken out of flow, which is what makes the tile's size
 * independent of the source.
 *
 * In flow, `height: 100%` against a grid row sized `auto` is an indefinite
 * percentage, so the browser falls back to the image's intrinsic height — and
 * the row then sizes to *that*. A 900x600 source collapsed the card to its
 * floor while an 800x1200 one stretched it to 312px. Absolute positioning
 * removes the image from the sizing calculation entirely: the frame is sized
 * by the row, and the image fills whatever it is given.
 */
const ART = cn(
  // object-cover with an explicit centre anchor: the frame's dimensions are
  // fixed, so any source ratio fills it and is cropped from the middle.
  "absolute inset-0 size-full object-cover object-center",
  "transition-transform duration-300 ease-[var(--ease-emphasized)]",
  "group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
);

const PAD = "p-5 @sm:p-6 @2xl:p-8";
const TITLE =
  "text-xl @xs:text-2xl @sm:text-[1.75rem] leading-[1.15] font-semibold tracking-tight text-balance";
const SUB = "max-w-prose text-sm leading-snug text-pretty opacity-75 @sm:text-base";

function Cta({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold",
        accent ? "text-primary" : "@sm:text-base",
      )}
    >
      <span className="relative">
        {label}
        <span
          aria-hidden
          className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 ease-[var(--ease-emphasized)] group-hover:scale-x-100 motion-reduce:transition-none"
        />
      </span>
      <Icon name="arrow_forward" size={accent ? 16 : 18} className="shrink-0" />
    </span>
  );
}

/**
 * A single promotional tile.
 *
 * Knows nothing about products or categories — just an image, some copy and
 * somewhere to go. The CTA lives here and nowhere else: its label and
 * destination are authored per banner, so repeating them as a generated link
 * in the section header gave two controls for one action.
 */
export function PromoCard({
  imageUrl,
  heading,
  subtext,
  ctaLabel,
  ctaLink,
  variant = "panel",
}: PromoCardProps) {
  // Anything not root-relative leaves the site, so it opens in a new tab and
  // gets the usual opener protection.
  const isInternal = ctaLink.startsWith("/");
  const tint = tintFor(heading);

  const art = (
    // eslint-disable-next-line @next/next/no-img-element -- operator-supplied URLs on any host
    <img src={imageUrl} alt="" loading="lazy" decoding="async" className={ART} />
  );

  let body: React.ReactNode;

  if (variant === "panel" || variant === "panel-tall") {
    // Paired sections. The image holds a fixed 13rem column rather than half
    // the card, so the copy is not left floating in a mostly-empty container.
    // Below @sm — a phone, or a narrow cell — it stacks.
    //
    // The height is a fixed choice, not a consequence of the image: a portrait
    // source used to stretch the tile to 312px while a landscape one let it
    // fall to the floor. `panel-tall` is that 312px, chosen deliberately.
    const tall = variant === "panel-tall";
    body = (
      <div
        className={cn(
          SHELL_PANEL,
          "grid min-h-[12rem] grid-cols-1 items-stretch @sm:grid-cols-[13rem_1fr]",
          tall ? "@sm:min-h-[19.5rem]" : "@sm:min-h-[12rem]",
        )}
      >
        <div
          className={cn(
            FRAME,
            "aspect-[4/3] @sm:aspect-auto @sm:h-full @sm:min-h-[9rem]",
          )}
        >
          {art}
        </div>

        <div className="flex flex-col justify-center gap-2 p-5">
          {/* Short accent rule anchors the copy so the column reads as
              deliberate rather than as leftover space. */}
          <span aria-hidden className="bg-primary h-0.5 w-8 rounded-full" />
          <h3 className="text-on-surface text-lg leading-[1.15] font-semibold tracking-tight text-balance @sm:text-xl">
            {heading}
          </h3>
          {subtext && (
            <p className="text-on-surface-variant max-w-[34ch] text-sm leading-snug text-pretty">
              {subtext}
            </p>
          )}
          <Cta label={ctaLabel} accent />
        </div>
      </div>
    );
  } else if (variant === "art-first") {
    body = (
      <div className={cn(SHELL_TINTED, "flex min-h-[17rem] flex-col @sm:min-h-[20rem]", tint)}>
        <div className={cn(FRAME, "aspect-[16/10] w-full shrink-0")}>{art}</div>
        <div className={cn("flex flex-1 flex-col gap-2", PAD)}>
          <h3 className={TITLE}>{heading}</h3>
          {subtext && <p className={SUB}>{subtext}</p>}
          <span className="mt-auto pt-2">
            <Cta label={ctaLabel} />
          </span>
        </div>
      </div>
    );
  } else if (variant === "split") {
    body = (
      <div
        className={cn(
          SHELL_TINTED,
          "grid min-h-[14rem] grid-cols-1 items-stretch @md:min-h-[11rem] @md:grid-cols-2",
          tint,
        )}
      >
        <div
          className={cn(
            FRAME,
            "aspect-[16/10] @md:aspect-auto @md:h-full @md:min-h-[9rem]",
          )}
        >
          {art}
        </div>
        <div className={cn("flex flex-col justify-center gap-2", PAD)}>
          <h3 className={TITLE}>{heading}</h3>
          {subtext && <p className={SUB}>{subtext}</p>}
          <span className="pt-2">
            <Cta label={ctaLabel} />
          </span>
        </div>
      </div>
    );
  } else {
    // stacked — copy, art, CTA on the bottom edge.
    body = (
      <div
        className={cn(
          SHELL_TINTED,
          "grid grid-rows-[auto_1fr_auto] gap-y-4",
          "min-h-[17rem] @sm:min-h-[20rem]",
          PAD,
          tint,
        )}
      >
        <header>
          <h3 className={TITLE}>{heading}</h3>
          {subtext && <p className={cn(SUB, "mt-2")}>{subtext}</p>}
        </header>
        <div className={cn(FRAME, "aspect-[16/10] w-full self-center rounded-2xl")}>
          {art}
        </div>
        <footer>
          <Cta label={ctaLabel} />
        </footer>
      </div>
    );
  }

  const className = cn(
    "group @container block h-full focus-visible:outline-2 focus-visible:outline-offset-2",
    variant === "panel" || variant === "panel-tall" ? "rounded-2xl" : "rounded-3xl",
  );

  if (isInternal) {
    return (
      <Link href={ctaLink} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <a href={ctaLink} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  );
}
