import { cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
import { render, screen } from "@testing-library/react";
import { mountLive } from "./hplace-run2.test-fixtures";
import { collectPreparationSnapshot } from "../dom/collect";
import { addressExpected } from "../policy/__fixtures__/hplace-mrs2-address.synthetic";
import { createEmptyProfile } from "../../profile/model";
import { basicAnalysis } from "../adapters/hplace/basic.test-fixtures";
import { AutofillWorkflow } from "./AutofillWorkflow";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
it("collects live staged SEARCH_ADDRESS from the untouched v4 policy independently of legacy birthday styling", () => {
  mountLive();
  expect(
    collectPreparationSnapshot(document)
      .request.sections.flatMap((s) => s.actionCandidates)
      .map((a) => a.domId),
  ).toContain("hplace.mrs2.currentAddress.search");
});

it("executes live preparation through collection, action request, modal commit and final readback", async () => {
  const { modal, policy } = mountLive();
  const p = createEmptyProfile();
  p.contact = {
    ...p.contact,
    postalCode: addressExpected.postalCode,
    addressLine1: addressExpected.address,
    addressLine2: addressExpected.detail,
  };
  const preparation = vi.fn(
    async (r: ReturnType<typeof collectPreparationSnapshot>["request"]) => ({
      snapshotId: r.snapshotId,
      mode: "ADAPTER" as const,
      analysisStatus: "COMPLETE" as const,
      preparationPlans: r.sections
        .flatMap((s) => s.actionCandidates)
        .filter((a) => a.domId === "hplace.mrs2.currentAddress.search")
        .map((a) => ({
          command: "SEARCH_ADDRESS" as const,
          actionCandidateId: a.candidateId,
          expectedEffect: "ADDRESS_SELECTED" as const,
        })),
    }),
  );
  const forbidden = vi.fn();
  document
    .querySelectorAll('[type="submit"],[data-button="add"]')
    .forEach((e) => e.addEventListener("click", forbidden));
  const analysis = async (
    r: FieldsAnalyzeRequest,
  ): Promise<FieldsAnalyzeResponse> => ({
    ...basicAnalysis(r),
    executionPolicy: policy,
    fields: r.sections
      .flatMap((s) => s.fields)
      .map((f) => {
        const a = policy.browserPolicy!.nativeForm!.address!.fields.find(
          (a) => a.name === f.domName || a.legacyName === f.domName,
        );
        return a
          ? {
              candidateId: f.candidateId,
              matchType: "MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              autofillPolicy: "ALLOWED",
              valueBinding: { type: "DIRECT", profileFieldKey: a.key },
              writePlan: { command: "SET_TEXT" },
            }
          : {
              candidateId: f.candidateId,
              matchType: "NO_MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "BLOCKED",
              reasonCodes: ["NO_MATCH"],
            };
      }),
  });
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => p }}
      apiClient={{
        loadExecutionPolicy: async () => policy,
        analyzePreparation: preparation,
        analyzeFields: analysis,
      }}
    />,
  );
  await screen.findByText("기입 결과", {}, { timeout: 15000 });
  expect(preparation).toHaveBeenCalledOnce();
  expect(modal.events.filter((e) => e === "open")).toHaveLength(1);
  expect(modal.inputs().map((e) => e.value)).toEqual(
    Object.values(addressExpected),
  );
  expect(screen.getByLabelText("입력 완료 3개")).toBeVisible();
  expect(screen.queryByText("자동으로 입력하지 못했어요")).toBeNull();
  expect(forbidden).not.toHaveBeenCalled();
});

it("keeps foreign assets and non-companion zip nodes rejected", () => {
  mountLive();
  document.querySelector<HTMLInputElement>(
    '[name="currentAddress.zipCode"]',
  )!.className = "text";
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (s) => s.actionCandidates,
    ),
  ).toHaveLength(0);
  mountLive();
  document.querySelector<HTMLScriptElement>("script")!.src =
    "https://other.example/resources-2.0.3a/mrs2/release/js/applicant/writeResume/writeResume.js?v=261015173100";
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (s) => s.actionCandidates,
    ),
  ).toHaveLength(0);
});
