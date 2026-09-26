import { afterEach, expect, it } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import { createProgressTracker } from "./progress-model";

afterEach(() => document.body.replaceChildren());

function snapshot(element: HTMLElement, candidateId: string) {
  const registry = new CandidateRegistry();
  const options = [...element.querySelectorAll<HTMLElement>('[role="radio"]')];
  registry.registerField({
    kind: "field",
    candidateId,
    sectionId: "education",
    signature: createStructuralSignature([element]),
    elements: [],
    customElements: [element],
    optionElements: new Map(
      options.map((option, index) => [String(index), option]),
    ),
    candidate: {
      candidateId,
      element: "custom",
      control: options.length ? "radio" : "button",
      visibility: "visible",
      options: options.map((option, index) => ({
        optionId: String(index),
        displayName: option.textContent!,
      })),
    },
  });
  const item: ReviewPlanItem = {
    candidateId,
    fieldLabel: "졸업 상태",
    profileFieldKey: "education.university.graduationStatus",
    currentValue: "",
    profileValue: "졸업",
    previewValue: "졸업",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
  };
  return { registry, item };
}

it.each([
  '<button type="button">졸업</button>',
  '<div role="radiogroup"><button role="radio" aria-checked="true">졸업</button></div>',
])("retains a custom control's write across recollection: %s", (markup) => {
  document.body.innerHTML = markup;
  const element = document.body.firstElementChild as HTMLElement;
  const first = snapshot(element, "old-id");
  const tracker = createProgressTracker();
  const [initial] = tracker.record(
    first.item,
    { candidateId: "old-id", status: "written" },
    first.registry,
  );
  const next = snapshot(element, "new-id");
  expect(tracker.wasWritten("new-id", next.registry)).toBe(true);
  expect(tracker.progressIdFor("new-id", next.registry)).toBe(initial.id);
  const entries = tracker.record(
    { ...next.item, currentValue: "졸업" },
    { candidateId: "new-id", status: "written" },
    next.registry,
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].unchanged).toBe(false);
  expect(tracker.progressStateFor(initial.id)).toBe(true);
  element.remove();
  expect(tracker.progressStateFor(initial.id)).toBe(false);
});

it("does not transfer a custom write to a different control reusing its candidate ID", () => {
  document.body.innerHTML = "<button>졸업</button><button>졸업</button>";
  const buttons = document.querySelectorAll("button");
  const first = snapshot(buttons[0], "same-id");
  const tracker = createProgressTracker();
  tracker.record(
    first.item,
    { candidateId: "same-id", status: "written" },
    first.registry,
  );
  const next = snapshot(buttons[1], "same-id");
  expect(tracker.wasWritten("same-id", next.registry)).toBe(false);
  expect(tracker.progressIdFor("same-id", next.registry)).toBeUndefined();
  expect(
    tracker.record(
      next.item,
      { candidateId: "same-id", status: "written" },
      next.registry,
    ),
  ).toHaveLength(2);
});
