import { describe, expect, it } from "vitest";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import {
  observeReadonlySearch,
  isReadonlySearchEligible,
  targetInput,
  searchOpeners,
  type ReadonlySearchEligibility,
} from "./readonly-search";

type ReadonlyFieldCase = readonly [string, string, string];

const READONLY_FIELDS: readonly ReadonlyFieldCase[] = [
  ["education.university.schoolName", "학교명", "가상대학교"],
  ["education.university.schoolRegion", "학교소재지", "가상지역"],
  ["education.university.majorName", "전공", "가상전공학과"],
  ["education.highSchool.schoolName", "고등학교 학교명", "가상고등학교"],
  ["education.graduateSchool.schoolName", "대학원 학교명", "가상대학원"],
];

function renderReadonlyField({
  label,
  value = "",
  openerLabel = `${label} 검색`,
  openerCount = 1,
  inputType = "text",
  disabled = false,
  inert = false,
  hidden = false,
}: {
  label: string;
  value?: string;
  openerLabel?: string;
  openerCount?: number;
  inputType?: string;
  disabled?: boolean;
  inert?: boolean;
  hidden?: boolean;
}): HTMLInputElement {
  document.body.innerHTML = `
    <div data-repeater-item="education-row" ${inert ? "inert" : ""}>
      <dl>
        <dt>${label}</dt>
        <dd>
          <input id="target" name="target" type="${inputType}" value="${value}" readonly ${disabled ? "disabled" : ""} ${hidden ? "hidden" : ""} aria-label="${label}" />
          ${Array.from({ length: openerCount }, (_, index) => `<button type="button" aria-label="${openerLabel}" data-opener="${index + 1}">검색</button>`).join("")}
        </dd>
      </dl>
    </div>`;
  return document.querySelector<HTMLInputElement>("#target")!;
}

function handleFor(
  input: HTMLInputElement,
  candidateId = "field-1",
): FieldCandidateHandle {
  return {
    kind: "field",
    candidateId,
    sectionId: "section-1",
    signature: createStructuralSignature([input]),
    candidate: {
      candidateId,
      element: "input",
      control: "text",
      visibility: "visible",
      readonly: true,
      semanticContext: { inputType: "text" },
    },
    elements: [input],
    optionElements: new Map(),
  };
}

function expectEligible(result: ReadonlySearchEligibility): void {
  expect(result.status).toBe("eligible");
  if (result.status === "eligible") {
    expect(result.identity.fieldSignature).toContain("INPUT|text|");
    expect(result.identity.fieldGroup.matches("dd, dl")).toBe(true);
  }
}

