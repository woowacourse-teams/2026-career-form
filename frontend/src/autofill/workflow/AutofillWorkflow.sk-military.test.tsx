import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type {
  AnalysisApiClient,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  PreparationAnalyzeRequest,
  PreparationPlan,
} from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

const militaryStatuses = ["군필", "복무중", "미필", "면제"] as const;
type MilitaryStatus = (typeof militaryStatuses)[number];
const militaryDetails: Record<MilitaryStatus, Record<string, string>> = {
  군필: {
    militaryType: "현역병",
  },
  복무중: {
    militaryType: "현역병",
  },
  미필: { militaryType: "미필" },
  면제: { militaryType: "면제", exemptionReason: "질병" },
};
const militaryBindings: Record<string, string> = {
  prsMilitarySvcType: "military.military.militaryType",
  prsMilitarySvcTypeReason: "military.military.exemptionReason",
};

function fields(request: FieldsAnalyzeRequest): FieldCandidate[] {
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}
function action(
  request: PreparationAnalyzeRequest,
  domName: string,
  displayName: string,
) {
  const candidate = request.sections
    .flatMap((section) => section.actionCandidates)
    .find(
      (item) =>
        item.domName === domName &&
        (displayName === "" || item.displayName === displayName),
    );
  if (!candidate)
    throw new Error(`Missing action candidate: ${domName}=${displayName}`);
  return candidate;
}
function revealPlan(
  request: PreparationAnalyzeRequest,
  domName: string,
  displayName: string,
  profileFieldKey: string,
  extra: Partial<
    Extract<PreparationPlan, { command: "SELECT_OPTION_TO_REVEAL" }>
  > = {},
): Extract<PreparationPlan, { command: "SELECT_OPTION_TO_REVEAL" }> {
  const candidate = action(request, domName, displayName);
  const section = request.sections.find((item) =>
    item.actionCandidates.some(
      ({ candidateId }) => candidateId === candidate.candidateId,
    ),
  );
  if (!section)
    throw new Error(`Missing action section: ${candidate.candidateId}`);
  return {
    actionCandidateId: candidate.candidateId,
    command: "SELECT_OPTION_TO_REVEAL",
    expectedEffect: "TARGET_FIELDS_VISIBLE",
    profileFieldKey,
    optionDisplayName: displayName || undefined,
    targetSectionId: section.sectionId,
    ...extra,
  };
}
function fieldResponse(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: fields(request).map((field) => {
      const profileFieldKey =
        field.domName === "prsMilitarySvcStatus"
          ? "military.military.militaryStatus"
          : field.domName === "prsVeteranBenefitNumber"
            ? "veteran.veteran.veteranNumber"
            : field.domName === "prsVeteranBenefitRelation"
              ? "veteran.veteran.veteranRelation"
              : field.domName
                ? militaryBindings[field.domName]
                : undefined;
      if (!profileFieldKey)
        return {
          candidateId: field.candidateId,
          matchType: "NO_MATCH" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "BLOCKED" as const,
          reasonCodes: ["NO_MATCH" as const],
        };
      if (field.domName === "prsMilitarySvcStatus")
        return {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "LOOKUP" as const,
            profileFieldKey,
            optionMap: Object.fromEntries(
              militaryStatuses.map((value) => [value, value]),
            ),
          },
          autofillPolicy: "ALLOWED" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "READY" as const,
          writePlan: { command: "SELECT_OPTION" as const },
        };
      if (field.domName === "prsMilitarySvcType")
        return {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "LOOKUP" as const,
            profileFieldKey,
            optionMap: { 현역병: "현역병", 미필: "미필", 면제: "면제" },
          },
          autofillPolicy: "ALLOWED" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "READY" as const,
          writePlan: { command: "SELECT_OPTION" as const },
        };
      return {
        candidateId: field.candidateId,
        matchType: "MATCH" as const,
        valueBinding: { type: "DIRECT" as const, profileFieldKey },
        autofillPolicy: "ALLOWED" as const,
        mappingStatus: "ADAPTER_VERIFIED" as const,
        interactionStatus: "READY" as const,
        writePlan: { command: "SET_TEXT" as const },
      };
    }),
  };
}

