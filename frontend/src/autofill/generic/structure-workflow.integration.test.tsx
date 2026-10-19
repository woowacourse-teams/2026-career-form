import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { AnalysisApiClient, GenericFieldsRequest } from "../api/types";
import type { InteractionDecisionRequest } from "../api/interaction-types";
import { AutofillWorkflow } from "../workflow/AutofillWorkflow";
import { collectFieldsSnapshotWithDropdowns } from "../dom/collect";
import * as mixed from "../dom/mixed-section-rows";
import * as preparation from "../workflow/mixed-section-preparation";
import type { ReviewPlanItem } from "../review/review-plan";
import { genericReasonText } from "./grade-reason-text";

const observed = vi.hoisted(() => ({
  review: undefined as undefined | ((items: readonly ReviewPlanItem[]) => void),
  result: undefined as undefined | (() => void),
}));
vi.mock("../workflow/WorkflowScreens", async (original) => {
  const module = await original<typeof import("../workflow/WorkflowScreens")>();
  return {
    ...module,
    WorkflowScreens(props: Parameters<typeof module.WorkflowScreens>[0]) {
      if (props.stage === "review") observed.review?.(props.reviewItems);
      if (props.stage === "result") observed.result?.();
      return <module.WorkflowScreens {...props} />;
    },
  };
});

afterEach(() => {
  cleanup();
  observed.review = undefined;
  observed.result = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function educationForm() {
  document.body.innerHTML = `<section><h3>학력</h3><div id="rows">${[0, 1]
    .map(
      (i) => `<div ismultirow="true">
      <select name="kind${i}"><option value="">구분</option>
        <option value="B">대학(학사)</option><option value="M">대학원(석사)</option>
      </select>
      <label>전공<input name="major${i}"></label>
      <label>학교명<input name="school${i}"></label>
    </div>`,
    )
    .join("")}</div><button type="button">학력 추가</button></section>`;
}

function profile(): Profile {
  return {
    ...createEmptyProfile(),
    education: [
      {
        id: "bachelor",
        sectionId: "university",
        values: { degreeLevel: "학사", majorName: "합성학사전공" },
      },
      {
        id: "master",
        sectionId: "graduateSchool",
        values: { degreeLevel: "석사", majorName: "합성석사전공" },
      },
    ],
  };
}

function client(options: { wrongMaster?: boolean; abstain?: boolean } = {}) {
  const analyzePreparation = vi.fn<AnalysisApiClient["analyzePreparation"]>();
  const api: AnalysisApiClient = {
    analyzePreparation,
    analyzeFields: vi.fn(),
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map(({ sectionId }) => ({
        sectionId,
        category: "education",
        confidence: 1,
      })),
    }),
    decideInteractions: async (request: InteractionDecisionRequest) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: request.decisions.map((decision) => {
        const text =
          decision.targetKind === "BACHELOR"
            ? "대학(학사)"
            : decision.targetKind === "MASTER"
              ? "대학원(석사)"
              : "";
        const candidate = options.abstain
          ? undefined
          : decision.candidates.find((item) =>
              item.semanticContext?.labels?.some(
                (label) => label.text === text,
              ),
            );
        return {
          decisionId: decision.decisionId,
          role: decision.role,
          selection: candidate ? "SELECTED" : "ABSTAINED",
          candidateId: candidate?.candidateId ?? null,
        };
      }),
    }),
    analyzeGenericFields: async (request: GenericFieldsRequest) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
      fields: request.sections.flatMap((section) =>
        section.fields.map((field) => {
          const element = field.domName
            ? document.getElementsByName(field.domName)[0]
            : undefined;
          const kind = element
            ?.closest("[ismultirow]")
            ?.querySelector("select")?.value;
          const stage =
            kind === "M" && !options.wrongMaster
              ? "graduateSchool"
              : "university";
          const key = field.domName?.startsWith("major")
            ? `education.${stage}.majorName`
            : null;
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
  return { api, analyzePreparation };
}

async function review(api: AnalysisApiClient) {
  let resolve!: (items: readonly ReviewPlanItem[]) => void;
  const ready = new Promise<readonly ReviewPlanItem[]>((done) => {
    resolve = done;
  });
  observed.review = resolve;
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile() }}
      apiClient={api}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  return ready;
}

const majors = (items: readonly ReviewPlanItem[]) =>
  items.filter((item) => item.profileFieldKey?.endsWith(".majorName"));

