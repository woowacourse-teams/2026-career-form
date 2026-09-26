import { executeApprovedWrites } from "../../write/executor";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import { buildReviewPlan } from "../../review/review-plan";
import { createEmptyProfile } from "../../../profile/model";
import type { FieldsAnalyzeResponse } from "../../api/types";
import { afterEach, expect, it, vi } from "vitest";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { greetingApproved, greetingWriteAdapter } from "./write";
import { greetingWorkflowAdapter } from "./workflow";

const rowName = "educationalBackground.universities.0";
afterEach(() => document.body.replaceChildren());
function fixture(score = "", scale = "선택") {
  document.body.innerHTML = `<input name="${rowName}.gpa.score" value="${score}"><button type="button" name="${rowName}.gpa.scoreScale" aria-controls="scales" aria-expanded="false">${scale}</button><div id="scales" role="listbox" hidden><button type="button" role="option">4.5</button></div>`;
  const input = document.querySelector("input")!;
  const button = document.querySelector("button")!;
  const popup = document.getElementById("scales")!;
  const option = popup.querySelector("button")!;
  button.onclick = () => {
    popup.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };
  option.onclick = () => {
    button.textContent = "4.5";
    button.setAttribute("aria-expanded", "false");
  };
  function entry(kind: "score" | "scoreScale") {
    const element = kind === "score" ? input : button;
    const handle = {
      kind: "field",
      candidateId: kind,
      sectionId: "s",
      signature: "test",
      candidate: {
        candidateId: kind,
        domName: element.name,
        control: kind === "score" ? "text" : "button",
      },
      elements: kind === "score" ? [input] : [],
      customElements: kind === "score" ? [] : [button],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: kind,
      currentValue: "",
      profileValue: kind === "score" ? "4.20" : "4.5",
      selected: true,
      disabled: false,
      greetingGpaApproval: { rowName, score: "4.20", scale: "4.5" },
      analysis: {
        candidateId: kind,
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: {
          command: kind === "score" ? "SET_TEXT" : "SELECT_BUTTON_OPTION",
        },
      },
    } as unknown as ReviewPlanItem;
    return { handle, item };
  }
  return {
    input,
    button,
    option,
    score: entry("score"),
    scale: entry("scoreScale"),
  };
}
it.each(["4.0", "선택"])(
  "does not write a GPA score until the expected scale is confirmed: %s",
  (scale) => {
    const { score } = fixture("", scale);
    expect(greetingWriteAdapter.tryWrite(score.handle, score.item)).toEqual({
      handled: true,
      written: false,
    });
  },
);
it("preserves the scale when an existing score belongs to another GPA pair", async () => {
  const { scale, button } = fixture("3.80");
  const click = vi.spyOn(button, "click");
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      scale.handle,
      scale.item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(click).not.toHaveBeenCalled();
});
it("allows a complete compatible pair and reads the live scale again", () => {
  const { score, scale, button } = fixture("4.2", "4.5");
  expect(greetingApproved(scale.handle, scale.item)).toBe(true);
  expect(greetingWriteAdapter.tryWrite(score.handle, score.item)).toEqual({
    handled: false,
  });
  button.textContent = "4.0";
  expect(greetingWriteAdapter.tryWrite(score.handle, score.item)).toEqual({
    handled: true,
    written: false,
  });
});
it("fails closed when the companion control is missing or duplicated", () => {
  const { score, button } = fixture("", "4.5");
  button.after(button.cloneNode(true));
  expect(greetingApproved(score.handle, score.item)).toBe(false);
  document.querySelectorAll("button").forEach((node) => node.remove());
  expect(greetingApproved(score.handle, score.item)).toBe(false);
});

