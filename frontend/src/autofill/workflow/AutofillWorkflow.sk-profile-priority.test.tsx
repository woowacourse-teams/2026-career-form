import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type {
  AnalysisApiClient,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
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

function allFields(request: FieldsAnalyzeRequest): FieldCandidate[] {
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

const bindings: Record<
  string,
  {
    key: string;
    command: "CHECK_RADIO" | "SET_TEXT" | "SELECT_OPTION";
    type?: "DERIVED" | "LOOKUP";
  }
> = {
  prsVeteranBenefitYN: {
    key: "veteran.veteran.veteranStatus",
    command: "CHECK_RADIO",
    type: "DERIVED",
  },
  prsDisabledYN: {
    key: "disability.disability.disabilityStatus",
    command: "CHECK_RADIO",
    type: "DERIVED",
  },
  prsVeteranBenefitNumber: {
    key: "veteran.veteran.veteranNumber",
    command: "SET_TEXT",
  },
  prsVeteranBenefitRelation: {
    key: "veteran.veteran.veteranRelation",
    command: "SET_TEXT",
  },
  prsDisabledType: {
    key: "disability.disability.disabilityGrade",
    command: "SELECT_OPTION",
    type: "LOOKUP",
  },
  prsDisabledTypeDtl: {
    key: "disability.disability.disabilityType",
    command: "SELECT_OPTION",
  },
};

function response(
  request: FieldsAnalyzeRequest,
  overrides: Record<string, string> = {},
  mappingStatus: "ADAPTER_VERIFIED" | "LLM_SUGGESTED" = "ADAPTER_VERIFIED",
): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER" as const,
    analysisStatus: "COMPLETE" as const,
    fields: allFields(request).map((field) => {
      const binding = bindings[field.domName ?? ""];
      const key = overrides[field.domName ?? ""] ?? binding?.key;
      if (!binding || !key || field.visibility !== "visible" || field.disabled)
        return {
          candidateId: field.candidateId,
          matchType: "NO_MATCH" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "BLOCKED" as const,
          reasonCodes: ["NO_MATCH" as const],
        };
      return {
        candidateId: field.candidateId,
        matchType: "MATCH" as const,
        valueBinding:
          binding.type === "DERIVED"
            ? {
                type: "DERIVED" as const,
                recipe: "BOOLEAN_YN" as const,
                profileFieldKey: key,
                trueLabel: "대상",
                falseLabel: "비대상",
              }
            : binding.type === "LOOKUP"
              ? {
                  type: "LOOKUP" as const,
                  profileFieldKey: key,
                  optionMap: {
                    중증: "중증(기존1급~3급)",
                    경증: "경증(기존4급~6급)",
                  },
                }
              : { type: "DIRECT" as const, profileFieldKey: key },
        autofillPolicy: "ALLOWED" as const,
        mappingStatus,
        interactionStatus: "READY" as const,
        writePlan: { command: binding.command },
      };
    }),
  };
}

