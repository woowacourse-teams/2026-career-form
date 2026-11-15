import { afterEach, describe, expect, it } from "vitest";
import type { FieldCandidateHandle } from "../dom/types";
import { matchesResultValue } from "../workflow/result-value-match";
import { CATALOG_VERSION } from "../../profile/catalog";
import type { ReviewPlanItem } from "../review/review-plan";
import { approveCatalogMatch } from "./catalog-identity";
import {
  rememberCatalogSelection,
  retainedCatalogSelection,
} from "./catalog-receipt";

afterEach(() => document.body.replaceChildren());

function fixture() {
  const identity = {
    status: "selected" as const,
    catalogId: "languageTest:opic",
    displayName: "OPIc",
    originalText: "오픽",
    catalogVersion: CATALOG_VERSION,
  };
  const key = "languages.languageTest.testName";
  const approval = approveCatalogMatch(identity, key, "OPIc");
  if (approval.status !== "selected") throw new Error("Missing exam approval");
  const item: ReviewPlanItem = {
    candidateId: "exam",
    fieldLabel: "시험명",
    currentValue: "",
    previewValue: "OPIc",
    profileValue: "OPIc",
    profileFieldKey: key,
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
    searchIdentity: identity,
    catalogMatch: approval.match,
  };
  const input = document.createElement("input");
  input.value = "opic";
  input.setAttribute("data-code", "SITE-1");
  document.body.append(input);
  const remembered = rememberCatalogSelection(item, {
    element: input,
    evidence: { label: "OPIC" },
    verify: () => input.getAttribute("data-code") === "SITE-1",
    readback: () => input.isConnected,
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

describe("the result readback after the write pass ended", () => {
  function endedPass() {
    const { item, input } = fixture();
    // The write pass ended; its approval no longer vouches for the site code.
    input.setAttribute("data-code", "PASS-ENDED");
    const handle = {
      candidateId: item.candidateId,
      elements: [input],
      candidate: { candidateId: item.candidateId, control: "text" },
    } as unknown as FieldCandidateHandle;
    return {
      item: {
        ...item,
        analysis: {
          candidateId: item.candidateId,
          matchType: "MATCH" as const,
          mappingStatus: "LLM_SUGGESTED" as const,
          interactionStatus: "READY" as const,
          autofillPolicy: "ALLOWED" as const,
          valueBinding: { type: "DIRECT" as const, profileFieldKey: item.profileFieldKey! },
          writePlan: { command: "SEARCH_SELECTION" as const },
        },
      },
      input,
      handle,
    };
  }

  it("still reads our own unchanged selection as entered", () => {
    const { item, handle } = endedPass();
    expect(retainedCatalogSelection(item, handle.elements[0] as HTMLElement)).toBeUndefined();
    expect(matchesResultValue(item, "opic", "OPIc", handle)).toBe(true);
  });

  it("does not read a selection edited after the pass as entered", () => {
    const { item, input, handle } = endedPass();
    input.value = "OPIC";
    expect(matchesResultValue(item, "OPIC", "OPIc", handle)).toBe(false);
  });
});