it.each(["score", "scale"])(
  "blocks both GPA fields when the profile only supplies %s",
  (provided) => {
    const { registry, analysis, profile } = reviewFixture();
    delete profile.education[0].values[
      provided === "score" ? "gpaScale" : "gpaScore"
    ];
    const review = buildReviewPlan({ registry, analysis, profile });
    expect(review.items).toHaveLength(2);
    expect(review.items.every((item) => item.disabled && !item.selected)).toBe(
      true,
    );
  },
);
it("binds the score and lookup scale to the same reviewed profile entry", () => {
  const { registry, analysis, profile } = reviewFixture();
  const review = buildReviewPlan({ registry, analysis, profile });
  expect(review.items.map((item) => item.greetingGpaApproval)).toEqual([
    { rowName, score: "4.20", scale: "4.5" },
    { rowName, score: "4.20", scale: "4.5" },
  ]);
});
function reviewFixture() {
  const { score, scale } = fixture();
  const registry = new CandidateRegistry();
  for (const { handle } of [score, scale]) {
    handle.itemIndex = 0;
    handle.itemId = "row0";
    handle.itemGroupId = "educationuniversity";
    handle.signature = createStructuralSignature([
      ...handle.elements,
      ...(handle.customElements ?? []),
    ]);
    registry.registerField(handle);
  }
  registry.setFieldItemCount("s", 1, "educationuniversity");
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "u1",
      sectionId: "university",
      values: { gpaScore: "4.20", gpaScale: "4.50" },
    },
  ];
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: "s",
    mode: "ADAPTER",
    executionAdapterId: "greeting-v1",
    analysisStatus: "COMPLETE",
    fields: [
      {
        ...score.item.analysis!,
        matchType: "MATCH",
        autofillPolicy: "ALLOWED",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "education.university.gpaScore",
        },
      },
      {
        ...scale.item.analysis!,
        matchType: "MATCH",
        autofillPolicy: "ALLOWED",
        valueBinding: {
          type: "LOOKUP",
          profileFieldKey: "education.university.gpaScale",
          optionMap: { "4.50": "4.5" },
        },
      },
    ],
  };
  return { registry, profile, analysis };
}
it("rechecks the existing score after opening the asynchronous scale menu", async () => {
  const { scale, input, button, option } = fixture();
  button.addEventListener("click", () => {
    input.value = "3.80";
  });
  const click = vi.spyOn(option, "click");
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      scale.handle,
      scale.item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(click).not.toHaveBeenCalled();
  expect(button.textContent).toBe("선택");
});
it("does not report scale success when the score changes during selection", async () => {
  const { scale, input, option } = fixture();
  option.addEventListener("click", () => {
    input.value = "3.80";
  });
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      scale.handle,
      scale.item,
      new AbortController().signal,
    ),
  ).toBe(false);
});
it("does not borrow a different education row's matching scale", () => {
  const { score, button } = fixture("", "4.0");
  const other = button.cloneNode(true) as HTMLButtonElement;
  other.name = "educationalBackground.graduateSchools.0.gpa.scoreScale";
  other.textContent = "4.5";
  button.after(other);
  expect(greetingApproved(score.handle, score.item)).toBe(false);
});

it("keeps the native score blank when review skips a conflicting existing scale", () => {
  const { registry, analysis, profile } = reviewFixture();
  document.querySelector("button")!.textContent = "4.0";
  const review = buildReviewPlan({ registry, analysis, profile });
  executeApprovedWrites({
    items: review.items,
    registry,
    approvedCandidateIds: new Set(
      review.items
        .filter((item) => item.selected)
        .map((item) => item.candidateId),
    ),
    executionAdapterId: "greeting-v1",
  });
  expect(document.querySelector("input")!.value).toBe("");
  expect(document.querySelector("button")!.textContent).toBe("4.0");
});
it("writes the native score only after the scale driver confirms the matching scale", async () => {
  const { registry, analysis, profile } = reviewFixture();
  const review = buildReviewPlan({ registry, analysis, profile });
  const scale = review.items.find((item) => item.candidateId === "scoreScale")!;
  const lookup = registry.lookupField(scale.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture must be ready");
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      lookup.handle,
      scale,
      new AbortController().signal,
    ),
  ).toBe(true);
  executeApprovedWrites({
    items: review.items,
    registry,
    approvedCandidateIds: new Set(review.items.map((item) => item.candidateId)),
    executionAdapterId: "greeting-v1",
  });
  expect(document.querySelector("input")!.value).toBe("4.20");
  expect(document.querySelector("button")!.textContent).toBe("4.5");
});

it("writes a score when the selected scale retains data-placeholder=false", () => {
  const { registry, analysis, profile } = reviewFixture();
  const button = document.querySelector("button")!;
  button.textContent = "4.5";
  button.setAttribute("data-placeholder", "false");
  const review = buildReviewPlan({ registry, analysis, profile });
  const results = executeApprovedWrites({
    items: review.items,
    registry,
    approvedCandidateIds: new Set(review.items.map((item) => item.candidateId)),
    executionAdapterId: "greeting-v1",
  });
  expect(results.find((result) => result.candidateId === "score")?.status).toBe(
    "written",
  );
  expect(document.querySelector("input")!.value).toBe("4.20");
});
it.each(["", "true"])(
  "does not treat placeholder scale text as selected: %s",
  (placeholder) => {
    const { score, button } = fixture("", "4.5");
    button.setAttribute("data-placeholder", placeholder);
    expect(greetingApproved(score.handle, score.item)).toBe(false);
  },
);

it("selects an initial placeholder-shown GPA scale and then writes its paired score", async () => {
  const { registry, analysis, profile } = reviewFixture();
  const button = document.querySelector("button")!;
  button.textContent = "만점기준";
  button.setAttribute("data-placeholder-shown", "");
  document.querySelector('[role="option"]')!.addEventListener("click", () => {
    button.setAttribute("data-placeholder-shown", "false");
  });
  const review = buildReviewPlan({ registry, analysis, profile });
  const scale = review.items.find((item) => item.candidateId === "scoreScale")!;
  expect(scale.selected).toBe(true);
  const lookup = registry.lookupField(scale.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture must be ready");
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      lookup.handle,
      scale,
      new AbortController().signal,
    ),
  ).toBe(true);
  const results = executeApprovedWrites({
    items: review.items,
    registry,
    approvedCandidateIds: new Set(review.items.map((item) => item.candidateId)),
    executionAdapterId: "greeting-v1",
  });
  expect(results.find((result) => result.candidateId === "score")?.status).toBe(
    "written",
  );
  expect(document.querySelector("input")!.value).toBe("4.20");
});
