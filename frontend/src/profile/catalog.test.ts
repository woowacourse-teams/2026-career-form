import { expect, it } from "vitest";
import {
  CATALOG,
  CATALOG_VERSION,
  catalogCertificateIssuer,
  getCatalogEntry,
} from "./catalog";
import { searchCatalog } from "./catalog-search";
import { LANGUAGE_TEST_OPTIONS } from "./standard-values";

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

function selected(catalogId: string, displayName: string) {
  return {
    status: "selected",
    catalogId,
    displayName,
    originalText: displayName,
    catalogVersion: CATALOG_VERSION,
  } as const;
}

it("derives a certificate issuer only from a selected certificate entry", () => {
  const sqld = selected("certificate:kdata:sqld", "SQL 개발자");
  expect(catalogCertificateIssuer(sqld, "SQL 개발자")).toBe(
    "한국데이터산업진흥원",
  );
  expect(
    catalogCertificateIssuer(
      selected("certificate:hrdk:e91f006b5973e103", "정보처리기사"),
      "정보처리기사",
    ),
  ).toBe("한국산업인력공단");

  expect(
    catalogCertificateIssuer(
      { status: "manual", originalText: "SQL 개발자" },
      "SQL 개발자",
    ),
  ).toBeUndefined();
  expect(
    catalogCertificateIssuer(
      { ...sqld, catalogVersion: "stale" },
      "SQL 개발자",
    ),
  ).toBeUndefined();
  expect(catalogCertificateIssuer(sqld, "SQL 전문가")).toBeUndefined();
  expect(
    catalogCertificateIssuer(
      { ...sqld, displayName: "SQL 전문가" },
      "SQL 개발자",
    ),
  ).toBeUndefined();
  expect(
    catalogCertificateIssuer(selected("languageTest:opic", "OPIc"), "OPIc"),
  ).toBeUndefined();
  expect(
    catalogCertificateIssuer(
      selected("highSchool:kess:110041601:fc3a718f5d1bacf6", "강동고등학교"),
      "강동고등학교",
    ),
  ).toBeUndefined();
});

it("yields a non-empty issuer for every shipped certificate", () => {
  const certificates = CATALOG.filter((entry) => entry.kind === "certificate");
  expect(certificates).toHaveLength(620);
  expect(
    certificates.filter(
      (entry) =>
        !catalogCertificateIssuer(selected(entry.id, entry.name), entry.name),
    ),
  ).toEqual([]);
});

it("projects TOEIC Speaking as its own searchable language-test entry", () => {
  expect(getCatalogEntry("languageTest:toeic-speaking")).toMatchObject({
    kind: "languageTest",
    name: "TOEIC Speaking",
    detail: "어학 시험",
  });
  const ids = (query: string) =>
    searchCatalog(CATALOG, "languageTest", query).map((entry) => entry.id);
  expect(ids("토익스피킹")).toEqual(["languageTest:toeic-speaking"]);
  expect(ids("TOEIC")).toEqual([
    "languageTest:toeic",
    "languageTest:toeic-speaking",
  ]);
  expect(
    CATALOG.filter((entry) => entry.kind === "languageTest").map(
      (entry) => entry.id,
    ),
  ).toEqual(
    LANGUAGE_TEST_OPTIONS.map((option) => `languageTest:${option.value}`),
  );
  expect(LANGUAGE_TEST_OPTIONS).toHaveLength(8);
  expect(CATALOG).toHaveLength(5156);
});
