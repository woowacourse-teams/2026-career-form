import { afterEach, describe, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import { MILITARY_BRANCH_OPTIONS } from "../../profile/standard-values";
import { createEmptyProfile, type Profile } from "../../profile/model";
import { resolveValueBinding } from "../profile/value-binding";
import { collectFieldsSnapshot } from "../dom/collect";
import { getWriteAdapter } from "../adapters/write";
import type { NativeField } from "./native-form-contract";
import { nativeOwnership } from "./native-form-collection";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import { mountSyntheticNative } from "./__fixtures__/hplace-mrs2-native.synthetic";
import { mountCareer } from "./__fixtures__/hplace-mrs2-career.synthetic";
import {
  educationProfile,
  mountEducation,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "./__fixtures__/hplace-mrs2-linked-form";
import { nativeRepeatableProfileCount } from "./native-form-row-assignment";
import { buildReviewPlan } from "../review/review-plan";
import type { FieldsAnalyzeResponse } from "../api/types";
afterEach(() => installExecutionPolicy(document));
function mount() {
  mountSyntheticNative(0);
  document.querySelectorAll("script").forEach((s, i) => {
    s.src = seed.executionPolicy.browserPolicy.nativeForm.assetPaths[i];
  });
  installExecutionPolicy(
    document,
    structuredClone(seed.executionPolicy) as ExecutionPolicy,
  );
}
function write(suffix: string, profile: Profile) {
  const snapshot = collectFieldsSnapshot(document),
    field = snapshot.request.sections
      .flatMap((s) => [
        ...s.fields,
        ...(s.items ?? []).flatMap((i) => i.fields),
      ])
      .find((f) => f.domName?.endsWith(suffix))!;
  const lookup = snapshot.registry.lookupField(field.candidateId);
  if (!("handle" in lookup)) throw new Error("missing control");
  const binding = nativeOwnership(lookup.handle)!.field.binding;
  const resolved = resolveValueBinding(profile, binding, 0);
  expect(resolved.status).toBe("resolved");
  const item = {
    candidateId: field.candidateId,
    selected: true,
    disabled: false,
    profileValue: resolved.status === "resolved" ? resolved.value : undefined,
    analysis: {
      candidateId: field.candidateId,
      matchType: "MATCH",
      valueBinding: binding,
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
const employment = PROFILE_CATEGORIES.find((c) => c.id === "careers")!
  .sections.find((s) => s.id === "career")!
  .fields.find((f) => f.id === "employmentType")!;
if (!("options" in employment) || !employment.options) throw new Error();
it.each(
  employment.options.map((value) =>
    typeof value === "string" ? value : value.value,
  ),
)(
  "maps actual employment profile option %s to a pinned tenant label",
  (value) => {
    mount();
    const labels = [
      "정규직",
      "계약직",
      "파견직",
      "프리랜서",
      "개인사업",
      "병역특례",
      "인턴",
      "아르바이트",
      "기타",
    ];
    document.querySelector('[data-wrap="career"]')!.innerHTML =
      `<div class="loop" data-loop="career"><select name="career[0].careerCriteriaCodeSn"><option value=""></option>${labels.map((label, i) => `<option value="${205586 + i}">${label}</option>`).join("")}</select><input name="career[0].company" maxlength="128"></div>`;
    const profile = createEmptyProfile();
    profile.careers.push({
      id: "synthetic-career",
      sectionId: "career",
      values: {
        employmentType: value,
      },
    });
    write("careerCriteriaCodeSn", profile);
  },
);
it.each(MILITARY_BRANCH_OPTIONS)(
  "maps standard military $label to its verified site code",
  ({ value }) => {
    mount();
    const options = (
      seed.executionPolicy.browserPolicy.nativeForm.sections[0]
        .fields as unknown as NativeField[]
    ).find((f) => f.name.endsWith("militaryBranchCode"))!.options!;
    document.querySelector("#wrapResume")!.insertAdjacentHTML(
      "beforeend",
      `<section class="writeResume" data-code="13"><select name="military.militaryBranchCode"><option value=""></option>${Object.entries(
        options,
      )
        .map(([label, code]) => `<option value="${code}">${label}</option>`)
        .join("")}</select></section>`,
    );
    const profile = createEmptyProfile();
    profile.military.militaryBranch = value;
    write("militaryBranchCode", profile);
  },
);

/* CF-177 C9 (F8): the review checks the tenant's option catalog before a
 * native select/radio is planned. Synthetic labels, virtual Sn codes. */
function reviewAll(profile: Profile) {
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((s) => [
    ...s.fields,
    ...(s.items ?? []).flatMap((i) => i.fields),
  ]);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: fields.map((f) => {
      const lookup = snapshot.registry.lookupField(f.candidateId);
      if (!("handle" in lookup)) throw new Error("no handle");
      return {
        candidateId: f.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        valueBinding: nativeOwnership(lookup.handle)!.field.binding,
        writePlan: {
          command:
            f.control === "select"
              ? "SELECT_OPTION"
              : f.control === "radio"
                ? "CHECK_RADIO"
                : "SET_TEXT",
        },
      };
    }),
  };
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis,
  });
  return { snapshot, plan };
}
function reviewedControl(profile: Profile, rawName: string) {
  const { snapshot, plan } = reviewAll(profile);
  const item = plan.items.find((i) => {
    const lookup = snapshot.registry.lookupField(i.candidateId);
    return (
      "handle" in lookup &&
      lookup.handle.elements[0]?.getAttribute("name") === rawName
    );
  });
  if (!item) throw new Error(`missing ${rawName}`);
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (!("handle" in lookup)) throw new Error("no handle");
  return { item, handle: lookup.handle, plan };
}
function careerProfile(...types: string[]) {
  const profile = createEmptyProfile();
  profile.careers = types.map((employmentType, i) => ({
    id: `synthetic-career-${i}`,
    sectionId: "career",
    values: {
      companyName: `합성회사 ${i}`,
      employmentType,
      startDate: "2020-01-01",
    },
  }));
  return profile;
}
describe("tenant option catalog in the review", () => {
  afterEach(() => {
    disposeLinkedForms();
    document.body.replaceChildren();
  });

  it.each(["아르바이트", "기타"])(
    "marks %s, absent from the seven-label tenant, as OPTION_UNMATCHED",
    (value) => {
      mountCareer(1, { labels: "seven" });
      const { item } = reviewedControl(
        careerProfile(value),
        "career[0].careerCriteriaCodeSn",
      );
      expect(item).toMatchObject({
        status: "unavailable",
        selected: false,
        disabled: true,
        failureCode: "OPTION_UNMATCHED",
        profileEntryId: "synthetic-career-0",
        itemIndex: 0,
        profileValue: value,
      });
    },
  );

  it.each(["정규", "계약", "파견", "프리랜서", "개인사업", "병역특례", "인턴"])(
    "still writes %s, which the seven-label tenant offers",
    (value) => {
      mountCareer(1, { labels: "seven" });
      const { item, handle } = reviewedControl(
        careerProfile(value),
        "career[0].careerCriteriaCodeSn",
      );
      expect(item).toMatchObject({ status: "available", selected: true });
      expect(item.failureCode).toBeUndefined();
      expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
        handled: true,
        written: true,
      });
    },
  );

  it("marks an integrated degree on a master/doctor-only radio as OPTION_UNMATCHED", () => {
    mountEducation(1, 1, false, { liveGating: true });
    const profile = educationProfile();
    profile.education.find(
      (e) => e.sectionId === "graduateSchool",
    )!.values.degreeLevel = "석박사통합";
    const { item } = reviewedControl(
      profile,
      "graduateSchool[0].degreeTypeCode",
    );
    expect(item).toMatchObject({
      status: "unavailable",
      selected: false,
      failureCode: "OPTION_UNMATCHED",
      profileEntryId: "graduate-a",
      itemIndex: 0,
    });
  });

  it("keeps a disabled offered option a structural refusal without a profile code", () => {
    mountCareer(1, { labels: "seven" });
    const select = document.querySelector<HTMLSelectElement>(
      '[name="career[0].careerCriteriaCodeSn"]',
    )!;
    Array.from(select.options).find((o) => o.textContent === "인턴")!.disabled =
      true;
    const { item } = reviewedControl(
      careerProfile("인턴"),
      "career[0].careerCriteriaCodeSn",
    );
    expect(item).toMatchObject({ status: "unavailable", selected: false });
    expect(item.failureCode).toBeUndefined();
  });

  it("does not add a career row for an employment type the tenant does not offer", () => {
    mountCareer(1, { labels: "seven" });
    expect(
      nativeRepeatableProfileCount(
        document,
        "hplace.mrs2.career.add",
        careerProfile("정규", "아르바이트"),
      ),
    ).toBe(1);
  });

  it("still counts every career on a tenant that offers every type", () => {
    mountCareer(1);
    expect(
      nativeRepeatableProfileCount(
        document,
        "hplace.mrs2.career.add",
        careerProfile("정규", "아르바이트"),
      ),
    ).toBe(2);
  });

  it("assigns offered careers to rows in order and reports the rest once", () => {
    mountCareer(2, { labels: "seven" });
    const profile = careerProfile("아르바이트", "정규", "계약");
    const { plan } = reviewAll(profile);
    const row0 = reviewedControl(profile, "career[0].careerCriteriaCodeSn");
    const row1 = reviewedControl(profile, "career[1].careerCriteriaCodeSn");
    expect(row0.item).toMatchObject({
      status: "available",
      profileEntryId: "synthetic-career-1",
    });
    expect(row1.item).toMatchObject({
      status: "available",
      profileEntryId: "synthetic-career-2",
    });
    const unoffered = plan.items.filter(
      (i) => i.failureCode === "OPTION_UNMATCHED",
    );
    expect(unoffered).toHaveLength(1);
    expect(unoffered[0]).toMatchObject({
      status: "unavailable",
      selected: false,
      disabled: true,
      profileFieldKey: "careers.career.employmentType",
      profileEntryId: "synthetic-career-0",
      itemIndex: 0,
      profileValue: "아르바이트",
    });
    expect(unoffered[0].candidateId).not.toMatch(/아르바이트|합성회사/);
  });
});
