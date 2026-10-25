import {
  fixturePolicy,
  usePolicyFixture,
} from "../../../test/fixtures/execution-policy";
usePolicyFixture("greeting", { capWaits: true });
import { afterEach, expect, it, vi } from "vitest";
import { componentWorkflowAdapter } from "./workflow";
import { installExecutionPolicy } from "../../workflow/execution-policy";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import type { WriteFailureCode } from "../../write/failure";
afterEach(() => document.body.replaceChildren());

const VALUE = "예시전공";
const option = (code: string, label: string) =>
  `<div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="${code}">${label}</div>`;
const createOption = (value: string) =>
  `<div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="[[new]]"><span>직접 입력하기:</span><span>“${value}”</span></div>`;
// Component forms lists similar names when the exact one is missing; the
// create option, when the site offers it, comes last.
function render(name: string, options: string[], value = VALUE) {
  document.body.innerHTML = `<input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices"><div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open">${options.join("")}</div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const clicks = vi.fn();
  document.querySelectorAll<HTMLElement>('[role="option"]').forEach((node) => {
    node.onclick = () => {
      clicks(node.getAttribute("data-value"));
      input.value = value;
      node.setAttribute("data-state", "checked");
      if (node.getAttribute("data-value") === "[[new]]") {
        node.setAttribute("data-value", `[[new]]-${value}`);
        node.textContent = value;
      }
      input.setAttribute("aria-expanded", "false");
    };
  });
  return { input, clicks };
}
async function drive(input: HTMLInputElement, value = VALUE) {
  const handle = {
    candidateId: "f",
    candidate: { candidateId: "f", domName: input.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f",
    profileValue: value,
    analysis: {
      candidateId: "f",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SEARCH_SELECTION" },
    },
  } as ReviewPlanItem;
  const reported: WriteFailureCode[] = [];
  const written = await componentWorkflowAdapter(document).executeStateDriver?.(
    document,
    handle,
    item,
    new AbortController().signal,
    (code) => reported.push(code),
  );
  return { written, reported };
}

it.each([
  "educationalBackground.universities.0.majors.2",
  "educationalBackground.graduateSchools.0.majors.1",
  "educationalBackground.universities.1.schoolName",
  "educationalBackground.graduateSchools.0.schoolName",
])(
  "uses the create option for %s when only similar names are listed",
  async (name) => {
    const { input, clicks } = render(name, [
      option("0020512", `${VALUE}과`),
      option("0217257", `응용${VALUE}`),
      createOption(VALUE),
    ]);
    const { written, reported } = await drive(input);
    expect(written).toBe(true);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveBeenCalledWith("[[new]]");
    expect(reported).toEqual([]);
  },
);

it("still prefers the exact canonical major over the create option", async () => {
  const { input, clicks } = render(
    "educationalBackground.universities.0.majors.1",
    [
      option("0048239", VALUE),
      option("0217671", `${VALUE}과(${VALUE}전공)`),
      createOption(VALUE),
    ],
  );
  const { written } = await drive(input);
  expect(written).toBe(true);
  expect(clicks).toHaveBeenCalledWith("0048239");
  expect(clicks).not.toHaveBeenCalledWith("[[new]]");
});

it("reports no exact match when similar names are listed without a create option", async () => {
  const { input, clicks } = render(
    "educationalBackground.universities.0.majors.2",
    [option("0020512", `${VALUE}과`), option("0217257", `응용${VALUE}`)],
  );
  const { written, reported } = await drive(input);
  expect(written).toBe(false);
  expect(reported).toEqual(["SEARCH_NO_EXACT_MATCH"]);
  expect(clicks).not.toHaveBeenCalled();
  expect(input.value).toBe("");
});

it("reports an ambiguous search when two canonical options match exactly", async () => {
  const { input, clicks } = render(
    "educationalBackground.universities.0.majors.2",
    [option("0020512", VALUE), option("0020516", VALUE), createOption(VALUE)],
  );
  const { written, reported } = await drive(input);
  expect(written).toBe(false);
  expect(reported).toEqual(["SEARCH_AMBIGUOUS"]);
  expect(clicks).not.toHaveBeenCalled();
});

it("does not use the create option for a kind outside the policy pattern", async () => {
  const { input, clicks } = render(
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName",
    [option("T1", `${VALUE} Basic`), createOption(VALUE)],
  );
  const { written, reported } = await drive(input);
  expect(written).toBe(false);
  expect(reported).toEqual(["SEARCH_NO_EXACT_MATCH"]);
  expect(clicks).not.toHaveBeenCalled();
});

it("keeps majors out of direct input under the v18 pattern", async () => {
  const policy = fixturePolicy("greeting", { capWaits: true }) as unknown as {
    componentPolicy: { patterns: Record<string, string> };
  };
  policy.componentPolicy.patterns.directSearch =
    "^(?:educationalBackground\\.highSchool\\.schoolName|workHistory\\.workExperiences\\.\\d+\\.companyName|languagesCertificationsAndOtherActivity\\.certificatesLicenses\\.\\d+\\.credentials)$";
  installExecutionPolicy(
    document,
    policy as unknown as Parameters<typeof installExecutionPolicy>[1],
  );
  const { input, clicks } = render(
    "educationalBackground.universities.0.majors.2",
    [option("0020512", `${VALUE}과`), createOption(VALUE)],
  );
  const { written, reported } = await drive(input);
  expect(written).toBe(false);
  expect(reported).toEqual(["SEARCH_NO_EXACT_MATCH"]);
  expect(clicks).not.toHaveBeenCalled();
});