describe("observeReadonlySearch", () => {
  it.each(READONLY_FIELDS)(
    "recognizes %s as a generic readonly search target",
    (_profileKey, label, _expectedValue) => {
      const input = renderReadonlyField({ label });
      expectEligible(observeReadonlySearch(handleFor(input)));
      expect(input.value).toBe("");
    },
  );

  it("keeps the existing high-school and graduate-school school-name route eligible", () => {
    const highSchool = renderReadonlyField({ label: "고등학교 학교명" });
    const highResult = observeReadonlySearch(handleFor(highSchool));
    expectEligible(highResult);

    const graduateSchool = renderReadonlyField({ label: "대학원 학교명" });
    const graduateResult = observeReadonlySearch(handleFor(graduateSchool));
    expectEligible(graduateResult);
  });

  it.each([
    ["editable", { value: "", inputType: "text" }],
    ["textarea", { value: "", inputType: "text" }],
    ["disabled", { value: "", inputType: "text", disabled: true }],
    ["inert", { value: "", inputType: "text", inert: true }],
    ["hidden", { value: "", inputType: "text", hidden: true }],
    ["email input", { value: "", inputType: "email" }],
    ["search input", { value: "", inputType: "search" }],
  ] as const)(
    "rejects a %s target before any opener action",
    (name, options) => {
      const input =
        name === "textarea"
          ? (() => {
              document.body.innerHTML = `<div data-repeater-item><dl><dt>전공</dt><dd><textarea id="target" aria-label="전공" readonly></textarea><button type="button" aria-label="전공 검색">검색</button></dd></dl></div>`;
              return document.querySelector<HTMLTextAreaElement>("#target")!;
            })()
          : renderReadonlyField({ label: "전공", ...options });
      if (name === "editable") input.readOnly = false;
      const result = observeReadonlySearch(
        handleFor(input as HTMLInputElement),
      );
      expect(result.status).toBe("unsupported");
      expect(input.value).toBe("");
      expect(document.querySelectorAll("[data-opener]")).toHaveLength(
        name === "textarea" ? 0 : 1,
      );
    },
  );

  it("requires a single opener in the smallest dd/dl group", () => {
    const input = renderReadonlyField({ label: "학교소재지", openerCount: 0 });
    expect(observeReadonlySearch(handleFor(input))).toEqual({
      status: "unsupported",
      reason: "search_opener_not_found",
    });

    const two = renderReadonlyField({ label: "학교소재지", openerCount: 2 });
    expect(observeReadonlySearch(handleFor(two))).toEqual({
      status: "ambiguous",
      reason: "multiple_search_openers",
    });
  });

  it("counts an unsafe plausible opener before filtering it out", () => {
    const input = renderReadonlyField({ label: "전공" });
    const safe =
      document.querySelector<HTMLButtonElement>("[data-opener='1']")!;
    safe.setAttribute("aria-label", "전공 검색");
    const unsafe = document.createElement("a");
    unsafe.href = "/navigate-away";
    unsafe.textContent = "전공 검색";
    unsafe.dataset.opener = "unsafe";
    input.parentElement!.append(unsafe);

    expect(searchOpeners(input.closest("dd")!)).toHaveLength(2);
    expect(observeReadonlySearch(handleFor(input))).toEqual({
      status: "ambiguous",
      reason: "multiple_search_openers",
    });
  });

  it("does not broaden a field group to a larger ancestor with another control", () => {
    document.body.innerHTML = `
      <div data-repeater-item>
        <dl>
          <dt>학교명</dt>
          <dd><input id="target" type="text" readonly /><button type="button" aria-label="학교명 검색">검색</button></dd>
          <dt>학교소재지</dt>
          <dd><input id="other" type="text" readonly /><button type="button" aria-label="학교소재지 검색">검색</button></dd>
        </dl>
      </div>`;
    const input = document.querySelector<HTMLInputElement>("#target")!;
    expect(observeReadonlySearch(handleFor(input))).toEqual({
      status: "eligible",
      targetCandidateId: "field-1",
      identity: expect.objectContaining({ fieldGroup: input.closest("dd") }),
    });
  });

  it("keeps target input resolution native and singular", () => {
    const input = renderReadonlyField({ label: "전공" });
    const handle = handleFor(input);
    expect(targetInput(handle)).toBe(input);
    handle.elements.push(input);
    expect(targetInput(handle)).toBeUndefined();
  });

  it("supports a live target eligibility check against the owning document", () => {
    const input = renderReadonlyField({ label: "전공" });
    const handle = handleFor(input);
    expect(isReadonlySearchEligible(handle, document)).toBe(true);
    const foreignDocument = document.implementation.createHTMLDocument("other");
    expect(isReadonlySearchEligible(handle, foreignDocument)).toBe(false);
  });

  it("does not mutate a readonly target while observing or classifying it", () => {
    const input = renderReadonlyField({
      label: "학교소재지",
      value: "기존 표시값",
    });
    const before = input.value;
    const result = observeReadonlySearch(handleFor(input));
    expect(result.status).toBe("eligible");
    expect(input.value).toBe(before);
    expect(input.readOnly).toBe(true);
  });

  it("rejects an opener that has no semantic same-field relation", () => {
    const input = renderReadonlyField({ label: "전공", openerLabel: "열기" });
    const opener = document.querySelector<HTMLButtonElement>("[data-opener]")!;
    opener.removeAttribute("aria-label");
    opener.textContent = "⌕";
    expect(observeReadonlySearch(handleFor(input))).toEqual({
      status: "unsupported",
      reason: "search_opener_not_found",
    });
  });

  it("rejects an anchor opener inheriting a new-window base target", () => {
    const input = renderReadonlyField({ label: "전공" });
    document.querySelector("button")!.outerHTML = '<a href="#">전공 검색</a>';
    const base = document.createElement("base");
    base.target = "_blank";
    document.head.append(base);
    try {
      expect(observeReadonlySearch(handleFor(input)).status).toBe(
        "unsupported",
      );
    } finally {
      base.remove();
    }
  });
});

describe("readonly search identity guards", () => {
  it("retains the captured repeat-row identity instead of allowing a sibling row", () => {
    document.body.innerHTML = `
      <div data-repeater-item="first"><dl><dt>전공</dt><dd><input id="first-target" type="text" readonly /><button type="button" aria-label="전공 검색">검색</button></dd></dl></div>
      <div data-repeater-item="second"><dl><dt>전공</dt><dd><input id="second-target" type="text" readonly /><button type="button" aria-label="전공 검색">검색</button></dd></dl></div>`;
    const first = document.querySelector<HTMLInputElement>("#first-target")!;
    const second = document.querySelector<HTMLInputElement>("#second-target")!;
    expect(observeReadonlySearch(handleFor(first, "first"))).toMatchObject({
      status: "eligible",
      targetCandidateId: "first",
    });
    expect(second).not.toBe(first);
  });

  it("keeps a readonly field blocked in the candidate registry without direct writes", () => {
    const input = renderReadonlyField({ label: "전공" });
    const handle = handleFor(input);
    const registry = new CandidateRegistry();
    registry.registerField(handle, "readonly");
    expect(registry.lookupField(handle.candidateId)).toMatchObject({
      status: "blocked",
      reason: "readonly",
    });
    expect(input.value).toBe("");
  });
});
