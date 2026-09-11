import { describe, expect, it } from "vitest";
import type { MatchedFieldAnalysis, PreparationPlan } from "../../api/types";
import { createStructuralSignature } from "../../dom/candidate-registry";
import type {
  ActionCandidateHandle,
  FieldCandidateHandle,
} from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import { getWorkflowAdapter } from "../workflow";

const adapter = getWorkflowAdapter("www.skcareers.com");
const majorSelection = adapter.revealSelections[0]!;
const militarySelection = adapter.revealSelections.find(
  ({ domName }) => domName === "prsMilitarySvcYN",
)!;
const veteranSelection = adapter.revealSelections.find(
  ({ domName }) => domName === "prsVeteranBenefitYN",
)!;

function radioDocument(name: string, label = "있음"): Document {
  const page = document.implementation.createHTMLDocument("fixture");
  page.body.innerHTML = `<label><input type="radio" name="${name}" /> ${label}</label>`;
  return page;
}

describe("SK conditional selections", () => {
  it.each([
    "eduMajorDoubleYN",
    "eduMajorDoubleYN_12345678-1234-abcd-1234-123456789abc",
  ])("selects the supported exact or UUID radio name %s", (name) => {
    const page = radioDocument(name);
    expect(adapter.selectReveal(page, majorSelection, " 있음 ")).toEqual({
      code: "SELECTED",
      count: 1,
    });
    expect(page.querySelector("input")!.checked).toBe(true);
  });

  it.each([
    "eduMajorDoubleYN_wrong",
    "eduMajorDoubleYNSuffix",
    "eduMajorDoubleYN_12345678-1234-abcd-1234-123456789abz",
  ])("does not click a similar but unverified name %s", (name) => {
    const page = radioDocument(name);
    expect(adapter.selectReveal(page, majorSelection, "있음")).toEqual({
      code: "TARGET_MISSING",
      count: 1,
    });
    expect(page.querySelector("input")!.checked).toBe(false);
  });

  it.each([undefined, "없음", "PRIVATE_PROFILE_SENTINEL"])(
    "returns value-free diagnostics without selecting when the profile condition is absent (%s)",
    (value) => {
      const page = radioDocument("eduMajorDoubleYN");
      const diagnostic = adapter.selectReveal(page, majorSelection, value);
      expect(diagnostic).toEqual({
        code:
          value === undefined ? "PROFILE_UNAVAILABLE" : "PROFILE_NOT_SELECTED",
        count: 1,
      });
      expect(page.querySelector("input")!.checked).toBe(false);
      expect(JSON.stringify(diagnostic)).not.toContain(
        "PRIVATE_PROFILE_SENTINEL",
      );
    },
  );

  it("reports a failed selection when the radio cannot be clicked", () => {
    const page = radioDocument("eduMajorDoubleYN");
    page.querySelector("input")!.disabled = true;
    expect(adapter.selectReveal(page, majorSelection, "있음")).toEqual({
      code: "SELECTION_FAILED",
      count: 1,
    });
  });

  it("requires the exact visible option label", () => {
    const page = radioDocument("eduMajorDoubleYN", "있음 (기타)");
    expect(adapter.selectReveal(page, majorSelection, "있음").code).toBe(
      "TARGET_MISSING",
    );
    expect(page.querySelector("input")!.checked).toBe(false);
  });
});

describe("SK education region compatibility", () => {
  it.each([
    ["education.highSchool.schoolRegion", "서울", "서울특별시"],
    ["education.university.schoolRegion", "경기", "경기도"],
    ["education.graduateSchool.schoolRegion", "충북", "충청북도"],
  ])("normalizes legacy region only for %s", (key, value, expected) => {
    expect(adapter.normalizeProfileValue?.(key, value)).toBe(expected);
  });

  it.each([
    ["education.university.schoolName", "서울"],
    ["education.university.schoolRegion", "region:seoul"],
    ["education.university.schoolRegion", "서울특별시"],
    ["education.university.schoolRegion", "서울관악"],
    ["education.university.schoolRegion", "해외"],
  ])("preserves unconverted value for %s: %s", (key, value) => {
    expect(adapter.normalizeProfileValue?.(key, value)).toBe(value);
  });
});

