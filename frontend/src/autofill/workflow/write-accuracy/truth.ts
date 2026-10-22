import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SnapshotTruth } from "./schema";

/** Missing files stay absent, never fabricated from product results. */
export function loadTruth(snapshot: string): SnapshotTruth | undefined {
  const path = join(
    process.cwd(),
    "fixtures/write-accuracy",
    snapshot,
    "truth.json",
  );
  if (!existsSync(path)) return undefined;
  return parseTruth(JSON.parse(readFileSync(path, "utf8")), snapshot);
}

/** Validate the fixture boundary before letting its keys drive product code. */
export function parseTruth(value: unknown, snapshot: string): SnapshotTruth {
  const fail = () => {
    throw new Error(`INVALID_TRUTH:${snapshot}`);
  };
  if (!value || typeof value !== "object") return fail();
  const truth = value as SnapshotTruth;
  if (
    truth.schemaVersion !== 1 ||
    truth.snapshot !== snapshot ||
    !Array.isArray(truth.fields)
  )
    return fail();
  const ordinals = new Set<number>();
  const paths = new Set<string>();
  for (const field of truth.fields) {
    if (
      !field ||
      !Number.isInteger(field.ordinal) ||
      field.ordinal < 0 ||
      ordinals.has(field.ordinal) ||
      !Array.isArray(field.structurePath) ||
      field.structurePath.length === 0 ||
      !field.structurePath.every(
        (path) =>
          typeof path === "string" &&
          /^body(?: > [a-z][a-z0-9-]*:nth-child\([1-9]\d*\))*$/.test(path),
      ) ||
      field.structurePath.some((path) => paths.has(path)) ||
      (field.rowIndex !== null &&
        (!Number.isInteger(field.rowIndex) || field.rowIndex < 0)) ||
      ![
        "text",
        "select",
        "radio",
        "checkbox",
        "textarea",
        "button",
        "custom",
      ].includes(field.controlKind) ||
      (field.profileFieldKey !== null &&
        (typeof field.profileFieldKey !== "string" ||
          !field.profileFieldKey)) ||
      (field.profileFieldKey === null &&
        !field.binding &&
        field.preserve !== true) ||
      typeof field.exercisable !== "boolean" ||
      (!field.exercisable &&
        (typeof field.exercisableReason !== "string" ||
          !field.exercisableReason.trim())) ||
      (field.preserve !== undefined && field.preserve !== true) ||
      (field.preserve && field.exercisable)
    )
      return fail();
    const state = field.expectedDomState;
    if (!state || typeof state !== "object" || Object.keys(state).length !== 1)
      return fail();
    if (!(
      ("value" in state && typeof state.value === "string") ||
      ("text" in state && typeof state.text === "string") ||
      ("checkedValues" in state &&
        Array.isArray(state.checkedValues) &&
        state.checkedValues.every((item) => typeof item === "string"))
    ))
      return fail();
    if (
      field.writeCommand !== undefined &&
      ![
        "SET_TEXT",
        "SELECT_OPTION",
        "CHECK_RADIO",
        "CHECK_CHECKBOX",
        "SELECT_BUTTON_OPTION",
        "SEARCH_SELECTION",
        "SELECT_DATE",
      ].includes(field.writeCommand)
    )
      return fail();
    if (field.binding !== undefined) {
      if (
        !field.binding ||
        typeof field.binding !== "object" ||
        (!(
          field.binding.type === "DATE_PART" &&
          ["YEAR", "MONTH", "DAY"].includes(field.binding.part)
        ) &&
          !(
            field.binding.type === "DERIVED" &&
            [
              "KOREAN_FULL_NAME",
              "HANJA_FULL_NAME",
              "ENGLISH_FULL_NAME_GIVEN_FIRST",
              "ENGLISH_FULL_NAME_FAMILY_FIRST",
            ].includes(field.binding.recipe)
          ))
      )
        return fail();
    }
    ordinals.add(field.ordinal);
    field.structurePath.forEach((path) => paths.add(path));
  }
  return truth;
}
