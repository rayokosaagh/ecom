"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brands/BrandMark";
import { Tilt } from "@/components/ui/Tilt";
import { Spotlight } from "@/components/ui/Spotlight";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/products/format";
import { RatingBadge } from "@/components/reviews/RatingStars";
import {
  SpecificationHotspots,
  SpecificationList,
} from "@/components/products/SpecificationHotspots";
import { buildSpecCallouts } from "@/lib/products/spec-callouts";
import type { FeaturedProductView } from "@/lib/featured/service";

/** The view plus what shoppers have said about it. */
type ShowcaseProduct = FeaturedProductView & {
  rating?: { average: number; count: number } | null;
};

/** How long each panel holds the stage before the carousel moves itself on. */
const AUTOPLAY_MS = 10000;

/**
 * The surface a floating chip is drawn on.
 *
 * Solid, because there is no card behind it. These were frosted while they sat
 * over a tinted stage, where a solid fill would have read as a second card laid
 * on the first. The stage is gone: the chips sit on the page's own background,
 * and a translucent slab on a plain background is just a slightly different
 * shade of that background — it needs its own surface to read as a thing at
 * all. Its shadow is what separates it now, not its blur.
 *
 * `bg-surface` rather than a fixed white: it is a scheme token, so the chips
 * turn dark with the theme and the text on them stays `on-surface` in both.
 */
const CHIP = "bg-surface hero-float";

/**
 * This product's callouts, chosen from its own spec rows.
 *
 * A thin wrapper so both the positioned layer and the phone list are built from
 * one call per panel and cannot disagree about which specs were picked. The
 * choosing itself is `lib/products/spec-callouts` — no spec values are decided
 * here, and none are written down anywhere in this file.
 */
const calloutsFor = (product: ShowcaseProduct) => buildSpecCallouts(product.specs);

/**
 * The fade either side of a deliberate change of product.
 *
 * Long enough to read as one product giving way to another, short enough that
 * the carousel does not appear to stall between them. It began as the fade
 * around the wrap back to the first panel and now covers every change a dot or
 * the autoplay makes — see `goTo`.
 */
const CHANGE_FADE_MS = 260;

/**
 * How far the product travels as it changes, in px.
 *
 * Enough to say which way the carousel went, not so much that it becomes the
 * slide this replaced — that one moved a whole panel width, which is precisely
 * what put two products on screen at once and gave the container a boundary to
 * cut. At this distance the old product is gone before it has travelled far
 * enough to meet an edge.
 */
const CHANGE_SHIFT_PX = 36;

/**
 * The home page's front door: the shop's opening line, and one featured product
 * on a stage beside it.
 *
 * One product at a time, with dot indicators below to move between them. A row
 * of equal cards asks the shopper to compare several things at once; a
 * spotlight gives one product the stage — and putting the copy beside it rather
 * than above it means the page makes its claim and shows the evidence in the
 * same screen.
 *
 * There was a second arrangement of all this — a centred block of copy, with
 * the featured products as a wide "Featured picks" shelf much further down the
 * page — published by an admin setting. Both are gone: the shelf layout lived
 * here as an `isHero` fork through every panel, and half of this file was
 * spent asking which of the two it was in. What remains is the arrangement the
 * shop actually serves.
 *
 * The *arrangement* is borrowed from a reference; the surface treatment is
 * not. Everything here is drawn from what the rest of the site already uses —
 * the spaced-caps eyebrow, the pill buttons, and the secondary-container fill
 * that marks a selection on the brand and category rails.
 *
 * Every panel is rendered in one scrolling track rather than being swapped in
 * and out. That is what makes a swipe work — the browser owns the movement,
 * with its own momentum and rubber-banding — and it keeps the container as tall
 * as the tallest panel, so a shorter product cannot make the page jump as it
 * arrives.
 *
 * How a change *looks* is a separate question from how it is stored, and the
 * two answers differ here. A drag slides, because the movement is the hand's
 * own. A dot or the autoplay dissolves: fade out, jump while nothing is
 * visible, fade back in. Sliding under those puts two products on screen with a
 * boundary between them, and the container has to cut that boundary somewhere —
 * which is the seam this arrangement removes rather than softens. See `goTo`.
 *
 * It loops on its own, and yields the moment there is any reason to think
 * someone is mid-thought: a pointer resting on it, focus inside it, the tab in
 * the background, the section scrolled off, or a stated preference for reduced
 * motion. The pointer and focus cases are not only courtesy — the panel carries
 * a link, and a carousel that advances out from under a cursor already on its
 * way to "View" sends the shopper to a different product than the one they were
 * looking at.
 */
