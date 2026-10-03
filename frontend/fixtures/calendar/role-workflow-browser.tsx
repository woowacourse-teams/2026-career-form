import { createRoot } from "react-dom/client";
import { createEmptyProfile } from "../../src/profile/model";
import type { AnalysisApiClient } from "../../src/autofill/api/types";
import { validateInteractionDecisionResponse } from "../../src/autofill/api/validate-interaction-response";
import { AutofillWorkflow } from "../../src/autofill/workflow/AutofillWorkflow";

const root = document.querySelector<HTMLElement>("#workflow-root");
const name = document.querySelector<HTMLInputElement>("#fixture-name");
const date = document.querySelector<HTMLInputElement>("#fixture-date");
const peer = document.querySelector<HTMLInputElement>("#fixture-peer");
const popup = document.querySelector<HTMLElement>("#ui-datepicker-div");
const output = document.querySelector<HTMLOutputElement>("#fixture-result");
const opener = document.querySelector<HTMLImageElement>(
  ".ui-datepicker-trigger",
);

if (
  location.hostname !== "127.0.0.1" ||
  !root ||
  !name ||
  !date ||
  !peer ||
  !popup ||
  !output ||
  !opener ||
  !document.querySelector("[data-calendar-role-fixture]") ||
  document.querySelector("form, [type=submit]")
)
  throw new Error("This synthetic fixture must run on 127.0.0.1");

let year = 2025;
let month = 0;
let calls = 0;
let openings = 0;
let navigationClicks = 0;
let navigationDecision = "not-requested";
const decisionMode = new URLSearchParams(location.search).get("decision");
if (decisionMode === "live") {
  const notice = document.querySelector("#fixture-provider");
  if (notice)
    notice.textContent =
      "합성 프로필과 production workflow를 사용합니다. 필드 매핑은 테스트 대역이며 달력 역할은 localhost:8080의 실제 provider로 판단합니다.";
}
const report = () => {
  output.textContent = `ordinary=${name.value || "empty"}, date=${date.value || "empty"}, peer=${peer.value}, calls=${calls}, openings=${openings}, navigation=${navigationDecision}, navigationClicks=${navigationClicks}`;
};
const renderCalendar = () => {
  popup.innerHTML = `
    <div class="ui-datepicker-header">
      <a href="#" class="ui-datepicker-prev" data-handler="prev">Previous</a>
      <select class="ui-datepicker-year" data-handler="selectYear">
        ${[2025, 2026, 2027].map((value) => `<option value="${value}"${year === value ? " selected" : ""}>${value}</option>`).join("")}
      </select>
      <select class="ui-datepicker-month" data-handler="selectMonth">
        ${Array.from({ length: 12 }, (_, index) => `<option value="${index}"${month === index ? " selected" : ""}>${index + 1}월</option>`).join("")}
      </select>
      <a href="#" class="ui-datepicker-next" data-handler="next">Next</a>
    </div>
    <table class="ui-datepicker-calendar" style="display:none"><tbody><tr><td><a href="#">1</a></td></tr></tbody></table>
    <div class="ui-datepicker-buttonpane"><button type="button" class="ui-datepicker-close" data-handler="hide">닫기</button></div>`;
  popup.querySelectorAll("a[data-handler]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigationClicks++;
      report();
    });
  });
  popup
    .querySelector<HTMLSelectElement>(".ui-datepicker-year")
    ?.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      year = Number(event.target.value);
      renderCalendar();
    });
  popup
    .querySelector<HTMLSelectElement>(".ui-datepicker-month")
    ?.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      month = Number(event.target.value);
      renderCalendar();
    });
  popup
    .querySelector<HTMLButtonElement>(".ui-datepicker-close")
    ?.addEventListener("click", () => {
      date.value = `${year}-${String(month + 1).padStart(2, "0")}`;
      date.dispatchEvent(new Event("change", { bubbles: true }));
      popup.style.display = "none";
      popup.classList.remove("ui-monthpicker");
      report();
    });
};
opener.addEventListener("click", () => {
  openings++;
  popup.classList.add("ui-monthpicker");
  renderCalendar();
  popup.style.display = "block";
  report();
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
      .map((field) => {
        const dateField = field.domName === "startMonth";
        if (dateField || field.domName === "applicantName")
          return {
            candidateId: field.candidateId,
            matchType: "MATCH" as const,
            valueBinding: {
              type: "DIRECT" as const,
              profileFieldKey: dateField
                ? "education.university.startDate"
                : "personal.personal.koreanGivenName",
            },
            autofillPolicy: dateField
              ? ("CONDITIONAL" as const)
              : ("ALLOWED" as const),
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: {
              command: dateField
                ? ("SELECT_DATE" as const)
                : ("SET_TEXT" as const),
            },
          };
        return {
          candidateId: field.candidateId,
          matchType: "NO_MATCH" as const,
          mappingStatus: "LLM_SUGGESTED" as const,
          interactionStatus: "BLOCKED" as const,
          reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
        };
      }),
  }),
  decideInteractions: async (request) => {
    calls++;
    if (calls === 1 && decisionMode === "ownership-conflict") {
      const competingPopup = document.createElement("div");
      competingPopup.id = "synthetic-competing-popup";
      competingPopup.hidden = true;
      const competingOpener = document.createElement("button");
      competingOpener.type = "button";
      competingOpener.textContent = "Synthetic competing opener";
      competingOpener.setAttribute("aria-labelledby", date.id);
      competingOpener.setAttribute("aria-controls", competingPopup.id);
      document.body.append(competingOpener, competingPopup);
    }
    if (calls === 1 && decisionMode === "unit-conflict") {
      const label = date.labels?.[0];
      if (label) label.textContent = "Date";
    }
    report();
    if (decisionMode === "live") {
      const response = await fetch("/api/v1/generic/interaction-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Synthetic role request failed");
      const decision = validateInteractionDecisionResponse(
        request,
        await response.json(),
      );
      const navigation = decision.decisions.find(
        (entry) => entry.role === "CALENDAR_NAVIGATION",
      );
      if (navigation) navigationDecision = navigation.selection;
      report();
      return decision;
    }
    return {
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: request.decisions.map((decision) => {
        const shape = {
          CALENDAR_OPENER: "none",
          CALENDAR_YEAR_TRIGGER: "none",
          CALENDAR_YEAR_CONTROL: "year-options",
          CALENDAR_MONTH_CONTROL: "month-options",
          CALENDAR_DAY_CONTROL: "day-grid",
          CALENDAR_NAVIGATION: "next",
          CALENDAR_APPLY: "apply",
        };
        const expected = Object.entries(shape).find(
          ([role]) => role === decision.role,
        )?.[1];
        const matches = decision.candidates.filter(
          (candidate) => candidate.calendarStructure?.valueShape === expected,
        );
        const selected =
          decisionMode !== "abstain" && matches.length === 1
            ? matches[0]
            : undefined;
        if (decision.role === "CALENDAR_NAVIGATION") {
          navigationDecision = selected ? "SELECTED" : "ABSTAINED";
          report();
        }
        return {
          decisionId: decision.decisionId,
          role: decision.role,
          selection: selected ? ("SELECTED" as const) : ("ABSTAINED" as const),
          ...(selected ? { candidateId: selected.candidateId } : {}),
        };
      }),
    };
  },
};
createRoot(root).render(
  <AutofillWorkflow
    apiClient={apiClient}
    repository={{ load: async () => profile }}
    pageDocument={document}
    onExit={() => undefined}
  />,
);
