import { afterEach, expect, it, vi } from "vitest";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

afterEach(() => document.body.replaceChildren());
it.each([
  "educationalBackground.universities.0.schoolName",
  "educationalBackground.highSchool.schoolName",
  "workHistory.workExperiences.0.companyName",
  "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName",
  "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials",
])("confirms exact owned search for %s", async (name) => {
  document.body.innerHTML = `<input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="K0000019">서울대학교</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const option = document.querySelector<HTMLElement>('[role="option"]')!;
  option.onclick = () => {
    input.value = "서울대학교";
    option.setAttribute("data-state", "checked");
    input.setAttribute("aria-expanded", "false");
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
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
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(option.getAttribute("data-state")).toBe("checked");
});
it("opens a Greeting school combobox by clicking its input before searching", async () => {
  document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools" aria-expanded="false"><div id="schools" hidden data-scope="scroll-area" data-part="viewport" role="presentation" data-state="closed"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="K0000019">서울대학교</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const popup = document.querySelector<HTMLElement>("#schools")!;
  const option = popup.querySelector<HTMLElement>('[role="option"]')!;
  input.onclick = () => {
    popup.hidden = false;
    popup.setAttribute("data-state", "open");
    input.setAttribute("aria-expanded", "true");
  };
  option.onclick = () => {
    option.setAttribute("data-state", "checked");
    input.setAttribute("aria-expanded", "false");
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
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
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(option.getAttribute("data-state")).toBe("checked");
}, 8000);
it("opens an aria-hidden search positioner with ArrowDown after entering the query", async () => {
  document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools" aria-expanded="false"><div data-scope="combobox" data-part="positioner" aria-hidden="true"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="K0000019">서울대학교</div></div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const positioner = document.querySelector<HTMLElement>(
    '[data-part="positioner"]',
  )!;
  const option = document.querySelector<HTMLElement>('[role="option"]')!;
  input.addEventListener("input", () =>
    input.setAttribute("aria-expanded", "true"),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") positioner.removeAttribute("aria-hidden");
  });
  option.onclick = () => option.setAttribute("data-state", "checked");
  const handle = {
    kind: "field",
    candidateId: "school",
    candidate: { candidateId: "school", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "school",
    profileValue: "서울대학교",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "school",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SEARCH_SELECTION" },
    },
  } as ReviewPlanItem;
  expect(
    await greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(option.getAttribute("data-state")).toBe("checked");
}, 8000);
it("does not count a closed search popup as a committed school selection", async () => {
  document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="K0000019">서울대학교</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const option = document.querySelector<HTMLElement>('[role="option"]')!;
  option.onclick = () => {
    input.setAttribute("aria-expanded", "false");
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
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

  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(option.getAttribute("data-state")).toBe("unchecked");
  expect(input.value).toBe("");
});
it("does not click a delayed school result after its profile changes", async () => {
  document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="K0000019">서울대학교</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const option = document.querySelector<HTMLElement>('[role="option"]')!;
  const clicked = vi.fn();
  option.onclick = clicked;
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
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
  let checks = 0;
  const beforeMutation = async () => ++checks === 1;

  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
      undefined,
      beforeMutation,
    ),
  ).toBe(false);
  expect(clicked).not.toHaveBeenCalled();
});

it("leaves ambiguous school search results unselected and restores its own query", async () => {
  document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div data-scope="combobox" data-part="item" role="option" data-value="A">서울대학교</div><div data-scope="combobox" data-part="item" role="option" data-value="B">서울대학교</div></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  let clicks = 0;
  document.querySelectorAll<HTMLElement>('[role="option"]').forEach(
    (option) =>
      (option.onclick = () => {
        clicks++;
      }),
  );
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
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
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(clicks).toBe(0);
  expect(input.value).toBe("");
});

it("waits for an exact school result that arrives after the initial empty response", async () => {
  vi.useFakeTimers();
  try {
    const { input, popup, option, handle, item } = greetingSearchFixture();
    option.remove();
    input.addEventListener(
      "input",
      () => {
        setTimeout(() => popup.append(option), 1800);
      },
      { once: true },
    );
    const result = greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(true);
    expect(input.value).toBe("서울대학교");
  } finally {
    vi.useRealTimers();
  }
});
it("confirms the same school ID when React replaces the selected option node", async () => {
  const { popup, option, handle, item } = greetingSearchFixture();
  option.onclick = () => {
    const replacement = option.cloneNode(true) as HTMLElement;
    replacement.setAttribute("data-state", "checked");
    popup.replaceChildren(replacement);
  };
  expect(
    await greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
});
it("rejects a checked school result with a different ID after rerender", async () => {
  const { popup, option, handle, item } = greetingSearchFixture();
  option.onclick = () => {
    const replacement = option.cloneNode(true) as HTMLElement;
    replacement.setAttribute("data-state", "checked");
    replacement.setAttribute("data-value", "OTHER-SCHOOL");
    popup.replaceChildren(replacement);
  };
  expect(
    await greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
});
function greetingSearchFixture() {
  document.body.innerHTML = `<input name="educationalBackground.universities.0.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="delayed-schools"><div id="delayed-schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="K0000019">서울대학교</div></div>`;
  const input = document.querySelector("input")!;
  const popup = document.getElementById("delayed-schools")!;
  const option = popup.querySelector<HTMLElement>('[role="option"]')!;
  option.onclick = () => option.setAttribute("data-state", "checked");
  const handle = {
    kind: "field",
    candidateId: "school",
    candidate: { candidateId: "school", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "school",
    profileValue: "서울대학교",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "school",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SEARCH_SELECTION" },
    },
  } as ReviewPlanItem;
  return { input, popup, option, handle, item };
}

it("selects the exact active school by keyboard and verifies its checked ID after reopening", async () => {
  const { input, popup, option, handle, item } = greetingSearchFixture();
  option.id = "school-option";
  let committed = false;
  const clicked = vi.spyOn(option, "click");
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      if (!popup.isConnected) {
        document.body.append(popup);
        popup.innerHTML = `<div id="school-option" role="option" data-scope="combobox" data-part="item" data-state="${committed ? "checked" : "unchecked"}" data-value="K0000019">서울대학교</div>`;
      }
      input.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-activedescendant", "school-option");
    }
    if (event.key === "Enter") {
      committed = true;
      input.setAttribute("aria-expanded", "false");
      popup.remove();
    }
  });
  expect(
    await greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(committed).toBe(true);
  expect(clicked).not.toHaveBeenCalled();
});
it("does not press Enter when keyboard navigation cannot identify the exact school option", async () => {
  const { input, option, handle, item } = greetingSearchFixture();
  option.id = "school-option";
  const entered = vi.fn();
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") entered();
  });
  expect(
    await greetingWorkflowAdapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(entered).not.toHaveBeenCalled();
  expect(input.value).toBe("");
});

function greetingSelectedSearchFixture(name: string, value: string) {
  const fixture = greetingSearchFixture();
  const { input, popup, option, handle, item } = fixture;
  input.name = name;
  handle.candidate.domName = name;
  item.profileValue = value;
  input.value = value;
  option.textContent = value;
  option.setAttribute("data-state", "checked");
  popup.remove();
  const root = document.createElement("div");
  root.setAttribute("data-scope", "scroll-area");
  root.setAttribute("data-part", "root");
  const positioner = document.createElement("div");
  positioner.setAttribute("data-scope", "combobox");
  positioner.setAttribute("data-part", "positioner");
  positioner.append(root);
  root.append(popup);
  input.setAttribute("aria-expanded", "false");
  input.onclick = () => {
    document.body.append(positioner);
    input.setAttribute("aria-expanded", "true");
  };
  const inputEvent = vi.fn();
  const keyEvent = vi.fn();
  const reselect = vi.fn();
  input.addEventListener("input", inputEvent);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      positioner.remove();
      input.setAttribute("aria-expanded", "false");
    } else {
      keyEvent(event);
    }
  });
  input.addEventListener("keyup", (event) => {
    if (event.key !== "Escape") keyEvent(event);
  });
  option.onclick = reselect;
  return { ...fixture, root, positioner, inputEvent, keyEvent, reselect };
}

it.each([
  ["educationalBackground.universities.0.schoolName", "서울대학교"],
  ["educationalBackground.universities.0.majors.0", "컴퓨터공학"],
  ["educationalBackground.graduateSchools.0.schoolName", "서울대학교"],
  ["educationalBackground.graduateSchools.0.majors.0", "컴퓨터공학"],
])(
  "confirms an existing selected search value on rerun without rewriting or reselecting (%s)",
  async (name, value) => {
    const { input, handle, item, inputEvent, keyEvent, reselect } =
      greetingSelectedSearchFixture(name, value);
    const setter = vi.spyOn(HTMLInputElement.prototype, "value", "set");
    try {
      expect(
        await greetingWorkflowAdapter.executeStateDriver!(
          document,
          handle,
          item,
          new AbortController().signal,
        ),
      ).toBe(true);
      expect(input.value).toBe(value);
      expect(setter).not.toHaveBeenCalled();
      expect(inputEvent).not.toHaveBeenCalled();
      expect(keyEvent).not.toHaveBeenCalled();
      expect(reselect).not.toHaveBeenCalled();
    } finally {
      setter.mockRestore();
    }
  },
);

it.each([
  ["educationalBackground.universities.0.schoolName", "서울대학교"],
  ["educationalBackground.universities.0.majors.0", "컴퓨터공학"],
  ["educationalBackground.graduateSchools.0.schoolName", "서울대학교"],
  ["educationalBackground.graduateSchools.0.majors.0", "컴퓨터공학"],
])(
  "confirms a retained %s when Greeting marks its visible open positioner aria-hidden",
  async (name, value) => {
    const { input, positioner, handle, item, inputEvent, keyEvent, reselect } =
      greetingSelectedSearchFixture(name, value);
    positioner.setAttribute("aria-hidden", "true");
    expect(
      await greetingWorkflowAdapter.executeStateDriver!(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(true);
    expect(input.value).toBe(value);
    expect(inputEvent).not.toHaveBeenCalled();
    expect(keyEvent).not.toHaveBeenCalled();
    expect(reselect).not.toHaveBeenCalled();
  },
);

it.each([
  "closed",
  "hidden",
  "wrong wrapper",
  "hidden ancestor",
  "duplicate ID",
])(
  "rejects a retained selection in an inaccessible Greeting popup (%s)",
  async (scenario) => {
    vi.useFakeTimers();
    try {
      const {
        input,
        popup,
        root,
        positioner,
        handle,
        item,
        inputEvent,
        reselect,
      } = greetingSelectedSearchFixture(
        "educationalBackground.universities.0.schoolName",
        "서울대학교",
      );
      positioner.setAttribute("aria-hidden", "true");
      if (scenario === "closed") popup.setAttribute("data-state", "closed");
      if (scenario === "hidden") positioner.style.display = "none";
      if (scenario === "wrong wrapper") root.removeAttribute("data-part");
      if (scenario === "hidden ancestor") {
        const outer = document.createElement("div");
        outer.setAttribute("aria-hidden", "true");
        outer.append(positioner);
        input.onclick = () => {
          document.body.append(outer);
          input.setAttribute("aria-expanded", "true");
        };
      }
      if (scenario === "duplicate ID") {
        input.onclick = () => {
          document.body.append(positioner, popup.cloneNode(true));
          input.setAttribute("aria-expanded", "true");
        };
      }
      const result = greetingWorkflowAdapter.executeStateDriver!(
        document,
        handle,
        item,
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(12000);
      expect(await result).toBe(false);
      expect(input.value).toBe("서울대학교");
      expect(inputEvent).not.toHaveBeenCalled();
      expect(reselect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  },
);

it.each([
  "missing",
  "unchecked",
  "duplicate",
  "empty code",
  "wrong label",
  "foreign popup",
])(
  "preserves existing search text without counting an unverified selection on rerun (%s)",
  async (scenario) => {
    vi.useFakeTimers();
    try {
      const {
        input,
        popup,
        option,
        handle,
        item,
        inputEvent,
        keyEvent,
        reselect,
      } = greetingSelectedSearchFixture(
        "educationalBackground.universities.0.schoolName",
        "서울대학교",
      );
      if (scenario === "missing") option.remove();
      if (scenario === "unchecked")
        option.setAttribute("data-state", "unchecked");
      if (scenario === "duplicate") popup.append(option.cloneNode(true));
      if (scenario === "empty code") option.setAttribute("data-value", "");
      if (scenario === "wrong label") option.textContent = "다른대학교";
      if (scenario === "foreign popup") popup.id = "other-schools";
      const result = greetingWorkflowAdapter.executeStateDriver!(
        document,
        handle,
        item,
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(12000);
      expect(await result).toBe(false);
      expect(input.value).toBe("서울대학교");
      expect(inputEvent).not.toHaveBeenCalled();
      expect(keyEvent).not.toHaveBeenCalled();
      expect(reselect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  },
);

it.each(["abort", "stale profile", "detached input"])(
  "does not confirm or rewrite an existing search selection invalidated during its rerun probe (%s)",
  async (scenario) => {
    const { input, handle, item, inputEvent, keyEvent, reselect } =
      greetingSelectedSearchFixture(
        "educationalBackground.universities.0.schoolName",
        "서울대학교",
      );
    const controller = new AbortController();
    let currentProfile = true;
    input.addEventListener("click", () => {
      if (scenario === "abort") controller.abort();
      if (scenario === "stale profile") currentProfile = false;
      if (scenario === "detached input") input.remove();
    });
    expect(
      await greetingWorkflowAdapter.executeStateDriver!(
        document,
        handle,
        item,
        controller.signal,
        undefined,
        async () => currentProfile,
      ),
    ).toBe(false);
    expect(input.value).toBe("서울대학교");
    expect(inputEvent).not.toHaveBeenCalled();
    expect(keyEvent).not.toHaveBeenCalled();
    expect(reselect).not.toHaveBeenCalled();
  },
);

it.each([
  "valid",
  "wrong-label",
  "wrong-structure",
  "duplicate-field",
  "duplicate-option",
  "wrong-id",
])(
  "verifies nationality search and retained selection: %s",
  async (mode) => {
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>${mode === "wrong-label" ? "관심국가" : "국적"}</label><input name="basicInformation.nationalityCode" data-scope="combobox" data-part="input" role="${mode === "wrong-structure" ? "textbox" : "combobox"}" aria-controls="countries"></div><div id="countries" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="KR">대한민국</div>${mode === "duplicate-option" ? '<div role="option" data-scope="combobox" data-part="item" data-value="KR2">대한민국</div>' : ""}</div>`;
    const input = document.querySelector<HTMLInputElement>("input")!;
    if (mode === "duplicate-field") input.after(input.cloneNode());
    const popup = document.querySelector<HTMLElement>("#countries")!;
    const option = popup.querySelector<HTMLElement>('[role="option"]')!;
    let clicks = 0;
    let edits = 0;
    input.oninput = () => {
      edits++;
    };
    input.onclick = () => {
      input.setAttribute("aria-expanded", "true");
    };
    option.onclick = () => {
      clicks++;
      option.setAttribute("data-state", "checked");
      if (mode === "wrong-id") option.setAttribute("data-value", "US");
      input.setAttribute("aria-expanded", "false");
    };
    input.onkeydown = (event) => {
      if (event.key === "Escape") {
        input.setAttribute("aria-expanded", "false");
        popup.remove();
      }
    };
    const handle = {
      kind: "field",
      candidateId: "nationality",
      candidate: {
        candidateId: "nationality",
        domName: input.name,
        control: "text",
      },
      elements: [input],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "nationality",
      profileValue: "대한민국",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: "nationality",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    } as ReviewPlanItem;
    expect(greetingWorkflowAdapter.isStateDriver?.(item, input.name)).toBe(
      true,
    );
    const execute = () =>
      greetingWorkflowAdapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      );
    expect(await execute()).toBe(mode === "valid");
    if (mode === "valid") {
      const positioner = document.createElement("div");
      positioner.setAttribute("data-scope", "combobox");
      positioner.setAttribute("data-part", "positioner");
      const root = document.createElement("div");
      root.setAttribute("data-scope", "scroll-area");
      root.setAttribute("data-part", "root");
      root.append(popup);
      positioner.append(root);
      document.body.append(positioner);
      expect(await execute()).toBe(true);
      expect(clicks).toBe(1);
      expect(edits).toBe(1);
    } else {
      expect(input.value).toBe("");
      expect(clicks).toBe(mode === "wrong-id" ? 1 : 0);
    }
  },
  10000,
);

