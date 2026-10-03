import { createRoot } from "react-dom/client";
import { createEmptyProfile } from "../../src/profile/model";
import type { AnalysisApiClient } from "../../src/autofill/api/types";
import { calendarRequestWithinBounds } from "../../src/autofill/api/calendar-role-contract";
import type { InteractionDecisionResponse } from "../../src/autofill/api/interaction-types";
import { validateInteractionDecisionResponse } from "../../src/autofill/api/validate-interaction-response";
import { AutofillWorkflow } from "../../src/autofill/workflow/AutofillWorkflow";
import { installUiDatepicker } from "../../src/autofill/interaction/ui-datepicker.test-fixtures";

const root = document.querySelector<HTMLElement>("#workflow-root");
const ordinary = document.querySelector<HTMLInputElement>("#fixture-name");
const date = document.querySelector<HTMLInputElement>("#fixture-date");
const peer = document.querySelector<HTMLInputElement>("#fixture-peer");
const output = document.querySelector<HTMLOutputElement>("#fixture-result");
if (
  location.hostname !== "127.0.0.1" ||
  !root ||
  !ordinary ||
  !date ||
  !peer ||
  !output ||
  !document.querySelector("[data-calendar-day-fixture]") ||
  document.querySelector("form, [type=submit]")
)
  throw new Error("This synthetic fixture must run on 127.0.0.1");

const params = new URLSearchParams(location.search);
const decisionMode = params.get("decision");
const focusMode = params.get("opener") === "focus";
const calendar = installUiDatepicker(document);
const popup = calendar.root;
calendar.attach(date, {
  yearRange: [2024, 2028],
  defaultDate: "2025-01-01",
  dateFormat: "yy-mm-dd",
  trigger: !focusMode,
});
const opener = focusMode
  ? date
  : date.parentElement!.querySelector<HTMLButtonElement>(
      ".ui-datepicker-trigger",
    )!;
if (decisionMode === "live") {
  const notice = document.querySelector("#fixture-provider");
  if (notice)
    notice.textContent =
      "합성 프로필과 production workflow를 사용합니다. 필드 매핑은 테스트 대역이며 달력 역할만 기존 localhost:8080 backend API로 판단합니다. 목표 날짜와 프로필 값은 역할 요청에 포함되지 않습니다.";
}

let calls = 0;
let openings = 0;
let navigationClicks = 0;
let navigationDecision = "not-requested";
let pendingYear = false;
let postprocessingDuringYear = false;
let signalYearPending: () => void = () => undefined;
let signalPostprocessed: () => void = () => undefined;
let postprocessing = Promise.resolve();
let providerError = "";
const report = () => {
  output.textContent = `calls=${calls}, openings=${openings}, navigation=${navigationDecision}, navigationClicks=${navigationClicks}, postprocessingDuringYear=${postprocessingDuringYear}, date=${date.value || "empty"}, ordinary=${ordinary.value || "empty"}, peer=${peer.value}, popupClosed=${!calendar.isOpen()}${providerError ? `, error=${providerError}` : ""}`;
};

