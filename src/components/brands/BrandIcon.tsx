import { cn } from "@/lib/cn";

/**
 * A brand's vector mark, inlined.
 *
 * `dangerouslySetInnerHTML` is doing exactly what its name warns about, and it
 * is safe here for one reason: nothing reaches `Brand.iconSvg` without going
 * through `lib/brands/svg`, which rebuilds the markup from an allowlist rather
 * than trying to strip the bad parts out. If that ever stops being true, this
 * component is the blast radius.
 *
 * Inlining (rather than `<img src="…">`) is what lets a single-colour mark take
 * `currentColor` from the text beside it, so one upload works in both light and
 * dark without a second asset.
 *
 * That does not happen on its own, which is the trap this component exists to
 * close. SVG's `fill` property does not default to `currentColor` — it defaults
 * to **black**. The marks stored here are icon-set paths carrying no `fill` of
 * their own, so every one of them rendered pure black on every surface,
 * invisible against a dark background, while the text beside it was correctly
 * light. `fill-current` on the root is the fix, and it has to stay: `fill` is an
 * inherited property in SVG, so setting it on the root reaches every child that
 * does not set its own, and a multi-colour mark that *does* set its own keeps
 * it.
 */
export function BrandIcon({
  svg,
  size = 20,
  label,
  className,
}: {
  /** Sanitized markup from `Brand.iconSvg`. */
  svg: string | null | undefined;
  /**
   * The box the mark is drawn into, square.
   *
   * Square because the artwork is: these are 24×24 icon-set marks, and a
   * wordmark like "LOGITECH" is drawn wide-but-short *inside* that square with
   * the empty space baked in. Giving the box a wider aspect therefore buys
   * nothing — the mark still fits by height and simply centres, so the only
   * lever on how large a wordmark reads is how big this square is.
   */
  size?: number;
  /**
   * Announced by screen readers. Leave unset where the brand name is already
   * rendered as text next to the mark — the default is decorative, so the name
   * is not read out twice.
   */
  label?: string;
  className?: string;
}) {
  if (!svg) return null;

  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      // The sanitizer strips the root's width/height, so the box set here is
      // what actually sizes the mark.
      style={{ width: size, height: size }}
      className={cn(
        // `fill-current` on the root only — see the note above. Applying it to
        // every descendant instead would overwrite the explicit fills a
        // multi-colour mark depends on.
        "inline-grid shrink-0 place-items-center [&>svg]:block [&>svg]:size-full [&>svg]:fill-current",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
