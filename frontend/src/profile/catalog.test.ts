import { expect, it } from "vitest";
import { CATALOG, getCatalogEntry } from "./catalog";
import { searchCatalog } from "./catalog-search";

it("finds a displayed name plus abbreviation using the shipped catalog", () => {
  const matches = searchCatalog(CATALOG, "certificate", "SQL 개발자 (SQLD)");
  expect(matches.map((entry) => entry.id)).toEqual(["certificate:kdata:sqld"]);
});

it("ships unique identifiers with names and independent SQL qualifications", () => {
  expect(new Set(CATALOG.map((entry) => entry.id)).size).toBe(CATALOG.length);
  expect(CATALOG.every((entry) => entry.id && entry.name && entry.detail)).toBe(
    true,
  );
  expect(getCatalogEntry("certificate:kdata:sqld")?.name).toBe("SQL 개발자");
  expect(getCatalogEntry("certificate:kdata:sqlp")?.name).toBe("SQL 전문가");
});