// Cosmetic beforeShow work retains the exact selects and their options, but
// moves the title and alters their outerHTML while the year request is pending.
const postprocess = () => {
  const header = popup.querySelector<HTMLElement>(".ui-datepicker-header")!;
  const title = popup.querySelector<HTMLElement>(".ui-datepicker-title")!;
  popup.prepend(title);
  title.querySelector<HTMLElement>(".ui-datepicker-year")!.style.cssText =
    "position:absolute;top:5px;left:200px";
  title.querySelector<HTMLElement>(".ui-datepicker-month")!.style.cssText =
    "position:absolute;top:5px;left:120px";
  header.querySelector<HTMLElement>(".ui-datepicker-prev")!.style.cssText =
    "position:absolute;top:5px;left:50px";
  header.querySelector<HTMLElement>(".ui-datepicker-next")!.style.cssText =
    "position:absolute;top:5px;right:50px";
  for (const [direction, label] of [
    [-1, "이전 연도"],
    [1, "다음 연도"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      direction < 0 ? "fixture-prev-year" : "fixture-next-year";
    button.textContent = label;
    button.style.cssText = `position:absolute;top:35px;${direction < 0 ? "left" : "right"}:0`;
    button.addEventListener("click", () => {
      navigationClicks++;
      const select = popup.querySelector<HTMLSelectElement>(
        ".ui-datepicker-year",
      )!;
      select.value = String(
        Math.max(2024, Math.min(2028, Number(select.value) + direction)),
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
      report();
    });
    header.append(button);
  }
};
opener.addEventListener(focusMode ? "focus" : "click", () => {
  openings++;
  const yearPending = new Promise<void>((resolve) => {
    signalYearPending = resolve;
  });
  postprocessing = new Promise<void>((resolve) => {
    signalPostprocessed = resolve;
  });
  // The observed 1 ms callback is gated on the actual year call. No provider
  // latency, fixed test sleep, or production executor delay is needed.
  setTimeout(() => {
    void yearPending.then(() => {
      postprocessingDuringYear = pendingYear;
      postprocess();
      signalPostprocessed();
      report();
    });
  }, 1);
  report();
});
popup.addEventListener("click", (event) => {
  const element = event.target instanceof Element ? event.target : undefined;
  if (!element?.closest(".ui-datepicker-prev, .ui-datepicker-next")) return;
  event.preventDefault();
  navigationClicks++;
  report();
});
// The emulator closes asynchronously; report the actual root transition.
new MutationObserver(report).observe(popup, {
  attributes: true,
  attributeFilter: ["style"],
});
ordinary.addEventListener("input", report);
date.addEventListener("change", report);

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
        const dateField = field.domName === "startDate";
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
    // Only production's finite structural role contract crosses the proxy.
    if (!calendarRequestWithinBounds(request) || calls >= 4)
      throw new Error(
        "Synthetic calendar request exceeded its bounded role contract",
      );
    calls++;
    const yearRequest = request.decisions.some(
      (decision) => decision.role === "CALENDAR_YEAR_CONTROL",
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    report();
    try {
      // Start the actual transport before releasing the beforeShow gate.
      const responsePending =
        decisionMode === "live"
          ? fetch("/api/v1/generic/interaction-decisions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
              signal: AbortSignal.timeout(10_000),
            })
          : Promise.resolve(undefined);
      let gate = Promise.resolve();
      if (yearRequest) {
        pendingYear = true;
        signalYearPending();
        gate = Promise.race([
          postprocessing,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(new Error("Synthetic beforeShow gate did not complete")),
              2_000,
            );
          }),
        ]);
      }
      const [response] = await Promise.all([responsePending, gate]);
      let decision: InteractionDecisionResponse;
      if (response) {
        if (!response.ok)
          throw new Error(`Synthetic role request failed: ${response.status}`);
        decision = validateInteractionDecisionResponse(
          request,
          await response.json(),
        );
      } else {
        decision = {
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: request.decisions.map((entry) => {
            const shapes = {
              CALENDAR_OPENER: "none",
              CALENDAR_YEAR_CONTROL: "year-options",
              CALENDAR_MONTH_CONTROL: "month-options",
              CALENDAR_DAY_CONTROL: "day-grid",
              CALENDAR_NAVIGATION: "next",
            };
            const shape = Object.entries(shapes).find(
              ([role]) => role === entry.role,
            )?.[1];
            const matches = entry.candidates.filter(
              (candidate) => candidate.calendarStructure?.valueShape === shape,
            );
            const selected =
              decisionMode !== "abstain" &&
              !(
                decisionMode === "navigation-abstain" &&
                entry.role === "CALENDAR_NAVIGATION"
              ) &&
              matches.length === 1
                ? matches[0]
                : undefined;
            return {
              decisionId: entry.decisionId,
              role: entry.role,
              selection: selected
                ? ("SELECTED" as const)
                : ("ABSTAINED" as const),
              ...(selected ? { candidateId: selected.candidateId } : {}),
            };
          }),
        };
        decision = validateInteractionDecisionResponse(request, decision);
      }
      const navigation = decision.decisions.find(
        (entry) => entry.role === "CALENDAR_NAVIGATION",
      );
      if (navigation) navigationDecision = navigation.selection;
      report();
      return decision;
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error);
      report();
      throw error;
    } finally {
      pendingYear = false;
      if (timer !== undefined) clearTimeout(timer);
    }
  },
};
report();
createRoot(root).render(
  <AutofillWorkflow
    apiClient={apiClient}
    repository={{ load: async () => profile }}
    pageDocument={document}
    onExit={() => undefined}
  />,
);
