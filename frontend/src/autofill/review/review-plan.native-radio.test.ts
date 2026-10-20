import { afterEach, describe, expect, it } from "vitest";
import {
  educationProfile,
  highschoolEntry,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import {
  careerEntries,
  mountCareer,
} from "../policy/__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import {
  nativeValueMatches,
  nativeWriteAdapter,
} from "../policy/native-form-write";
import { nativeOwnership } from "../policy/native-form-collection";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "./review-plan";
import { installExecutionPolicy } from "../workflow/execution-policy";
import type { FieldsAnalyzeResponse } from "../api/types";
import type { Profile } from "../../profile/model";

afterEach(() => {
  disposeLinkedForms();
  document.body.replaceChildren();
  installExecutionPolicy(document);
});

/** Adapter-verified analysis for every native control, including the
 * single-entity section fields (educationReview only maps repeated rows). */
function review(profile: Profile) {
  const snapshot = collectFieldsSnapshot(document);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: snapshot.request.sections
      .flatMap((s) => [
        ...(s.fields ?? []),
        ...(s.items?.flatMap((i) => i.fields) ?? []),
      ])
      .map((f) => {
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
  return {
    snapshot,
    review: buildReviewPlan({ registry: snapshot.registry, profile, analysis }),
  };
}

/** Reviews the page and returns one native control of the first row (or the
 * single entity). `name` is the policy field suffix, e.g. `degreeTypeCode`. */
function reviewed(section: string, name: string, profile: Profile) {
  const state = review(profile);
  const domName = `hplace.mrs2.${section}.${name}`;
  const request = state.snapshot.request.sections.find(
    (s) => s.sectionId === `hplace-mrs2-${section}`,
  );
  const candidate = [
    ...(request?.fields ?? []),
    ...(request?.items?.[0]?.fields ?? []),
  ].find((f) => f.domName === domName);
  if (!candidate) throw new Error(`missing ${domName}`);
  const lookup = state.snapshot.registry.lookupField(candidate.candidateId);
  if (!("handle" in lookup)) throw new Error(`no handle ${domName}`);
  return {
    handle: lookup.handle,
    item: state.review.items.find(
      (i) => i.candidateId === candidate.candidateId,
    )!,
  };
}

/** Writes one control with the run's own adapter, then reviews it again. */
function writeThenReview(section: string, name: string, profile: Profile) {
  const first = reviewed(section, name, profile);
  expect(first.item.status).toBe("available");
  expect(nativeWriteAdapter.tryWrite(first.handle, first.item)).toEqual({
    handled: true,
    written: true,
  });
  return reviewed(section, name, profile);
}

const radio = (name: string, value: string) =>
  document.querySelector<HTMLInputElement>(
    `[name="${name}"][value="${value}"]`,
  )!;

function highschoolProfile() {
  const profile = educationProfile();
  profile.education = [highschoolEntry(), ...profile.education];
  return profile;
}

function careerProfile() {
  const profile = educationProfile();
  profile.education = [];
  profile.careers = careerEntries();
  return profile;
}

describe("native radio currentValue after the run's own write", () => {
  it("reads the checked degree as its policy label", () => {
    mountEducation(1);
    const profile = educationProfile();
    const again = writeThenReview("college", "degreeTypeCode", profile);
    expect(radio("college[0].degreeTypeCode", "50").checked).toBe(true);
    expect(again.item).toMatchObject({
      status: "available",
      currentValue: "학사",
      profileValue: "학사",
    });
    expect(nativeValueMatches(again.handle, again.item)).toBe(true);
  });

  it("reads the high-school graduation written over the 작성안함 default", () => {
    mountEducation(1, 1, false, { highschool: { emptyRadio: true } });
    radio("highschool.graduationTypeCode", "").checked = true;
    const again = writeThenReview(
      "highschool",
      "graduationTypeCode",
      highschoolProfile(),
    );
    expect(radio("highschool.graduationTypeCode", "01").checked).toBe(true);
    expect(again.item).toMatchObject({
      status: "available",
      currentValue: "졸업",
    });
  });

  it("reads the career working status as its policy label", () => {
    mountCareer(1);
    const profile = careerProfile();
    writeThenReview("career", "careerCriteriaCodeSn", profile);
    const again = writeThenReview("career", "workingStatusCode", profile);
    expect(radio("career[0].workingStatusCode", "LEAVE").checked).toBe(true);
    expect(again.item).toMatchObject({
      status: "available",
      currentValue: "퇴사",
    });
  });
});

describe("native radio currentValue keeps conflicts and identity guards", () => {
  it("keeps the raw code when the checked label no longer maps to it", () => {
    mountEducation(1);
    const profile = educationProfile();
    writeThenReview("college", "degreeTypeCode", profile);
    const label = radio("college[0].degreeTypeCode", "50").labels![0];
    label.lastChild!.textContent = "전문학사";
    expect(reviewed("college", "degreeTypeCode", profile).item).toMatchObject({
      status: "conflict",
      currentValue: "50",
    });
  });

  it("leaves a manual check without a receipt unavailable", () => {
    mountEducation(1);
    radio("college[0].degreeTypeCode", "50").checked = true;
    expect(
      reviewed("college", "degreeTypeCode", educationProfile()).item,
    ).toMatchObject({ status: "unavailable", selected: false });
  });

  it("keeps the 작성안함 empty value as empty", () => {
    mountEducation(1, 1, false, { highschool: { emptyRadio: true } });
    radio("highschool.graduationTypeCode", "").checked = true;
    expect(
      reviewed("highschool", "graduationTypeCode", highschoolProfile()).item,
    ).toMatchObject({ status: "available", currentValue: "" });
  });

  it("matches the label by normalized text with NBSP and repeated spaces", () => {
    mountEducation(1);
    const profile = educationProfile();
    writeThenReview("college", "degreeTypeCode", profile);
    radio("college[0].degreeTypeCode", "50").labels![0].lastChild!.textContent =
      " 학사   ";
    expect(reviewed("college", "degreeTypeCode", profile).item).toMatchObject({
      status: "available",
      currentValue: "학사",
    });
  });
});
