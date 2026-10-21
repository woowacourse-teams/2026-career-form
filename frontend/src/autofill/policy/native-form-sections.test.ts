/** Synthetic public-template fixture: T:2634–2753,2774–2870,3789–3862.
 * 900001 is a virtual test-only tenant Sn, never a shipped verified code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { collectFieldsSnapshot } from "../dom/collect";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import { getWorkflowAdapter } from "../adapters/workflow";
import { getWriteAdapter } from "../adapters/write";
import type { ReviewPlanItem } from "../review/review-plan";
import { nativeOwnership } from "./native-form-collection";
import { mountSyntheticNative } from "./__fixtures__/hplace-mrs2-native.synthetic";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { expectHarnessLine } from "../workflow/test-utils/harness-diagnostic-line";
afterEach(() => installExecutionPolicy(document));
function mount() {
  mountSyntheticNative(0);
  document
    .querySelectorAll("script")
    .forEach(
      (s, i) =>
        (s.src = seed.executionPolicy.browserPolicy.nativeForm.assetPaths[i]),
    );
  return structuredClone(seed.executionPolicy) as unknown as ExecutionPolicy;
}
it("maps only language and speaking with observed codes and exact labels in each owned row", () => {
  const policy = mount();
  document
    .querySelector("#wrapResume")!
    .insertAdjacentHTML(
      "beforeend",
      `<section class="writeResume" data-code="18"><div class="subject" data-code="166" data-wrap="foreignAbility">${[0, 1].map((i) => `<div class="loop" data-loop="languageSkill"><select name="languageSkill[${i}].languageCode"><option value=""></option><option value="01">영어</option></select><select name="languageSkill[${i}].speakingLevelCodeSn"><option value=""></option><option value="900001">Advanced</option></select><select name="languageSkill[${i}].writingLevelCodeSn" required><option value=""></option><option value="900001">Advanced</option></select><select name="languageSkill[${i}].readingLevelCodeSn" required><option value=""></option><option value="900001">Advanced</option></select></div>`).join("")}</div></section>`,
    );
  installExecutionPolicy(document, policy);
  const snap = collectFieldsSnapshot(document);
  const section = snap.request.sections.find(
    (s) => s.sectionId === "hplace-mrs2-foreignAbility",
  )!;
  expect(section.items).toHaveLength(2);
  expect(section.items!.map((i) => i.fields.length)).toEqual([2, 2]);
  for (const [index, value] of [
    [0, "영어"],
    [1, "Advanced"],
  ] as const) {
    const field = section.items![0].fields[index];
    const lookup = snap.registry.lookupField(field.candidateId);
    expect(lookup.status).toBe("ready");
    if (!("handle" in lookup)) throw new Error();
    const item = {
      candidateId: field.candidateId,
      selected: true,
      disabled: false,
      profileValue: value,
      analysis: {
        candidateId: field.candidateId,
        matchType: "MATCH",
        valueBinding: nativeOwnership(lookup.handle)!.field.binding,
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_OPTION" },
      },
    } as ReviewPlanItem;
    expect(getWriteAdapter(document).tryWrite(lookup.handle, item)).toEqual({
      handled: true,
      written: true,
    });
  }
  expect(
    document.querySelector<HTMLSelectElement>(
      '[name="languageSkill[0].speakingLevelCodeSn"]',
    )!.value,
  ).toBe("900001");
  expect(
    document.querySelector<HTMLSelectElement>(
      '[name="languageSkill[1].languageCode"]',
    )!.value,
  ).toBe("");
  expect(
    document.querySelector<HTMLSelectElement>(
      '[name="languageSkill[0].writingLevelCodeSn"]',
    )!.value,
  ).toBe("");
  expect(
    document.querySelector<HTMLSelectElement>(
      '[name="languageSkill[0].readingLevelCodeSn"]',
    )!.value,
  ).toBe("");
});
it("contains nine career and four project mappings without semantic substitutions", () => {
  const policy = mount();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const [basic, career, project, language] =
    policy.browserPolicy.nativeForm.sections;
  expect(career.fields).toHaveLength(9);
  expect(project.fields).toHaveLength(4);
  expect(language.fields).toHaveLength(2);
  expect(project.enabled).toBe(true);
  expect(language.enabled).toBe(true);
  expect(
    basic.fields.find((f) => f.rawName === "latestSalary")!.binding,
  ).toEqual({
    type: "DIRECT",
    profileFieldKey: "compensation.compensation.previousSalary",
  });
  expect(career.fields.some((f) => f.rawName.endsWith(".salary"))).toBe(false);
  expect(
    project.fields.some((f) =>
      JSON.stringify(f.binding).includes("activityDetails"),
    ),
  ).toBe(false);
  expect(
    policy.browserPolicy.nativeForm.unsupportedSections.map((s) => s.reason),
  ).toEqual(Array(6).fill("프로필 키 없음"));
  expect(
    JSON.stringify(policy.browserPolicy.nativeForm.sections),
  ).not.toContain("joinPossibleDate");
  expect(
    JSON.stringify(policy.browserPolicy.nativeForm.sections),
  ).not.toContain("existYn");
});
it("collects nine career and four project fields independently in each synthetic row", () => {
  const policy = mount();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const career = document.querySelector('[data-wrap="career"]')!;
  career.innerHTML = [0, 1]
    .map(
      (i) =>
        `<div class="loop" data-loop="career"><select name="career[${i}].careerCriteriaCodeSn"><option value=""></option><option value="900001">정규직</option></select><input name="career[${i}].company" maxlength="128"><input name="career[${i}].entranceDate"><input name="career[${i}].leavingDate"><label><input name="career[${i}].workingStatusCode" type="radio" value="WORK">재직중</label><label><input name="career[${i}].workingStatusCode" type="radio" value="LEAVE">퇴사</label><input name="career[${i}].department" maxlength="128"><input name="career[${i}].position" maxlength="64"><input name="career[${i}].assignedTask" maxlength="216"><input name="career[${i}].retirementReason" maxlength="512"><input name="career[${i}].salary" type="number"></div>`,
    )
    .join("");
  career.insertAdjacentHTML(
    "afterend",
    `<div class="subject" data-code="154" data-wrap="project">${[0, 1].map((i) => `<div class="loop" data-loop="project"><input name="project[${i}].projectName" maxlength="128"><input name="project[${i}].startDate"><input name="project[${i}].endDate"><input name="project[${i}].role" maxlength="128"><textarea name="project[${i}].performWork"></textarea><textarea name="project[${i}].comment"></textarea></div>`).join("")}</div>`,
  );
  installExecutionPolicy(document, policy);
  const snap = collectFieldsSnapshot(document);
  for (const [id, count] of [
    ["career", 9],
    ["project", 4],
  ] as const) {
    const section = snap.request.sections.find(
      (s) => s.sectionId === `hplace-mrs2-${id}`,
    )!;
    expect(section.items!.map((i) => i.fields.length)).toEqual([count, count]);
    expect(
      section
        .items!.flatMap((i) => i.fields)
        .map((f) => f.semanticContext!.repeat!.rowIndex),
    ).toEqual([...Array(count).fill(0), ...Array(count).fill(1)]);
  }
  const field = snap.request.sections.find(
    (s) => s.sectionId === "hplace-mrs2-career",
  )!.items![0].fields[0];
  career.append(career.firstElementChild!);
  expect(snap.registry.lookupField(field.candidateId).status).toBe("stale");
});

it("requires the end date to become disabled after selecting current employment", async () => {
  const policy = mount();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  policy.browserPolicy.nativeForm.sections[1].fields.find((f) =>
    f.rawName.endsWith(".workingStatusCode"),
  )!.driver!.timeoutMs = 30;
  document.querySelector('[data-wrap="career"]')!.innerHTML =
    `<div class="loop" data-loop="career"><select name="career[0].careerCriteriaCodeSn"><option value=""></option></select><label><input name="career[0].workingStatusCode" type="radio" value="WORK">재직중</label><label><input name="career[0].workingStatusCode" type="radio" value="LEAVE">퇴사</label><input name="career[0].leavingDate"></div>`;
  installExecutionPolicy(document, policy);
  const snap = collectFieldsSnapshot(document);
  const field = snap.request.sections
    .flatMap((s) => s.items?.flatMap((i) => i.fields) ?? [])
    .find((f) => f.domName?.endsWith("workingStatusCode"))!;
  const lookup = snap.registry.lookupField(field.candidateId);
  if (!("handle" in lookup)) throw new Error();
  const item = {
    candidateId: field.candidateId,
    selected: true,
    disabled: false,
    profileValue: "재직중",
    analysis: {
      candidateId: field.candidateId,
      matchType: "MATCH",
      valueBinding: nativeOwnership(lookup.handle)!.field.binding,
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "CHECK_RADIO" },
    },
  } as ReviewPlanItem;
  const adapter = getWorkflowAdapter(document),
    signal = new AbortController().signal;
  expect(
    await adapter.executeStateDriver?.(document, lookup.handle, item, signal),
  ).toBe(true);
  expect(
    await adapter.settleStateDriver?.(document, lookup.handle, undefined, {
      item,
      signal,
    }),
  ).toBe(false);
  document.querySelector<HTMLInputElement>(
    '[name="career[0].leavingDate"]',
  )!.disabled = true;
  expect(
    await adapter.settleStateDriver?.(document, lookup.handle, undefined, {
      item,
      signal,
    }),
  ).toBe(true);
});

/** CF-177 C6 (F13): a visible policy-unsupported subject prints one neutral
 * line per collection; no title, reason text or page value. */