function setup({
  veteran = "veteran-status:eligible",
  disability = "disability-status:not-eligible",
  initialVeteran = "0",
  initialDisability = "1",
  overrides,
  host = "www.skcareers.com",
  mappingStatus = "ADAPTER_VERIFIED",
}: {
  veteran?: string;
  disability?: string;
  initialVeteran?: "0" | "1";
  initialDisability?: "0" | "1";
  overrides?: Record<string, string>;
  host?: string;
  mappingStatus?: "ADAPTER_VERIFIED" | "LLM_SUGGESTED";
} = {}) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: `https://${host}/Application/Index/synthetic` });
  document.body.innerHTML = `
    <section aria-label="보훈"><fieldset><legend>보훈</legend>
      <label><input type="radio" name="prsVeteranBenefitYN" value="0">비대상</label>
      <label><input type="radio" name="prsVeteranBenefitYN" value="1">대상</label>
    </fieldset></section>
    <section aria-label="장애"><fieldset><legend>장애</legend>
      <label><input type="radio" name="prsDisabledYN" value="0">비대상</label>
      <label><input type="radio" name="prsDisabledYN" value="1">대상</label>
    </fieldset></section>
    <input name="unrelated" value="keep" aria-label="무관 필드">
  `;
  const veteranTarget = document.querySelector<HTMLInputElement>(
    "[name=prsVeteranBenefitYN][value='1']",
  )!;
  const veteranNegative = document.querySelector<HTMLInputElement>(
    "[name=prsVeteranBenefitYN][value='0']",
  )!;
  const disabledTarget = document.querySelector<HTMLInputElement>(
    "[name=prsDisabledYN][value='1']",
  )!;
  const disabledNegative = document.querySelector<HTMLInputElement>(
    "[name=prsDisabledYN][value='0']",
  )!;
  let veteranChanges = 0;
  let disabilityChanges = 0;
  const veteranDetails = () =>
    veteranTarget
      .closest("fieldset")!
      .querySelector<HTMLDivElement>(".veteran-details");
  const disabilityDetails = () =>
    disabledTarget
      .closest("fieldset")!
      .querySelector<HTMLDivElement>(".disability-details");
  const showDetails = (details: HTMLDivElement | null) => {
    if (!details) return;
    details.hidden = false;
    details
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
      .forEach((control) => {
        control.disabled = false;
      });
  };
  const hideDetails = (details: HTMLDivElement | null) => {
    if (!details) return;
    details.hidden = true;
    details
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
      .forEach((control) => {
        control.disabled = true;
      });
  };
  const showVeteranDetails = () => {
    if (!veteranDetails())
      veteranTarget
        .closest("fieldset")!
        .insertAdjacentHTML(
          "beforeend",
          '<div class="veteran-details"><input name="prsVeteranBenefitNumber" value="existing-number" aria-label="보훈 번호"><input name="prsVeteranBenefitRelation" aria-label="보훈 관계"></div>',
        );
    showDetails(veteranDetails());
  };
  const showDisabilityDetails = () => {
    if (!disabilityDetails())
      disabledTarget
        .closest("fieldset")!
        .insertAdjacentHTML(
          "beforeend",
          '<div class="disability-details"><select name="prsDisabledType" aria-label="장애 정도"><option value=""></option><option value="306001">중증(기존1급~3급)</option><option value="306002">경증(기존4급~6급)</option></select><select name="prsDisabledTypeDtl" aria-label="장애 유형"><option value=""></option><option value="307014">지체장애</option></select></div>',
        );
    showDetails(disabilityDetails());
  };
  veteranTarget.addEventListener("change", () => {
    veteranChanges++;
    if (veteranTarget.checked) showVeteranDetails();
  });
  veteranNegative.addEventListener("change", () => {
    veteranChanges++;
    if (veteranNegative.checked) hideDetails(veteranDetails());
  });
  disabledTarget.addEventListener("change", () => {
    disabilityChanges++;
    if (disabledTarget.checked) showDisabilityDetails();
  });
  disabledNegative.addEventListener("change", () => {
    disabilityChanges++;
    if (disabledNegative.checked) hideDetails(disabilityDetails());
  });
  (initialVeteran === "1" ? veteranTarget : veteranNegative).checked = true;
  (initialDisability === "1" ? disabledTarget : disabledNegative).checked =
    true;
  if (initialVeteran === "1") veteranTarget.dispatchEvent(new Event("change"));
  if (initialDisability === "1")
    disabledTarget.dispatchEvent(new Event("change"));
  veteranChanges = 0;
  disabilityChanges = 0;

  const profile = createEmptyProfile();
  profile.veteran = {
    veteranStatus: veteran,
    veteranNumber: "VET-001",
    veteranRelation: "본인",
  };
  profile.disability = {
    disabilityStatus: disability,
    disabilityGrade: "중증",
    disabilityType: "지체장애",
  };
  const requests: FieldsAnalyzeRequest[] = [];
  const client: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      requests.push(request);
      return response(request, overrides, mappingStatus);
    },
  };
  render(
    <AutofillWorkflow
      apiClient={client}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  return {
    requests,
    veteranChanges: () => veteranChanges,
    disabilityChanges: () => disabilityChanges,
  };
}