describe("structure loop through the entire workflow", () => {
  it("never enters legacy mixed-row detection or assignment through approved writes", async () => {
    educationForm();
    const detection = vi.spyOn(mixed, "detectMixedSectionGroup");
    const assignment = vi.spyOn(mixed, "assignMixedRows");
    const mixedPreparation = vi.spyOn(preparation, "prepareMixedSectionRows");
    const api = client();
    const items = await review(api.api);

    expect(detection).not.toHaveBeenCalled();
    expect(assignment).not.toHaveBeenCalled();
    expect(mixedPreparation).not.toHaveBeenCalled();
    expect(api.analyzePreparation).not.toHaveBeenCalled();
    expect(
      majors(items).map((item) => [
        item.profileFieldKey,
        item.profileEntryId,
        item.itemIndex,
        item.profileValue,
      ]),
    ).toEqual([
      ["education.university.majorName", "bachelor", 0, "합성학사전공"],
      ["education.graduateSchool.majorName", "master", 0, "합성석사전공"],
    ]);
    expect(majors(items).every((item) => !item.disabled)).toBe(true);
    expect(majors(items).map((item) => item.genericGrade)).toEqual([
      "AUTO",
      "AUTO",
    ]);
    const done = new Promise<void>((resolve) => {
      observed.result = resolve;
    });
    fireEvent.click(screen.getByRole("button", { name: "2개 항목 기입하기" }));
    await done;
    expect(
      document.querySelector<HTMLInputElement>("[name=major0]")?.value,
    ).toBe("합성학사전공");
    expect(
      document.querySelector<HTMLInputElement>("[name=major1]")?.value,
    ).toBe("합성석사전공");
    expect(detection).not.toHaveBeenCalled();
    expect(assignment).not.toHaveBeenCalled();
    expect(mixedPreparation).not.toHaveBeenCalled();
  });

  it("keeps a stage-mismatch row disabled through final review", async () => {
    educationForm();
    const items = await review(client({ wrongMaster: true }).api);
    const blocked = items.filter((item) =>
      item.reason?.includes("STAGE_KEY_MISMATCH"),
    );
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((item) => item.disabled && !item.selected)).toBe(true);
    expect(
      blocked.every(
        (item) =>
          item.genericGrade === "BLOCKED" &&
          item.genericReasonCode === "STRUCTURE_BLOCKED",
      ),
    ).toBe(true);
    expect(
      majors(items).find((item) => item.profileEntryId === "bachelor")
        ?.disabled,
    ).not.toBe(true);
    const reviewTab = screen.getByRole("tab", { name: /입력 불가/ });
    fireEvent.click(reviewTab);
    const panel = document.getElementById(
      reviewTab.getAttribute("aria-controls")!,
    )!;
    expect(panel).toHaveAttribute("role", "tabpanel");
    const badges = panel.querySelectorAll('[data-generic-grade="BLOCKED"]');
    expect(badges.length).toBeGreaterThanOrEqual(blocked.length);
    expect(
      within(panel).getAllByText(genericReasonText("STRUCTURE_BLOCKED")).length,
    ).toBeGreaterThanOrEqual(blocked.length);
    for (const badge of badges) {
      expect(badge).toBeVisible();
      expect(
        within(badge.closest("article")!).queryByRole("button", {
          name: /포함하기/,
        }),
      ).toBeNull();
    }
    const done = new Promise<void>((resolve) => {
      observed.result = resolve;
    });
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));
    await done;
    expect(
      document.querySelector<HTMLInputElement>("[name=major0]")?.value,
    ).toBe("합성학사전공");
    expect(
      document.querySelector<HTMLInputElement>("[name=major1]")?.value,
    ).toBe("");
  });

  it("never makes an undecided kind row writable through final review", async () => {
    educationForm();
    const items = await review(client({ abstain: true }).api);
    const blocked = items.filter((item) =>
      item.reason?.includes("ROW_KIND_OPTION_UNDECIDED"),
    );
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((item) => item.disabled && !item.selected)).toBe(true);
    expect(
      blocked.every(
        (item) =>
          item.genericGrade === "BLOCKED" &&
          item.genericReasonCode === "STRUCTURE_BLOCKED",
      ),
    ).toBe(true);
    expect(items.some((item) => item.selected && !item.disabled)).toBe(false);
  });

  it("preserves default collection bytes when the injection is omitted", async () => {
    educationForm();
    const normalize = (value: unknown) =>
      JSON.stringify(value, (key, item) =>
        key === "snapshotId" ? "snapshot" : item,
      );
    const before = await collectFieldsSnapshotWithDropdowns(document);
    const after = await collectFieldsSnapshotWithDropdowns(document, undefined);
    expect(normalize(after.request)).toBe(normalize(before.request));
    const handles = after.request.sections.flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ]);
    expect(
      handles.some(({ candidateId }) => {
        const found = after.registry.lookupField(candidateId);
        return "handle" in found && !!found.handle.mixedSectionRow;
      }),
    ).toBe(true);
  });
});
