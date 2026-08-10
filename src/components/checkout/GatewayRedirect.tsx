"use client";

import { useEffect, useRef } from "react";

/**
 * A signed gateway form, submitted on arrival.
 *
 * Both eSewa and connectIPS take a browser form POST rather than a redirect, so
 * there is no URL the server can send anyone to — the fields have to reach the
 * gateway from the customer's own browser. They arrive here already signed;
 * this component adds no logic beyond pressing the button, which is why one
 * component serves both despite their signatures being computed quite
 * differently.
 *
 * It renders a real submit button and only *also* clicks it from an effect.
 * That ordering is the point: with JavaScript blocked, or if the effect never
 * runs, the page is still a working payment form rather than a screen that sits
 * there. The visible button is the feature; the effect is the convenience.
 *
 * `submitted` guards against React running the effect twice in development —
 * Strict Mode mounts every component twice, and a second submit mid-navigation
 * is a second payment attempt.
 */
export function GatewayRedirect({
  action,
  fields,
}: {
  action: string;
  /**
   * Rendered as-is. Typed loosely on purpose — the field set is eSewa's, and
   * `buildFormFields` is what decides it; enumerating the names again here
   * would be a second place to keep in step for no gain.
   */
  fields: Readonly<Record<string, string>>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    formRef.current?.submit();
  }, []);

  return (
    <form ref={formRef} action={action} method="POST" className="mt-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <button
        type="submit"
        className="bg-primary text-on-primary state-layer inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
      >
        Continue
      </button>

      <p className="text-on-surface-variant mt-3 text-xs">
        Not redirected automatically? Use the button above.
      </p>
    </form>
  );
}