describe("SK military and veteran conditional selections", () => {
  it("normalizes only the exact military status alias at the SK adapter boundary", () => {
    expect(
      adapter.normalizeProfileValue?.(
        "military.military.militaryStatus",
        "만기전역",
      ),
    ).toBe("군필");
    expect(
      adapter.normalizeProfileValue?.(
        "military.military.militaryType",
        "만기전역",
      ),
    ).toBe("만기전역");
    expect(
      adapter.normalizeProfileValue?.(
        "military.military.militaryStatus",
        "의병전역",
      ),
    ).toBe("의병전역");
    expect(
      getWorkflowAdapter("example.com").normalizeProfileValue,
    ).toBeUndefined();
  });

  it.each(["군필", "미필", "면제", "복무중"])(
    "selects the exact military target radio for %s",
    (profileValue) => {
      const page = document.implementation.createHTMLDocument("fixture");
      page.body.innerHTML = `
        <label><input type="radio" name="prsMilitarySvcYN" value="0" /> 비대상</label>
        <label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>
      `;

      expect(
        adapter.selectReveal(page, militarySelection, profileValue),
      ).toEqual({
        code: "SELECTED",
        count: 1,
      });
      expect(page.querySelectorAll<HTMLInputElement>("input")[1]!.checked).toBe(
        true,
      );
    },
  );

  it("does not select military target for a non-target status", () => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `
      <label><input type="radio" name="prsMilitarySvcYN" value="0" /> 비대상</label>
      <label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>
    `;

    expect(adapter.selectReveal(page, militarySelection, "비대상")).toEqual({
      code: "PROFILE_NOT_SELECTED",
      count: 1,
    });
    expect(
      Array.from(page.querySelectorAll<HTMLInputElement>("input")).some(
        ({ checked }) => checked,
      ),
    ).toBe(false);
  });

  it("preserves an existing non-target military radio selection", () => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `
      <label><input type="radio" name="prsMilitarySvcYN" value="0" checked /> 비대상</label>
      <label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>
    `;
    const [existing, target] = page.querySelectorAll<HTMLInputElement>("input");
    let targetClicks = 0;
    target!.addEventListener("click", () => {
      targetClicks += 1;
    });

    expect(adapter.selectReveal(page, militarySelection, "군필")).toEqual({
      code: "SKIPPED",
      count: 1,
    });
    expect(existing!.checked).toBe(true);
    expect(target!.checked).toBe(false);
    expect(targetClicks).toBe(0);
  });

  it("keeps an already selected veteran target without a duplicate click", () => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `
      <label><input type="radio" name="prsVeteranBenefitYN" value="0" /> 비대상</label>
      <label><input type="radio" name="prsVeteranBenefitYN" value="1" checked /> 대상</label>
    `;
    const target = page.querySelectorAll<HTMLInputElement>("input")[1]!;
    let targetClicks = 0;
    target.addEventListener("click", () => {
      targetClicks += 1;
    });

    expect(adapter.selectReveal(page, veteranSelection, "대상")).toEqual({
      code: "SELECTED",
      count: 1,
    });
    expect(target.checked).toBe(true);
    expect(targetClicks).toBe(0);
  });

  it.each([
    [
      "multiple exact targets",
      `<label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>`,
    ],
    [
      "a disabled target",
      `<label><input type="radio" name="prsMilitarySvcYN" disabled /> 대상</label>`,
    ],
    [
      "an inert target",
      `<div inert><label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label></div>`,
    ],
    [
      "a hidden target",
      `<label hidden><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>`,
    ],
  ] as const)("refuses %s", (_description, markup) => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = markup;

    expect(adapter.selectReveal(page, militarySelection, "군필")).toEqual({
      code: "TARGET_MISSING",
      count: 1,
    });
    expect(
      Array.from(page.querySelectorAll<HTMLInputElement>("input")).some(
        ({ checked }) => checked,
      ),
    ).toBe(false);
  });

  it("selects only the exact veteran target radio", () => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `
      <label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label>
      <label><input type="radio" name="prsVeteranBenefitYN" value="0" /> 비대상</label>
      <label><input type="radio" name="prsVeteranBenefitYN" value="1" /> 대상</label>
    `;

    expect(adapter.selectReveal(page, veteranSelection, "대상")).toEqual({
      code: "SELECTED",
      count: 1,
    });
    const [military, veteranNonTarget, veteranTarget] =
      page.querySelectorAll<HTMLInputElement>("input");
    expect(military!.checked).toBe(false);
    expect(veteranNonTarget!.checked).toBe(false);
    expect(veteranTarget!.checked).toBe(true);
  });

  it.each([
    ["prsMilitarySvcYN_wrong", militarySelection],
    ["prsVeteranBenefitYN_wrong", veteranSelection],
  ] as const)(
    "does not infer a similar conditional radio name %s",
    (name, selection) => {
      const page = radioDocument(name, "대상");
      const profileValue =
        selection.domName === "prsMilitarySvcYN" ? "군필" : "대상";

      expect(adapter.selectReveal(page, selection, profileValue)).toEqual({
        code: "TARGET_MISSING",
        count: 1,
      });
      expect(page.querySelector("input")!.checked).toBe(false);
    },
  );
});