it("prioritizes canonical SK status values through 0→1 and 1→0, then fills only reanalyzed visible details", async () => {
  const run = setup();
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(
    document.querySelector<HTMLInputElement>(
      "[name=prsVeteranBenefitYN][value='1']",
    )?.checked,
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>("[name=prsDisabledYN][value='0']")
      ?.checked,
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>("[name=prsVeteranBenefitNumber]")
      ?.value,
  ).toBe("existing-number");
  expect(
    document.querySelector<HTMLInputElement>("[name=prsVeteranBenefitRelation]")
      ?.value,
  ).toBe("본인");
  expect(
    document.querySelector<HTMLInputElement>("[name=unrelated]")?.value,
  ).toBe("keep");
  expect(run.veteranChanges()).toBe(1);
  expect(run.disabilityChanges()).toBe(1);
  expect(run.requests).toHaveLength(3);
  expect(
    allFields(run.requests.at(-1)!).map((field) => field.domName),
  ).toContain("prsVeteranBenefitRelation");
  expect(
    allFields(run.requests.at(-1)!)
      .filter((field) => field.visibility === "visible" && !field.disabled)
      .map((field) => field.domName),
  ).not.toContain("prsDisabledType");
});

it("supports legacy 대상/비대상 values and writes SK disability grade/type codes once", async () => {
  const run = setup({
    veteran: "비대상",
    disability: "대상",
    initialDisability: "0",
  });
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(
    document.querySelector<HTMLInputElement>("[name=prsDisabledYN][value='1']")
      ?.checked,
  ).toBe(true);
  expect(
    document.querySelector<HTMLSelectElement>("[name=prsDisabledType]")?.value,
  ).toBe("306001");
  expect(
    document.querySelector<HTMLSelectElement>("[name=prsDisabledTypeDtl]")
      ?.value,
  ).toBe("307014");
  expect(run.disabilityChanges()).toBe(1);
});

it.each([
  ["missing", ""],
  ["unknown", "unsupported:status"],
  ["cross-field", "disability.disability.disabilityStatus"],
] as const)(
  "preserves existing SK radio state for %s profile bindings",
  async (_case, value) => {
    const run = setup({
      initialVeteran: "0",
      overrides: { prsVeteranBenefitYN: value },
    });
    await waitFor(() =>
      expect(document.body.textContent).toContain("기입 결과"),
    );
    expect(
      document.querySelector<HTMLInputElement>(
        "[name=prsVeteranBenefitYN][value='0']",
      )?.checked,
    ).toBe(true);
    expect(run.veteranChanges()).toBe(0);
  },
);

it.each([
  ["missing", ""],
  ["unknown", "unsupported:status"],
  ["cross-field", "disability.disability.disabilityStatus"],
] as const)(
  "preserves existing SK radio state for actual %s veteran values",
  async (_case, veteran) => {
    const run = setup({ initialVeteran: "0", veteran });
    await waitFor(() =>
      expect(document.body.textContent).toContain("기입 결과"),
    );
    expect(
      document.querySelector<HTMLInputElement>(
        "[name=prsVeteranBenefitYN][value='0']",
      )?.checked,
    ).toBe(true);
    expect(run.veteranChanges()).toBe(0);
  },
);

it("does not override a generic host", async () => {
  const run = setup({ host: "example.test" });
  await waitFor(() => expect(document.body.textContent).toContain("기입 결과"));
  expect(
    document.querySelector<HTMLInputElement>(
      "[name=prsVeteranBenefitYN][value='0']",
    )?.checked,
  ).toBe(true);
  expect(run.veteranChanges()).toBe(0);
});

it("does not override an LLM-suggested SK mapping", async () => {
  const run = setup({ mappingStatus: "LLM_SUGGESTED" });
  await waitFor(() => expect(document.body.textContent).toContain("기입 결과"));
  expect(
    document.querySelector<HTMLInputElement>(
      "[name=prsVeteranBenefitYN][value='0']",
    )?.checked,
  ).toBe(true);
  expect(run.veteranChanges()).toBe(0);
});
