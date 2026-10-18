import { afterEach, expect, it, vi } from "vitest";
import { mountAddress } from "./__fixtures__/hplace-mrs2-address.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { collectStagedAddress } from "./staged-address-collection";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldsSection } from "../api/types";
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
