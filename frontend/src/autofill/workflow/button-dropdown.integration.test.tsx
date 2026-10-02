import { render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient, FieldsAnalyzeRequest } from "../api/types";
import { mountButtonDropdowns } from "../dom/button-dropdown.fixture";
import { collectFieldsSnapshotWithDropdowns } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { resultFieldState } from "./result-field-state";

afterEach(() => {
  document.body.onmousedown = null;
  document.body.replaceChildren();
});

function clientFor(requests: FieldsAnalyzeRequest[]): AnalysisApiClient {
  return {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      requests.push(request);
      return {
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: request.sections.flatMap((section) =>
          section.fields.map((field) =>
            field.control === "select"
              ? {
                  candidateId: field.candidateId,
                  matchType: "MATCH" as const,
                  mappingStatus: "LLM_SUGGESTED" as const,
                  interactionStatus: "READY" as const,
                  autofillPolicy: "CONDITIONAL" as const,
                  valueBinding: {
                    type: "DIRECT" as const,
                    profileFieldKey: "personal.personal.koreanGivenName",
                  },
                  writePlan: { command: "SELECT_OPTION" as const },
                }
              : {
                  candidateId: field.candidateId,
                  matchType: "NO_MATCH" as const,
                  mappingStatus: "LLM_SUGGESTED" as const,
                  interactionStatus: "BLOCKED" as const,
                  reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
                },
          ),
        ),
      };
    },
  };
}

it("passes four dropdown option lists to analysis and counts actual selections in the result panel", async () => {
  const { triggers, menus } = mountButtonDropdowns();
  const requests: FieldsAnalyzeRequest[] = [];
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "해당";
  const completed = new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[aria-label="입력 완료 4개"]')) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error("Dropdown workflow did not reach the completed panel"));
    }, 3000);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });

  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={clientFor(requests)}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  await completed;
  expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible();
  expect(
    requests[0]?.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.control === "select")
      .map((field) => field.options?.map((option) => option.displayName)),
  ).toEqual(Array.from({ length: 4 }, () => ["해당", "비해당"]));
  expect(triggers.map((trigger) => trigger.textContent)).toEqual([
    "해당",
    "해당",
    "해당",
    "해당",
  ]);
  expect(menus.every((menu) => menu.hidden)).toBe(true);
  expect(screen.getByLabelText("입력 완료 4개")).toBeVisible();
  expect(document.querySelector("input")?.value).toBe("기존 합성값");
});

it("leaves an unmatched profile option unavailable without writing", async () => {
  const { triggers } = mountButtonDropdowns({ count: 1 });
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "없는 옵션";
  const response = await clientFor([]).analyzeFields(snapshot.request);

  const plan = buildReviewPlan({
    analysis: response,
    profile,
    registry: snapshot.registry,
  });

  const dropdown = plan.items.find((item) => item.analysis);
  expect(dropdown?.status).toBe("unavailable");
  expect(triggers[0]?.textContent).toBe("선택해주세요.");
});

it("does not write a dropdown without explicit candidate approval", async () => {
  const { triggers, menus } = mountButtonDropdowns({ count: 1 });
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "해당";
  const plan = buildReviewPlan({
    analysis: await clientFor([]).analyzeFields(snapshot.request),
    profile,
    registry: snapshot.registry,
  });

  const results = await executeApprovedWritesAfterPageSettles({
    items: plan.items,
    approvedCandidateIds: new Set(),
    registry: snapshot.registry,
    document,
  });

  expect(results.every((result) => result.status === "skipped")).toBe(true);
  expect(triggers[0]?.textContent).toBe("선택해주세요.");
  expect(menus.every((menu) => menu.hidden)).toBe(true);
});

it("does not report success when the option click is not reflected in the trigger value", async () => {
  mountButtonDropdowns({ count: 1, reflectSelection: false });
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "해당";
  const plan = buildReviewPlan({
    analysis: await clientFor([]).analyzeFields(snapshot.request),
    profile,
    registry: snapshot.registry,
  });
  const dropdown = plan.items.find((item) => item.analysis);
  if (!dropdown) throw new Error("Missing collected dropdown");
  dropdown.selected = true;

  const results = await executeApprovedWritesAfterPageSettles({
    items: plan.items,
    approvedCandidateIds: new Set([dropdown.candidateId]),
    registry: snapshot.registry,
    document,
  });

  expect(
    results.find((result) => result.candidateId === dropdown.candidateId),
  ).toMatchObject({
    status: "skipped",
    outcome: "needs-verification",
    code: "RETAINED_VALUE_UNCONFIRMED",
  });
  expect(
    resultFieldState(snapshot.registry, document, dropdown.candidateId)?.value,
  ).toBe("");
});

