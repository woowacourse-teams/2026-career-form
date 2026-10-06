import { expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { FieldsAnalyzeResponse } from "../api/types";
import type { collectFieldsSnapshot } from "../dom/collect";
import { runAddressAnalysis } from "./address-analysis";

const names = [
  "personalInformation.currentAddress.postalCode",
  "personalInformation.currentAddress.address",
  "personalInformation.currentAddress.detailedAddress",
];
const keys = [
  "contact.contact.postalCode",
  "contact.contact.addressLine1",
  "contact.contact.addressLine2",
];

function setup(button?: Element) {
  const inputs = names.map((name, index) => {
    const input = document.createElement("input");
    input.name = name;
    input.readOnly = index < 2;
    return input;
  });
  const snapshot = {
    request: {
      sections: [
        {
          fields: names.map((name, index) => ({
            candidateId: `f${index}`,
            domName: name,
            element: "input",
            control: "text",
            visibility: "visible",
            readonly: index < 2,
          })),
        },
      ],
    },
    registry: {
      lookupField: (id: string) => ({
        status: "ready",
        handle: { elements: [inputs[Number(id.slice(1))]] },
      }),
    },
  } as unknown as ReturnType<typeof collectFieldsSnapshot>;
  const analysis = {
    mode: "ADAPTER",
    fields: [
      ...names.map((_, index) => ({
        candidateId: `f${index}`,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        valueBinding: { type: "DIRECT", profileFieldKey: keys[index] },
      })),
      { candidateId: "other", matchType: "MATCH" },
    ],
  } as unknown as FieldsAnalyzeResponse;
  const runAddress = vi.fn(async () => {
    inputs[0].value = "06152";
    inputs[1].value = "서울특별시 강남구 테헤란로 305";
    inputs[2].value = "10층";
    return { status: "written" as const, reason: "ok" };
  });
  const adapter = {
    runAddress,
    addressFieldNames: names,
    addressRequiresSearch: true,
  } as unknown as WorkflowAdapter;
  const onWriteResult = vi.fn();
  const result = runAddressAnalysis({
    analysis,
    snapshot,
    adapter,
    run: { controller: new AbortController(), button },
    pageDocument: document,
    profile: createEmptyProfile(),
    repository: { load: async () => createEmptyProfile() },
    addressSearch: vi.fn(),
    onWriteResult,
    setAddressResult: vi.fn(),
  });
  return { result, runAddress, onWriteResult };
}

it("runs a search-only address whose fields are identified by name", async () => {
  const { result, runAddress, onWriteResult } = setup(
    document.createElement("button"),
  );

  expect((await result)?.fields.map((field) => field.candidateId)).toEqual([
    "other",
  ]);
  expect(runAddress).toHaveBeenCalledOnce();
  expect(onWriteResult).toHaveBeenCalledTimes(3);
});

it("never leaves a search-only detail address writable without its search", async () => {
  const { result, runAddress } = setup();

  expect((await result)?.fields.map((field) => field.candidateId)).toEqual([
    "other",
  ]);
  expect(runAddress).not.toHaveBeenCalled();
});
