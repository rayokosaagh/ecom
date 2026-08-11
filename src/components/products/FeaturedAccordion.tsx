"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/products/format";
import { resolveWell } from "@/lib/tints";

/**
 * The featured shelf as an expanding accordion.
 *
 * One panel is open at a time and the row's width never changes — opening one
 * takes the space from the others rather than from the page. That is the whole
 * trick, and it is why this is `flex-grow` rather than a width animation: the
 * panels divide a fixed row between them, so the arithmetic is the browser's
 * and nothing reflows around it.
 *
 * Three deliberate departures from the reference this was taken from:
 *
 *  - **It does not depend on hover.** Hover is a pointer affordance and half
 *    the people who see this will be on a phone. Below `md` the accordion is
 *    abandoned entirely for a scroll rail of equal panels, each already showing
 *    everything the expanded state would — no tap-to-expand-then-tap-to-open,
 *    which is the usual way this pattern goes wrong on touch.
 *  - **Focus opens a panel too.** Each panel is a real link, so tabbing through
 *    them opens each in turn. A keyboard user gets the same information a mouse
 *    user does instead of a row of narrow strips.
 *  - **It respects reduced motion.** A panel tripling in width is a large
 *    movement; under `prefers-reduced-motion` the swap is instant.
 *
 * ## Why no text sits on the photograph
 *
 * It used to. The name, brand and price were laid over the image in fixed
 * white, under a black scrim gradient that darkened the bottom half of every
 * panel to guarantee they stayed legible.
 *
 * That is a defensible way to caption media, and it is what streaming and
 * editorial cards do — but it is not what this app does anywhere else, and
 * that is the whole objection. Every other surface here states its type in
 * `on-surface` / `on-surface-variant` against a `surface-container-*` fill.
 * A panel with white type burned onto a photo behind a black wash reads as a
 * component borrowed from somewhere else, because it is one, and no amount of
 * tokenising the scrim fixes it: the scrim itself is the foreign element.
 *
 * So the type moved off the media entirely. Each panel is now an ordinary M3
 * card — media on top, a content area beneath it on the card's own surface —
 * and every string in it takes a scheme colour that flips with the theme. The
 * scrim is gone rather than restyled, because with nothing over the image
 * there is nothing to guarantee legibility against.
 *
 * The one mark still over the photo is the closed panel's vertical name, which
 * has nowhere else to go: a closed panel is a ~7rem strip and a horizontal
 * name would truncate to two letters. It is a *surface* over the media rather
 * than text on it — a translucent `surface-container-lowest` pill with
 * `on-surface` type, the same pill language as the brand and category rails —
 * so it stays legible over any photograph without a scrim and still moves with
 * the scheme.
 */

export interface AccordionProduct {
  slug: string;
  name: string;
  image: string | null;
  brand: string | null;
  minCents: number;
  priceVaries: boolean;
  soldOut: boolean;
  /** Admin's chosen background preset; null falls back to the auto cycle. */
  tint: string | null;
}

// The palette itself, the reasoning behind it, and the automatic fallback all
// live in `lib/tints` now, because the promo banners and the featured spotlight
// offer the same choice and three copies of a colour list is three chances for
// them to disagree.

