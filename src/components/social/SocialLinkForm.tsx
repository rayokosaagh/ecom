"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { BrandIconField } from "@/components/brands/BrandIconField";
import { HoverColorField } from "@/components/social/HoverColorField";
import { SocialIcon } from "@/components/social/SocialIcon";
import { SocialPlatform } from "@/generated/prisma/enums";
import { sanitizeSvg } from "@/lib/brands/svg";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_ORDER,
} from "@/lib/social/catalogue";
import { normalizeHexColor } from "@/lib/social/color";
import { MAX_LABEL_LENGTH } from "@/lib/social/validation";
import type { SocialLinkFormState } from "@/lib/actions/social";

export interface SocialLinkFormValues {
  platform: SocialPlatform;
  url: string;
  label: string;
  /** Empty for "whatever the platform's colour is". */
  hoverColor: string;
  iconSvg: string;
  published: boolean;
}

const INITIAL: SocialLinkFormState = {};

const OPTIONS = SOCIAL_PLATFORM_ORDER.map((platform) => ({
  value: platform,
  label:
    platform === SocialPlatform.CUSTOM
      ? "Custom — your own link"
      : SOCIAL_PLATFORMS[platform].name,
}));

/**
 * Create or edit one social link.
 *
 * The action is passed in already bound to an id where there is one, so this
 * component never needs to know which of the two it is doing — the same shape
 * the FAQ and banner forms use.
 *
 * The platform is held in state because it decides most of the rest of the
 * form: what the link field is asking for, whether a mark needs pasting, and
 * what colour "reset" goes back to. Choosing TikTok and then being told
 * "expected instagram.com/yourshop" on submit is a round trip the hint text can
 * save entirely.
 */
export function SocialLinkForm({
  action,
  values,
  submitLabel,
}: {
  action: (
    state: SocialLinkFormState,
    formData: FormData,
  ) => Promise<SocialLinkFormState>;
  values: SocialLinkFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [platform, setPlatform] = useState<SocialPlatform>(values.platform);
  const [iconSvg, setIconSvg] = useState(values.iconSvg);
  const [hoverColor, setHoverColor] = useState(
    // An empty stored colour means "follow the platform", which the picker
    // shows as that platform's colour rather than as an empty box.
    values.hoverColor || SOCIAL_PLATFORMS[values.platform].brandColor,
  );
  // Whether this link is still following its platform's colour, tracked rather
  // than derived: it is what decides if switching platform should carry the
  // colour along, and once someone has picked a colour deliberately, changing
  // the dropdown must not silently discard it.
  const [followsPlatform, setFollowsPlatform] = useState(!values.hoverColor);

  const info = SOCIAL_PLATFORMS[platform];
  const isCustom = platform === SocialPlatform.CUSTOM;

  /**
   * The pasted mark, run through the sanitizer before it is previewed.
   *
   * `BrandIcon` inlines what it is given, and its contract is that the markup
   * has already been rebuilt from the allowlist. Feeding it the raw field would
   * break that contract in the one place an attacker-supplied string is being
   * typed — and would preview something other than what gets stored, which is
   * the whole point of the sanitizer being DOM-free.
   */
  const previewSvg = useMemo(() => {
    if (!iconSvg.trim()) return null;
    const result = sanitizeSvg(iconSvg);
    return result.ok ? result.svg : null;
  }, [iconSvg]);

  const changePlatform = (next: SocialPlatform) => {
    setPlatform(next);
    if (followsPlatform) setHoverColor(SOCIAL_PLATFORMS[next].brandColor);
  };

  const changeColor = (next: string) => {
    setHoverColor(next);
    setFollowsPlatform(
      normalizeHexColor(next) === SOCIAL_PLATFORMS[platform].brandColor,
    );
  };

  const resetColor = () => {
    setHoverColor(info.brandColor);
    setFollowsPlatform(true);
  };

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
          <Select
            label="Platform"
            name="platform"
            value={platform}
            onChange={(event) =>
              changePlatform(event.target.value as SocialPlatform)
            }
            options={OPTIONS}
            supportingText={
              isCustom
                ? "Any address, your own name and mark. Use this for anything not in the list."
                : "Decides the mark shown and where the link is allowed to point."
            }
            error={state.errors?.platform}
            required
          />

          <TextField
            label="Link"
            name="url"
            defaultValue={values.url}
            inputMode="url"
            supportingText={info.hint}
            error={state.errors?.url}
            required
          />

          <TextField
            label={isCustom ? "Name" : "Label"}
            name="label"
            defaultValue={values.label}
            maxLength={MAX_LABEL_LENGTH}
            supportingText={
              isCustom
                ? "Required. Names the link wherever the mark alone will not — “Our newsletter”, “Mastodon”."
                : `Optional. What a screen reader announces and what shows on hover — “@yourshop”, say. Defaults to “${info.name}”.`
            }
            error={state.errors?.label}
            required={isCustom}
          />

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
                Hidden links stay here but are left out of the home page bar.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Appearance</h3>

          {/* Only for a custom link. A built-in's mark comes from the
              catalogue, so a field here would offer to override something that
              is not the admin's to change — the Instagram logo is Instagram's.
              The field is mounted only in the custom case, so nothing stale is
              submitted by someone who pasted markup and then switched the
              dropdown. */}
          {isCustom && (
            <BrandIconField
              name="iconSvg"
              value={iconSvg}
              onChange={setIconSvg}
              error={state.errors?.iconSvg}
            />
          )}

          <HoverColorField
            name="hoverColor"
            value={hoverColor}
            onChange={changeColor}
            onReset={resetColor}
            platformName={info.name}
            isDefault={followsPlatform}
            error={state.errors?.hoverColor}
          >
            <SocialIcon platform={platform} iconSvg={previewSvg} size={20} />
          </HoverColorField>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/social"
          className="text-on-surface-variant rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
