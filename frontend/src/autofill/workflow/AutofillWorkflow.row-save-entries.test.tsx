import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  certName: "certifications.certificate.name",
  certIssuer: "certifications.certificate.issuer",
};

const CATEGORY: Record<string, string> = { 자격증: "certifications" };

/**
 * One certificate entry box with its own save button and no add button.
 * Saving registers the entry as a list item and empties the same inputs.
 */
function singleBoxForm() {
  document.body.innerHTML = `<section><h3>기본 정보</h3><label>메모<input name="memo"></label></section>
    <section><h3>자격증</h3>
      <ul id="registered"></ul>
      <label>자격증명<input name="certName"></label>
      <label>발급기관<input name="certIssuer"></label>
      <button type="button" id="rowSave">저장</button>
    </section>`;
  document.querySelector("#rowSave")!.addEventListener("click", () => {
    const name = document.querySelector<HTMLInputElement>("[name=certName]")!;
    const issuer =
      document.querySelector<HTMLInputElement>("[name=certIssuer]")!;
    const item = document.createElement("li");
    item.textContent = name.value;
    document.querySelector("#registered")!.append(item);
    name.value = "";
    issuer.value = "";
  });
}

function profile(): Profile {
  const value = createEmptyProfile();
  value.certifications = [0, 1, 2].map((index) => ({
    id: `certificate-${index}`,
    sectionId: "certificate",
    values: { name: `합성자격${index}`, issuer: `합성기관${index}` },
  }));
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

describe("row save of a single entry box", () => {
  it(
    "saves the next stored entries into the same emptied box",
    { timeout: 40_000 },
    async () => {
      singleBoxForm();
      const rowSave = clicks("#rowSave");
      start();
      fireEvent.click(
        await screen.findByRole("button", { name: /항목 기입하기/ }),
      );
      await screen.findByRole(
        "heading",
        { name: "기입 결과" },
        { timeout: 30_000 },
      );
      expect(rowSave()).toBe(3);
      expect(
        [...document.querySelectorAll("#registered li")].map(
          (item) => item.textContent,
        ),
      ).toEqual(["합성자격0", "합성자격1", "합성자격2"]);
      expect(input("certName")?.value).toBe("");
      expect(input("certIssuer")?.value).toBe("");
      const saved = screen.getByRole("region", { name: "확장이 저장한 줄" });
      expect(saved).toHaveTextContent("3개 줄");
    },
  );

  it(
    "saves only the first entry when pre-approval is off",
    { timeout: 40_000 },
    async () => {
      singleBoxForm();
      const rowSave = clicks("#rowSave");
      start();
      fireEvent.click(
        await screen.findByRole("checkbox", { name: /다시 묻지 않고 기입/ }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: /항목 기입하기/ }),
      );
      await screen.findByRole(
        "heading",
        { name: "기입 결과" },
        { timeout: 30_000 },
      );
      expect(rowSave()).toBe(1);
      expect(document.querySelectorAll("#registered li")).toHaveLength(1);
    },
  );
});
