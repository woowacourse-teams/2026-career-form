import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  militaryStatus: "military.military.militaryStatus",
  specialty: "military.military.militarySpecialty",
  nationality: "personal.personal.nationality",
};

function militaryForm() {
  document.body.innerHTML = `<section><h3>병역</h3>
    <label>병역 상태<select name="militaryStatus">
      <option value="">선택</option><option value="군필">군필</option><option value="미필">미필</option>
    </select></label>
    <div id="more"></div></section>`;
  document.querySelector("select")!.addEventListener("change", (event) => {
    if ((event.target as HTMLSelectElement).value !== "군필") return;
    document.querySelector("#more")!.innerHTML = `
      <label>병과<input name="specialty"></label>
      <label>국적<input name="nationality" value="다른국적"></label>`;
  });
}

function profile(): Profile {
  const value = createEmptyProfile();
  value.military = { militaryStatus: "군필", militarySpecialty: "합성병과" };
  value.personal.nationality = "합성국적";
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
          const key = KEYS[field.domName ?? ""] ?? null;
          return {
            candidateId: field.candidateId,
            profileFieldKey: key,
            confidence: 0.99,
            categoryConfirmed: true,
            autofillPolicy: "ALLOWED" as const,
            interactionStatus: key ? ("READY" as const) : ("BLOCKED" as const),
            ...(key
              ? {
                  writePlan: {
                    command:
                      field.control === "select"
                        ? ("SELECT_OPTION" as const)
                        : ("SET_TEXT" as const),
                  },
                }
              : {}),
          };
        }),
      ),
    }),
  };
}

function hiddenSpecialtyForm() {
  document.body.innerHTML = `<section><h3>병역</h3>
    <label>병역 상태<select name="militaryStatus">
      <option value="">선택</option><option value="군필">군필</option>
    </select></label>
    <div id="more" style="display:none"><label>병과<input name="specialty"></label></div></section>`;
  // The field exists from the start and the page only shows it after the choice.
  document.querySelector("select")!.addEventListener("change", () => {
    document.querySelector<HTMLElement>("#more")!.style.display = "";
  });
}

const noFillButton = () =>
  expect(screen.queryByRole("button", { name: /항목 기입하기/ })).toBeNull();

function savedSectionForm() {
  document.body.innerHTML = `<section><h3>병역</h3>
    <label>병역 상태<select name="militaryStatus">
      <option value="">선택</option><option value="군필">군필</option>
    </select></label>
    <div id="more"></div><button type="button" id="save">저장</button></section>`;
  // The page shows the next field only after the user saves the section.
  document.querySelector("#save")!.addEventListener("click", () => {
    document.querySelector("#more")!.innerHTML =
      '<label>병과<input name="specialty"></label>';
  });
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

describe("fields a reviewed area reveals after a write", () => {
  it("shows the stored values the area may reveal in the first review", async () => {
    militaryForm();
    start();
    const group = await screen.findByRole("group", {
      name: /나타날 수 있는 칸/,
    });
    expect(group).toHaveTextContent("병과");
    expect(group).toHaveTextContent("합성병과");
    // A category the page has no field for yet is offered too.
    expect(group).toHaveTextContent("합성국적");
    expect(
      screen.getByRole("checkbox", { name: /다시 묻지 않고 기입/ }),
    ).toBeChecked();
  });

  it("writes an approved revealed field at once and only lists the rest", async () => {
    militaryForm();
    start();
    fireEvent.click(await screen.findByRole("button", { name: "1개 항목 기입하기" }));
    await screen.findByRole("heading", { name: "기입 결과" });
    expect(input("specialty")?.value).toBe("합성병과");
    // A revealed field that already holds a value is never overwritten and
    // never asked again.
    expect(input("nationality")?.value).toBe("다른국적");
    noFillButton();
    const shown = screen.getByRole("region", {
      name: "다시 묻지 않고 기입한 새 칸",
    });
    expect(shown).toHaveTextContent("병과");
    expect(shown).not.toHaveTextContent("국적");
    const manual = screen.getByRole("region", { name: "직접 확인할 새 칸" });
    expect(manual).toHaveTextContent("국적");
    expect(manual).not.toHaveTextContent("병과");
  });

  it("writes no revealed field and asks nothing again when the approval is off", async () => {
    militaryForm();
    start();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /다시 묻지 않고 기입/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));
    await screen.findByRole("heading", { name: "기입 결과" });
    noFillButton();
    expect(input("specialty")?.value).toBe("");
    expect(input("nationality")?.value).toBe("다른국적");
    const manual = screen.getByRole("region", { name: "직접 확인할 새 칸" });
    expect(manual).toHaveTextContent("병과");
    expect(manual).toHaveTextContent("국적");
  });

  it("writes a field the first review held hidden once the page shows it", async () => {
    hiddenSpecialtyForm();
    start();
    const group = await screen.findByRole("group", {
      name: /나타날 수 있는 칸/,
    });
    expect(group).toHaveTextContent("합성병과");
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));
    await screen.findByRole("heading", { name: "기입 결과" });
    expect(input("specialty")?.value).toBe("합성병과");
    noFillButton();
  });

  it("writes an approved field the page reveals after the user saves", async () => {
    savedSectionForm();
    let saveClicks = 0;
    document
      .querySelector("#save")!
      .addEventListener("click", () => (saveClicks += 1));
    start();
    fireEvent.click(await screen.findByRole("button", { name: "1개 항목 기입하기" }));
    await screen.findByRole("heading", { name: "기입 결과" });
    expect(input("specialty")).toBeNull();
    fireEvent.click(document.querySelector("#save")!);
    await waitFor(() => expect(input("specialty")?.value).toBe("합성병과"), {
      timeout: 5_000,
    });
    expect(saveClicks).toBe(1);
  });
});
