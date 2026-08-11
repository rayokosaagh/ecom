"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brands/BrandMark";
import { Tilt } from "@/components/ui/Tilt";
import { Spotlight } from "@/components/ui/Spotlight";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/products/format";
import { resolveWell } from "@/lib/tints";
import { SALE_TINTS, saleGradient } from "@/components/products/sale-tints";
import { RatingBadge } from "@/components/reviews/RatingStars";
import type { FeaturedProductView } from "@/lib/featured/service";

/** The view plus what shoppers have said about it. */
type ShowcaseProduct = FeaturedProductView & {
  rating?: { average: number; count: number } | null;
};

/** How long each panel holds the stage before the carousel moves itself on. */
const AUTOPLAY_MS = 10000;

/**
 * The fade either side of the wrap back to the first panel. Long enough to read
 * as a deliberate return to the start, short enough that the carousel does not
 * appear to stall on the last product.
 */
const WRAP_FADE_MS = 260;

/**
 * The home page spotlight.
 *
 * One product at a time, with a named strip and dot indicators below to move
 * between them. A row of equal cards asks the shopper to compare several
 * things at once; a spotlight gives one product the stage.
 *
 * The *arrangement* is borrowed from a reference; the surface treatment is
 * not. Everything here is drawn from what the rest of the site already uses —
 * the outlined card, the spaced-caps eyebrow over a two-tone heading, the pill
 * buttons, and the secondary-container fill that marks a selection on the
 * brand and category rails.
 *
 * Every panel is rendered and the track slides, rather than swapping one panel
 * for another. That buys two things a crossfade cannot: the movement is
 * continuous, so the eye can follow which way it went, and the container is
 * always as tall as the tallest panel, so a shorter product cannot make the
 * page jump as it arrives.
 *
 * It loops on its own, and yields the moment there is any reason to think
 * someone is mid-thought: a pointer resting on it, focus inside it, the tab in
 * the background, the section scrolled off, or a stated preference for reduced
 * motion. The pointer and focus cases are not only courtesy — the panel carries
 * two links, and a carousel that advances out from under a cursor already on
 * its way to "View product" sends the shopper to a different product than the
 * one they were looking at.
 */
