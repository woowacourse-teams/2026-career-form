import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../model";
import type { ImportEntrySelection, ImportSelection } from "./merge";
import { findInvalidImportRows } from "./review-selection";

const row = (
  sourceRow: number,
  name: string,
  targetId?: string,
): ImportEntrySelection => ({
  categoryId: "careers",
  sectionId: "career",
  sourceRow,
  ...(targetId ? { targetId } : {}),
  values: { companyName: name },
});

describe("import row preflight", () => {
  it("reports the later duplicate addition while retaining subsequent valid rows", () => {
    const profile = createEmptyProfile();
    const duplicate = row(1, "회사 가");
    const selection: ImportSelection = {
      entries: [row(0, "회사 가"), duplicate, row(2, "회사 나")],
    };
    expect(findInvalidImportRows(profile, selection)).toEqual([duplicate]);
  });
  it("reports a repeated existing target before persistence", () => {
    const profile = createEmptyProfile();
    profile.careers.push({
      id: "existing",
      sectionId: "career",
      values: { companyName: "기존 회사" },
    });
    const repeated = row(1, "회사 나", "existing");
    expect(
      findInvalidImportRows(profile, {
        entries: [row(0, "회사 가", "existing"), repeated],
      }),
    ).toEqual([repeated]);
  });
  it("accepts valid rows without changing inputs or colliding with existing IDs", () => {
    const profile = createEmptyProfile();
    profile.careers.push({
      id: "import-review-0",
      sectionId: "career",
      values: { companyName: "기존 회사" },
    });
    const selection: ImportSelection = {
      single: { contact: { email: "test@example.invalid" } },
      entries: [row(0, "회사 가"), row(1, "회사 나")],
    };
    const before = structuredClone({ profile, selection });
    expect(findInvalidImportRows(profile, selection)).toEqual([]);
    expect({ profile, selection }).toEqual(before);
  });
  it("reports an invalid row without preventing a valid later row", () => {
    const invalid = row(0, "");
    expect(
      findInvalidImportRows(createEmptyProfile(), {
        entries: [invalid, row(1, "회사 가")],
      }),
    ).toEqual([invalid]);
  });
});
