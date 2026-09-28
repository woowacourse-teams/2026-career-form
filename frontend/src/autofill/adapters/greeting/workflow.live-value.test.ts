import { afterEach, expect, it, vi } from "vitest";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function fixture(date = false) {
  const name = date
    ? "basicInformation.birthdate"
    : "educationalBackground.universities.0.completionStatus";
  const desired = date ? "1990-01-02" : "졸업";
  document.body.innerHTML = `<button name="${name}" aria-controls="popup" aria-expanded="false" ${date ? 'data-scope="date-picker" data-part="trigger"' : ""}>선택</button><div id="popup" hidden ${date ? 'data-scope="date-picker" data-part="content" role="application" aria-label="calendar"' : 'role="listbox"'}>${date ? '<input data-scope="date-picker" data-part="input"><div data-scope="date-picker" data-part="table-cell-trigger" data-view="day" data-value="1990-01-02">2</div>' : '<button role="option">졸업</button>'}</div>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  const popup = document.getElementById("popup")!;
  const option = popup.lastElementChild as HTMLElement;
  const optionClick = vi.fn(() => {
    trigger.textContent = desired;
  });
  option.onclick = optionClick;
  const open = vi.fn(() => {
    popup.hidden = false;
  });
  trigger.onclick = open;
  let current = true;
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: name, control: "button" },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
    isCurrentContext: () => current,
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f1",
    currentValue: "",
    profileValue: desired,
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "f1",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: date ? "SELECT_DATE" : "SELECT_BUTTON_OPTION" },
    },
  } as ReviewPlanItem;
  return {
    trigger,
    popup,
    option,
    optionClick,
    open,
    invalidate: () => {
      current = false;
    },
    run: () =>
      greetingWorkflowAdapter.executeStateDriver!(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
  };
}

it.each([false, true])(
  "preserves a live value entered after collection (date=%s)",
  async (date) => {
    const view = fixture(date);
    const existing = date ? "2000.01.01" : "재학";
    view.trigger.textContent = existing;
    expect(await view.run()).toBe(false);
    expect(view.trigger.textContent).toBe(existing);
    expect(view.open).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "preserves a live value entered while the popup opens (date=%s)",
  async (date) => {
    vi.useFakeTimers();
    const view = fixture(date);
    const existing = date ? "2000.01.01" : "재학";
    view.trigger.onclick = () => {
      setTimeout(() => {
        view.trigger.textContent = existing;
        view.popup.hidden = false;
      }, 50);
    };
    const pending = view.run();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(view.trigger.textContent).toBe(existing);
    expect(view.optionClick).not.toHaveBeenCalled();
    expect(view.popup.querySelector("input")?.value ?? "").toBe("");
  },
);

it.each([false, true])(
  "rejects a changed target binding while the popup opens (date=%s)",
  async (date) => {
    vi.useFakeTimers();
    const view = fixture(date);
    view.trigger.onclick = () => {
      setTimeout(() => {
        view.invalidate();
        view.popup.hidden = false;
      }, 50);
    };
    const pending = view.run();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(view.optionClick).not.toHaveBeenCalled();
  },
);

it("preserves a live date entered while waiting for the calendar day", async () => {
  vi.useFakeTimers();
  const view = fixture(true);
  view.option.hidden = true;
  const input = view.popup.querySelector("input")!;
  input.onkeyup = () => {
    setTimeout(() => {
      view.trigger.textContent = "2000.01.01";
      view.option.hidden = false;
    }, 50);
  };
  const pending = view.run();
  await vi.runAllTimersAsync();
  expect(await pending).toBe(false);
  expect(view.trigger.textContent).toBe("2000.01.01");
  expect(view.optionClick).not.toHaveBeenCalled();
});

it.each(["name", "popup", "detached"])(
  "rejects a target whose %s binding changes while opening",
  async (change) => {
    vi.useFakeTimers();
    const view = fixture();
    view.trigger.onclick = () => {
      setTimeout(() => {
        if (change === "name")
          view.trigger.name =
            "educationalBackground.universities.1.completionStatus";
        if (change === "popup") {
          view.popup.id = "replacement";
          view.trigger.setAttribute("aria-controls", "replacement");
        }
        if (change === "detached") view.trigger.remove();
        view.popup.hidden = false;
      }, 50);
    };
    const pending = view.run();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(view.optionClick).not.toHaveBeenCalled();
  },
);

it("does not report selection success after its target binding changes", async () => {
  vi.useFakeTimers();
  const view = fixture();
  view.option.onclick = () => {
    view.trigger.textContent = "졸업";
    view.invalidate();
  };
  const pending = view.run();
  await vi.runAllTimersAsync();
  expect(await pending).toBe(false);
});

it.each([
  ["popup", "value"],
  ["popup", "context"],
  ["popup", "name"],
  ["option", "value"],
  ["option", "context"],
  ["option", "name"],
])(
  "preserves search target changes while waiting for %s (%s)",
  async (phase, change) => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="SCHOOL">서울대학교</div></div>`;
    const input = document.querySelector("input")!;
    const popup = document.getElementById("schools")!;
    const option = popup.firstElementChild as HTMLElement;
    popup.hidden = phase === "popup";
    option.hidden = phase === "option";
    let current = true;
    const click = vi.fn(() => {
      input.value = "서울대학교";
      option.setAttribute("data-state", "checked");
    });
    option.onclick = click;
    const handle = {
      kind: "field",
      candidateId: "f1",
      candidate: { candidateId: "f1", domName: input.name, control: "text" },
      elements: [input],
      optionElements: new Map(),
      isCurrentContext: () => current,
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "f1",
      profileValue: "서울대학교",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: "f1",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    } as ReviewPlanItem;
    setTimeout(() => {
      if (change === "value") input.value = "고려대학교";
      if (change === "context") current = false;
      if (change === "name")
        input.name = "educationalBackground.universities.1.schoolName";
      popup.hidden = false;
      option.hidden = false;
    }, 50);
    const pending = greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    );
    await vi.runAllTimersAsync();
    expect(await pending).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(input.value).toBe(change === "value" ? "고려대학교" : "서울대학교");
  },
);