const bindingPlan: PreparationPlan = {
  actionCandidateId: "reveal-major",
  command: "SELECT_OPTION_TO_REVEAL",
  expectedEffect: "TARGET_FIELDS_VISIBLE",
  targetSectionId: "education",
  profileFieldKey: "education.university.doubleMajorStatus",
  revealedFieldBindings: {
    eduMajorDouble: "education.university.additionalMajorName",
    eduMajorSub: "education.university.minorName",
  },
};
const field: MatchedFieldAnalysis = {
  candidateId: "major",
  matchType: "MATCH",
  autofillPolicy: "ALLOWED",
  mappingStatus: "ADAPTER_VERIFIED",
  interactionStatus: "READY",
  valueBinding: {
    type: "DIRECT",
    profileFieldKey: "education.university.additionalMajorName",
  },
  writePlan: { command: "SET_TEXT" },
};

describe("revealed field binding selection", () => {
  it("matches only the exact policy-provided DOM and profile binding", () => {
    const bindings = adapter.revealedBindings([bindingPlan]);
    expect(
      adapter.revealedProfileFieldKey(field, "eduMajorDouble", bindings),
    ).toBe("education.university.additionalMajorName");
    expect(
      adapter.revealedProfileFieldKey(field, "eduMajorSub", bindings),
    ).toBeUndefined();
    expect(
      adapter.revealedProfileFieldKey(field, "eduMajorDouble_extra", bindings),
    ).toBeUndefined();
    expect(
      adapter.revealedProfileFieldKey(field, undefined, bindings),
    ).toBeUndefined();
    expect(
      adapter.revealedProfileFieldKey(
        { ...field, writePlan: { command: "SELECT_OPTION" } },
        "eduMajorDouble",
        bindings,
      ),
    ).toBeUndefined();
  });

  it.each([
    "talent.hyundai.com",
    "careers.example.test",
    "skcareers.com.example.test",
  ])("does not apply SK preparation rules on %s", (host) => {
    const other = getWorkflowAdapter(host);
    expect(other.revealSelections).toEqual([]);
    expect(other.revealedBindings([bindingPlan]).size).toBe(0);
    expect(
      other.revealedProfileFieldKey(
        field,
        "eduMajorDouble",
        adapter.revealedBindings([bindingPlan]),
      ),
    ).toBeUndefined();
    expect(other.isFreshRowDefault("eduEducationType")).toBe(false);
    expect(
      other.hasFreshRows([
        {
          plan: {
            actionCandidateId: "add",
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            expectedFieldNames: ["eduEducationName"],
          },
          currentGroupCount: 0,
          requiredAdditions: 1,
        },
      ]),
    ).toBe(false);
  });
});

