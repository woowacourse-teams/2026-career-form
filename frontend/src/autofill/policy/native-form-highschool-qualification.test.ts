/**
 * CF-177 C9 (F8): a 대입 검정고시 profile is not a high-school graduation.
 * The policy deliberately leaves the site's 08 검정고시 radio out, so the
 * high-school section fails closed for that profile instead of checking
 * 01 졸업. Live-shaped section 140 (six radios with 08, none checked, no
 * 작성안함); synthetic values only.
 */
import { afterEach, expect, it } from "vitest";
import {
  educationProfile,
  highschoolEntry,
  mountEducation,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "./__fixtures__/hplace-mrs2-linked-form";
import { nativeOwnership } from "./native-form-collection";
import { nativeWriteAdapter } from "./native-form-write";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { installExecutionPolicy } from "../workflow/execution-policy";
import type { FieldsAnalyzeResponse } from "../api/types";
import type { Profile } from "../../profile/model";

afterEach(() => {
  disposeLinkedForms();
  document.body.replaceChildren();
  installExecutionPolicy(document);
});

function highschoolItems(profile: Profile) {
  const snapshot = collectFieldsSnapshot(document);
  const section = snapshot.request.sections.find(
    (s) => s.sectionId === "hplace-mrs2-highschool",
  );
  if (!section) throw new Error("high-school section not collected");
  const fields = [
    ...section.fields,
    ...(section.items ?? []).flatMap((i) => i.fields),
  ];
  const handles = new Map(
    fields.map((f) => {
      const lookup = snapshot.registry.lookupField(f.candidateId);
      if (!("handle" in lookup)) throw new Error("no handle");
      return [f.candidateId, lookup.handle] as const;
    }),
  );
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: fields.map((f) => ({
      candidateId: f.candidateId,
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      autofillPolicy: "ALLOWED",
      valueBinding: nativeOwnership(handles.get(f.candidateId)!)!.field.binding,
      writePlan: {
        command:
          f.control === "select"
            ? "SELECT_OPTION"
            : f.control === "radio"
              ? "CHECK_RADIO"
              : "SET_TEXT",
      },
    })),
  };
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis,
  });
  return plan.items.map((item) => ({
    item,
    handle: handles.get(item.candidateId)!,
  }));
}

function profileWith(values: Record<string, string>): Profile {
  const profile = educationProfile();
  const highschool = highschoolEntry();
  Object.assign(highschool.values, values);
  profile.education = [highschool, ...profile.education];
  return profile;
}

/** Runs every planned high-school write as the run would. */
function runPlanned(profile: Profile) {
  const items = highschoolItems(profile);
  for (const { item, handle } of items)
    if (item.status === "available" && item.selected)
      nativeWriteAdapter.tryWrite(handle, item);
  return items;
}

const graduation = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(
      '[name="highschool.graduationTypeCode"]',
    ),
  );

it("fails the high-school section closed for a 대입 검정고시 profile", () => {
  mountEducation(1, 1, false, { highschool: {} });
  expect(graduation().map((r) => r.value)).toEqual([
    "01",
    "02",
    "04",
    "05",
    "07",
    "08",
  ]);
  const profile = profileWith({
    academicProcess: "대입 검정고시",
    completionStatus: "졸업",
    qualificationPassDate: "2018-08-01",
  });

  const items = runPlanned(profile);

  expect(graduation().filter((r) => r.checked)).toEqual([]);
  expect(items.length).toBeGreaterThan(0);
  for (const { item } of items) {
    expect(item).toMatchObject({
      status: "unavailable",
      selected: false,
      disabled: true,
    });
    expect(item.reason).toMatch(/검정고시/);
    // The reason is fixed text: no profile value leaks into it.
    expect(item.reason).not.toMatch(/합성고등학교|서울|2018|2016|2019/);
  }
});

it("still checks 01 졸업 for an ordinary high-school graduation", () => {
  mountEducation(1, 1, false, { highschool: {} });
  const items = runPlanned(
    profileWith({ academicProcess: "고등학교", completionStatus: "졸업" }),
  );
  expect(
    graduation()
      .filter((r) => r.checked)
      .map((r) => r.value),
  ).toEqual(["01"]);
  const driver = items.find(
    ({ handle }) =>
      handle.elements[0]?.getAttribute("name") ===
      "highschool.graduationTypeCode",
  );
  expect(driver?.item.status).toBe("available");
});
