import {
  MAX_SPECS,
  MAX_SPEC_LABEL_LENGTH,
  MAX_SPEC_VALUE_LENGTH,
  specLabelKey,
  specValueKey,
} from "@/lib/specs/keys";

/**
 * Spec parsing shared by the admin form and the product actions.
 *
 * Same shape as `products/colors`: the form submits parallel arrays under
 * repeated field names, which is how a native multi-row form posts without any
 * client-side serialisation.
 *
 * A row carries a label rather than a definition id. The label is matched to an
 * existing definition by key, or creates one — the same create-or-reuse rule
 * categories and brands already follow, so an editor never has to leave the
 * product form to declare "RAM" before they can fill it in.
 */

export interface SpecInput {
  label: string;
  labelKey: string;
  value: string;
  valueKey: string;
}

export interface SpecParseResult {
  specs: SpecInput[];
  error?: string;
}

export function parseSpecs(formData: FormData): SpecParseResult {
  const labels = formData.getAll("specLabel").map((v) => String(v).trim());
  const values = formData.getAll("specValue").map((v) => String(v).trim());

  const rows = Math.max(labels.length, values.length);
  const specs: SpecInput[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows; i++) {
    const label = labels[i] ?? "";
    const value = values[i] ?? "";

    // Wholly blank rows are dropped rather than rejected — an empty trailing
    // row is how the form offers "add another", so it must not be an error.
    if (!label && !value) continue;

    if (!label) return { specs, error: "Every spec needs a label" };
    if (label.length > MAX_SPEC_LABEL_LENGTH) {
      return {
        specs,
        error: `Spec labels must be ${MAX_SPEC_LABEL_LENGTH} characters or fewer`,
      };
    }

    const labelKey = specLabelKey(label);
    if (!labelKey) {
      return { specs, error: `“${label}” needs at least one letter or number` };
    }

    if (!value) return { specs, error: `Enter a value for “${label}”` };
    if (value.length > MAX_SPEC_VALUE_LENGTH) {
      return {
        specs,
        error: `The value for “${label}” must be ${MAX_SPEC_VALUE_LENGTH} characters or fewer`,
      };
    }

    const valueKey = specValueKey(value);
    if (!valueKey) {
      return { specs, error: `The value for “${label}” needs a letter or number` };
    }

    // The schema has a unique on (productId, definitionId), and two rows whose
    // labels differ only in case or spacing resolve to the same definition.
    // Catching it here gives a field error instead of a database exception.
    if (seen.has(labelKey)) return { specs, error: `“${label}” is listed twice` };
    seen.add(labelKey);

    specs.push({ label, labelKey, value, valueKey });
  }

  if (specs.length > MAX_SPECS) {
    return { specs, error: `At most ${MAX_SPECS} specs` };
  }

  return { specs };
}
