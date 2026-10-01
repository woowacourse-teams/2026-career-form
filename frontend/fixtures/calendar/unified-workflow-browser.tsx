import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createEmptyProfile } from "../../src/profile/model";
import type { AnalysisApiClient } from "../../src/autofill/api/types";
import { AutofillWorkflow } from "../../src/autofill/workflow/AutofillWorkflow";

const fixture = document.querySelector<HTMLElement>(
  "[data-cf117-synthetic-fixture]",
);
const root = document.querySelector<HTMLElement>("#workflow-root");
const name = document.querySelector<HTMLInputElement>("#synthetic-name");
const date = document.querySelector<HTMLInputElement>("#synthetic-start");
const popup = document.querySelector<HTMLElement>("#synthetic-calendar");
const months = document.querySelector<HTMLElement>("#synthetic-months");
const output = document.querySelector<HTMLOutputElement>("#fixture-result");
const opener = document.querySelector<HTMLButtonElement>(
  "[aria-controls=synthetic-calendar]",
);

if (
  location.hostname !== "127.0.0.1" ||
  !fixture ||
  !root ||
  !name ||
  !date ||
  !popup ||
  !months ||
  !output ||
  !opener ||
  document.querySelector("form, [type=submit]")
) {
  throw new Error("CF-117 fixture is allowed only on its local synthetic page");
}

const report = () => {
  output.textContent = `ordinary=${name.value || "empty"}, date=${date.value || "empty"}`;
};

for (let month = 1; month <= 12; month += 1) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${month}월`;
  if (month === 3) {
    button.addEventListener("click", () => {
      date.value = "2026-03";
      date.dispatchEvent(new Event("change", { bubbles: true }));
      popup.hidden = true;
      report();
    });
  }
  months.append(button);
}
opener.addEventListener("click", () => {
  popup.hidden = false;
});
name.addEventListener("input", report);

const profile = createEmptyProfile();
profile.personal.koreanGivenName = "합성 사용자";
profile.education = [
  {
    id: "synthetic-education",
    sectionId: "university",
    values: { startDate: "2026-03-15" },
  },
];

const apiClient: AnalysisApiClient = {
  analyzePreparation: async (request) => ({
    snapshotId: request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    preparationPlans: [],
  }),
  analyzeFields: async (request) => ({
    snapshotId: request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .map((field) =>
        field.domName === "startMonth"
          ? {
              candidateId: field.candidateId,
              matchType: "MATCH" as const,
              valueBinding: {
                type: "DIRECT" as const,
                profileFieldKey: "education.university.startDate",
              },
              autofillPolicy: "CONDITIONAL" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SELECT_DATE" as const },
            }
          : field.domName === "applicantName"
            ? {
                candidateId: field.candidateId,
                matchType: "MATCH" as const,
                valueBinding: {
                  type: "DIRECT" as const,
                  profileFieldKey: "personal.personal.koreanGivenName",
                },
                autofillPolicy: "ALLOWED" as const,
                mappingStatus: "LLM_SUGGESTED" as const,
                interactionStatus: "READY" as const,
                writePlan: { command: "SET_TEXT" as const },
              }
            : {
                candidateId: field.candidateId,
                matchType: "NO_MATCH" as const,
                mappingStatus: "LLM_SUGGESTED" as const,
                interactionStatus: "BLOCKED" as const,
                reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
              },
      ),
  }),
};

createRoot(root).render(
  <StrictMode>
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />
  </StrictMode>,
);