describe("SK education action section hints", () => {
  it.each([
    ["btnAddEducationGrad", "graduateSchool"],
    ["btnAddEducationHigh", "highSchool"],
    ["btnAddEducationUniv", "university"],
    ["educationuniv educationhigh educationgrad", "graduateSchool"],
    ["educationuniv educationhigh", "highSchool"],
    ["학력 추가", undefined],
  ] as const)(
    "resolves %s using the existing section priority",
    (label, expected) => {
      expect(adapter.educationSectionHint?.(label)).toBe(expected);
    },
  );
});

function stateDriver(
  domName: string,
  profileFieldKey: string,
): { item: ReviewPlanItem; handle: FieldCandidateHandle } {
  const input = document.createElement("input");
  input.name = domName;
  const analysis: MatchedFieldAnalysis = {
    candidateId: `field-${domName}`,
    matchType: "MATCH",
    valueBinding: { type: "DIRECT", profileFieldKey },
    autofillPolicy: "CONDITIONAL",
    mappingStatus: "ADAPTER_VERIFIED",
    interactionStatus: "READY",
    writePlan: { command: "SET_TEXT" },
  };
  return {
    item: {
      candidateId: analysis.candidateId,
      fieldLabel: domName,
      profileFieldKey,
      currentValue: "",
      profileValue: "공개 테스트 값",
      previewValue: "공개 테스트 값",
      status: "available",
      selected: true,
      disabled: false,
      revealed: true,
      reason: "fixture",
      analysis,
    },
    handle: {
      kind: "field",
      candidateId: analysis.candidateId,
      candidate: {
        candidateId: analysis.candidateId,
        element: "input",
        control: "text",
        visibility: "visible",
        domName,
      },
      elements: [input],
      optionElements: new Map(),
      sectionId: "section",
      itemId: "item",
      itemIndex: 0,
      signature: createStructuralSignature([input]),
    },
  };
}

describe("SK autocomplete state drivers", () => {
  it.each([
    ["eduEducationName", "education.university.schoolName", 2],
    ["cerCertName", "certifications.certificate.name", 3],
    ["lngExamName", "languages.languageTest.testName", 4],
  ])(
    "runs the exact verified %s binding in its serial stage",
    (domName, fieldKey, stage) => {
      const { item, handle } = stateDriver(domName, fieldKey);
      expect(adapter.stateDriverStage?.(item, handle)).toBe(stage);
    },
  );

  it("gives the second exam row its own later write-and-settle stage", () => {
    const { item, handle } = stateDriver(
      "lngExamName",
      "languages.languageTest.testName",
    );
    expect(adapter.stateDriverStage?.(item, { ...handle, itemIndex: 1 })).toBe(
      7,
    );
  });

  it("does not treat a similar or differently bound text field as a search driver", () => {
    const { item, handle } = stateDriver(
      "lngExamNameSuffix",
      "languages.languageTest.testName",
    );
    expect(adapter.stateDriverStage?.(item, handle)).toBeUndefined();
    const exactHandle = stateDriver(
      "lngExamName",
      "languages.languageTest.grade",
    );
    expect(
      adapter.stateDriverStage?.(exactHandle.item, exactHandle.handle),
    ).toBeUndefined();
  });

  it("requires the approved direct READY text contract for a search driver", () => {
    const { item, handle } = stateDriver(
      "cerCertName",
      "certifications.certificate.name",
    );
    expect(
      adapter.stateDriverStage?.(
        {
          ...item,
          analysis: { ...item.analysis!, mappingStatus: "LLM_SUGGESTED" },
        },
        handle,
      ),
    ).toBeUndefined();
    expect(
      adapter.stateDriverStage?.(
        {
          ...item,
          analysis: {
            ...item.analysis!,
            interactionStatus: "BLOCKED",
            writePlan: undefined,
          },
        },
        handle,
      ),
    ).toBeUndefined();
  });
});

