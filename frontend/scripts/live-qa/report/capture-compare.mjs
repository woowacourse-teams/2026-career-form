// Independent check of the DOM verdict against screenshots: the capture
// judge sees only the captures and the expected values, never the DOM
// result, and writes what it can read in each control. This module builds
// that input and compares the two verdicts control by control.

import { resolve } from "node:path";

const FROM_DOM = ["WRONG", "MISSED", "UNVERIFIABLE", "EXPECTATION_ERROR"];
const EXCLUDED = ["UNVERIFIABLE", "EXPECTATION_ERROR"];
const REF_INDEX = /^i=(\d+)(?:\s|$)/;

// Comparable form of a value: display text only (`code|text` keeps the text,
// a radio `text [v=value]` keeps the text), without spaces, hyphens, dots
// and slashes, lowercased.
export function normalizeValue(value) {
  let text = String(value ?? "");
  text = text.replace(/\s*\[v=[^\]]*\]\s*$/, "");
  if (text.includes("|")) text = text.slice(text.lastIndexOf("|") + 1);
  return text.replace(/[\s\-./]/g, "").toLowerCase();
}

// `grade/<label>.capture-input.json`: capture files (absolute) and the
// expected values of AUTOFILLABLE controls. No DOM result goes in here.
export function buildCaptureInput({ joined, captures, baseDir }) {
  return {
    label: joined.label,
    captures: captures.map((c) => ({
      file: resolve(baseDir, c.file),
      name: c.name,
      controls: c.controls ?? [],
    })),
    expected: joined.rows
      .filter((r) => r.category === "AUTOFILLABLE")
      .map((r) => ({
        i: r.i,
        section: r.section,
        label: r.label,
        type: r.type,
        expected: r.expected,
      })),
  };
}

// captureVerdict: [{ i, seen }] with seen "" (empty control) or null (control
// not visible in any capture).
export function compareCaptures({ joined, verdict, captureVerdict }) {
  const dom = {};
  for (const it of verdict.items ?? []) {
    const i = REF_INDEX.exec(it.ref ?? "")?.[1];
    if (i !== undefined && FROM_DOM.includes(it.kind) && !dom[i])
      dom[i] = it.kind;
  }
  const seenBy = {};
  for (const c of captureVerdict ?? []) seenBy[c.i] = c.seen ?? null;
  const result = {
    compared: 0,
    agreed: 0,
    notVisible: 0,
    excluded: 0,
    disagreements: [],
  };
  for (const r of joined.rows ?? []) {
    if (r.category !== "AUTOFILLABLE") continue;
    const kind = dom[r.i] ?? "CORRECT";
    if (EXCLUDED.includes(kind)) {
      result.excluded++;
      continue;
    }
    const seen = seenBy[r.i] ?? null;
    if (seen === null) {
      result.notVisible++;
      continue;
    }
    result.compared++;
    const same = normalizeValue(seen) === normalizeValue(r.expected);
    const agrees =
      kind === "CORRECT"
        ? same
        : kind === "MISSED"
          ? seen === ""
          : seen !== "" && !same;
    if (agrees) result.agreed++;
    else
      result.disagreements.push({
        i: r.i,
        dom: kind,
        seen,
        expected: r.expected,
      });
  }
  return result;
}
