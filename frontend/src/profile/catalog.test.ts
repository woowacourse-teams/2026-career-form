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
  expect(certificates).toHaveLength(734);
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
  expect(LANGUAGE_TEST_OPTIONS).toHaveLength(21);
  expect(CATALOG).toHaveLength(5283);
});

const ids = (kind: "certificate" | "languageTest", query: string) =>
  searchCatalog(CATALOG, kind, query).map((entry) => entry.id);

it("keeps the catalog version and existing identifiers stable", () => {
  expect(CATALOG_VERSION).toBe("2026-10-07");
  expect(getCatalogEntry("certificate:kdata:sqld")?.name).toBe("SQL 개발자");
  expect(getCatalogEntry("certificate:hrdk:e91f006b5973e103")?.name).toBe(
    "정보처리기사",
  );
  expect(getCatalogEntry("languageTest:opic")?.name).toBe("OPIc");
});

it("ships no duplicate (kind, name, detail) triples", () => {
  const triples = CATALOG.map((e) =>
    JSON.stringify([e.kind, e.name, e.detail]),
  );
  expect(new Set(triples).size).toBe(CATALOG.length);
});

it.each([
  ["컴퓨터활용능력", "대한상공회의소"],
  ["워드프로세서", "대한상공회의소"],
  ["한국사능력검정시험", "국사편찬위원회"],
  ["리눅스마스터", "한국정보통신진흥협회"],
])("finds the %s certificate with its issuer", (query, issuer) => {
  const matches = searchCatalog(CATALOG, "certificate", query);
  expect(matches.length).toBeGreaterThan(0);
  expect(
    matches.some((entry) => entry.detail.split(" · ")[0]?.includes(issuer)),
  ).toBe(true);
});

it("finds the verified official abbreviations without changing their ids", () => {
  expect(ids("certificate", "ADsP")).toEqual([
    "certificate:kdata:9fc4cc62283580a3",
  ]);
  expect(ids("certificate", "ADP")).toEqual([
    "certificate:kdata:193438432819fbe7",
  ]);
});

it.each([
  "TEPS Speaking",
  "G-TELP",
  "FLEX",
  "JPT",
  "SJPT",
  "HSKK",
  "TSC",
  "DELF",
  "DALF",
  "DELE",
  "Goethe-Zertifikat",
  "TestDaF",
  "TOPIK",
])("finds the %s language test by name", (name) => {
  const found = searchCatalog(CATALOG, "languageTest", name).filter(
    (entry) => entry.name === name,
  );
  expect(found).toHaveLength(1);
});
