import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { CandidateRegistry, createStructuralSignature } from "../dom/candidate-registry";
import { gradeGenericField } from "../generic/field-grading";
import { resolveChoiceOption } from "../profile/choice-option";
import { executeApprovedWrites, settledGenericResult } from "../write/native-executor";
import { buildReviewPlan } from "./review-plan";

afterEach(() => document.body.replaceChildren());

function fixture(key: string, value: string, names: string[], radio = false) {
  const profile = createEmptyProfile();
  if (key.startsWith("veteran.")) profile.veteran.veteranStatus = value;
  if (key.startsWith("disability.")) profile.disability.disabilityStatus = value;
  if (key.endsWith(".gender")) profile.personal.gender = value;
  if (key.endsWith(".nationality")) profile.personal.nationality = value;
  if (key.startsWith("military.")) {
    profile.military = { militaryStatus: value, militaryType: "현역병", militaryRank: "military-rank:byeongjang" };
  }
  if (key.startsWith("certifications.")) {
    profile.certifications = [{ id: "certificate", sectionId: "certificate", values: { grade: value } }];
  }
  const container = document.createElement("div");
  document.body.append(container);
  const options = names.map((displayName, index) => ({ optionId: `o${index}`, displayName }));
  const select = document.createElement("select");
  const optionElements = new Map<string, HTMLElement>();
  const elements: (HTMLInputElement | HTMLSelectElement)[] = [];
  if (radio) {
    options.forEach((option) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "choice";
      input.value = option.optionId;
      label.append(input, option.displayName);
      container.append(label);
      elements.push(input);
      optionElements.set(option.optionId, input);
    });
  } else {
    select.append(new Option("선택", ""));
    options.forEach((option) => {
      const element = new Option(option.displayName, option.optionId);
      select.append(element);
      optionElements.set(option.optionId, element);
    });
    container.append(select);
    elements.push(select);
  }
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field", candidateId: "choice",
    candidate: { candidateId: "choice", displayName: "선택", element: radio ? "input" : "select", control: radio ? "radio" : "select", visibility: "visible", options },
    elements, optionElements, sectionId: "section",
    signature: createStructuralSignature(elements),
  });
  const plan = buildReviewPlan({
    profile, registry,
    analysis: {
      snapshotId: "test", mode: "GENERIC", analysisStatus: "COMPLETE",
      fields: [{
        candidateId: "choice", matchType: "MATCH", valueBinding: { type: "DIRECT", profileFieldKey: key },
        autofillPolicy: "ALLOWED", mappingStatus: "LLM_SUGGESTED", interactionStatus: "READY",
        writePlan: { command: radio ? "CHECK_RADIO" : "SELECT_OPTION" },
      }],
    },
  });
  return { registry, item: plan.items[0]!, select, elements, options, profile };
}

describe("semantic choice binding and native writing", () => {
  it.each([
    ["veteran.veteran.veteranStatus", "veteran-status:not-eligible", ["해당", "해당없음"], "해당없음", true],
    ["disability.disability.disabilityStatus", "disability-status:eligible", ["예", "아니오"], "예", true],
    ["personal.personal.gender", "남성", ["M", "F"], "M", true],
    ["personal.personal.nationality", "대한민국", ["내국인", "외국인"], "내국인", true],
    ["military.military.militaryStatus", "military-status:served", ["병역필_현역(병)", "병역필_현역(장교)", "병역필_현역(부사관)", "병역필_사회복무", "면제"], "병역필_현역(병)", false],
    ["certifications.certificate.grade", "기사", ["1급", "2급", "기타"], "기타", false],
  ] as const)("binds and writes %s", (key, value, names, expected, radio) => {
    const { registry, item, select, elements } = fixture(key, value, [...names], radio);
    expect(item.profileValue).toBe(expected);
    expect(item.disabled).toBe(false);
    const [result] = executeApprovedWrites({
      items: [{ ...item, selected: true }], approvedCandidateIds: new Set(["choice"]), registry,
    });
    expect(result.status).toBe("written");
    if (radio) expect((elements[(names as readonly string[]).indexOf(expected)] as HTMLInputElement).checked).toBe(true);
    else expect(select.selectedOptions[0]!.textContent).toBe(expected);
    expect(settledGenericResult(item, registry).status).toBe("written");
  });

  it("uses military context in grading and refuses ambiguous composites", () => {
    const { options, profile } = fixture("military.military.militaryStatus", "military-status:served",
      ["병역필_현역(병)", "병역필_현역(장교)", "병역필_현역(부사관)"]);
    const input = {
      profileFieldKey: "military.military.militaryStatus", confidence: 0.9,
      categoryConfirmed: true, hasProfileValue: true, control: "select" as const,
      displayName: "병역", options,
      optionValueCheck: { profileValue: "military-status:served", context: profile.military },
    };
    expect(gradeGenericField(input)).toEqual({ grade: "AUTO" });
    expect(gradeGenericField({ ...input, optionValueCheck: { profileValue: "군필" } }).reason)
      .toBe("OPTION_VALUE_UNMATCHED");
  });

  it("writes raw aliases through the shared resolver and refuses duplicate meanings", () => {
    const { registry, item, elements } = fixture("personal.personal.gender", "남성", ["M", "F"], true);
    const raw = { ...item, profileValue: "남성", selected: true };
    expect(executeApprovedWrites({ items: [raw], approvedCandidateIds: new Set(["choice"]), registry })[0].status).toBe("written");
    expect((elements[0] as HTMLInputElement).checked).toBe(true);
    expect(settledGenericResult(raw, registry).status).toBe("written");
    expect(resolveChoiceOption("personal.personal.gender", "남성", [{ displayName: "남성" }, { displayName: "M" }]).status).toBe("ambiguous");
  });

  it("does not write a placeholder for unmatched or ambiguous options", () => {
    const { registry, item, select } = fixture("personal.personal.gender", "남성", ["M", "남자"]);
    const result = executeApprovedWrites({ items: [{ ...item, selected: true }], approvedCandidateIds: new Set(["choice"]), registry });
    expect(result[0].status).toBe("skipped");
    expect(select.value).toBe("");
  });
});
