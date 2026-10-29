import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient, GenericFieldsRequest } from "../api/types";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const KEYS: Record<string, string> = {
  companyName: "careers.career.companyName",
  department: "careers.career.department",
  testName: "languages.languageTest.testName",
};

const CATEGORY: Record<string, string> = { 경력: "careers", 어학: "languages" };

/**
 * One career entry row with its own save button. Saving a filled row turns it
 * into a list item, and the language area appears only after that.
 */
function rowSaveForm({ register = true } = {}) {
  document.body.innerHTML = `<section><h3>기본 정보</h3><label>메모<input name="memo"></label></section>
    <section><h3>경력</h3>
      <ul id="registered"></ul>
      <div id="careerRow">
        <label>회사명<input name="companyName"></label>
        <label>부서<input name="department"></label>
        <button type="button" id="rowSave">저장</button>
      </div></section>
    <div id="language"></div>
    <div id="bar"><button type="button" id="tempSave">임시저장</button>
      <button type="button" id="submit">제출</button></div>`;
  document.querySelector("#rowSave")!.addEventListener("click", () => {
    if (!register) return;
    document.querySelector("#careerRow")!.remove();
    document.querySelector("#registered")!.append(document.createElement("li"));
    document.querySelector("#language")!.innerHTML =
      '<section><h3>어학</h3><label>시험명<input name="testName"></label></section>';
  });
}

function profile(): Profile {
  const value = createEmptyProfile();
  value.careers = [
    {
      id: "career-1",
      sectionId: "career",
      values: { companyName: "합성회사", department: "합성부서" },
    },
  ];
  value.languages = [
    { id: "language-1", sectionId: "languageTest", values: { testName: "합성시험" } },
  ];
  return value;
}

function client(): AnalysisApiClient {
  return {
    analyzePreparation: vi.fn(),
    analyzeFields: vi.fn(),
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map(({ sectionId, title }) => ({
        sectionId,
        category: CATEGORY[title ?? ""] ?? "personal",
        confidence: 1,
      })),
    }),
    decideInteractions: async (request: InteractionDecisionRequest) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: request.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        role: decision.role,
        selection: "ABSTAINED" as const,
        candidateId: null,
      })),
    }),
    analyzeGenericFields: async (request: GenericFieldsRequest) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
      fields: request.sections.flatMap((section) =>
        section.fields.map((field) => {
          const key = KEYS[field.domName ?? ""] ?? null;
          return {
            candidateId: field.candidateId,
            profileFieldKey: key,
            confidence: 0.99,
            categoryConfirmed: true,
            autofillPolicy: "ALLOWED" as const,
            interactionStatus: key ? ("READY" as const) : ("BLOCKED" as const),
            ...(key ? { writePlan: { command: "SET_TEXT" as const } } : {}),
          };
        }),
      ),
    }),
  };
}

function clicks(selector: string): () => number {
  let count = 0;
  document
    .querySelector(selector)!
    .addEventListener("click", () => (count += 1));
  return () => count;
}

const input = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name=${name}]`);

function start() {
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile() }}
      apiClient={client()}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
}

describe("row save on the generic path", () => {
  it("saves the row it filled, then fills the field the save reveals", async () => {
    rowSaveForm();
    const rowSave = clicks("#rowSave");
    const tempSave = clicks("#tempSave");
    const submit = clicks("#submit");
    start();
    fireEvent.click(await screen.findByRole("button", { name: "2개 항목 기입하기" }));
    await screen.findByRole("heading", { name: "기입 결과" }, { timeout: 8_000 });
    expect(rowSave()).toBe(1);
    expect(tempSave()).toBe(0);
    expect(submit()).toBe(0);
    expect(document.querySelectorAll("#registered li")).toHaveLength(1);
    expect(input("testName")?.value).toBe("합성시험");
    const saved = screen.getByRole("region", { name: "확장이 저장한 줄" });
    expect(saved).toHaveTextContent("1개 줄");
  });

  it("stops and names the row when the page does not register it", async () => {
    rowSaveForm({ register: false });
    const rowSave = clicks("#rowSave");
    start();
    fireEvent.click(await screen.findByRole("button", { name: "2개 항목 기입하기" }));
    await screen.findByRole("heading", { name: "기입 결과" }, { timeout: 8_000 });
    expect(rowSave()).toBe(1);
    const manual = screen.getByRole("region", { name: "직접 저장할 줄" });
    expect(within(manual).getByText(/이후 줄 저장을 멈췄어요/)).toBeTruthy();
    expect(manual).toHaveTextContent("직장경력 1번째 줄");
  });
});