function setup(
  militaryStatus: MilitaryStatus | "비대상",
  veteranStatus: "대상" | "비대상",
) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/synthetic",
  });
  document.body.innerHTML = `
    <section id="conditional-profile" aria-label="지원자 조건부 정보">
      <fieldset aria-label="병역"><legend>병역</legend>
        <label><input type="radio" name="prsMilitarySvcYN" value="0"> 비대상</label>
        <label><input type="radio" name="prsMilitarySvcYN" value="1"> 대상</label>
      </fieldset>
      <fieldset aria-label="보훈"><legend>보훈</legend>
        <label><input type="radio" name="prsVeteranBenefitYN" value="0"> 비대상</label>
        <label><input type="radio" name="prsVeteranBenefitYN" value="1"> 대상</label>
      </fieldset>
      <input name="prsMilitarySvcEtcReason" aria-label="기타 사유(검증되지 않은 필드)" />
      <input name="prsMilitarySvcUnfinishReason" aria-label="미필 사유(검증되지 않은 필드)" />
    </section>`;
  const militaryTarget = document.querySelector<HTMLInputElement>(
    "input[name='prsMilitarySvcYN'][value='1']",
  )!;
  const militaryFieldset = militaryTarget.closest("fieldset")!;
  militaryTarget.addEventListener("change", () => {
    if (militaryTarget.checked && !militaryFieldset.querySelector("select")) {
      militaryFieldset.insertAdjacentHTML(
        "beforeend",
        `<label for="prsMilitarySvcStatus">복무 상태
        <select id="prsMilitarySvcStatus" name="prsMilitarySvcStatus"><option value="">선택</option><option value="군필">군필</option><option value="복무중">복무중</option><option value="미필">미필</option><option value="면제">면제</option></select></label>`,
      );
      militaryFieldset
        .querySelector<HTMLSelectElement>("#prsMilitarySvcStatus")!
        .addEventListener("change", (event) => {
          const select = event.currentTarget as HTMLSelectElement;
          if (
            select.value &&
            !militaryFieldset.querySelector(".military-details")
          )
            militaryFieldset.insertAdjacentHTML(
              "beforeend",
              `<div class="military-details">
          <label>복무 구분<select name="prsMilitarySvcType"><option value="">선택</option><option value="현역병">현역병</option><option value="미필">미필</option><option value="면제">면제</option></select></label>
          <input name="prsMilitarySvcEtcReason" aria-label="기타 사유(검증되지 않은 필드)" />
          <input name="prsMilitarySvcUnfinishReason" aria-label="미필 사유(검증되지 않은 필드)" />
          <input name="prsMilitarySvcTypeReason" aria-label="면제 사유" />
        </div>`,
            );
        });
    }
  });
  const veteranTarget = document.querySelector<HTMLInputElement>(
    "input[name='prsVeteranBenefitYN'][value='1']",
  )!;
  const veteranFieldset = veteranTarget.closest("fieldset")!;
  veteranTarget.addEventListener("change", () => {
    if (
      veteranTarget.checked &&
      !veteranFieldset.querySelector("[name='prsVeteranBenefitNumber']")
    )
      veteranFieldset.insertAdjacentHTML(
        "beforeend",
        `<input name="prsVeteranBenefitNumber" aria-label="보훈 번호" /><input name="prsVeteranBenefitRelation" aria-label="보훈 대상과의 관계" />`,
      );
  });
  const profile = createEmptyProfile();
  profile.military =
    militaryStatus === "비대상"
      ? { militaryStatus }
      : { militaryStatus, ...militaryDetails[militaryStatus] };
  profile.veteran =
    veteranStatus === "대상"
      ? {
          veteranStatus,
          veteranNumber: "VET-DEMO-001",
          veteranRelation: "본인",
        }
      : { veteranStatus };
  let preparationCalls = 0;
  let fieldAnalysisCalls = 0;
  const preparationRequests: PreparationAnalyzeRequest[] = [];
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      preparationCalls += 1;
      preparationRequests.push(request);
      if (preparationCalls === 1)
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          preparationPlans: [
            revealPlan(
              request,
              "prsMilitarySvcYN",
              "대상",
              "military.military.militaryStatus",
              {
                expectedFieldNames: ["prsMilitarySvcStatus"],
                selectableProfileValues: [...militaryStatuses],
              },
            ),
            revealPlan(
              request,
              "prsVeteranBenefitYN",
              "대상",
              "veteran.veteran.veteranStatus",
              { selectableProfileValues: ["대상"] },
            ),
          ],
        };
      const statusAction = request.sections
        .flatMap((section) => section.actionCandidates)
        .find((candidate) => candidate.domName === "prsMilitarySvcStatus");
      const statusPlan = statusAction
        ? revealPlan(
            request,
            "prsMilitarySvcStatus",
            "",
            "military.military.militaryStatus",
            {
              selectableProfileValues: [...militaryStatuses],
              revealedFieldBindings: militaryBindings,
            },
          )
        : undefined;
      if (statusPlan)
        expect(statusPlan).not.toHaveProperty("expectedFieldNames");
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: statusPlan ? [statusPlan] : [],
      };
    },
    analyzeFields: async (request) => {
      fieldAnalysisCalls += 1;
      return fieldResponse(request);
    },
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  return {
    preparationCalls: () => preparationCalls,
    fieldAnalysisCalls: () => fieldAnalysisCalls,
    preparationRequests,
  };
}

