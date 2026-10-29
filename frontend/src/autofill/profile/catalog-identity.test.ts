import { expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { CATALOG, getCatalogEntry } from "../../profile/catalog";
import { catalogLabels } from "../../profile/catalog-search";
import {
  bindSearchIdentity,
  matchesCatalogLabel,
  matchesCatalogNumberedCollege,
  normalizedCatalogLabel,
} from "./catalog-identity";

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

const campus = (code: string) => {
  const entry = getCatalogEntry(`university:kess:${code}:a7149b19bd06a284`);
  if (!entry) throw new Error(`Missing catalog university ${code}`);
  return entry;
};

it("matches a numbered Korea Polytechnic site label to the numeral-less catalog campus", () => {
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3110000"),
      "한국폴리텍 I 대학 서울정수캠퍼스",
    ),
  ).toBe(true);
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3120000"),
      "한국폴리텍 II 대학 인천캠퍼스",
    ),
  ).toBe(true);
  // A catalog record that carries the number accepts a numeral-less site label.
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3112000"),
      "한국폴리텍대학 성남캠퍼스",
    ),
  ).toBe(true);
});

it("rejects other campuses and conflicting college numbers", () => {
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3110000"),
      "한국폴리텍 I 대학 서울강서캠퍼스",
    ),
  ).toBe(false);
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3120000"),
      "한국폴리텍 II 대학 남인천캠퍼스",
    ),
  ).toBe(false);
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3112000"),
      "한국폴리텍 II 대학 성남캠퍼스",
    ),
  ).toBe(false);
  // The exact catalog name is matchesCatalogLabel's job, not a numbering difference.
  expect(
    matchesCatalogNumberedCollege(
      campus("Z3110000"),
      "한국폴리텍대학 서울정수캠퍼스",
    ),
  ).toBe(false);
  expect(
    matchesCatalogNumberedCollege(campus("51012000"), "서울 I 대학교"),
  ).toBe(false);
  const highSchool = getCatalogEntry(
    "highSchool:kess:110041601:fc3a718f5d1bacf6",
  );
  if (!highSchool) throw new Error("Missing catalog high school");
  expect(
    matchesCatalogNumberedCollege(highSchool, "한국폴리텍 I 대학 강동고등학교"),
  ).toBe(false);
});

it("keeps every numeral-stripped Korea Polytechnic key unique in the shipped catalog", () => {
  const keys = new Map<string, Set<string>>();
  for (const entry of CATALOG) {
    if (entry.kind !== "university" && entry.kind !== "graduateSchool")
      continue;
    for (const label of catalogLabels(entry)) {
      const normalized = normalizedCatalogLabel(label);
      if (!normalized.startsWith("한국폴리텍")) continue;
      const key = `${entry.kind}:${normalized.replace(/^한국폴리텍[ivx]+대학/, "한국폴리텍대학")}`;
      keys.set(key, (keys.get(key) ?? new Set()).add(entry.id));
    }
  }
  expect(keys.size).toBeGreaterThan(20);
  expect([...keys.values()].filter((ids) => ids.size > 1)).toEqual([]);
});
