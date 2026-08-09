"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { BrandMark } from "@/components/brands/BrandMark";
import { Select } from "@/components/ui/Select";
import { LogoTreatment } from "@/generated/prisma/enums";
import { BrandIconField } from "@/components/brands/BrandIconField";
import { sanitizeSvg } from "@/lib/brands/svg";
import type { BrandFormState } from "@/lib/actions/brands";

export interface BrandFormValues {
  name: string;
  slug: string;
  /** Stored markup on edit, "" on create. */
  iconSvg: string;
  /** Stored image URL on edit, "" on create. */
  logo: string;
  logoTreatment: LogoTreatment;
}

export const EMPTY_BRAND: BrandFormValues = {
  name: "",
  slug: "",
  iconSvg: "",
  logo: "",
  logoTreatment: LogoTreatment.AUTO,
};

const INITIAL_STATE: BrandFormState = {};

export function BrandForm({
  action,
  values = EMPTY_BRAND,
  submitLabel = "Save brand",
}: {
  action: (state: BrandFormState, formData: FormData) => Promise<BrandFormState>;
  values?: BrandFormValues;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const [name, setName] = useState(values.name);
  const [iconSvg, setIconSvg] = useState(values.iconSvg);
  const [logo, setLogo] = useState(values.logo);
  const [logoTreatment, setLogoTreatment] = useState(values.logoTreatment);

  const preview = iconSvg.trim() ? sanitizeSvg(iconSvg) : null;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} />
          <span>{state.message}</span>
        </div>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Details</h3>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={state.errors?.name}
              maxLength={60}
              required
            />

            <TextField
              label="Slug"
              name="slug"
              defaultValue={values.slug}
              error={state.errors?.slug}
              leadingIcon="link"
              supportingText="Used in /products?brand=… — leave empty to derive it from the name"
            />
          </div>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Mark</h3>

          <BrandIconField
            name="iconSvg"
            value={iconSvg}
            onChange={setIconSvg}
            error={state.errors?.iconSvg}
          />

          {/* The fallback, presented as one: the vector is what adapts to the
              surface it lands on, and an image address is what you reach for
              when there is no vector to be had. Kept in the same card so the
              two read as one decision rather than two independent fields. */}
          <TextField
            label="Image address"
            name="logo"
            value={logo}
            onChange={(event) => setLogo(event.target.value)}
            error={state.errors?.logo}
            leadingIcon="image"
            supportingText="Used only when there is no mark above. A hosted image keeps its own colours, so pick artwork that reads on both light and dark."
          />

          {/* Only meaningful once there is an image to treat, and hidden until
              then rather than shown disabled — a control with nothing to act on
              is a question the operator cannot answer yet. */}
          {logo.trim() && (
            <Select
              label="On dark backgrounds"
              name="logoTreatment"
              value={logoTreatment}
              onChange={(event) =>
                setLogoTreatment(event.target.value as LogoTreatment)
              }
              supportingText="A dark logo disappears on a dark page, and nothing here can recolour a hosted image. Pick what suits this artwork."
              options={[
                { value: LogoTreatment.AUTO, label: "Decide automatically" },
                {
                  value: LogoTreatment.INVERT,
                  label: "Recolour white — for a single-colour mark",
                },
                {
                  value: LogoTreatment.PLATE,
                  label: "Keep colours, add a light chip — for a multi-colour mark",
                },
                {
                  value: LogoTreatment.NONE,
                  label: "Leave it alone — already reads on dark",
                },
                {
                  value: LogoTreatment.VARIANT,
                  label: "Use the CDN's white version — for a filled mark",
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-4">
          <h3 className="text-on-surface text-sm font-medium">In context</h3>
          {/* The same pairing the product card uses, so the mark can be judged
              at the size it will actually be seen. */}
          <p className="text-on-surface-variant flex items-center gap-1.5 text-xs tracking-wide uppercase">
            {/* Ranked exactly as the storefront ranks them, so the preview
                shows which of the two a shopper would actually see. */}
            <BrandMark
              svg={preview?.ok ? preview.svg : null}
              logo={logo.trim() || null}
              treatment={logoTreatment}
              size={14}
            />
            <span className="text-on-surface font-medium">
              {name || "Brand name"}
            </span>
            <span aria-hidden className="bg-outline-variant h-3 w-px shrink-0" />
            Keyboards
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} icon="save">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/brands"
          className="text-on-surface-variant state-layer inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