export function FeaturedShowcase({
  products,
  lead,
}: {
  products: ShowcaseProduct[];
  /**
   * The hero copy — the page's h1 and its call to action.
   *
   * Passed in rather than rendered here, which is what lets the headline stay a
   * server component while everything below is a client one, and keeps this
   * file ignorant of what the shop's opening line happens to say. The two have
   * to be siblings in this component's own grid for the product to sit *beside*
   * the headline rather than under it, which is why the page hands it over
   * instead of wrapping both.
   */
  lead: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Starts false so a carousel below the fold is not already several products
  // in by the time it is scrolled to.
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  /**
   * Where a deliberate change of product has got to.
   *
   * Three states rather than a boolean, because the change is a cross-slide and
   * a cross-slide has a middle. `out` carries the old product away and fades it;
   * `in` is the single frame where the track has jumped and the new product is
   * parked off to the *other* side, not yet moving; `idle` is it arriving and
   * everything at rest.
   *
   * The `in` frame is the whole reason a boolean will not do. The incoming
   * product has to be repositioned instantly — with no transition — before it
   * can be animated into place, or the browser would simply tween it from where
   * the outgoing one left off and the movement would read as one object sliding
   * back and forth rather than two products changing over.
   */
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");

  /**
   * Which way the change is travelling: 1 forward, -1 back.
   *
   * The slide is the only thing that carries this information. A dissolve is
   * direction-less — it says a product changed but not which way the carousel
   * moved — and a shopper stepping back to the previous product should see it
   * come from the side they left it on.
   */
  const [direction, setDirection] = useState(1);

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
  // and the dots simply ask it to scroll somewhere.
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

  const changeTimer = useRef(0);
  const settleTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(changeTimer.current);
      window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const goTo = (i: number) => {
    // Set optimistically as well as scrolling: a smooth scroll takes a few
    // hundred milliseconds to report its first event, and a control that looks
    // dead for that long reads as broken.
    setIndex(i);
    if (!trackRef.current) return;

    /*
     * Dissolve rather than slide.
     *
     * This is the treatment the wrap-around already used, now used for every
     * deliberate change, and the reason is what the sliding version could never
     * fix: a slide puts two products on screen at once, so there is always a
     * boundary between them, and the container has to cut that boundary
     * somewhere. Softening the cut helps; removing it is better. Fading out,
     * jumping while nothing is visible, and fading back in means one product is
     * on the stage at a time and the join has nowhere to show.
     *
     * Only for changes the shopper *asked* for — a dot, or the autoplay. A
     * finger dragging the track still slides, because there the movement is the
     * hand's own and seeing the next product follow it is the feedback that
     * makes a swipe feel connected. `goTo` is not on that path.
     *
     * `behavior: "instant"` matters: nothing is travelling, so there are no
     * intermediate positions for the scroll listener to misread as choices.
     */
    // Forward unless the shopper picked something earlier in the list — and
    // forward for the wrap, where the last product gives way to the first and
    // a backward slide would contradict the direction the carousel was going.
    setDirection(i === 0 && activeIndex === products.length - 1 ? 1 : i > activeIndex ? 1 : -1);

    setPhase("out");
    window.clearTimeout(changeTimer.current);
    changeTimer.current = window.setTimeout(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: i * track.clientWidth, behavior: "instant" });
      releaseTarget();

      // Park the incoming product off to the far side with no transition, then
      // release it a frame later so it animates in. Two frames, not one: the
      // first commits the parked position, the second is the one the browser
      // can tween *from*. Collapsed into a single frame the reposition and the
      // release land in the same style recalculation and no movement happens.
      setPhase("in");
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("idle")));
    }, CHANGE_FADE_MS);
  };

  const advance = () => goTo((activeIndex + 1) % products.length);

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

  if (products.length === 0) {
    // An empty featured list means no *carousel*, not no hero: the copy beside
    // it is the page's h1 and its call to action, and an admin emptying the
    // featured list is not a reason for the front door to lose its headline. So
    // the lead renders on its own, in one column, and the stage is simply not
    // there to fill.
    return (
      <section className="mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14 sm:pb-24">
        {lead}
      </section>
    );
  }


  return (
    <section
      ref={sectionRef}
      // Deliberately unlabelled: there is no "Featured picks" heading to point
      // at — the page's own h1 lives in the lead — and the track below carries
      // its own carousel label.
      className={cn(
        "mx-auto max-w-7xl px-4 sm:px-6",
        // Generous, because with the best sellers no longer tucked underneath
        // this section is the whole of the first screen and was sitting too
        // high in it.
        "pt-12 pb-24 sm:pt-20 sm:pb-28",
      )}
      // Mouse events rather than pointer events: a touch raises `pointerenter`
      // and then frequently never raises `pointerleave`, which would strand the
      // carousel suspended for the rest of the visit on exactly the devices
      // where there is no pointer to rest on it.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // These are focusin/focusout in the DOM, so they cover anything focused
      // inside the section — a dot, a link on the panel.
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        {/* In a wrapper of its own rather than dropped straight into the grid,
            for two reasons. This component owns its own columns — where the
            copy sits is a fact about the layout, not about what the copy says —
            and it keeps an element built by another component out of a
            children *array*, which is the shape React's missing-key check looks
            at. The lead is one of two fixed children and needs no key; being
            the sole child of this wrapper is what makes that unambiguous. */}
        <div className="min-w-0">{lead}</div>

        {/* `min-w-0` is load-bearing: a grid item defaults to `min-width: auto`,
            so the track's own content would refuse to let this column be
            narrower than its widest panel and would squeeze the copy beside it
            down to nothing. */}
        <div className="min-w-0">
          {/* A scroll container, not a transformed strip. Swiping is the whole
              reason: a translated track cannot be dragged, so on a phone the
              carousel could only be changed by the controls underneath it. The
              scrollbar is hidden because the panels themselves are the
              affordance.

              `overflow-y-hidden` is deliberate. Setting one axis to `auto`
              computes the other from `visible` to `auto` as well, and this
              track reported 12px of vertical scrollable overflow —
              scrollHeight 627 against clientHeight 615 — which made the whole
              carousel a vertically scrollable box.

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
              /*
                The cross-slide.

                A plain dissolve removed the seam but took the direction with
                it: it says a product changed without saying which way the
                carousel went. This puts that back without bringing the seam
                back — the old product leaves to one side as it fades, and the
                new one arrives from the other. Both are the only thing on
                screen while they move, so there is still never a boundary
                between two products for the container to cut.

                The `in` frame carries no transition, because it is a
                reposition rather than a movement. See `phase`.
              */
              phase === "in"
                ? "transition-none"
                : "transition-[opacity,transform] ease-standard",
              /*
                A soft edge on the two sides the track clips against.

                The container cuts at the panel boundary, so mid-change the
                product arriving from the right meets that boundary as a hard
                vertical line straight down its middle — the edges do not read
                as finished, they read as torn. A photograph sliced by a clean
                rule is what a carousel looks like to whoever built it and what
                a rendering fault looks like to everyone else.

                A mask rather than a pair of gradient strips laid over the top:
                a strip has to be painted in the page's own background colour
                and would then be wrong the moment this section sits on
                anything else, where a mask makes the pixels transparent and
                cannot disagree with what is behind it. 16px is deliberately
                small — enough to turn the cut into a fade, not enough to read
                as a vignette.
              */
              "[mask-image:linear-gradient(to_right,transparent_0,black_16px,black_calc(100%-16px),transparent_100%)]",
            )}
            style={{
              transitionDuration: `${CHANGE_FADE_MS}ms`,
              opacity: phase === "idle" ? 1 : 0,
              // Short on purpose. This is a cue about direction, not a journey —
              // a full panel's width of travel is the slide this replaced, and
              // it is the slide that put two products on screen at once.
              transform: `translateX(${
                phase === "out"
                  ? -direction * CHANGE_SHIFT_PX
                  : phase === "in"
                    ? direction * CHANGE_SHIFT_PX
                    : 0
              }px)`,
            }}
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
                  //
                  // One column at every width: the panel is already sitting in
                  // half a page, and splitting that again would leave the
                  // product a quarter of the screen.
                  className="grid w-full shrink-0 snap-start"
                >
                  <Spotlight
                    className={cn(
                      "relative",
                      // The stage *is* the card: the product stands on the
                      // page's own background and the copy floats over it as
                      // chips, so there is no fill to paint and nothing to clip
                      // against. Stated outright at both widths instead of an
                      // aspect ratio, because what has to be controlled here is
                      // how much room the product and the chips get — not the
                      // shape of the box they share. A ratio at this width would
                      // also put the card well past the fold.
                      //
                      // Raised from 30/40rem when the best-sellers shelf moved
                      // out from under the hero (see the note in
                      // `app/page.tsx`). Taking a whole shelf off the fold left
                      // this holding the top of the page on its own and looking
                      // short for the job — the stage is what fills that, and a
                      // larger stage draws a larger product, which is the point
                      // of the arrangement. The card still lands above the fold.
                      // `hero-stage` also carries the spotlight and switches off
                      // the panel vignette — see `.hero-stage::after`.
                      "hero-stage h-[32rem] md:h-[44rem]",
                    )}
                  >
                    {/*
                      What stands behind the product now that nothing frames it.

                      Two faint fields of dots, `aria-hidden` and carrying
                      nothing to read. Without a card the product hangs in an
                      empty band, and the eye needs something to measure a
                      floating object against. Tinted through `currentColor` so
                      they follow the scheme into dark mode rather than becoming
                      soot on charcoal.

                      The pair of rings that used to sit here has gone: with the
                      specification callouts leaning in from the corners, a
                      circle around the product was a second thing drawing
                      attention to the middle of the stage, and the two read as
                      clutter together where either alone read as composition.
                    */}
                    <span aria-hidden className="pointer-events-none absolute inset-0">
                      <span className="hero-dot-grid text-primary/[0.14] absolute top-1/2 left-[6%] hidden size-28 -translate-y-1/2 lg:block" />
                      <span className="hero-dot-grid text-primary/[0.14] absolute top-[58%] right-[4%] hidden size-24 -translate-y-1/2 lg:block" />
                    </span>

                    {/* The specifications, annotated onto the photograph. Built
                        from this product's own spec rows — a different panel
                        annotates different facts, and a product with none is not
                        annotated at all. */}
                    <SpecificationHotspots
                      callouts={calloutsFor(product)}
                      current={current}
                    />

                    {product.image ? (
                      // Two nested transforms rather than one. The settle owns
                      // the outer element at 700ms and the sway owns the inner
                      // at 150ms; sharing a single `transform` property would
                      // force one duration on both, and whichever was written
                      // last would silently overwrite the other with no error.
                      <div
                        className={cn(
                          "relative z-10 size-full transition-transform duration-700 ease-emphasized",
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
                          {/* `contain` rather than `cover`: a cut-out on
                              transparency has to sit inside its box to read as a
                              product on a stage. The grid cards keep `cover`,
                              where filling the square matters more than showing
                              every edge.

                              Both the halo and the shadow are cast by CSS from
                              the alpha channel rather than baked into the file,
                              so they follow the theme instead of fighting one of
                              them — and they follow the product's own outline
                              rather than a box around it. See `.product-glow`.

                              The inset is asymmetric, and that is the layout
                              doing its job rather than an oversight: the chips
                              occupy the top and bottom of the stage, so the
                              artwork is given the band between them. The sides
                              stay narrow because width is what the product is
                              actually bound by here — a landscape cut-out in a
                              ~680px stage runs out of width long before height,
                              so trimming `px` is what makes it draw larger,
                              while `pt`/`pb` cost it almost nothing and keep it
                              clear of the chips. The bottom inset only tightens
                              from `sm` up: on a phone the two slabs stack
                              instead of sitting side by side, so the space they
                              need down there is roughly double. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.image}
                            alt={product.name}
                            className={cn(
                              // The halo traces the artwork's own alpha, so it
                              // is the light *on* the product — the pool behind
                              // it is `.hero-stage::after`. Both, or neither
                              // reads as lighting: a lit floor under an unlit
                              // object looks like a sticker on a photograph.
                              "product-glow size-full object-contain",
                              "px-4 pt-14 pb-32 sm:px-8 sm:pt-16 sm:pb-32",
                            )}
                          />
                        </Tilt>
                      </div>
                    ) : (
                      <div className="text-on-surface-variant relative z-10 grid size-full place-items-center">
                        <Icon name="image" size={48} />
                      </div>
                    )}

                    {/*
                      The facts, floating over the stage instead of stacked
                      under it.

                      The panel used to be two halves — a picture on top, a
                      column of copy beneath — which gave the product half a card
                      and made the other half a list. Here the stage is the whole
                      card and the same four facts orbit the product: what it is
                      at the top, what it costs and where it goes at the bottom.
                      Nothing is lost; it is arranged around the subject rather
                      than queued below it.

                      `pointer-events-none` on the layer is load-bearing. It
                      spans the whole stage, and without it this would sit
                      between the cursor and everything underneath — killing the
                      tilt, the spotlight, and the press-and-drag that moves the
                      carousel on a touch screen. Only the link inside takes
                      events back.
                    */}
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 z-20 flex flex-col justify-between gap-3 p-4 sm:p-5",
                        // The same beat the copy column used to arrive on, so
                        // the panel still assembles rather than landing rigid.
                        "transition-all duration-500 ease-emphasized",
                        current
                          ? "translate-y-0 opacity-100 delay-150"
                          : "translate-y-3 opacity-0",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              CHIP,
                              "eyebrow text-primary flex items-center gap-1.5 rounded-full px-3 py-1.5",
                            )}
                          >
                            <Icon name="stars" size={14} filled />
                            Featured
                          </span>

                          {(product.isNew || product.soldOut) && (
                            <span
                              className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-medium",
                                product.soldOut
                                  ? "bg-error-container text-on-error-container"
                                  : "bg-primary text-on-primary",
                              )}
                            >
                              {product.soldOut ? "Sold out" : "New"}
                            </span>
                          )}
                        </div>

                        {/* Renders nothing until someone has rated it, so a new
                            feature does not lead with an empty row of grey
                            stars. */}
                        {product.rating && (
                          <span
                            className={cn(
                              CHIP,
                              "flex shrink-0 items-center rounded-full px-3 py-1.5",
                            )}
                          >
                            <RatingBadge
                              average={product.rating.average}
                              count={product.rating.count}
                              size={14}
                            />
                          </span>
                        )}
                      </div>

                      {/* Wraps rather than shrinks: on a narrow stage the two
                          slabs stack instead of squeezing a long product name
                          into a column two words wide. */}
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className={cn(CHIP, "min-w-0 rounded-2xl px-4 py-3")}>
                          <p className="label-caps text-on-surface-variant flex items-center gap-1.5">
                            {product.brand &&
                              (product.brand.iconSvg || product.brand.logo ? (
                                <BrandMark
                                  svg={product.brand.iconSvg}
                                  logo={product.brand.logo}
                                  treatment={product.brand.logoTreatment}
                                  size={14}
                                  label={product.brand.name}
                                />
                              ) : (
                                <span className="text-on-surface font-medium">
                                  {product.brand.name}
                                </span>
                              ))}
                            {product.brand && product.category && (
                              <span
                                aria-hidden
                                className="bg-outline-variant h-3 w-px shrink-0"
                              />
                            )}
                            {product.category}
                          </p>

                          <h3 className="text-on-surface text-title-lg sm:text-headline-sm mt-1 truncate">
                            {product.name}
                          </h3>
                        </div>

                        <div
                          className={cn(
                            CHIP,
                            "flex shrink-0 items-center gap-3 rounded-2xl py-2 pr-2 pl-4",
                          )}
                        >
                          <p className="text-on-surface text-xl whitespace-nowrap">
                            {product.priceVaries && (
                              <span className="text-on-surface-variant text-sm">
                                from{" "}
                              </span>
                            )}
                            {formatPrice(product.minCents)}
                          </p>

                          <Link
                            href={`/products/${product.slug}`}
                            className="bg-primary text-on-primary state-layer pointer-events-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
                          >
                            View
                            <Icon name="arrow_forward" size={18} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </Spotlight>

                  {/* The same specifications, for phones — outside the stage, so
                      nothing overlaps the product at the one width where there
                      is no room beside it. Hidden from `md` up, where the
                      positioned callouts above take over. */}
                  <SpecificationList callouts={calloutsFor(product)} />
                </div>
              );
            })}
          </div>

          {/* Position indicators, and the only way to change panel by hand: a
              row of named thumbnails under the panel would be a second product
              list directly beneath the first, in a column that is already only
              half the page. So these take the tab order and each one takes the
              name of the product it selects. */}
          {products.length > 1 && (
            <div
              role="group"
              aria-label="Choose a featured product"
              // Under the panel it belongs to, and aligned with the copy in that
              // column rather than with the page.
              className="mt-5 flex justify-center gap-2 lg:justify-start"
            >
              {products.map((product, i) => {
                const current = i === activeIndex;
                return (
                  <button
                    key={product.id}
                    type="button"
                    aria-label={product.name}
                    aria-current={current}
                    onClick={() => goTo(i)}
                    className={cn(
                      "h-2 overflow-hidden rounded-full transition-all duration-300 ease-emphasized",
                      current ? "w-8" : "bg-outline-variant hover:bg-outline w-2",
                      // Dimmed to a track only while something is draining it;
                      // held or stationary it stays the solid dot it was.
                      current && (running ? "bg-primary/25" : "bg-primary"),
                    )}
                  >
                    {/* Mounted only while the clock is actually running, which
                        is also what restarts it: suspending unmounts this, and
                        resuming mounts a fresh one from zero — the same reset
                        the timeout itself gets, so the bar cannot claim time the
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
          )}
        </div>
      </div>
    </section>
  );
}
