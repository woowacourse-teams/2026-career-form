import { mockGreetingEditingCommand } from "../../interaction/test-utils/greeting-email-editing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let restoreEditingCommand: (() => void) | undefined;
beforeEach(() => {
  restoreEditingCommand = mockGreetingEditingCommand(document);
});
afterEach(() => restoreEditingCommand?.());

import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { collectFieldsSnapshot } from "../../dom/collect";
import { greetingWriteAdapter } from "./write";
import { installGreetingEmailCloseBridge } from "../../interaction/greeting-email-close-bridge";
beforeEach(() => installGreetingEmailCloseBridge(document));

export function radioFixture() {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>장애여부*</label><div role="radiogroup" data-scope="toggle-group" data-part="root"><button type="button" data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">비대상</button><button type="button" data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">대상</button></div></div>`;
  const group = document.querySelector<HTMLElement>('[role="radiogroup"]')!;
  const options = [...group.querySelectorAll<HTMLElement>("button")];
  options.forEach(
    (option) =>
      (option.onclick = () =>
        options.forEach((other) =>
          other.setAttribute("aria-checked", String(other === option)),
        )),
  );
  const handle = {
    kind: "field",
    candidateId: "f1",
    sectionId: "s1",
    signature: "sig",
    candidate: {
      candidateId: "f1",
      domName:
        "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
      control: "radio",
      options: [
        { optionId: "o1", displayName: "비대상" },
        { optionId: "o2", displayName: "대상" },
      ],
    },
    elements: [],
    customElements: [group],
    optionElements: new Map([
      ["o1", options[0]],
      ["o2", options[1]],
    ]),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f1",
    profileValue: "대상",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "f1",
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "CHECK_RADIO" },
    },
  } as ReviewPlanItem;
  return { handle, item, group, options };
}
afterEach(() => document.body.replaceChildren());
describe("Greeting exact radio write", () => {
  it("rejects a sensitive radio group whose verified field label changed after collection", () => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>보훈여부*</label><div data-scope="toggle-group" data-part="root" role="radiogroup"><button type="button" data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">비대상</button><button type="button" data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">대상</button></div></div>`;
    const snapshot = collectFieldsSnapshot(document, {
      executionAdapterId: "greeting-v1",
    });
    const candidate = snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.domName?.endsWith("veteran.veteranStatus"))!;
    const lookup = snapshot.registry.lookupField(candidate.candidateId);
    expect(lookup.status).toBe("ready");
    if (lookup.status !== "ready") return;
    const item = {
      candidateId: candidate.candidateId,
      profileValue: "대상",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: candidate.candidateId,
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "CHECK_RADIO" },
      },
    } as ReviewPlanItem;
    const target = document.querySelectorAll<HTMLElement>('[role="radio"]')[1]!;
    const click = vi.spyOn(target, "click");
    document.querySelector("label")!.textContent = "장애여부*";

    expect(greetingWriteAdapter.tryWrite(lookup.handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(click).not.toHaveBeenCalled();
  });

  it("selects the sole collected matching option and verifies checked state", () => {
    const { handle, item, options } = radioFixture();
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(options[1].getAttribute("aria-checked")).toBe("true");
  });
  it("preserves a different existing selection", () => {
    const { handle, item, options } = radioFixture();
    options[0].setAttribute("aria-checked", "true");
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(options[0].getAttribute("aria-checked")).toBe("true");
  });
  it("does not click a relabeled target", () => {
    const { handle, item, options } = radioFixture();
    const click = vi.spyOn(options[1], "click");
    options[1].textContent = "다른 선택";
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(click).not.toHaveBeenCalled();
  });
  it("does not click when a duplicate semantic radio group appears", () => {
    const { handle, item, options } = radioFixture();
    const click = vi.spyOn(options[1], "click");
    document.body.insertAdjacentHTML("beforeend", document.body.innerHTML);

    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(click).not.toHaveBeenCalled();
  });
  it("rejects radio nodes whose selection state cannot be read", () => {
    const { handle, item, options } = radioFixture();
    options[0].removeAttribute("aria-checked");
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(options[1].getAttribute("aria-checked")).toBe("false");
  });
});

describe("Greeting veteran number", () => {
  it("allows only the site's eight-digit number format", () => {
    const input = document.createElement("input");
    input.name =
      "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber";
    document.body.append(input);
    const handle = {
      candidate: { domName: input.name, control: "text" },
      elements: [input],
    } as unknown as FieldCandidateHandle;
    const item = { profileValue: "1234567890" } as ReviewPlanItem;
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    item.profileValue = "12-345678";
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: false,
    });
    item.profileValue = "12345678";
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: false,
    });
  });
});