it.each(militaryStatuses)(
  "runs the SK military radio -> status -> details chain for %s",
  async (status) => {
    const run = setup(status, "비대상");
    await waitFor(() => {
      expect(run.fieldAnalysisCalls()).toBe(2);
      expect(
        document.querySelector<HTMLSelectElement>("[name='prsMilitarySvcType']")
          ?.value,
      ).toBe(militaryDetails[status].militaryType ?? "");
    });
    expect(
      document.querySelector<HTMLInputElement>(
        "[name='prsMilitarySvcYN'][value='1']",
      )?.checked,
    ).toBe(true);
    expect(
      document.querySelector<HTMLSelectElement>("[name='prsMilitarySvcStatus']")
        ?.value,
    ).toBe(status);
    expect(document.querySelector(".military-details")).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>(
        "[name='prsMilitarySvcEtcReason']",
      )?.value,
    ).toBe("");
    expect(run.preparationCalls()).toBe(2);
    expect(
      run.preparationRequests[1]!.sections.flatMap(
        (section) => section.actionCandidates,
      ).some((candidate) => candidate.domName === "prsMilitarySvcStatus"),
    ).toBe(true);
  },
);

it("keeps military details closed for a non-target status and leaves unsupported fields empty", async () => {
  const run = setup("비대상", "비대상");
  await waitFor(() => expect(run.fieldAnalysisCalls()).toBe(1));
  expect(
    document.querySelector<HTMLInputElement>(
      "[name='prsMilitarySvcYN'][value='1']",
    )?.checked,
  ).toBe(false);
  expect(document.querySelector("[name='prsMilitarySvcStatus']")).toBeNull();
  expect(document.querySelector(".military-details")).toBeNull();
  expect(
    document.querySelector<HTMLInputElement>(
      "[name='prsMilitarySvcUnfinishReason']",
    )?.value,
  ).toBe("");
  expect(run.preparationCalls()).toBe(1);
});

it("connects veteran target to number and relation while preserving unsupported military fields", async () => {
  const run = setup("비대상", "대상");
  await waitFor(() => {
    expect(run.fieldAnalysisCalls()).toBe(1);
    expect(
      document.querySelector<HTMLInputElement>(
        "[name='prsVeteranBenefitNumber']",
      )?.value,
    ).toBe("VET-DEMO-001");
  });
  expect(
    document.querySelector<HTMLInputElement>(
      "[name='prsVeteranBenefitYN'][value='1']",
    )?.checked,
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>(
      "[name='prsVeteranBenefitRelation']",
    )?.value,
  ).toBe("본인");
  expect(document.querySelector("[name='prsMilitarySvcStatus']")).toBeNull();
  expect(
    document.querySelector<HTMLInputElement>("[name='prsMilitarySvcEtcReason']")
      ?.value,
  ).toBe("");
});
