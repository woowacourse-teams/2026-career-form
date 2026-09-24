import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

it("runs only a checked calendar from the installed workflow screen", async () => {
  document.body.innerHTML = `
    <section><label>입학 연월 <input id="date-target" name="startMonth" readonly type="text"></label>
      <button type="button" aria-labelledby="date-target" aria-controls="date-popup">월 선택</button>
      <div id="date-popup" role="dialog" hidden><button type="button">2026</button>
        ${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}
      </div></section>
    <section><label>학교 <input name="schoolSearch" type="text" readonly></label><button type="button">학교 검색</button></section>`;
  const date = document.querySelector<HTMLInputElement>("#date-target")!;
  const popup = document.querySelector<HTMLElement>("#date-popup")!;
  const school = document.querySelector<HTMLInputElement>(
    "[name=schoolSearch]",
  )!;
  let schoolOpened = 0;
  document
    .querySelector<HTMLButtonElement>("[aria-controls=date-popup]")!
    .addEventListener("click", () => {
      popup.hidden = false;
    });
  document
    .querySelectorAll<HTMLButtonElement>("section:nth-of-type(2) button")
    .forEach((button) =>
      button.addEventListener("click", () => {
        schoolOpened++;
      }),
    );
  popup.querySelectorAll("button").forEach((button) => {
    if (button.textContent === "3월")
      button.addEventListener("click", () => {
        date.value = "2026-03";
        popup.hidden = true;
      });
  });
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "edu-one",
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
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  const include = await screen.findByRole("button", {
    name: /입학 연월 포함하기/,
  });
  expect(date.value).toBe("");
  expect(popup.hidden).toBe(true);
  expect(schoolOpened).toBe(0);
  fireEvent.click(include);
  fireEvent.click(screen.getByRole("button", { name: "선택한 날짜만 입력" }));
  await waitFor(() => expect(date.value).toBe("2026-03"));
  expect(popup.hidden).toBe(true);
  expect(schoolOpened).toBe(0);
  expect(school.value).toBe("");
});
