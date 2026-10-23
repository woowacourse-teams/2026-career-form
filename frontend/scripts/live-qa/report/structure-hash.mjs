// Hashes the value-free page structure a pre-grading was made from, so the
// same structure (another posting on the same form, or the same page measured
// again) can reuse its `final.json` instead of grading it again.
//
// The hash covers `controls` (without the index `i`, in page order) and
// `addButtons`. `url` and `label` stay out: two postings of one form share a
// structure and should share a grading.

import { createHash } from "node:crypto";

// JSON with object keys sorted, so key order never changes the hash.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function structureHash(gradeInput) {
  const controls = (gradeInput.controls ?? []).map((c) => {
    const rest = { ...c };
    delete rest.i;
    return rest;
  });
  const body = canonicalJson({
    controls,
    addButtons: gradeInput.addButtons ?? [],
  });
  return createHash("sha256").update(body).digest("hex");
}
