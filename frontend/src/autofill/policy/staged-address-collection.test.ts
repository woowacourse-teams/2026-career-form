import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAddress } from "./__fixtures__/hplace-mrs2-address.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { collectStagedAddress } from "./staged-address-collection";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldsSection } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";
afterEach(() => {
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
it("keeps the full triplet when an unrelated candidate has no domName", () => {
  mountAddress();
  const sections: FieldsSection[] = [
    {
      sectionId: "unrelated",
      fields: [
        {
          candidateId: "anonymous",
          element: "input",
          control: "text",
          visibility: "visible",
        },
      ],
    },
  ];
  collectStagedAddress(document, new CandidateRegistry(), sections);
  expect(
    sections
      .find((s) => s.sectionId === "hplace-mrs2-currentAddress")
      ?.fields.map((f) => f.domName),
  ).toEqual([
    "hplace.mrs2.currentAddress.zipCode",
    "hplace.mrs2.currentAddress.address",
    "hplace.mrs2.currentAddress.detailAddress",
  ]);
});
it.each([true, false])(
  "only reuses a legacy detail owned by the same node: %s",
  (same) => {
    const s = mountAddress();
    const registry = new CandidateRegistry();
    const candidate = {
      candidateId: "legacy",
      domName: "hplace.detail.detailAddress",
      element: "input" as const,
      control: "text" as const,
      visibility: "visible" as const,
    };
    const node = same
      ? s.inputs()[2]
      : document.querySelector<HTMLInputElement>(
          '[name="residentAddress.detailAddress"]',
        )!;
    registry.registerField({
      kind: "field",
      owner: "native",
      candidateId: candidate.candidateId,
      candidate,
      sectionId: "legacy",
      elements: [node],
      optionElements: new Map(),
      signature: createStructuralSignature([node]),
    });
    const sections: FieldsSection[] = [
      { sectionId: "legacy", fields: [candidate] },
    ];
    collectStagedAddress(document, registry, sections);
    const staged = sections.find(
      (s) => s.sectionId === "hplace-mrs2-currentAddress",
    );
    if (same) expect(staged?.fields).toHaveLength(2);
    else expect(staged).toBeUndefined();
  },
);

/** CF-177 C6: an absent address trigger is a missing section control; only
 * duplicated triggers stay an ownership mismatch. */
describe("address trigger diagnostics", () => {
  afterEach(() => setAutofillDebugEnabled(false));
  const skips = () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    collectFieldsSnapshot(document);
    const all = log.mock.calls.map(([line]) => line as string);
    for (const line of all) expectHarnessLine(line, ["우편번호"]);
    return all
      .filter((line) => line.startsWith("[CareerForm] skip"))
      .join("\n");
  };
  const trigger = () =>
    document.querySelector<HTMLButtonElement>(
      'div.addresszipcode button[type="button"][data-type="currentAddress"]',
    )!;
  it("reports a missing trigger as a missing section control", () => {
    mountAddress();
    trigger().remove();
    const lines = skips();
    expect(lines).toContain(
      "[CareerForm] skip stage=collect key=hplace.mrs2.currentAddress.search reason=section-missing detail=address-trigger",
    );
    expect(lines).not.toContain("trigger-count");
  });
  it("keeps duplicated triggers an owner mismatch", () => {
    mountAddress();
    trigger().insertAdjacentHTML("afterend", trigger().outerHTML);
    const lines = skips();
    expect(lines).toContain(
      "[CareerForm] skip stage=collect key=hplace.mrs2.currentAddress.search reason=owner-mismatch detail=trigger-count",
    );
    expect(lines).not.toContain("address-trigger");
  });
});