it.each([
  ["nationality", 250, 0, true, 0],
  ["nationality", 250, 249, true, 249],
  ["nationality", 300, 299, false, 256],
  ["school", 250, 249, false, 128],
] as const)(
  "navigates %s's %i options to index %i within its keyboard budget",
  async (kind, count, targetIndex, expected, expectedActiveIndex) => {
    const { input, popup, option, handle, item } = greetingSearchFixture();
    const profileValue = kind === "nationality" ? "대한민국" : "서울대학교";
    item.profileValue = profileValue;
    if (kind === "nationality") {
      input.name = "basicInformation.nationalityCode";
      handle.candidate.domName = input.name;
    }
    const field = document.createElement("div");
    field.dataset.scope = "field";
    field.dataset.part = "root";
    const label = document.createElement("label");
    label.textContent = "국적";
    input.before(field);
    field.append(label, input);
    option.remove();
    for (let index = 0; index < count; index++) {
      const country = document.createElement("div");
      const code = index === targetIndex ? "KR" : `COUNTRY-${index}`;
      country.id = `combobox:countries:option:${code}`;
      country.setAttribute("role", "option");
      country.dataset.scope = "combobox";
      country.dataset.part = "item";
      country.dataset.state = "unchecked";
      country.dataset.value = code;
      country.textContent =
        index === targetIndex ? profileValue : `항목 ${index}`;
      popup.append(country);
    }
    let activeIndex = -1;
    let entered = false;
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        if (!popup.isConnected) document.body.append(popup);
        if (!entered) activeIndex++;
        input.setAttribute("aria-expanded", "true");
        input.setAttribute(
          "aria-activedescendant",
          popup.children[activeIndex].id,
        );
      }
      if (event.key === "Enter") {
        entered = true;
        (popup.children[activeIndex] as HTMLElement).dataset.state = "checked";
        input.setAttribute("aria-expanded", "false");
        popup.remove();
      }
      if (event.key === "Escape") input.setAttribute("aria-expanded", "false");
    });
    expect(
      await greetingWorkflowAdapter.executeStateDriver!(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(expected);
    expect(entered).toBe(expected);
    expect(input.value).toBe(expected ? item.profileValue : "");
    expect(activeIndex).toBe(expectedActiveIndex);
    expect(
      popup.querySelector('[data-state="checked"]')?.getAttribute("data-value"),
    ).toBe(expected ? "KR" : undefined);
  },
);
