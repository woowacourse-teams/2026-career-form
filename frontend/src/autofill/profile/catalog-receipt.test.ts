import { afterEach, expect, it } from "vitest";
import { CATALOG_VERSION } from "../../profile/catalog";
import type { ReviewPlanItem } from "../review/review-plan";
import { approveCatalogMatch } from "./catalog-identity";
import { rememberCatalogSelection, retainedCatalogSelection } from "./catalog-receipt";

afterEach(() => document.body.replaceChildren());

function fixture() {
  const identity = {
    status: "selected" as const, catalogId: "languageTest:opic",
    displayName: "OPIc", originalText: "오픽", catalogVersion: CATALOG_VERSION,
  };
  const key = "languages.languageTest.testName";
  const approval = approveCatalogMatch(identity, key, "OPIc");
  if (approval.status !== "selected") throw new Error("Missing exam approval");
  const item: ReviewPlanItem = {
    candidateId: "exam", fieldLabel: "시험명", currentValue: "", previewValue: "OPIc",
    profileValue: "OPIc", profileFieldKey: key, status: "available",
    selected: true, disabled: false, revealed: true, reason: "",
    searchIdentity: identity, catalogMatch: approval.match,
  };
  const input = document.createElement("input");
  input.value = "opic";
  input.setAttribute("data-code", "SITE-1");
  document.body.append(input);
  const remembered = rememberCatalogSelection(item, {
    element: input, evidence: { label: "OPIC" },
    verify: () => input.getAttribute("data-code") === "SITE-1",
  });
  expect(remembered).toBe(true);
  return { item, input };
}

it("retains the actual committed value rather than a differently formatted option label", () => {
  const { item, input } = fixture();
  expect(retainedCatalogSelection(item, input)).toBe("opic");
});

it("rejects a post-selection display edit even when it is another approved alias", () => {
  const { item, input } = fixture();
  input.value = "OPIC";
  expect(retainedCatalogSelection(item, input)).toBeUndefined();
});
