import type { Validated } from "@/lib/auth/validation";
import { MAX_SPEC_LABEL_LENGTH, specLabelKey } from "@/lib/specs/keys";

/** Admin form rules for a spec label. */

export type SpecDefinitionInput = {
  label: string;
  key: string;
  unit: string | null;
  group: string | null;
  icon: string | null;
  filterable: boolean;
};

export function parseSpecDefinition(
  formData: FormData,
): Validated<SpecDefinitionInput> {
  const errors: Record<string, string> = {};

  const label = String(formData.get("label") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const group = String(formData.get("group") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  // An unchecked checkbox submits nothing at all.
  const filterable = formData.get("filterable") === "on";

  if (!label) errors.label = "Label is required";
  else if (label.length > MAX_SPEC_LABEL_LENGTH) {
    errors.label = `Label must be ${MAX_SPEC_LABEL_LENGTH} characters or fewer`;
  }

  // The key is derived rather than entered: it is what already-stored specs
  // are matched by, so letting it be typed independently of the label would
  // let the two drift apart.
  const key = specLabelKey(label);
  if (label && !key) errors.label = "Label needs at least one letter or number";

  if (unit.length > 12) errors.unit = "Unit must be 12 characters or fewer";
  if (group.length > 40) errors.group = "Section must be 40 characters or fewer";

  // Material Symbols ligatures are lowercase words joined by underscores;
  // anything else would render as literal text inside the glyph span.
  if (icon && !/^[a-z0-9_]{1,40}$/.test(icon)) {
    errors.icon = "Use a Material Symbols name, e.g. memory or battery_full";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      label,
      key,
      unit: unit || null,
      group: group || null,
      icon: icon || null,
      filterable,
    },
  };
}
