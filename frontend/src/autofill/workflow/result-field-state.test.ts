import { buildResultModel } from "./result-model";
import type { ReviewPlanItem } from "../review/review-plan";
import { afterEach, expect, it } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { resultFieldState } from "./result-field-state";
import { createFieldPresentation } from "../write/field-presentation";
import { buildReviewPlan } from "../review/review-plan";
import { createEmptyProfile } from "../../profile/model";

let clear: (() => void) | undefined;
afterEach(() => {
  clear?.();
  document.body.replaceChildren();
});

function customField(markup: string, radio = false) {
  document.body.innerHTML = markup;
  const element = document.body.firstElementChild as HTMLElement;
  element.getBoundingClientRect = () => new DOMRect(20, 20, 160, 40);
  const options = [...element.querySelectorAll<HTMLElement>('[role="radio"]')];
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field",
    sectionId: "section",
    candidate: {
      candidateId: "field",
      element: "custom",
      control: radio ? "radio" : "button",
      displayName: "상태",
      visibility: "visible",
      ...(radio
        ? {
            options: options.map((option, i) => ({
              optionId: String(i),
              displayName: option.textContent!,
            })),
          }
        : {}),
    },
    elements: [],
    customElements: [element],
    optionElements: new Map(options.map((option, i) => [String(i), option])),
    signature: createStructuralSignature([element]),
  });
  return { registry, element };
}

it("reads the live selected label of a custom radio group", () => {
  const { registry, element } = customField(
    '<div role="radiogroup"><button role="radio" aria-checked="false">비대상</button><button role="radio" aria-checked="true">대상</button></div>',
    true,
  );
  expect(resultFieldState(registry, document, "field")).toMatchObject({
    visible: true,
    value: "대상",
  });
  element.children[0].setAttribute("aria-checked", "true");
  element.children[1].setAttribute("aria-checked", "false");
  expect(resultFieldState(registry, document, "field")?.value).toBe("비대상");
});

it.each(["1990.01.02", "졸업"])(
  "reads custom trigger value %s and presents its field and section",
  (value) => {
    const { registry, element } = customField(
      `<button type="button">${value}</button>`,
    );
    expect(resultFieldState(registry, document, "field")).toMatchObject({
      visible: true,
      value,
    });
    const presentation = createFieldPresentation(document);
    clear = presentation.clear;
    expect(presentation.show(registry, "field")).toBe(true);
    expect(element.style.outline).not.toBe("");
    expect(presentation.showSection(registry, ["field"])).toBe(true);
    expect(
      document.querySelector("[data-career-form-section-highlight]"),
    ).not.toBeNull();
  },
);

it.each(['<button data-placeholder="">선택</button>', "<button>선택</button>"])(
  "does not treat a trigger placeholder as an existing value",
  (markup) => {
    const { registry } = customField(markup);
    expect(resultFieldState(registry, document, "field")?.value).toBe("");
  },
);

it("protects the existing custom control value in the review plan", () => {
  const { registry } = customField("<button>site@example.test</button>");
  const profile = createEmptyProfile();
  profile.contact.email = "saved@example.test";
  const plan = buildReviewPlan({
    registry,
    profile,
    analysis: {
      snapshotId: "snapshot",
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field",
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "contact.contact.email",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    },
  });
  expect(plan.items[0]).toMatchObject({
    currentValue: "site@example.test",
    status: "conflict",
    selected: false,
  });
});

it.each(["written", "unchanged", "failed"] as const)(
  "classifies %s custom controls using their live value without hiding a failed write",
  (outcome) => {
    const { registry } = customField("<button>졸업</button>");
    const item: ReviewPlanItem = {
      candidateId: "field",
      fieldLabel: "졸업 상태",
      currentValue: "",
      profileValue: "졸업",
      previewValue: "졸업",
      status: "available",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "",
    };
    const result = buildResultModel({
      reviewItems: [item],
      results:
        outcome === "unchanged"
          ? []
          : [
              {
                candidateId: "field",
                status: outcome === "written" ? "written" : "skipped",
                reason: "selection unconfirmed",
                ...(outcome === "failed"
                  ? { failureCode: "SEARCH_UNCONFIRMED" as const }
                  : {}),
              },
            ],
      fieldStateFor: (id) => resultFieldState(registry, document, id),
    });
    expect(result.completed).toHaveLength(outcome === "written" ? 1 : 0);
    expect(result.pending).toHaveLength(outcome === "failed" ? 1 : 0);
    expect(result.skipped).toHaveLength(outcome === "unchanged" ? 1 : 0);
    if (outcome === "failed")
      expect(result.pending[0].failureCode).toBe("SEARCH_UNCONFIRMED");
  },
);
