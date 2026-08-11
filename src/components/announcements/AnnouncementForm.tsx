"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import {
  ANNOUNCEMENT_LEVELS,
  ANNOUNCEMENT_LEVEL_ORDER,
} from "@/lib/announcements/levels";
import {
  MAX_HREF_LENGTH,
  MAX_MESSAGE_LENGTH,
} from "@/lib/announcements/validation";
import type { AnnouncementFormState } from "@/lib/actions/announcements";
import type { AnnouncementLevel } from "@/generated/prisma/enums";

export interface AnnouncementFormValues {
  message: string;
  level: AnnouncementLevel;
  href: string;
  published: boolean;
}

const INITIAL: AnnouncementFormState = {};

/**
 * Create or edit one notice.
 *
 * The action is passed in already bound to an id where there is one, so this
 * component never needs to know which of the two it is doing — the same shape
 * the FAQ and store forms use.
 *
 * The level is a row of swatches rather than a `<select>`, and that is the one
 * place this form departs from the others. The choice is *about* colour: the
 * whole point of picking CRITICAL over WARNING is what the strip will look like
 * on every page of the shop, and a dropdown reading "Critical" shows none of
 * that. Radios styled as the real thing let an admin see the decision they are
 * making.
 */
export function AnnouncementForm({
  action,
  values,
  submitLabel,
}: {
  action: (
    state: AnnouncementFormState,
    formData: FormData,
  ) => Promise<AnnouncementFormState>;
  values: AnnouncementFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Local, purely so the preview below can react. The radio inputs are still
  // the source of truth for what gets submitted.
  const [level, setLevel] = useState<AnnouncementLevel>(values.level);
  const [message, setMessage] = useState(values.message);

  const style = ANNOUNCEMENT_LEVELS[level];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} className="mt-px" />
          <span>{state.message}</span>
        </div>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <TextField
            label="Message"
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            supportingText="One line. It scrolls past, so put the point first."
            error={state.errors?.message}
            required
          />

          <TextField
            label="Link (optional)"
            name="href"
            defaultValue={values.href}
            maxLength={MAX_HREF_LENGTH}
            supportingText="A path like /sale, or a full https:// address. Leave empty for a notice that goes nowhere."
            error={state.errors?.href}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-on-surface text-sm font-medium">Level</h3>
            <p className="text-on-surface-variant mt-1 text-sm">
              Decides the strip&apos;s colour and its glyph. When several
              notices are live at once the strip takes the colour of the loudest
              one, so reach for Critical only when it should out-shout
              everything else.
            </p>
          </div>

          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Announcement level</legend>
            {ANNOUNCEMENT_LEVEL_ORDER.map((option) => {
              const optionStyle = ANNOUNCEMENT_LEVELS[option];
              const selected = option === level;
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
                    "transition-all duration-200",
                    optionStyle.chip,
                    selected
                      ? "outline-primary scale-105 outline-2 outline-offset-2"
                      : "opacity-60 hover:opacity-100",
                  )}
                >
                  <input
                    type="radio"
                    name="level"
                    value={option}
                    checked={selected}
                    onChange={() => setLevel(option)}
                    className="sr-only"
                  />
                  <Icon name={optionStyle.icon} size={16} filled />
                  {optionStyle.label}
                </label>
              );
            })}
          </fieldset>

          {state.errors?.level && (
            <p className="text-error text-sm">{state.errors.level}</p>
          )}

          {/* What the shopper gets, at the size they get it. Static rather than
              scrolling: this is here to show the colour and the wording, and a
              preview that slides away is one an admin has to wait for. */}
          <div>
            <p className="text-on-surface-variant mb-2 text-xs tracking-wide uppercase">
              Preview
            </p>
            <div
              className={cn(
                "flex items-center gap-2 overflow-hidden rounded-lg px-5 py-2 text-sm font-medium",
                style.strip,
              )}
            >
              <Icon name={style.icon} size={16} filled className="shrink-0" />
              <span className="truncate">
                {message.trim() || "Your message appears here"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          {/* An unchecked box submits nothing at all, which is exactly how the
              parser reads "not published". */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="published"
              defaultChecked={values.published}
              className="accent-primary size-4"
            />
            <span className="text-on-surface text-sm">
              Published
              <span className="text-on-surface-variant block text-xs">
                Unpublished notices stay here but never reach the strip.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/announcements"
          className="text-on-surface-variant rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