export function FeaturedShowcase({
  products,
  lead,
}: {
  products: ShowcaseProduct[];
  /**
   * The hero copy, when this carousel is the front door rather than a shelf.
   *
   * Passing it in rather than rendering it here is what lets the headline stay
   * a server component while everything below is a client one — and it keeps
   * this file ignorant of what the shop's opening line happens to say.
   *
   * Its presence is also the layout switch. With a lead the section becomes the
   * two-column hero: copy on the left, one product on a stage to the right,
   * and the panel's own copy condensed to what fits beside a headline. Without
   * it, nothing changes — the section is the wide "Featured picks" shelf it has
   * always been.
   */
  lead?: React.ReactNode;
}) {
  const isHero = Boolean(lead);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const baseId = useId();

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Starts false so a carousel below the fold is not already several products
  // in by the time it is scrolled to.
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [wrapping, setWrapping] = useState(false);

  /**
   * The panel a programmatic scroll is on its way to, or null when the scroll
   * position is the visitor's own doing.
   *
   * Without this the listener below reports every panel a smooth scroll passes
   * over as though it had been chosen. Going from panel 0 to 1 reads back as
   * 0 → 1 → 0 → 1: the optimistic set lands first, then the animation's own
   * opening frames are still nearer panel 0. Nothing looked broken while the
   * carousel only moved when clicked, but on a five-second timer every one of
   * those spurious changes restarts the clock and re-runs the panel's entry
   * animation from the top.
   */
  const pendingTarget = useRef<number | null>(null);
  const releaseTarget = () => {
    pendingTarget.current = null;
  };

  // Which panel is showing is read back off the scroll position rather than
  // being the thing that drives it. That inversion is what makes a swipe work:
  // the browser owns the movement — with its own momentum and rubber-banding —
  // and the tabs and dots simply ask it to scroll somewhere.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (track.clientWidth === 0) return;
        const next = Math.round(track.scrollLeft / track.clientWidth);

        const target = pendingTarget.current;
        if (target !== null) {
          // Still travelling. Everything short of the destination is a frame of
          // the animation, not a decision.
          if (next !== target) return;
          pendingTarget.current = null;
        }

        // Guarded so a scroll that stays within one panel does not re-render.
        setIndex((prev) => (prev === next ? prev : next));
      });
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Live, so a preference changed mid-session is honoured without a reload —
  // and read here rather than left to CSS because the thing being suppressed is
  // a timer, which the global reduced-motion rule cannot reach.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Background tabs still run timers. Without this, a visitor who leaves for a
  // minute comes back to a carousel that has silently moved on.
  useEffect(() => {
    const sync = () => setTabVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      // Shrunk viewport rather than a ratio of the element. A ratio would be
      // unreachable here: stacked on a phone this section runs well past one
      // screen, and an element taller than 2.5 viewports can never report 40%
      // of itself visible, so the carousel would sit frozen on exactly the
      // devices it looks best on.
      { threshold: 0, rootMargin: "-10% 0px -10% 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Guards against the list shrinking under a stale index after a revalidate.
  const activeIndex = products.length > 0 ? Math.min(index, products.length - 1) : 0;

  const running =
    products.length > 1 && !hovered && !focused && onScreen && tabVisible && !reducedMotion;

  const wrapTimer = useRef(0);
  const settleTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(wrapTimer.current);
      window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const goTo = (i: number) => {
    // Set optimistically as well as scrolling: a smooth scroll takes a few
    // hundred milliseconds to report its first event, and a control that looks
    // dead for that long reads as broken.
    setIndex(i);
    const track = trackRef.current;
    if (!track) return;

    pendingTarget.current = i;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });

    // A backstop, in case the scroll is interrupted and never lands on `i` —
    // otherwise the listener stays muted and a later swipe would move the
    // panels without moving the tabs or dots with them.
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(releaseTarget, 1200);
  };

  const advance = () => {
    const next = (activeIndex + 1) % products.length;
    if (next !== 0) {
      goTo(next);
      return;
    }

    // Wrapping. Scrolling smoothly back to the first panel would whip the whole
    // strip past the eye in one movement — the more products are featured, the
    // worse it reads. Fading out, jumping, and fading back in costs the same
    // moment and says "back to the start" instead.
    setWrapping(true);
    wrapTimer.current = window.setTimeout(() => {
      setIndex(0);
      // Instant, so nothing is travelling and there are no intermediate
      // positions for the listener to misread.
      trackRef.current?.scrollTo({ left: 0, behavior: "instant" });
      releaseTarget();
      setWrapping(false);
    }, WRAP_FADE_MS);
  };

  // Held in a ref so the timer below depends only on *when* to fire, not on the
  // identity of a closure that changes every render.
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });

  // A timeout keyed on the active panel rather than a repeating interval, so
  // choosing a product by hand gives that product a full five seconds too
  // instead of however much was left on a shared clock.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => advanceRef.current(), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [running, activeIndex]);

  if (products.length === 0) return null;


  return (
    <section
      ref={sectionRef}
      // As the hero there is no "Featured picks" heading to point at — the
      // page's own h1 lives in the lead — and the track below still carries its
      // own carousel label, so the region is left unlabelled rather than
      // pointing at an id that is not rendered.
      aria-labelledby={isHero ? undefined : `${baseId}-heading`}
      className={cn(
        "mx-auto max-w-7xl px-4 sm:px-6",
        isHero ? "pt-10 pb-20 sm:pt-14 sm:pb-24" : "pb-24",
      )}
      // Mouse events rather than pointer events: a touch raises `pointerenter`
      // and then frequently never raises `pointerleave`, which would strand the
      // carousel suspended for the rest of the visit on exactly the devices
      // where there is no pointer to rest on it.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // These are focusin/focusout in the DOM, so they cover anything focused
      // inside the section — a tab in the strip, a link on the panel.
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div
        className={cn(
          isHero &&
            "grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14",
        )}
      >
        {/* Nothing at all when this is the plain shelf. */}
        {lead}

        {/* `min-w-0` is load-bearing in the hero layout: a grid item defaults to
            `min-width: auto`, so the track's own content would refuse to let
            this column be narrower than its widest panel and would squeeze the
            copy beside it down to nothing. */}
        <div className={cn(isHero && "min-w-0")}>
          {/* Same header shape as "Latest arrivals" below it — but as the hero
              the page's h1 is the heading, and a "Featured picks" title over the
              product would be a second one competing with it. "View all" goes
              with it, since the lead already carries "Shop all products" to the
              same place. */}
          {!isHero && (
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2
                id={`${baseId}-heading`}
                className="text-on-surface text-2xl font-medium tracking-tight sm:text-3xl"
              >
                Featured <span className="accent-word">picks</span>
              </h2>
              <Link
                href="/products"
                className="text-primary rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                View all
              </Link>
            </div>
          )}

          <Card variant="outlined" className="overflow-hidden">
        {/* A scroll container, not a transformed strip. Swiping is the whole
            reason: a translated track cannot be dragged, so on a phone the
            carousel could only be changed by the controls underneath it. The
            scrollbar is hidden because the panels themselves are the
            affordance.

            `overflow-y-hidden` is deliberate. Setting one axis to `auto`
            computes the other from `visible` to `auto` as well, and this track
            reported 12px of vertical scrollable overflow — scrollHeight 627
            against clientHeight 615 — which made the whole carousel a
            vertically scrollable box.

            What produces those 12px is not established. It survives hiding
            every panel and every child of a panel, disabling the spotlight
            animation, the `scale-105` on non-current panels, the tilt
            transform and the drop shadow, and it is unchanged by
            `overflow-x: hidden` or any `scrollbar-width`, so it is neither a
            descendant nor a scrollbar gutter. Pinning it down was not worth
            more than this comment; a horizontal carousel has no business
            scrolling vertically either way, and nothing real is clipped —
            every panel measures exactly the track's height, with its lowest
            content ending well inside. */}
        <div
          ref={trackRef}
          role="group"
          aria-roledescription="carousel"
          aria-label="Featured products"
          // Focusable so the region can be scrolled from the keyboard.
          tabIndex={0}
          // Any hand on the track outranks a scroll still in flight: from here
          // on the position it reports is a choice, not an animation frame.
          onPointerDown={releaseTarget}
          onTouchStart={releaseTarget}
          onWheel={releaseTarget}
          onKeyDown={releaseTarget}
          className={cn(
            "flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "transition-opacity ease-[var(--ease-standard)]",
            wrapping ? "opacity-0" : "opacity-100",
          )}
          style={{ transitionDuration: `${WRAP_FADE_MS}ms` }}
        >
          {products.map((product, i) => {
            const current = i === activeIndex;
            return (
              <div
                key={product.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${products.length}: ${product.name}`}
                // Deliberately not `inert` and not hidden. When this was a
                // transformed strip the off-stage panels really were
                // unreachable, so hiding them was right; in a scroll container
                // they are one swipe away. `inert` also applies
                // `pointer-events: none`, which is the last thing a surface
                // meant to be dragged should carry.
                className={cn(
                  "grid w-full shrink-0 snap-start",
                  // The hero panel stays one column at every width: it is
                  // already sitting in half a page, and splitting that again
                  // would leave the product a quarter of the screen.
                  !isHero && "md:grid-cols-2",
                )}
              >
                <Spotlight
                  className={cn(
                    "bg-surface-container-high relative aspect-[4/3] overflow-hidden",
                    // The floor, not the height — see the note on the image's
                    // `max-h` below, which is what actually bounds the panel on
                    // desktop. Both were trimmed together so a landscape
                    // product, which rests on this minimum, shortens by the same
                    // proportion as a portrait one, which rests on the cap.
                    !isHero && "md:aspect-auto md:min-h-[24rem]",
                    // The same background an admin picked for this product in
                    // the featured list, so it looks like itself in both places
                    // it appears on the home page. The spotlight's own lighting
                    // layers over the top: the wash is the colour of the room,
                    // the spotlight is the lamp standing in it.
                    resolveWell(product.tint, i).className,
                  )}
                  style={resolveWell(product.tint, i).style}
                >
                  {/*
                    The stage's colour, one per panel.

                    Assorted rather than random, and the distinction is the
                    whole of it. `sale-tints` already sets out why a colour
                    drawn at random is the wrong tool: a value picked during
                    render differs between the server pass and the client's,
                    which is a hydration mismatch, and a product that wears a
                    different colour on every visit is a product nobody can
                    recognise. So the palette is walked by panel index instead.

                    By index rather than by hashing the slug, for the reason
                    that file gives about the sale shelf: a hash can land the
                    same colour on two panels in a row, and with four tints and
                    a handful of featured products, cycling guarantees every
                    neighbour differs.

                    Borrowed whole rather than redefined. Those four are built
                    from theme tokens with no hardcoded hex in them, so this
                    follows the light and dark schemes — and the wash is the
                    same 70%-to-20% diagonal the sale cards wear, laid over the
                    neutral fill above rather than replacing it, so the product
                    still sits on a surface rather than in a puddle of colour.
                  */}
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: saleGradient(SALE_TINTS[i % SALE_TINTS.length]),
                    }}
                  />

                  {product.image ? (
                    // Two nested transforms rather than one. The settle owns
                    // the outer element at 700ms and the sway owns the inner at
                    // 150ms; sharing a single `transform` property would force
                    // one duration on both, and whichever was written last
                    // would silently overwrite the other with no error.
                      <div
                      className={cn(
                        "relative z-10 size-full transition-transform duration-700 ease-[var(--ease-emphasized)]",
                        // A gentle counter-drift against the slide: the image
                        // trails the panel, which reads as depth rather than a
                        // flat sheet of card moving sideways.
                        current ? "scale-100" : "scale-105",
                      )}
                    >
                      {/* Far higher than a grid card's 8deg, plus a slide.
                          This subject is one large cut-out with nothing beside
                          it for scale, and at card angles the movement simply
                          did not register — see the note on `maxDeg`. */}
                      <Tilt maxDeg={18} maxShiftPx={22} className="size-full">
                        {/* `contain` rather than `cover`, and only here: a
                            cut-out on transparency has to sit inside its box
                            to read as a product on a stage. The grid cards
                            keep `cover`, where filling the square matters more
                            than showing every edge.

                            Both the halo and the shadow are cast by CSS from
                            the alpha channel rather than baked into the file,
                            so they follow the theme instead of fighting one of
                            them — and they follow the product's own outline
                            rather than a box around it. See `.product-glow`.

                            The padding is what gives the halo somewhere to
                            go: `object-contain` fits the artwork to the box,
                            so with no inset the glow would be clipped at the
                            edges it is meant to wrap. */}
                        {/* The `max-h` is what bounds the panel. `size-full` is
                            `height: 100%`, but on desktop the stage above is
                            `aspect-auto` with only a `min-height`, so that
                            percentage has no definite height to resolve against
                            and collapses to `auto` — leaving the product's own
                            intrinsic aspect ratio to set the height of the whole
                            carousel. A portrait cut-out then pushed every panel
                            to ~682px, well past the 24rem the stage asks for.
                            The cap belongs on the image rather than on the stage
                            because the stage is `overflow-hidden`, which would
                            crop; `object-contain` fits the artwork instead. It
                            cannot bind on mobile, where `aspect-[4/3]` already
                            gives the stage a definite height to fill.

                            Because it is the real ceiling, this is the number to
                            change when the section is asked to be shorter — the
                            stage's `min-h` only moves the panels whose artwork
                            is too short to reach it. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={product.image}
                          alt={product.name}
                          className="product-glow size-full max-h-[35rem] object-contain p-8 sm:p-12"
                        />
                      </Tilt>
                      </div>
                  ) : (
                    <div className="text-on-surface-variant relative z-10 grid size-full place-items-center">
                      <Icon name="image" size={48} />
                    </div>
                  )}

                  {(product.isNew || product.soldOut) && (
                    <span
                      className={cn(
                        "absolute top-4 left-4 rounded-full px-3 py-1 text-xs font-medium",
                        product.soldOut
                          ? "bg-error-container text-on-error-container"
                          : "bg-primary text-on-primary",
                      )}
                    >
                      {product.soldOut ? "Sold out" : "New"}
                    </span>
                  )}
                </Spotlight>

                {/* The copy settles a beat after the slide, so the panel does
                    not arrive as one rigid block. */}
                <div
                  className={cn(
                    "flex flex-col transition-all duration-500 ease-[var(--ease-emphasized)]",
                    isHero ? "p-5 sm:p-6" : "p-6 sm:p-8",
                    current
                      ? "translate-y-0 opacity-100 delay-150"
                      : "translate-y-3 opacity-0",
                  )}
                >
                  <p className="text-primary flex items-center gap-2 text-xs font-medium tracking-[0.25em] uppercase">
                    <Icon name="stars" size={16} filled />
                    Featured
                  </p>

                  <h3 className="text-on-surface mt-4 text-2xl leading-[1.15] font-medium tracking-tight text-balance sm:text-3xl">
                    {product.name}
                  </h3>

                  {/* Renders nothing until someone has rated it, so a new
                      feature does not lead with an empty row of grey stars. */}
                  {product.rating && (
                    <RatingBadge
                      average={product.rating.average}
                      count={product.rating.count}
                      size={15}
                      className="mt-2"
                    />
                  )}

                  <p className="text-on-surface-variant mt-3 flex items-center gap-1.5 text-xs tracking-wide uppercase">
                    {product.brand &&
                      (product.brand.iconSvg || product.brand.logo ? (
                        <BrandMark
                          svg={product.brand.iconSvg}
                          logo={product.brand.logo}
                          treatment={product.brand.logoTreatment}
                          size={16}
                          label={product.brand.name}
                        />
                      ) : (
                        <span className="text-on-surface font-medium">
                          {product.brand.name}
                        </span>
                      ))}
                    {product.brand && product.category && (
                      <span aria-hidden className="bg-outline-variant h-3 w-px shrink-0" />
                    )}
                    {product.category}
                  </p>

                  {/* Both the blurb and the spec list are dropped in the hero.
                      There is a headline and three buttons in the column beside
                      this one; a paragraph and a spec table underneath the
                      product turn the front door into two things to read at
                      once. What is left — name, rating, brand, price — is the
                      identification, and the panel links through for the rest. */}
                  {!isHero && (
                    <p className="text-on-surface-variant mt-4 line-clamp-3 leading-relaxed">
                      {product.description}
                    </p>
                  )}

                  {!isHero && product.specs.length > 0 && (
                    <ul className="text-on-surface-variant mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {product.specs.map((spec) => (
                        <li key={spec.label} className="flex items-center gap-1.5">
                          <Icon name={spec.icon ?? "label"} size={16} />
                          {spec.label}
                          <span className="text-on-surface font-medium">
                            {spec.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p
                    className={cn(
                      "text-on-surface text-2xl",
                      isHero ? "mt-4" : "mt-6",
                    )}
                  >
                    {product.priceVaries && (
                      <span className="text-on-surface-variant text-sm">from </span>
                    )}
                    {formatPrice(product.minCents)}
                  </p>

                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-3",
                      isHero ? "mt-5" : "mt-6 pt-2",
                    )}
                  >
                    <Link
                      href={`/products/${product.slug}`}
                      className="bg-primary text-on-primary state-layer inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-medium shadow-none transition-all duration-200 hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 sm:w-auto"
                    >
                      View product
                      <Icon name="arrow_forward" size={18} />
                    </Link>

                    {/* Suppressed in the hero: the lead beside it already
                        carries "Shop all products", and a third destination in
                        the same row makes the row a menu rather than an
                        action. */}
                    {!isHero && product.category && (
                      <Link
                        href={`/products?category=${encodeURIComponent(
                          product.category.toLowerCase().replace(/\s+/g, "-"),
                        )}`}
                        className="text-primary state-layer inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                      >
                        Shop {product.category}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {products.length > 1 && (
        <>
          {/* Selection rail, in the same pill language as the brand and
              category rails. Dropped in the hero: a row of named thumbnails
              under the panel is a second product list directly beneath the
              first, in a column that is already only half the page. The dots
              below take over its job there, and take over its labels with it. */}
          {!isHero && (
          <nav
            aria-label="Choose a featured product"
            className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
          >
            {products.map((product, i) => {
              const selected = i === activeIndex;
              return (
                <button
                  key={product.id}
                  type="button"
                  aria-current={selected}
                  onClick={() => goTo(i)}
                  className={cn(
                    "flex h-12 shrink-0 items-center gap-2 rounded-full py-1 pr-4 pl-1 text-sm font-medium whitespace-nowrap transition-colors duration-200 sm:h-14 sm:gap-3 sm:pr-5",
                    "focus-visible:outline-2 focus-visible:outline-offset-2",
                    selected
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant hover:bg-on-surface/[0.06]",
                  )}
                >
                  <span className="bg-surface-container-highest size-10 shrink-0 overflow-hidden rounded-full sm:size-12">
                    {product.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={product.image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-on-surface-variant grid size-full place-items-center">
                        <Icon name="image" size={18} />
                      </span>
                    )}
                  </span>
                  <span className="max-w-28 truncate sm:max-w-40">{product.name}</span>
                </button>
              );
            })}
          </nav>
          )}

          {/* Position indicators.

              Hidden from assistive tech only while the strip above is there to
              expose the same choice with real names — a second set of controls
              for one panel is noise to anyone not looking at them. In the hero
              the strip is gone, so these stop being decorative and become the
              only way to change panel: they take the tab order and each one
              takes the name of the product it selects. */}
          <div
            aria-hidden={isHero ? undefined : true}
            role={isHero ? "group" : undefined}
            aria-label={isHero ? "Choose a featured product" : undefined}
            className={cn(
              "flex gap-2",
              // Under the panel it belongs to, and aligned with the copy in
              // that column rather than with the page.
              isHero ? "mt-5 justify-center lg:justify-start" : "mt-6 justify-center",
            )}
          >
            {products.map((product, i) => {
              const current = i === activeIndex;
              return (
                <button
                  key={product.id}
                  type="button"
                  tabIndex={isHero ? undefined : -1}
                  aria-label={isHero ? product.name : undefined}
                  aria-current={isHero ? current : undefined}
                  onClick={() => goTo(i)}
                  className={cn(
                    "h-2 overflow-hidden rounded-full transition-all duration-300 ease-[var(--ease-emphasized)]",
                    current ? "w-8" : "bg-outline-variant hover:bg-outline w-2",
                    // Dimmed to a track only while something is draining it;
                    // held or stationary it stays the solid dot it was.
                    current && (running ? "bg-primary/25" : "bg-primary"),
                  )}
                >
                  {/* Mounted only while the clock is actually running, which is
                      also what restarts it: suspending unmounts this, and
                      resuming mounts a fresh one from zero — the same reset the
                      timeout itself gets, so the bar cannot claim time the
                      carousel is not counting. */}
                  {current && running && (
                    <span
                      className="bg-primary block h-full w-full origin-left rounded-full"
                      style={{
                        animation: `carousel-progress ${AUTOPLAY_MS}ms linear forwards`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
        </div>
      </div>
    </section>
  );
}
