import { afterEach, expect, it } from "vitest";
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
