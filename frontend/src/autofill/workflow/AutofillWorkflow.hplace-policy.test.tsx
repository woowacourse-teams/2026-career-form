import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { createEmptyProfile } from "../../profile/model";
import {
  mountBasicDetail,
  activateBasicDetails,
} from "../adapters/hplace/basic.test-fixtures";
import { resetHplacePage } from "./test-utils/hplace.fixture";
import { installExecutionPolicy } from "./execution-policy";
import type { ExecutionPolicy } from "./execution-policy";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
afterEach(() => {
  resetHplacePage();
  installExecutionPolicy(document);
});
function mount() {
  mountBasicDetail();
  activateBasicDetails();
  document
    .querySelector('section[data-code="13"]')!
    .insertAdjacentHTML(
      "beforeend",
      '<div class="subject"><div class="row"><input type="text" name="emergencyContact.contact" maxlength="64" data-validType="PHONE"><input name="emergencyContact.comment"></div></div>',
    );
  const wrap = document.createElement("div");
  wrap.id = "wrapResume";
  const form = document.querySelector("#frm")!;
  wrap.append(...form.children);
  form.append(wrap);
  document
    .querySelector('section[data-code="11"]')!
    .insertAdjacentHTML(
      "beforeend",
      '<input name="chineseName" id="chineseName" maxlength="32"><input type="number" name="hopeSalary" min="0" max="210000000" step="1">',
    );
}
const policy = () => structuredClone(seed.executionPolicy) as ExecutionPolicy;
it("prevents duplicate candidate ownership beside all legacy basic controls", () => {
  mount();
  installExecutionPolicy(document, policy());
  const snapshot = collectFieldsSnapshot(document),
    fields = snapshot.request.sections.flatMap((s) => s.fields);
  expect(snapshot.request.sections.map((s) => s.sectionId)).toEqual([
    "hplace-detail-basic",
    "hplace-mrs2-basic-extra",
  ]);
  expect(
    fields.filter((f) => f.domName?.startsWith("hplace.detail.")),
  ).toHaveLength(17);
  expect(new Set(fields.map((f) => f.candidateId)).size).toBe(fields.length);
  const elements = fields.flatMap((f) => {
    const l = snapshot.registry.lookupField(f.candidateId);
    return "handle" in l ? l.handle.elements : [];
  });
  expect(new Set(elements).size).toBe(elements.length);
});
it("retains legacy basic fields beside new fields through the full workflow", async () => {
  mount();
  const profile = createEmptyProfile();
  profile.personal.birthDate = "2000-02-29";
  profile.personal.hanjaFamilyName = "金";
  profile.personal.hanjaGivenName = "試驗";
  profile.compensation.desiredSalary = "4100";
  const analyzeFields = vi.fn(
    async (request: FieldsAnalyzeRequest): Promise<FieldsAnalyzeResponse> => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      executionPolicy: policy(),
      fields: request.sections
        .flatMap((s) => s.fields)
        .map((f) => {
          const key =
            f.domName === "hplace.detail.birthday"
              ? "personal.personal.birthDate"
              : f.domName?.endsWith("hopeSalary")
                ? "compensation.compensation.desiredSalary"
                : undefined;
          if (!key && !f.domName?.endsWith("chineseName"))
            return {
              candidateId: f.candidateId,
              matchType: "NO_MATCH",
              interactionStatus: "BLOCKED",
              reasonCodes: ["NO_MATCH"],
              mappingStatus: "ADAPTER_VERIFIED",
            };
          return {
            candidateId: f.candidateId,
            matchType: "MATCH",
            valueBinding: key
              ? { type: "DIRECT", profileFieldKey: key }
              : { type: "DERIVED", recipe: "HANJA_FULL_NAME" },
            mappingStatus: "ADAPTER_VERIFIED",
            autofillPolicy: "ALLOWED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          };
        }),
    }),
  );
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => profile }}
      apiClient={{
        loadExecutionPolicy: async () => policy(),
        analyzePreparation: async (r) => ({
          snapshotId: r.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [],
        }),
        analyzeFields,
      }}
    />,
  );
  expect(await screen.findByLabelText("입력 완료 3개")).toBeVisible();
  expect(
    (document.querySelector('[name="birthday"]') as HTMLInputElement).value,
  ).toBe("2000.02.29");
  expect(
    (document.querySelector('[name="chineseName"]') as HTMLInputElement).value,
  ).toBe("金試驗");
  expect(analyzeFields.mock.calls.length).toBeLessThanOrEqual(3);
});

it("invalidates both owners when a native policy changes after collection", () => {
  mount();
  const p = policy();
  installExecutionPolicy(document, p);
  const snapshot = collectFieldsSnapshot(document);
  if (p.browserPolicy!.schemaVersion !== 2) throw new Error();
  const changed = policy();
  if (changed.browserPolicy!.schemaVersion !== 2) throw new Error();
  changed.browserPolicy!.nativeForm.maxFieldsRequests = 6;
  installExecutionPolicy(document, changed);
  for (const field of snapshot.request.sections.flatMap((s) => s.fields))
    expect(snapshot.registry.lookupField(field.candidateId).status).toBe(
      "stale",
    );
});
