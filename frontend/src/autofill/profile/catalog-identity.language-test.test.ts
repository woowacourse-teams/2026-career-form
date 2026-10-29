import { expect, it } from "vitest";
import type { ProfileIdentity } from "../../profile/model";
import { approveCatalogMatch } from "./catalog-identity";
import {
  matchesApprovedCatalog,
  normalizedCatalogLabel,
} from "./catalog-match";

const TEST_NAME = "languages.languageTest.testName";

function selected(catalogId: string, displayName: string): ProfileIdentity {
  return {
    status: "selected",
    catalogId,
    displayName,
    originalText: displayName,
    // A literal, not CATALOG_VERSION: adding an exam must keep stored selections valid.
    catalogVersion: "2026-10-07",
  };
}

it("keeps TOEIC and TOEIC Speaking approvals disjoint without a catalog version change", () => {
  const speaking = approveCatalogMatch(
    selected("languageTest:toeic-speaking", "TOEIC Speaking"),
    TEST_NAME,
    "TOEIC Speaking",
  );
  if (speaking.status !== "selected")
    throw new Error(`TOEIC Speaking approval was ${speaking.status}`);
  expect(
    matchesApprovedCatalog(speaking.match, { label: "TOEIC SPEAKING" }),
  ).toBe(true);
  expect(matchesApprovedCatalog(speaking.match, { label: "토익스피킹" })).toBe(
    true,
  );
  expect(matchesApprovedCatalog(speaking.match, { label: "TOEIC" })).toBe(
    false,
  );

  const toeic = approveCatalogMatch(
    selected("languageTest:toeic", "TOEIC"),
    TEST_NAME,
    "TOEIC",
  );
  if (toeic.status !== "selected")
    throw new Error(`TOEIC approval was ${toeic.status}`);
  expect(toeic.match.labels.map(normalizedCatalogLabel)).not.toContain(
    "toeicspeaking",
  );
  expect(matchesApprovedCatalog(toeic.match, { label: "TOEIC Speaking" })).toBe(
    false,
  );
});
