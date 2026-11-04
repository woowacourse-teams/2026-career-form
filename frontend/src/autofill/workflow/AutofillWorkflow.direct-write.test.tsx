import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient, GenericFieldsRequest } from "../api/types";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import { AutofillWorkflow } from "./AutofillWorkflow";

const includeNeedsReview = vi.hoisted(() => ({ on: false }));
vi.mock("../debug/developer-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../debug/developer-mode")>()),
  readIncludeNeedsReview: async () => includeNeedsReview.on,
}));

afterEach(() => {
  includeNeedsReview.on = false;
  cleanup();
  document.body.replaceChildren();
});

const FIELDS: Record<string, { key: string; confidence: number }> = {
  specialty: { key: "military.military.militarySpecialty", confidence: 0.99 },
  nationality: { key: "personal.personal.nationality", confidence: 0.6 },
  email: { key: "contact.contact.email", confidence: 0.99 },
};

function profile(): Profile {
  const value = createEmptyProfile();
  value.military = { militarySpecialty: "합성병과" };
  value.personal.nationality = "합성국적";
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

function form() {
  document.body.innerHTML = `<section><h3>지원 정보</h3>
    <label>병과<input name="specialty"></label>
    <label>이메일<input name="email" value="existing@example.test"></label>
    <label>메모<input name="memo"></label>
  </section>
  <section><input name="nationality"></section>`;
}

const input = (name: string) =>
  document.querySelector<HTMLInputElement>(`[name=${name}]`)!;

/** Runs the workflow and reports whether the review screen ever rendered. */
async function runToResult() {
  let reviewShown = false;
  const observer = new MutationObserver(() => {
    if (
      screen.queryByRole("tablist", { name: "자동 기입 확인 구분" }) ||
      screen.queryByRole("button", { name: /항목 기입하기|선택하지 않고 계속/ })
    )
      reviewShown = true;
  });
  observer.observe(document.body, { childList: true, subtree: true });
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile() }}
      apiClient={client()}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "기입 결과" }, { timeout: 5_000 });
  observer.disconnect();
  return { reviewShown };
}

describe("generic autofill without a review screen", () => {
  it("writes the planned items and goes straight to the result", async () => {
    form();
    const { reviewShown } = await runToResult();
    expect(reviewShown).toBe(false);
    expect(input("specialty").value).toBe("합성병과");
  });

  it("leaves items to check untouched and lists them with their reason", async () => {
    form();
    await runToResult();
    expect(input("nationality").value).toBe("");
    expect(input("email").value).toBe("existing@example.test");
    const pending = within(
      screen.getByRole("region", { name: "확인 필요한 항목" }),
    );
    expect(pending.getByText(/연결 확신이 보통/)).toBeInTheDocument();
    expect(
      pending.getByText(/지원서 값과 등록한 값이 달라요/),
    ).toBeInTheDocument();
  });

  it("lists a blocked field with its reason and writes nothing to it", async () => {
    form();
    await runToResult();
    expect(input("memo").value).toBe("");
    const pending = within(
      screen.getByRole("region", { name: "확인 필요한 항목" }),
    );
    expect(
      pending.getByText("저장된 정보와 연결하지 못했습니다."),
    ).toBeInTheDocument();
  });

  it("writes items to check too when the developer toggle is on", async () => {
    includeNeedsReview.on = true;
    form();
    const { reviewShown } = await runToResult();
    expect(reviewShown).toBe(false);
    expect(input("specialty").value).toBe("합성병과");
    expect(input("nationality").value).toBe("합성국적");
    expect(input("email").value).toBe("synthetic@example.test");
    expect(input("memo").value).toBe("");
  });

  it("carries the developer toggle into a field the page reveals", async () => {
    includeNeedsReview.on = true;
    document.body.innerHTML = `<section><h3>지원 정보</h3>
      <label>병과<input name="specialty"></label>
      <div id="more"></div></section>`;
    input("specialty").addEventListener("input", () => {
      document.querySelector("#more")!.innerHTML = '<input name="nationality">';
    });
    await runToResult();
    expect(input("nationality").value).toBe("합성국적");
  });
});