export function FeaturedAccordion({
  products,
  className,
}: {
  products: AccordionProduct[];
  className?: string;
}) {
  // The first panel starts open rather than all of them closed: a row of
  // identical strips gives a first-time visitor nothing to read and no reason
  // to reach for it.
  const [active, setActive] = useState(0);

  // Two panels is a pair, not an accordion, and one is just a picture.
  if (products.length < 3) return null;

  // Resolved once for the row rather than per panel inside the map, because the
  // automatic fallback depends on a panel's position among *all* of them.
  const wells = products.map((product, index) => resolveWell(product.tint, index));

  return (
    <ul
      className={cn(
        // Mobile: a scroll rail. Desktop: a fixed row that divides itself.
        "flex gap-2 overflow-x-auto pb-2 md:gap-3 md:overflow-visible md:pb-0",
        // The rail should bleed to the screen edge rather than stopping short.
        "-mx-4 px-4 md:mx-0 md:px-0",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {products.map((product, index) => {
        const open = index === active;
        const price = product.priceVaries
          ? `From ${formatPrice(product.minCents)}`
          : formatPrice(product.minCents);

        return (
          <li
            key={product.slug}
            className={cn(
              "h-[20rem] shrink-0 md:h-[26rem] md:shrink",
              // Wide enough on a phone that the next one peeks and says "scroll".
              "w-[76vw] sm:w-[20rem] md:w-auto",
              // A flex item defaults to `min-width: auto`, which is the width of
              // its own content — so the name and price inside a *closed* panel
              // set a floor the row had to honour, and the open panel could
              // never actually reach its three shares. With this the flex-basis
              // of 0 means what it says, and the caption below can stay in the
              // markup instead of being torn out to work around it.
              "md:min-w-0",
              // The redistribution itself. An open panel takes three shares of
              // the row, a closed one takes one.
              open ? "md:flex-[3_1_0%]" : "md:flex-[1_1_0%]",
              "transition-[flex-grow] duration-[var(--duration-long2)] ease-[var(--ease-emphasized)]",
              "motion-reduce:transition-none",
            )}
          >
            <Link
              href={`/products/${product.slug}`}
              // Pointer and keyboard open a panel the same way. `onMouseEnter`
              // rather than `onMouseOver`, which fires again for every child.
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              aria-label={`${product.name} — ${product.soldOut ? "sold out" : price}`}
              className={cn(
                // A column, not a stack of overlays: media on top, content
                // beneath it on the card's own surface. That split is what
                // removed the scrim — the caption is no longer on the photo, so
                // nothing has to be darkened to keep it readable.
                "group/panel relative flex size-full flex-col overflow-hidden",
                // M3 extra-large shape, the same 28px the bulk bar and the
                // dialog-shaped surfaces in this app use for a big container.
                // The card's fill is `surface-container`, one step below the
                // media well inside it, so the two read as layered.
                "bg-surface-container ring-outline-variant/60 rounded-2xl ring-1",
                // Elevation carries the interaction, the way `Card interactive`
                // does. `.state-layer` cannot: its overlay sits at z-index -1
                // so an image in normal flow would cover it.
                "shadow-elevation-1 hover:shadow-elevation-3 focus-visible:shadow-elevation-3",
                "transition-shadow duration-[var(--duration-medium2)] ease-[var(--ease-standard)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2",
              )}
            >
              {/* The media well. `min-h-0` because a flex child's default
                  `min-height: auto` refuses to shrink below its content, which
                  would let a tall image push the content strip off the bottom
                  of a fixed-height panel. */}
              {/*
                The admin's choice if there is one, and the palette cycled by
                position if there is not — see `resolveWellTint`.

                The neutral fill stays underneath either way: the tint is a
                `background-image` and this a `background-color`, so the surface
                shows through the wash and is what a transparent PNG's margins
                sit on.
              */}
              <div
                className={cn(
                  "bg-surface-container-highest relative min-h-0 flex-1 overflow-hidden",
                  wells[index].className,
                )}
                style={wells[index].style}
              >
                {product.image ? (
                  // Plain <img>: these URLs are operator-supplied and can point at
                  // any host, so they are deliberately not routed through
                  // next/image — the same call the catalogue card makes.
                  /*
                    `contain`, not `cover`, and the panel's proportions are the
                    reason.

                    The catalogue's product shots are square — 500x500,
                    1080x1080, 904x840. A closed panel is roughly 199x416, a
                    ratio of 0.48. Filling that box with a square source means
                    showing a vertical slice through its middle: measured, 45%
                    to 54% of the image survived, magnified about two-fold. Half
                    of every product was cropped off and the rest was enlarged
                    past the resolution it was shot at, which is what read as
                    "zoomed".

                    Fitting instead of filling keeps the whole product at its
                    natural scale in both states. It leaves air above and below
                    in a closed panel, which is the correct trade: a product
                    nobody can identify is worse than a product with space
                    around it, and the well it sits in is a surface colour, so
                    the space reads as a mount rather than as a gap.
                  */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={product.image}
                    alt=""
                    loading={index === 0 ? "eager" : "lazy"}
                    className={cn(
                      "size-full object-contain transition-transform duration-[var(--duration-long2)] ease-[var(--ease-emphasized)] motion-reduce:transition-none",
                      //
                      // Size comes from two things, and the second is the one
                      // doing the real work.
                      //
                      // Padding first: less inset while narrow, since a closed
                      // panel has little width to spare and every pixel of
                      // padding there costs product. The extra bottom inset
                      // when closed is the pill's seat — fitting rather than
                      // filling centres the product in the well, which put the
                      // label squarely on top of it, so this re-centres the
                      // artwork in the space *above* the label.
                      //
                      // Then a scale on top. `object-contain` fits a square
                      // source to the *narrow* axis, so in a 199px-wide panel
                      // the product could only ever be 199px tall inside a
                      // 416px well — correct, and small. Scaling past the box
                      // is safe here in a way it would not be on a photograph:
                      // these are cut-outs that carry their own transparent
                      // margin, so what overflows and gets clipped is empty
                      // pixels rather than the product. Kept modest for that
                      // reason — push it much further and the clipping reaches
                      // the artwork itself.
                      //
                      // The two states fit their pictures differently, and that
                      // is deliberate rather than an inconsistency.
                      //
                      // A closed panel fills. It is a 199x416 strip whose job is
                      // to be an inviting slab of product, not a spec sheet —
                      // fitting a square source into it left the artwork
                      // stranded in the middle of a tall grey well with more
                      // mount than product. Filling crops it heavily, and that
                      // is the accepted price: nothing has to be *identified*
                      // in a closed panel, because the label names it and
                      // hovering shows the whole thing a moment later.
                      //
                      // An open panel fits. Once it is the thing being read,
                      // the product has to be complete and undistorted, so it
                      // keeps `object-contain` and its inset.
                      //
                      // Below `md` there is no closed state — every panel shows
                      // its caption — so the fill only applies from `md` up.
                      open
                        ? "scale-105 p-3 group-hover/panel:scale-[1.09]"
                        : "scale-110 p-2 md:scale-100 md:object-cover md:p-0",
                    )}
                  />
                ) : (
                  <span className="text-on-surface-variant grid size-full place-items-center">
                    <Icon name="image" size={32} />
                  </span>
                )}

                {/* Closed: the name turned on its side. Desktop only — there is
                    no closed state on a phone to label.

                    A translucent surface pill rather than the inverse-surface
                    chip this used to be. The inverse pair is legible over a
                    photo in both schemes, but it is also the loudest surface in
                    the system — a hard black slab in light mode — and beside
                    the rest of this page it read as a sticker on the image. A
                    blurred `surface-container-lowest` with an outline is the
                    same pill the brand and category rails use, and it belongs
                    to the photograph rather than sitting on top of it. */}
                {/*
                  The two labels never overlap, and the timing is what
                  guarantees it rather than good luck.

                  Both this pill and the caption below state the same product
                  name. Cross-fading them at equal duration meant that for a
                  few hundred milliseconds the panel painted its name twice —
                  a solid one and a translucent one drifting sideways as the
                  panel resized — which reads exactly like a ghost of the label
                  that was there a moment ago.

                  So the outgoing label leaves fast and the incoming one waits.
                  Whichever is departing gets `short2` with no delay; whichever
                  is arriving gets `medium2` behind a `medium2` delay. That
                  leaves a clear gap in the middle where neither is drawn, and
                  the arriving label lands just after the 500ms width settles —
                  so the name appears once the panel has stopped moving, never
                  during.
                */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-3 left-1/2 hidden -translate-x-1/2 md:block",
                    "transition-opacity motion-reduce:transition-none",
                    open
                      ? "opacity-0 delay-0 duration-[var(--duration-short2)]"
                      : "opacity-100 delay-[var(--duration-medium2)] duration-[var(--duration-medium2)]",
                  )}
                >
                  {/* The fill and the blur are one setting, not two. At 85%
                      opaque there was nothing left behind the pill to blur, so
                      the frosting did not read; letting more of the photograph
                      through is what makes the blur visible at all. 70% is as
                      far as it goes before `on-surface` type starts losing the
                      brighter product shots underneath it. */}
                  <span className="bg-surface-container-lowest/70 text-on-surface ring-outline-variant/40 block rounded-full px-2 py-3 text-sm font-medium whitespace-nowrap ring-1 backdrop-blur-xl [writing-mode:vertical-rl]">
                    {product.name}
                  </span>
                </span>
              </div>

              {/*
                The content area, on the card's surface rather than over the
                photo. Always present below `md`, where every panel is open.

                Its height animates from nothing rather than being switched on
                with `hidden`, and that is the whole fix for the jump when
                panels swap. `display` cannot be transitioned, so the caption
                used to appear at full size on the first frame — laid out inside
                a panel still 7rem wide, wrapping to three lines — and then
                reflow as the width caught up, while the media well above it
                lost its height in the same instant and re-cropped the
                photograph. Two abrupt changes on top of a 500ms slide.

                `grid-template-rows: 0fr → 1fr` is the same mechanism
                `.row-leaving` uses in globals.css, and for the same reason: it
                animates to the content's real height without anything having to
                measure it. Run at the row's own duration, the caption opens as
                the panel widens and the media gives up its height gradually —
                one movement instead of three.
              */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-[var(--duration-long2)] ease-[var(--ease-emphasized)] motion-reduce:transition-none",
                  open
                    ? "grid-rows-[1fr]"
                    : "grid-rows-[1fr] md:grid-rows-[0fr]",
                )}
              >
                {/* `min-h-0` lets the child be squeezed rather than setting its
                    own floor; `overflow-hidden` is what clips it while it is. */}
                {/* The mirror of the pill's timing above — see that note. Below
                    `md` every panel is open, so the caption is simply always
                    there and none of this applies. */}
                <div
                  className={cn(
                    "min-h-0 overflow-hidden opacity-100 transition-opacity motion-reduce:transition-none",
                    open
                      ? "md:opacity-100 md:delay-[var(--duration-medium2)] md:duration-[var(--duration-medium2)]"
                      : "md:opacity-0 md:delay-0 md:duration-[var(--duration-short2)]",
                  )}
                >
                  {/* The row itself, and the padding lives here rather than on
                      the collapsing wrapper above — padding on a `0fr` row is
                      still painted, so a closed panel would keep a band of
                      empty surface it could never shed. */}
                  <div className="flex items-end justify-between gap-3 p-4">
                    <span className="min-w-0">
                      {/* M3 label-small: 11px, heavily tracked, upper. The same
                      treatment the hero eyebrow above this uses. */}
                      {product.brand && (
                        <span className="text-on-surface-variant block truncate text-[11px] font-medium tracking-[0.18em] uppercase">
                          {product.brand}
                        </span>
                      )}
                      {/* One line, always. `text-balance` let a long name wrap to
                      two or three lines depending on how wide the panel had got
                      — which changed the caption's height mid-animation, and
                      the media well above it re-cropped to match on every
                      frame. A fixed single line keeps the whole card's internal
                      geometry constant while only its width moves. */}
                      <span className="text-on-surface mt-1 block truncate text-lg leading-tight font-medium">
                        {product.name}
                      </span>

                      {/* The affordance the panel otherwise lacks — it looks like a
                      picture, and this says it is a destination. Primary, like
                      every other link in the app that leads somewhere. */}
                      <span className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-medium">
                        View product
                        <Icon
                          name="arrow_forward"
                          size={14}
                          className="transition-transform duration-[var(--duration-short4)] ease-[var(--ease-emphasized)] group-hover/panel:translate-x-0.5 motion-reduce:transition-none"
                        />
                      </span>
                    </span>

                    {/* Sold out is a state, so it takes a pill rather than sitting
                    where a number would — and now that it is on a surface it
                    can take the error-container pair the rest of the app uses
                    for exactly this, instead of white on a black wash. */}
                    <span className="shrink-0 text-right whitespace-nowrap">
                      {product.soldOut ? (
                        <span className="bg-error-container text-on-error-container inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium">
                          {/* The same glyph `StockBadge` uses for out of stock, so
                          the storefront says this one thing one way. */}
                          <Icon name="error" size={14} />
                          Sold out
                        </span>
                      ) : (
                        <>
                          {product.priceVaries && (
                            <span className="text-on-surface-variant block text-[10px] font-medium tracking-[0.18em] uppercase">
                              From
                            </span>
                          )}
                          <span className="text-on-surface block text-xl leading-tight font-medium tabular-nums">
                            {formatPrice(product.minCents)}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
