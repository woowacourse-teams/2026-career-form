import { expect, it, vi } from "vitest";

vi.mock("../address/kakao-executor", () => ({
  runKakaoAddress: vi.fn(async () => ({ status: "manual" as const, reason: "mocked" })),
}));
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

it("runs the vendor address executor for a generic page with two visible fields", async () => {
  const { runKakaoAddress } = await import("../address/kakao-executor");
  vi.mocked(runKakaoAddress).mockClear();
  const button = document.createElement("button");
  button.setAttribute("aria-label", "검색");
  document.body.append(button);
  const rows = [
    { candidateId: "f1", domName: "roadAddress", element: "input", control: "text", visibility: "visible", readonly: true, disabled: false, inert: false },
    { candidateId: "f2", domName: "detailAddress", element: "input", control: "text", visibility: "visible", readonly: false, disabled: false, inert: false },
  ];
  const inputs = rows.map((row) => {
    const input = document.createElement("input");
    button.after(input);
    return input;
  });
  const snapshot = {
    request: { sections: [{ fields: rows }] },
    registry: {
      lookupField: (id: string) => ({
        status: "ready",
        handle: { elements: [inputs[Number(id.slice(1)) - 1]] },
      }),
    },
  } as unknown as ReturnType<typeof collectFieldsSnapshot>;
  const analysis = {
    mode: "GENERIC",
    fields: [
      {
        candidateId: "f1",
        matchType: "MATCH",
        mappingStatus: "LLM_SUGGESTED",
        valueBinding: { type: "DIRECT", profileFieldKey: keys[1] },
      },
      {
        candidateId: "f2",
        matchType: "MATCH",
        mappingStatus: "LLM_SUGGESTED",
        valueBinding: { type: "DIRECT", profileFieldKey: keys[2] },
      },
    ],
  } as unknown as FieldsAnalyzeResponse;

  const result = await runAddressAnalysis({
    analysis,
    snapshot,
    adapter: {} as unknown as WorkflowAdapter,
    run: { controller: new AbortController(), button },
    pageDocument: document,
    profile: createEmptyProfile(),
    repository: { load: async () => createEmptyProfile() },
    addressSearch: vi.fn(),
    onWriteResult: vi.fn(),
    setAddressResult: vi.fn(),
  });

  expect(runKakaoAddress).toHaveBeenCalledOnce();
  expect(vi.mocked(runKakaoAddress).mock.calls[0]![0].targets).toEqual({
    address: inputs[0],
    detail: inputs[1],
  });
  expect(result?.fields.map((field) => field.candidateId)).toEqual([]);
});

it("never leaves a search-only detail address writable without its search", async () => {
  const { result, runAddress } = setup();

  expect((await result)?.fields.map((field) => field.candidateId)).toEqual([
    "other",
  ]);
  expect(runAddress).not.toHaveBeenCalled();
});
