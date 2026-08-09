"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { MAX_SPEC_LABEL_LENGTH } from "@/lib/specs/keys";
import type { SpecFormState } from "@/lib/actions/specs";

export interface SpecDefinitionFormValues {
  label: string;
  unit: string;
  group: string;
  icon: string;
  filterable: boolean;
}

export const EMPTY_SPEC_DEFINITION: SpecDefinitionFormValues = {
  label: "",
  unit: "",
  group: "",
  icon: "",
  filterable: true,
};

const INITIAL_STATE: SpecFormState = {};

export function SpecDefinitionForm({
  action,
  values = EMPTY_SPEC_DEFINITION,
  submitLabel = "Save label",
  /** Sections already in use, offered as autocomplete. */
  knownGroups = [],
}: {
  action: (state: SpecFormState, formData: FormData) => Promise<SpecFormState>;
  values?: SpecDefinitionFormValues;
  submitLabel?: string;
  knownGroups?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [icon, setIcon] = useState(values.icon);

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
          <TextField
            label="Label"
            name="label"
            defaultValue={values.label}
            error={state.errors?.label}
            maxLength={MAX_SPEC_LABEL_LENGTH}
            supportingText="Shown in the left column of the spec table, e.g. “RAM”"
            required
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Unit"
              name="unit"
              defaultValue={values.unit}
              error={state.errors?.unit}
              maxLength={12}
              placeholder="GB"
              supportingText="Optional — appended to every value, so “16” reads “16 GB”"
            />

            <div>
              <TextField
                label="Section"
                name="group"
                defaultValue={values.group}
                error={state.errors?.group}
                maxLength={40}
                list="spec-groups"
                supportingText="Optional heading — ungrouped specs are listed first"
              />
              <datalist id="spec-groups">
                {knownGroups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <TextField
              label="Icon"
              name="icon"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              error={state.errors?.icon}
              maxLength={40}
              placeholder="memory"
              supportingText="Optional Material Symbols name — see fonts.google.com/icons"
            />
            {/* Live, so a typo shows as a blank tile rather than surviving to
                the storefront. */}
            <div className="bg-secondary-container text-on-secondary-container mb-6 grid size-14 shrink-0 place-items-center rounded-lg">
              <Icon name={icon.trim() || "label"} size={24} />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="filterable"
              defaultChecked={values.filterable}
              className="accent-primary size-5 rounded"
            />
            <span>
              <span className="text-on-surface block text-sm font-medium">
                Offer as a filter
              </span>
              <span className="text-on-surface-variant block text-xs">
                Turn off for values that are unique per product — a filter whose
                every option matches one item is noise rather than navigation
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} icon="save">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/specs"
          className="text-on-surface-variant state-layer inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