it("confirms a deferred DOM selection through its exact value update", async () => {
  const { menus } = mountButtonDropdowns({ count: 1, deferSelection: true });
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "해당";
  const plan = buildReviewPlan({
    analysis: await clientFor([]).analyzeFields(snapshot.request),
    profile,
    registry: snapshot.registry,
  });
  const dropdown = plan.items.find((item) => item.analysis);
  if (!dropdown) throw new Error("Missing collected dropdown");
  dropdown.selected = true;

  const results = await executeApprovedWritesAfterPageSettles({
    items: plan.items,
    approvedCandidateIds: new Set([dropdown.candidateId]),
    registry: snapshot.registry,
    document,
  });

  expect(
    results.find((result) => result.candidateId === dropdown.candidateId),
  ).toEqual({
    candidateId: dropdown.candidateId,
    status: "written",
    outcome: "success",
    code: "WRITTEN",
  });
  expect(menus.every((menu) => menu.hidden)).toBe(true);
});

it.each(["options", "owner", "current-value"] as const)(
  "preserves the field when %s changes after approval",
  async (change) => {
    const { triggers, menus } = mountButtonDropdowns({ count: 1 });
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "해당";
    const plan = buildReviewPlan({
      analysis: await clientFor([]).analyzeFields(snapshot.request),
      profile,
      registry: snapshot.registry,
    });
    const dropdown = plan.items.find((item) => item.analysis);
    const trigger = triggers[0];
    const menu = menus[0];
    if (!dropdown || !trigger || !menu)
      throw new Error("Missing fixture field");
    dropdown.selected = true;
    if (change === "options") {
      const option = menu.querySelector("li");
      if (option) option.textContent = "변경된 옵션";
    } else if (change === "owner") {
      menu.getBoundingClientRect = () => new DOMRect(600, 80, 200, 80);
    } else {
      const display = trigger.querySelector("span");
      if (display) display.textContent = "비해당";
    }

    const results = await executeApprovedWritesAfterPageSettles({
      items: plan.items,
      approvedCandidateIds: new Set([dropdown.candidateId]),
      registry: snapshot.registry,
      document,
    });

    expect(
      results.find((result) => result.candidateId === dropdown.candidateId)
        ?.status,
    ).toBe("skipped");
    expect(trigger.textContent).toBe(
      change === "current-value" ? "비해당" : "선택해주세요.",
    );
    expect(menu.hidden).toBe(true);
  },
);

it.each([undefined, "false"])(
  "protects an existing non-option value with placeholder marker %s",
  async (marker) => {
    const { triggers } = mountButtonDropdowns({ count: 1 });
    const display = triggers[0]?.querySelector("span");
    if (!display) throw new Error("Missing fixture display");
    display.textContent = "이미 입력된 값";
    if (marker !== undefined)
      triggers[0]?.setAttribute("data-placeholder", marker);
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "해당";

    const plan = buildReviewPlan({
      analysis: await clientFor([]).analyzeFields(snapshot.request),
      profile,
      registry: snapshot.registry,
    });

    expect(plan.items.find((item) => item.analysis)).toMatchObject({
      status: "conflict",
      currentValue: "이미 입력된 값",
      selected: false,
    });
    expect(display.textContent).toBe("이미 입력된 값");
  },
);

it("rejects a declared owner link that changes after approval even when option labels are identical", async () => {
  const { triggers, menus } = mountButtonDropdowns({ count: 1 });
  const trigger = triggers[0];
  const menu = menus[0];
  if (!trigger || !menu) throw new Error("Missing fixture field");
  menu.id = "original-menu";
  trigger.setAttribute("aria-controls", menu.id);
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "해당";
  const plan = buildReviewPlan({
    analysis: await clientFor([]).analyzeFields(snapshot.request),
    profile,
    registry: snapshot.registry,
  });
  const dropdown = plan.items.find((item) => item.analysis);
  if (!dropdown) throw new Error("Missing collected dropdown");
  dropdown.selected = true;
  menu.id = "changed-menu";
  trigger.setAttribute("aria-controls", menu.id);

  const results = await executeApprovedWritesAfterPageSettles({
    items: plan.items,
    approvedCandidateIds: new Set([dropdown.candidateId]),
    registry: snapshot.registry,
    document,
  });

  expect(
    results.find((result) => result.candidateId === dropdown.candidateId),
  ).toMatchObject({ status: "skipped", code: "STALE_TARGET" });
  expect(trigger.textContent).toBe("선택해주세요.");
  expect(menu.hidden).toBe(true);
});