describe("SK military branch and disability conditional controls", () => {
  const disabilitySelection = adapter.revealSelections.find(
    ({ domName }) => domName === "prsDisabledYN",
  );

  it("reveals disability only through the exact target radio contract", () => {
    expect(disabilitySelection).toEqual({
      domName: "prsDisabledYN",
      profileFieldKey: "disability.disability.disabilityStatus",
      itemIndex: 0,
    });
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `
      <label><input type="radio" name="prsDisabledYN" value="0" /> 비대상</label>
      <label><input type="radio" name="prsDisabledYN" value="1" /> 대상</label>
    `;

    expect(adapter.selectReveal(page, disabilitySelection!, "대상")).toEqual({
      code: "SELECTED",
      count: 1,
    });
    expect(
      page.querySelector<HTMLInputElement>(
        "input[name='prsDisabledYN'][value='1']",
      )?.checked,
    ).toBe(true);
  });

  it.each([
    ["wrong code", '<input type="radio" name="prsDisabledYN" value="9" />'],
    [
      "wrong label",
      '<label><input type="radio" name="prsDisabledYN" value="1" /> 예</label>',
    ],
    [
      "duplicate target",
      '<label><input type="radio" name="prsDisabledYN" value="1" /> 대상</label><label><input type="radio" name="prsDisabledYN" value="1" /> 대상</label>',
    ],
    [
      "hidden target",
      '<label hidden><input type="radio" name="prsDisabledYN" value="1" /> 대상</label>',
    ],
  ] as const)("rejects a disability target with %s", (_reason, markup) => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = markup;
    expect(adapter.selectReveal(page, disabilitySelection!, "대상")).toEqual({
      code: "TARGET_MISSING",
      count: 1,
    });
  });

  it("accepts only verified SK branch option codes after the military target gate", () => {
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `
      <label><input type="radio" name="prsMilitarySvcYN" value="1" checked /> 대상</label>
      <select name="prsMilitarySvcCategory">
        <option value="">군별 *필수항목</option>
        <option value="304001">육군</option>
        <option value="304002">해군</option>
        <option value="304003">공군</option>
        <option value="304004">해병대</option>
        <option value="304005">전투경찰</option>
        <option value="304006">해양경찰</option>
        <option value="304007">의무경찰</option>
        <option value="304008">의무소방</option>
      </select>
    `;
    const select = page.querySelector<HTMLSelectElement>(
      "[name='prsMilitarySvcCategory']",
    )!;
    const handle = {
      element: select,
      elements: [select],
      candidate: {
        candidateId: "branch",
        domName: "prsMilitarySvcCategory",
        domId: "prsMilitarySvcCategory",
        displayName: "군별",
        tagName: "SELECT",
      },
    } as never;
    const item = {
      candidateId: "branch",
      profileValue: "육군",
      selected: true,
      disabled: false,
      analysis: {
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "military.military.militaryBranch",
        },
      },
    } as never;

    expect(adapter.canWriteProfileOption?.(handle, item)).toBe(true);
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="999999">육군</option>`,
    );
    expect(adapter.canWriteProfileOption?.(handle, item)).toBe(false);
  });
});

function preparationHandle(
  element: HTMLInputElement | HTMLSelectElement,
): ActionCandidateHandle {
  const select = element instanceof HTMLSelectElement;
  return {
    kind: "action",
    candidateId: "preparation-target",
    sectionId: "synthetic-sensitive-section",
    signature: createStructuralSignature([element]),
    element,
    candidate: {
      candidateId: "preparation-target",
      element: select ? "select" : "input",
      control: select ? "select" : "radio",
      visibility: "visible",
      domName: element.name,
      displayName: select ? "대상 분류" : "대상",
    },
  };
}

describe("SK protected preparation contract", () => {
  it.each(["prsMilitarySvcYN", "prsVeteranBenefitYN", "prsDisabledYN"])(
    "rejects an extra same-code wrong-label peer through the real preparation gate: %s",
    (name) => {
      const page = document.implementation.createHTMLDocument("fixture");
      page.body.innerHTML = `<label><input type="radio" name="${name}" value="0" disabled>비대상</label><label><input type="radio" name="${name}" value="1">대상</label><label><input type="radio" name="${name}" value="1">예</label>`;
      const target = page.querySelectorAll<HTMLInputElement>("input")[1]!;
      const value = name === "prsMilitarySvcYN" ? "군필" : "대상";
      expect(
        adapter.canSelectProfileOption?.(preparationHandle(target), value),
      ).toBe(false);
      expect(target.checked).toBe(false);
      page.querySelectorAll("label")[2]!.remove();
      expect(
        adapter.canSelectProfileOption?.(preparationHandle(target), value),
      ).toBe(true);
    },
  );

  it.each(["duplicate-status", "wrong-target-code", "extra-radio"])(
    "rejects a malformed military status preparation boundary: %s",
    (kind) => {
      const page = document.implementation.createHTMLDocument("fixture");
      page.body.innerHTML = `<label><input type="radio" name="prsMilitarySvcYN" value="0" disabled>비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" checked>대상</label><select name="prsMilitarySvcStatus"><option value="">대상 분류</option><option value="302001">군필</option><option value="302002">미필</option><option value="302003">면제</option><option value="302004">복무중</option></select>`;
      const select = page.querySelector("select")!;
      if (kind === "duplicate-status") page.body.append(select.cloneNode(true));
      if (kind === "wrong-target-code")
        page.querySelector<HTMLInputElement>("input[value='1']")!.value = "9";
      if (kind === "extra-radio")
        page.body.insertAdjacentHTML(
          "beforeend",
          '<label><input type="radio" name="prsMilitarySvcYN" value="1">예</label>',
        );
      expect(
        adapter.canSelectProfileOption?.(preparationHandle(select), "군필"),
      ).toBe(false);
      expect(select.value).toBe("");
    },
  );
  it("rejects a complete radio group when a peer has an unverified code or label", () => {
    const selection = adapter.revealSelections.find(
      ({ domName }) => domName === "prsMilitarySvcYN",
    )!;
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `<label><input type="radio" name="prsMilitarySvcYN" value="0" disabled /> 비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="9" /> 대상</label>`;
    expect(adapter.selectReveal(page, selection, "군필")).toEqual({
      code: "TARGET_MISSING",
      count: 1,
    });
    expect(page.querySelector<HTMLInputElement>("[value='9']")?.checked).toBe(
      false,
    );

    page.body.innerHTML = `<label><input type="radio" name="prsMilitarySvcYN" value="0" disabled /> 비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" /> 대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" /> 잘못된 라벨</label>`;
    expect(adapter.selectReveal(page, selection, "군필")).toEqual({
      code: "TARGET_MISSING",
      count: 1,
    });
  });

  it("prepares only the unique exact SK military status select code", () => {
    const selection = {
      domName: "prsMilitarySvcStatus",
      profileFieldKey: "military.military.militaryStatus",
      itemIndex: 0,
    };
    const page = document.implementation.createHTMLDocument("fixture");
    page.body.innerHTML = `<select name="prsMilitarySvcStatus"><option value="">대상 분류</option><option value="302001">군필</option><option value="302002">미필</option><option value="302003">면제</option><option value="302004">복무중</option></select>`;
    const select = page.querySelector<HTMLSelectElement>("select")!;
    let events = 0;
    select.addEventListener("change", () => events++);
    expect(adapter.selectReveal(page, selection, "군필")).toEqual({
      code: "SELECTION_FAILED",
      count: 1,
    });
    expect(select.value).toBe("");
    expect(events).toBe(0);
    page.body.insertAdjacentHTML(
      "afterbegin",
      '<label><input type="radio" name="prsMilitarySvcYN" value="0" disabled>비대상</label><label><input type="radio" name="prsMilitarySvcYN" value="1" checked>대상</label>',
    );
    expect(adapter.selectReveal(page, selection, "군필")).toEqual({
      code: "SELECTED",
      count: 1,
    });
    expect(select.value).toBe("302001");
    expect(events).toBe(1);

    page.body.innerHTML = `<select name="prsMilitarySvcStatus"><option value="302001">군필</option><option value="302001">군필</option></select>`;
    expect(adapter.selectReveal(page, selection, "군필")).toEqual({
      code: "SELECTION_FAILED",
      count: 1,
    });
  });
});
