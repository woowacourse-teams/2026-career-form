import { afterEach, expect, it, vi } from "vitest";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
afterEach(() => document.body.replaceChildren());

it.each([
  ["workHistory.workExperiences.0.companyName", false],
  ["educationalBackground.highSchool.schoolName", false],
  ["workHistory.workExperiences.0.companyName", true],
  ["educationalBackground.highSchool.schoolName", true],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials",
    true,
  ],
])(
  "confirms exact label or explicit creation for %s (create=%s)",
  async (name, create) => {
    document.body.innerHTML = `<input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices"><div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="${create ? "[[new]]" : "KNOWN-1"}">${create ? "<span>직접 입력하기:</span><span>“예시이름”</span>" : '예시이름<span data-part="item-description">공개분류</span>'}</div></div>`;
    const input = document.querySelector<HTMLInputElement>("input")!;
    const option = document.querySelector<HTMLElement>('[role="option"]')!;
    option.onclick = () => {
      input.value = "예시이름";
      option.setAttribute("data-state", "checked");
      if (create) {
        option.setAttribute("data-value", "[[new]]-예시이름");
        option.textContent = "예시이름";
      }
      input.setAttribute("aria-expanded", "false");
    };
    const handle = {
      candidateId: "f",
      candidate: { candidateId: "f", domName: name, control: "text" },
      elements: [input],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "f",
      profileValue: "예시이름",
      analysis: {
        candidateId: "f",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    } as ReviewPlanItem;
    expect(
      await greetingWorkflowAdapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(true);
    expect(option.getAttribute("data-state")).toBe("checked");
  },
  8000,
);

it("prefers one canonical company over its explicit create option", async () => {
  document.body.innerHTML = `<input name="workHistory.workExperiences.0.companyName" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices"><div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="C1">예시회사<span data-part="item-description">업종</span></div><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="[[new]]">직접 입력하기:“예시회사”</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const option = document.querySelector<HTMLElement>('[data-value="C1"]')!;
  const create = document.querySelector<HTMLElement>('[data-value="[[new]]"]')!;
  const createClick = vi.fn();
  create.onclick = createClick;
  option.onclick = () => {
    option.setAttribute("data-state", "checked");
    input.setAttribute("aria-expanded", "false");
  };
  const handle = {
    candidateId: "f",
    candidate: { candidateId: "f", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f",
    profileValue: "예시회사",
    analysis: {
      candidateId: "f",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SEARCH_SELECTION" },
    },
  } as ReviewPlanItem;
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(createClick).not.toHaveBeenCalled();
});
it("rejects duplicate canonical schools after removing descriptions, without using create", async () => {
  document.body.innerHTML = `<input name="educationalBackground.highSchool.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices"><div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open">${["서울", "경기"].map((region, i) => `<div role="option" data-scope="combobox" data-part="item" data-value="S${i}">예시고<span data-part="item-description">${region}</span></div>`).join("")}<div role="option" data-scope="combobox" data-part="item" data-value="[[new]]">직접 입력하기:“예시고”</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const clicks = vi.fn();
  document
    .querySelectorAll<HTMLElement>('[role="option"]')
    .forEach((option) => (option.onclick = clicks));
  const handle = {
    candidateId: "f",
    candidate: { candidateId: "f", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f",
    profileValue: "예시고",
    analysis: {
      candidateId: "f",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SEARCH_SELECTION" },
    },
  } as ReviewPlanItem;
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(clicks).not.toHaveBeenCalled();
  expect(input.value).toBe("");
});