it("leaves duplicate matching dropdown options unavailable", async () => {
  const { menus } = mountButtonDropdowns({ count: 1 });
  const option = document.createElement("li");
  option.setAttribute("role", "menuitem");
  option.textContent = "해당";
  menus[0]?.append(option);
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "해당";

  const plan = buildReviewPlan({
    analysis: await clientFor([]).analyzeFields(snapshot.request),
    profile,
    registry: snapshot.registry,
  });

  expect(plan.items.find((item) => item.analysis)?.status).toBe("unavailable");
});

it.each(["value", "second-menu"] as const)(
  "does not select when %s changes during approval revalidation",
  async (change) => {
    const { triggers, menus } = mountButtonDropdowns({ count: 1 });
    const trigger = triggers[0];
    const menu = menus[0];
    const display = trigger?.querySelector("span");
    if (!trigger || !menu || !display) throw new Error("Missing fixture field");
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "해당";
    const plan = buildReviewPlan({
      analysis: await clientFor([]).analyzeFields(snapshot.request),
      profile,
      registry: snapshot.registry,
    });
    const dropdown = plan.items.find((item) => item.analysis);
    if (!dropdown) throw new Error("Missing collected dropdown");
    dropdown.selected = true;
    const second = menu.cloneNode(true) as HTMLElement;
    second.hidden = true;
    menu.parentElement?.append(second);
    let changed = false;

    const results = await executeApprovedWritesAfterPageSettles({
      items: plan.items,
      approvedCandidateIds: new Set([dropdown.candidateId]),
      registry: snapshot.registry,
      document,
      beforeMutation: async () => {
        if (!menu.hidden) {
          changed = true;
          if (change === "value") display.textContent = "비해당";
          else second.hidden = false;
        }
        return true;
      },
    });

    expect(changed).toBe(true);
    expect(
      results.find((result) => result.candidateId === dropdown.candidateId)
        ?.status,
    ).toBe("skipped");
    expect(display.textContent).toBe(
      change === "value" ? "비해당" : "선택해주세요.",
    );
    expect(menu.hidden).toBe(true);
    expect(second.hidden).toBe(change === "value");
  },
);

it.each(["reopen-side-effect", "replacement-menu"] as const)(
  "preserves other fields when the approved dropdown has %s",
  async (change) => {
    const { triggers, menus } = mountButtonDropdowns({ count: 1 });
    const trigger = triggers[0];
    const menu = menus[0];
    const input = document.querySelector("input");
    if (!trigger || !menu || !input) throw new Error("Missing fixture field");
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "해당";
    const plan = buildReviewPlan({
      analysis: await clientFor([]).analyzeFields(snapshot.request),
      profile,
      registry: snapshot.registry,
    });
    const dropdown = plan.items.find((item) => item.analysis);
    if (!dropdown) throw new Error("Missing collected dropdown");
    dropdown.selected = true;
    const replacement = menu.cloneNode(true) as HTMLElement;
    replacement.getBoundingClientRect = menu.getBoundingClientRect;
    if (change === "replacement-menu") {
      menu.parentElement?.append(replacement);
      trigger.addEventListener("click", () => {
        menu.hidden = true;
        replacement.hidden = !replacement.hidden;
      });
      replacement.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("li")) {
          input.value = "WRONG_FIELD_SELECTED";
          replacement.hidden = true;
        }
      });
    } else {
      trigger.addEventListener(
        "click",
        () => {
          input.value = "WRITE_PROBE_SIDE_EFFECT";
        },
        { once: true },
      );
    }

    const results = await executeApprovedWritesAfterPageSettles({
      items: plan.items,
      approvedCandidateIds: new Set([dropdown.candidateId]),
      registry: snapshot.registry,
      document,
    });

    expect(
      results.find((result) => result.candidateId === dropdown.candidateId)
        ?.status,
    ).toBe("skipped");
    expect(trigger.textContent).toBe("선택해주세요.");
    expect(input.value).toBe("기존 합성값");
    expect(menu.hidden).toBe(true);
    expect(replacement.hidden).toBe(true);
  },
);