describe("unsupported section diagnostics", () => {
  const CANARY = "합성수상명CANARY";
  afterEach(() => {
    setAutofillDebugEnabled(false);
    vi.restoreAllMocks();
  });
  const award = `<section class="writeResume" data-code="18"><div class="subject" data-code="170" data-wrap="award"><div class="row loop" data-loop="award"><input type="text" name="award[0].awardName" value="${CANARY}"><button type="button" data-button="add"></button></div></div></section>`;
  const collect = (html: string) => {
    const policy = mount();
    document
      .querySelector("#wrapResume")!
      .insertAdjacentHTML("beforeend", html);
    installExecutionPolicy(document, policy);
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const snapshot = collectFieldsSnapshot(document);
    const lines = log.mock.calls.map(([line]) => line as string);
    for (const line of lines)
      expectHarnessLine(line, [CANARY, "수상", "프로필 키 없음"]);
    return { snapshot, lines };
  };
  it("prints exactly one unsupported-section line for a visible subject", () => {
    const { snapshot, lines } = collect(award);
    expect(
      lines.filter((line) => line.includes("unsupported-section")),
    ).toEqual([
      "[CareerForm] skip stage=collect key=hplace-mrs2-unsupported-170 reason=unsupported-section detail=profile-key-missing",
    ]);
    expect(JSON.stringify(snapshot.request)).not.toContain(CANARY);
    expect(
      snapshot.request.sections.some((s) => s.sectionId.includes("170")),
    ).toBe(false);
  });
  it("prints nothing without the subject", () => {
    const { lines } = collect("");
    expect(lines.join("\n")).not.toContain("unsupported-section");
  });
});
