import type { ProfileFieldDefinition } from "./field-definitions";
import type { StandardValueOption } from "./standard-values";

type FieldOptions = readonly (string | StandardValueOption)[];

/** Label of a structured option whose stored value matches; plain string options are their own label. */
export function optionLabel(
  options: FieldOptions | undefined,
  value: string,
): string | undefined {
  const option = options?.find((item) =>
    typeof item === "string" ? item === value : item.value === value,
  );
  return option && typeof option !== "string" ? option.label : undefined;
}

/** What a reader sees for a stored value: its option label, or the value unchanged. */
export function fieldDisplayValue(
  field: ProfileFieldDefinition,
  value: string,
  values: Readonly<Record<string, string>>,
): string {
  const options = field.optionsFor?.({ ...values }) ?? field.options;
  return optionLabel(options, value) ?? value;
}
