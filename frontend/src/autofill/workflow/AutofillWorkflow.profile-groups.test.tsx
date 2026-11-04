import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient, GenericFieldsRequest } from "../api/types";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const FIELDS: Record<string, { key: string; confidence: number }> = {
  specialty: { key: "military.military.militarySpecialty", confidence: 0.99 },
  email: { key: "contact.contact.email", confidence: 0.99 },
};

function profile(): Profile {
  const value = createEmptyProfile();
  value.military = { militarySpecialty: "합성병과" };
  value.contact.email = "synthetic@example.test";
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
      sections: request.sections.map(({ sectionId }) => ({
        sectionId,
        category: "military",
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
          const known = FIELDS[field.domName ?? ""];
          return {
            candidateId: field.candidateId,
            profileFieldKey: known?.key ?? null,
            confidence: known?.confidence ?? 0.99,
            categoryConfirmed: true,
            autofillPolicy: "ALLOWED" as const,
            interactionStatus: known
              ? ("READY" as const)
              : ("BLOCKED" as const),
            ...(known ? { writePlan: { command: "SET_TEXT" as const } } : {}),
          };
        }),
      ),
    }),
  };
}

const SHAPES = {
  "label-wrapped inputs": `<section><h3>지원 정보</h3>
    <label>병과<input name="specialty"></label>
    <label>메모<input name="memo"></label>
    <label>비고<input name="note"></label>
    <label>이메일<input name="email" value="existing@example.test"></label></section>`,
  "table rows with th and td": `<table><tbody>
    <tr><th>병과</th><td><input name="specialty"></td></tr>
    <tr><th>메모</th><td><input name="memo"></td></tr>
    <tr><th>비고</th><td><input name="note"></td></tr>
    <tr><th>이메일</th><td><input name="email" value="existing@example.test"></td></tr></tbody></table>`,
};

const OVERLAY = "[data-career-form-unfilled-highlight]";

describe.each(Object.entries(SHAPES))("generic page with %s", (_name, html) => {
  it("lists unlinked blocked fields in the gray group and marks only pending ones", async () => {
    document.body.innerHTML = html;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.tagName === "INPUT"
          ? new DOMRect(40, 100, 300, 30)
          : new DOMRect(0, 0, 0, 0);
      },
    );
    render(
      <AutofillWorkflow
        repository={{ load: async () => profile() }}
        apiClient={client()}
        pageDocument={document}
        onExit={() => undefined}
      />,
    );
    await screen.findByRole(
      "heading",
      { name: "기입 결과" },
      { timeout: 5_000 },
    );
    // Only email (differs from the page) is pending; memo and note have no
    // saved value.
    expect(screen.getByLabelText("확인 필요 1개")).toBeVisible();
    const details = [...document.querySelectorAll("details")].filter(
      (node) => node.querySelector("summary")?.textContent?.includes("프로필"),
    );
    expect(details).toHaveLength(1);
    expect(details[0].open).toBe(false);
    expect(details[0].querySelector("summary strong")).toHaveTextContent("2");
    expect(
      [...details[0].querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["메모", "비고"]);
    await waitFor(() =>
      expect(document.querySelectorAll(OVERLAY)).toHaveLength(1),
    );
    expect(
      document.querySelector<HTMLInputElement>("[name=specialty]")!.value,
    ).toBe("합성병과");
  });
});