it("leaves Greeting email suggestion dismissal to settled verification", () => {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이메일주소*</label><input type="email" role="combobox" data-scope="combobox" data-part="input" aria-expanded="false"></div><section id="education"><input name="educationalBackground.universities.0.schoolName"></section>`;
  const input = document.querySelector<HTMLInputElement>(
    "input[role='combobox']",
  )!;
  const education = document.querySelector<HTMLElement>("#education")!;
  input.addEventListener("input", () => {
    input.setAttribute("aria-expanded", "true");
    education.setAttribute("aria-hidden", "true");
  });
  const snapshot = collectFieldsSnapshot(document, {
    executionAdapterId: "greeting-v1",
  });
  const candidate = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((field) => field.domName === "basicInformation.email")!;
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  expect(lookup.status).toBe("ready");
  if (lookup.status !== "ready") return;
  const item = {
    candidateId: candidate.candidateId,
    profileValue: "example@example.test",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: candidate.candidateId,
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  } as ReviewPlanItem;

  expect(greetingWriteAdapter.tryWrite(lookup.handle, item)).toEqual({
    handled: true,
    written: true,
  });
  expect(input.value).toBe("example@example.test");
  expect(education.hasAttribute("aria-hidden")).toBe(true);
});

function emailFixture() {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이메일주소*</label><input type="email" role="combobox" data-scope="combobox" data-part="input" aria-expanded="false"></div>`;
  const input = document.querySelector("input")!;
  const snapshot = collectFieldsSnapshot(document, {
    executionAdapterId: "greeting-v1",
  });
  const candidate = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((field) => field.domName === "basicInformation.email")!;
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (lookup.status !== "ready") throw new Error("Fixture unavailable");
  const item = {
    candidateId: candidate.candidateId,
    profileValue: "example@example.test",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: candidate.candidateId,
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    },
  } as ReviewPlanItem;
  return { input, handle: lookup.handle, item };
}

it("focuses the blank email editor before committing so delayed page state accepts the value", async () => {
  vi.useFakeTimers();
  try {
    const { input, handle, item } = emailFixture();
    let editing = false;
    let focusedBlank = false;
    let accepted = "";
    input.addEventListener("focus", () => {
      focusedBlank = input.value === "";
    });
    input.addEventListener("click", () => {
      editing = focusedBlank && input.value === "";
    });
    input.addEventListener("input", () => {
      const next = editing ? input.value : "";
      setTimeout(() => {
        accepted = next;
        input.value = accepted;
      }, 400);
    });
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(accepted).toBe("example@example.test");
    expect(input.value).toBe("example@example.test");
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  "replacement",
  "readonly",
  "occupied",
  "relabeled",
  "maxlength",
  "type",
])("revalidates the email target after clicking: %s", (change) => {
  const { input, handle, item } = emailFixture();
  let committed = false;
  input.addEventListener("input", () => {
    committed = true;
  });
  input.addEventListener("click", () => {
    if (change === "replacement") input.replaceWith(input.cloneNode(true));
    if (change === "readonly") input.readOnly = true;
    if (change === "occupied") input.value = "existing@example.test";
    if (change === "relabeled")
      document.querySelector("label")!.textContent = "Other";
    if (change === "maxlength") input.maxLength = 1;
    if (change === "type") input.type = "number";
  });
  expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
    handled: true,
    written: false,
  });
  expect(committed).toBe(false);
  if (change === "occupied") expect(input.value).toBe("existing@example.test");
});

it("does not click an email target that becomes readonly on focus", () => {
  const { input, handle, item } = emailFixture();
  let committed = false;
  input.addEventListener("input", () => {
    committed = true;
  });
  let clicked = false;
  input.addEventListener("focus", () => {
    input.readOnly = true;
  });
  input.addEventListener("click", () => {
    clicked = true;
  });
  expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
    handled: true,
    written: false,
  });
  expect(clicked).toBe(false);
  expect(committed).toBe(false);
});

it("does not confirm email when MAIN commit is unavailable", () => {
  const { input, handle, item } = emailFixture();
  let committed = false;
  input.addEventListener("input", () => {
    committed = true;
  });
  const stop = (event: Event) => event.stopImmediatePropagation();
  document.addEventListener(
    "career-form:greeting-email-commit-request",
    stop,
    true,
  );
  try {
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
    expect(committed).toBe(false);
  } finally {
    document.removeEventListener(
      "career-form:greeting-email-commit-request",
      stop,
      true,
    );
  }
});

it("dispatches email value events only inside the acknowledged MAIN commit", () => {
  const { input, handle, item } = emailFixture();
  let committing = false;
  const mainEvents: boolean[] = [];
  const start = () => {
    committing = true;
  };
  const finish = () => {
    committing = false;
  };
  document.addEventListener(
    "career-form:greeting-email-commit-request",
    start,
    true,
  );
  document.addEventListener(
    "career-form:greeting-email-commit-ack",
    finish,
    true,
  );
  input.addEventListener("focus", () => mainEvents.push(committing));
  input.addEventListener("click", () => mainEvents.push(committing));
  input.addEventListener("input", () => mainEvents.push(committing));
  input.addEventListener("change", () => mainEvents.push(committing));
  try {
    expect(greetingWriteAdapter.tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(mainEvents).toEqual([true, true, true]);
  } finally {
    document.removeEventListener(
      "career-form:greeting-email-commit-request",
      start,
      true,
    );
    document.removeEventListener(
      "career-form:greeting-email-commit-ack",
      finish,
      true,
    );
  }
});
