import { afterEach, expect, it, vi } from "vitest";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

afterEach(() => document.body.replaceChildren());
it("resolves university and graduate rows by their exact action IDs", () => {
  expect(
    greetingWorkflowAdapter.repeatedProfileSectionHint?.(
      "greeting:add:universities",
    ),
  ).toEqual({ categoryId: "education", sectionId: "university" });
  expect(
    greetingWorkflowAdapter.repeatedProfileSectionHint?.(
      "greeting:add:graduateSchools",
    ),
  ).toEqual({ categoryId: "education", sectionId: "graduateSchool" });
  expect(
    greetingWorkflowAdapter.repeatedProfileSectionHint?.(
      "greeting:add:universities-extra",
    ),
  ).toBeUndefined();
});
it.each([
  ["listbox", 'role="listbox"', true],
  [
    "owned scroll viewport",
    'role="presentation" data-scope="scroll-area" data-part="viewport" data-state="open"',
    true,
  ],
  ["unverified presentation container", 'role="presentation"', false],
  [
    "closed scroll viewport",
    'role="presentation" data-scope="scroll-area" data-part="viewport" data-state="closed"',
    false,
  ],
  [
    "duplicate options",
    'role="presentation" data-scope="scroll-area" data-part="viewport" data-state="open"',
    false,
  ],
  [
    "duplicate popup IDs",
    'role="presentation" data-scope="scroll-area" data-part="viewport" data-state="open"',
    false,
  ],
  [
    "foreign option",
    'role="presentation" data-scope="scroll-area" data-part="viewport" data-state="open"',
    false,
  ],
])(
  "selects only the unique exact owned option (%s)",
  async (scenario, attributes, expected) => {
    document.body.innerHTML = `<button type="button" name="educationalBackground.universities.0.completionStatus" aria-controls="list" aria-expanded="false">선택</button><div ${attributes} id="list" hidden><button type="button" role="option" aria-selected="false">졸업</button></div><div role="listbox"><button role="option">졸업</button></div>`;
    const button = document.querySelector<HTMLButtonElement>("button")!;
    const list = document.getElementById("list")!;
    const option = list.querySelector<HTMLElement>('[role="option"]')!;
    if (scenario === "duplicate options") list.append(option.cloneNode(true));
    if (scenario === "foreign option") option.remove();
    if (scenario === "duplicate popup IDs")
      document.body.append(list.cloneNode(true));
    button.onclick = () => {
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
    };
    option.onclick = () => {
      button.textContent = "졸업";
      option.setAttribute("aria-selected", "true");
      button.setAttribute("aria-expanded", "false");
    };
    const handle = {
      kind: "field",
      candidateId: "f1",
      candidate: { candidateId: "f1", domName: button.name, control: "button" },
      elements: [],
      customElements: [button],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "f1",
      profileValue: "졸업",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: "f1",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_BUTTON_OPTION" },
      },
    } as ReviewPlanItem;
    expect(
      await greetingWorkflowAdapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(expected);
    expect(button.textContent).toBe(expected ? "졸업" : "선택");
  },
);
it("confirms a military select after React replaces its trigger", async () => {
  const name =
    "militaryServicePreferentialEmploymentStatus.militaryService.rank";
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>계급*</label><button type="button" name="${name}" aria-controls="rank-options" aria-expanded="false">선택</button></div><div role="listbox" id="rank-options" hidden><button type="button" role="option">병장</button></div>`;
  const trigger = document.querySelector<HTMLButtonElement>(
    `[name="${name}"]`,
  )!;
  const popup = document.getElementById("rank-options")!;
  trigger.onclick = () => {
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  popup.querySelector("button")!.onclick = () => {
    const replacement = Object.assign(document.createElement("button"), {
      name,
      textContent: "병장",
    });
    replacement.setAttribute("aria-controls", "rank-options");
    replacement.setAttribute("aria-expanded", "false");
    trigger.replaceWith(replacement);
    popup.hidden = true;
  };
  const handle = {
    kind: "field",
    candidateId: "rank",
    candidate: { candidateId: "rank", domName: name, control: "button" },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "rank",
    profileValue: "병장",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "rank",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_BUTTON_OPTION" },
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
  expect(document.querySelector(`[name="${name}"]`)?.textContent).toBe("병장");
});
it("waits for a Greeting radio's React selection before confirming it", async () => {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>장애여부*</label><div data-scope="toggle-group" data-part="root" role="radiogroup"><button type="button" data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">비대상</button><button type="button" data-scope="toggle-group" data-part="item" role="radio" aria-checked="false">대상</button></div></div>`;
  const group = document.querySelector<HTMLElement>('[role="radiogroup"]')!;
  const options = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
  options[1].onclick = () => {
    setTimeout(() => options[1].setAttribute("aria-checked", "true"), 0);
  };
  const handle = {
    kind: "field",
    candidateId: "disability",
    candidate: {
      candidateId: "disability",
      domName:
        "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
      control: "radio",
      options: [
        { optionId: "no", displayName: "비대상" },
        { optionId: "yes", displayName: "대상" },
      ],
    },
    elements: [],
    customElements: [group],
    optionElements: new Map([
      ["no", options[0]],
      ["yes", options[1]],
    ]),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "disability",
    profileValue: "대상",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "disability",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "CHECK_RADIO" },
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
  expect(options[1].getAttribute("aria-checked")).toBe("true");
});
it.each([
  "graduateSchools.0.majors.1",
  "universities.0.majors.1",
  "universities.0.majors.2",
])("replaces only the verified fresh classification for %s", async (path) => {
  document.body.innerHTML = `<button type="button" name="educationalBackground.${path}.majorClassification" aria-controls="major-options" aria-expanded="false">주전공</button><div role="listbox" id="major-options" hidden><button type="button" role="option">복수전공</button></div>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  const popup = document.getElementById("major-options")!;
  trigger.onclick = () => {
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  popup.querySelector("button")!.onclick = () => {
    trigger.textContent = "복수전공";
    trigger.setAttribute("aria-expanded", "false");
    popup.hidden = true;
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: trigger.name, control: "button" },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f1",
    currentValue: "주전공",
    verifiedFreshDefaultValue: "주전공",
    profileValue: "복수전공",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "f1",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_BUTTON_OPTION" },
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
  expect(trigger.textContent).toBe("복수전공");
});
it.each([
  [undefined, "주전공"],
  ["주전공", "부전공"],
])(
  "preserves a second major's existing choice without matching fresh provenance (%s, %s)",
  async (verifiedFreshDefaultValue, liveValue) => {
    document.body.innerHTML = `<button type="button" name="educationalBackground.graduateSchools.0.majors.1.majorClassification" aria-controls="major-options">${liveValue}</button><div role="listbox" id="major-options"><button type="button" role="option">복수전공</button></div>`;
    const trigger = document.querySelector<HTMLButtonElement>("button")!;
    let clicks = 0;
    trigger.onclick = () => {
      clicks += 1;
    };
    const handle = {
      kind: "field",
      candidateId: "f1",
      candidate: {
        candidateId: "f1",
        domName: trigger.name,
        control: "button",
      },
      elements: [],
      customElements: [trigger],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "f1",
      currentValue: "주전공",
      ...(verifiedFreshDefaultValue ? { verifiedFreshDefaultValue } : {}),
      profileValue: "복수전공",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: "f1",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_BUTTON_OPTION" },
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
    expect(trigger.textContent).toBe(liveValue);
  },
);
it("confirms the committed date when Greeting changes data-placeholder to false", async () => {
  document.body.innerHTML = `<button type="button" name="basicInformation.birthdate" data-scope="date-picker" data-part="trigger" aria-controls="calendar" data-placeholder="true">선택</button><div id="calendar" data-scope="date-picker" data-part="content" role="application" aria-label="calendar" hidden><input data-scope="date-picker" data-part="input" placeholder="1990.01.01"><div role="button" data-scope="date-picker" data-part="table-cell-trigger" data-view="day" data-value="1990-01-02">2</div></div>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  const popup = document.getElementById("calendar")!;
  trigger.onclick = () => {
    popup.hidden = false;
    trigger.setAttribute("data-state", "open");
  };
  const day = popup.querySelector<HTMLElement>("[data-value]")!;
  day.onclick = () => {
    trigger.textContent = "1990.01.02";
    trigger.setAttribute("data-placeholder", "false");
    trigger.setAttribute("data-state", "closed");
    popup.hidden = true;
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: trigger.name, control: "button" },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f1",
    profileValue: "1990-01-02",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "f1",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_DATE" },
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
  expect(trigger.textContent).toBe("1990.01.02");
});
it("rejects malformed dates without opening a calendar", async () => {
  document.body.innerHTML = `<button type="button" data-scope="date-picker" data-part="trigger" aria-controls="calendar">선택</button>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  let clicks = 0;
  trigger.onclick = () => {
    clicks++;
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: {
      candidateId: "f1",
      domName: "basicInformation.birthdate",
      control: "button",
    },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f1",
    profileValue: "1990-99-99",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "f1",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_DATE" },
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
});
it.each([
  [
    "educationalBackground.universities.0.enrollmentPeriod.startDate",
    "2020-03",
  ],
  [
    "educationalBackground.universities.0.enrollmentPeriod.startDate",
    "2020-03-01",
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.startDate",
    "2020-03-01",
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.endDate",
    "2020-03-01",
  ],
  ["educationalBackground.highSchool.enrollmentPeriod.startDate", "2020-03"],
  ["workHistory.workExperiences.0.employmentPeriod.startDate", "2020-03"],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.acquisitionDate",
    "2020-03",
  ],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.0.acquisitionDate",
    "2020-03",
  ],
])(
  "selects a month for %s from %s by exact year label",
  async (name, profileValue) => {
    document.body.innerHTML = `<button type="button" name="${name}" data-scope="date-picker" data-part="trigger" aria-controls="calendar">선택</button><div id="calendar" data-scope="date-picker" data-part="content" role="application" aria-label="calendar" hidden><input data-scope="date-picker" data-part="input" placeholder="2026. 09"><div role="button" data-scope="date-picker" data-part="table-cell-trigger" data-view="month" data-value="3" aria-label="2020년 3월">3월</div><div role="button" data-scope="date-picker" data-part="table-cell-trigger" data-view="day" data-value="2020-03-01" hidden>1</div></div>`;
    const trigger = document.querySelector<HTMLButtonElement>("button")!;
    const popup = document.getElementById("calendar")!;
    const month = popup.querySelector<HTMLElement>('[data-view="month"]')!;
    trigger.onclick = () => {
      popup.hidden = false;
      trigger.setAttribute("data-state", "open");
    };
    month.onclick = () => {
      trigger.textContent = "2020. 03";
      trigger.setAttribute("data-state", "closed");
      popup.hidden = true;
    };
    const handle = {
      kind: "field",
      candidateId: "f1",
      candidate: {
        candidateId: "f1",
        domName: trigger.name,
        control: "button",
      },
      elements: [],
      customElements: [trigger],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "f1",
      profileValue,
      selected: true,
      disabled: false,
      analysis: {
        candidateId: "f1",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_DATE" },
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
    expect(trigger.textContent).toBe("2020. 03");
    expect(popup.querySelector("input")?.value).toBe("2020. 03");
  },
);
it("commits the month input with Enter before considering a cell from another year", async () => {
  document.body.innerHTML = `<button type="button" name="educationalBackground.universities.0.enrollmentPeriod.startDate" data-scope="date-picker" data-part="trigger" aria-controls="calendar">선택</button><div id="calendar" data-scope="date-picker" data-part="content" role="application" aria-label="calendar" hidden><input data-scope="date-picker" data-part="input"><div role="button" data-scope="date-picker" data-part="table-cell-trigger" data-view="month" data-value="3" aria-label="2026년 3월">3월</div></div>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  const popup = document.getElementById("calendar")!;
  const input = popup.querySelector<HTMLInputElement>("input")!;
  trigger.onclick = () => {
    popup.hidden = false;
    trigger.setAttribute("data-state", "open");
  };
  let clicks = 0;
  popup.querySelector<HTMLElement>("[data-view]")!.onclick = () => {
    clicks++;
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter") trigger.textContent = input.value;
  };
  const handle = {
    kind: "field",
    candidateId: "f1",
    candidate: { candidateId: "f1", domName: trigger.name, control: "button" },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f1",
    profileValue: "2019-03-01",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "f1",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_DATE" },
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
  expect(trigger.textContent).toBe("2019. 03");
  expect(clicks).toBe(0);
});

it("accepts an exact date committed while the matching month cell is being discovered", async () => {
  document.body.innerHTML = `<button type="button" name="educationalBackground.universities.1.enrollmentPeriod.endDate" data-scope="date-picker" data-part="trigger" aria-controls="calendar">선택</button><div id="calendar" data-scope="date-picker" data-part="content" role="application" aria-label="calendar" hidden><input data-scope="date-picker" data-part="input"><div role="button" data-scope="date-picker" data-part="table-cell-trigger" data-view="month" data-value="8" aria-label="2026년 8월">8월</div></div>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  const popup = document.getElementById("calendar")!;
  const month = popup.querySelector<HTMLElement>('[data-view="month"]')!;
  trigger.onclick = () => {
    popup.hidden = false;
    trigger.setAttribute("data-state", "open");
  };
  const originalGetAttribute = month.getAttribute.bind(month);
  vi.spyOn(month, "getAttribute").mockImplementation((name) => {
    const value = originalGetAttribute(name);
    if (name === "aria-label") trigger.textContent = "2026. 08";
    return value;
  });
  const monthClick = vi.spyOn(month, "click");
  const handle = {
    kind: "field",
    candidateId: "end-date",
    candidate: {
      candidateId: "end-date",
      domName: trigger.name,
      control: "button",
    },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "end-date",
    profileValue: "2026-08-31",
    selected: true,
    disabled: false,
    analysis: {
      candidateId: "end-date",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_DATE" },
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
  expect(monthClick).not.toHaveBeenCalled();
});

it.each([
  {
    label: "exact value",
    committed: "2026. 08",
    current: true,
    approved: true,
    expected: true,
  },
  {
    label: "different value",
    committed: "2026. 07",
    current: true,
    approved: true,
    expected: false,
  },
  {
    label: "stale context",
    committed: "2026. 08",
    current: false,
    approved: true,
    expected: false,
  },
  {
    label: "changed profile",
    committed: "2026. 08",
    current: true,
    approved: false,
    expected: false,
  },
])(
  "checks $label committed while the calendar mutation guard is pending",
  async ({ committed, current, approved, expected }) => {
    document.body.innerHTML = `<button type="button" name="educationalBackground.universities.1.enrollmentPeriod.endDate" data-scope="date-picker" data-part="trigger" aria-controls="calendar">선택</button><div id="calendar" data-scope="date-picker" data-part="content" role="application" aria-label="calendar" hidden><input data-scope="date-picker" data-part="input"><div role="button" data-scope="date-picker" data-part="table-cell-trigger" data-view="month" data-value="8" aria-label="2026년 8월">8월</div></div>`;
    const trigger = document.querySelector<HTMLButtonElement>("button")!;
    const popup = document.getElementById("calendar")!;
    const input = popup.querySelector<HTMLInputElement>("input")!;
    let contextCurrent = true;
    let inputSubmitted = false;
    let clicks = 0;
    trigger.onclick = () => {
      popup.hidden = false;
      trigger.setAttribute("data-state", "open");
    };
    input.onkeydown = (event) => {
      if (event.key === "Enter") inputSubmitted = true;
    };
    popup.querySelector<HTMLElement>('[data-view="month"]')!.onclick = () =>
      clicks++;
    const handle = {
      kind: "field",
      candidateId: "end-date",
      candidate: {
        candidateId: "end-date",
        domName: trigger.name,
        control: "button",
      },
      elements: [],
      customElements: [trigger],
      optionElements: new Map(),
      isCurrentContext: () => contextCurrent,
    } as unknown as FieldCandidateHandle;
    const item = {
      candidateId: "end-date",
      profileValue: "2026-08-31",
      selected: true,
      disabled: false,
      analysis: {
        candidateId: "end-date",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_DATE" },
      },
    } as ReviewPlanItem;
    const beforeMutation = async () => {
      if (!inputSubmitted) return true;
      await Promise.resolve();
      trigger.textContent = committed;
      contextCurrent = current;
      return approved;
    };
    expect(
      await greetingWorkflowAdapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
        undefined,
        beforeMutation,
      ),
    ).toBe(expected);
    expect(trigger.textContent).toBe(committed);
    expect(clicks).toBe(0);
  },
);
