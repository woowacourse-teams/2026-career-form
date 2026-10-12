import { expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { getCatalogEntry } from "../../profile/catalog";
import { bindSearchIdentity, matchesCatalogLabel } from "./catalog-identity";

it("carries the sole high-school identity even without a repeated item index", () => {
  const profile = createEmptyProfile();
  const identity = { status: "manual" as const, originalText: "가상고등학교" };
  profile.education = [
    {
      id: "school-1",
      sectionId: "highSchool",
      values: { schoolName: "가상고등학교" },
      identity,
    },
  ];
  expect(
    bindSearchIdentity(
      profile,
      "education.highSchool.schoolName",
      undefined,
      "가상고등학교",
    ),
  ).toEqual(identity);
});

it("recognizes a canonical name with its verified abbreviation in the shipped catalog", () => {
  const entry = getCatalogEntry("certificate:kdata:sqld");
  if (!entry) throw new Error("Missing SQLD catalog entry");
  expect(matchesCatalogLabel(entry, "SQL 개발자 (SQLD)")).toBe(true);
});
