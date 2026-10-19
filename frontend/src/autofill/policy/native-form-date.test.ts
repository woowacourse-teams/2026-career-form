import { afterEach, describe, expect, it } from "vitest";
import { getWriteAdapter } from "../adapters/write";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { nativeTestItem } from "./__fixtures__/native-test-item";
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
import type { FieldsAnalyzeResponse } from "../api/types";
import type { Profile } from "../../profile/model";
afterEach(() => installExecutionPolicy(document));
describe("nativeForm dates", () => {
  it.each([
    ["YM", "2024.02"],
    ["YMD", "2024.02.29"],
  ])("formats a complete leap date for %s", (precision, expected) => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    document
      .querySelector('[name="career[0].entranceDate"]')!
      .setAttribute(
        "data-dates",
        `career[0].careerDate:${precision} forbiddenAfterToday`,
      );
    const { handle, item } = nativeTestItem("entranceDate", "2024-02-29");
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(handle.elements[0].value).toBe(expected);
  });
  it.each(["2023-02-29", "2024-13-01", "9999-01-01"])(
    "rejects invalid or future date %s",
    (value) => {
      mountSyntheticNative();
      installExecutionPolicy(document, syntheticNativePolicy());
      const { handle, item } = nativeTestItem("entranceDate", value);
      expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
        handled: true,
        written: false,
      });
    },
  );
  it("rejects unknown date precision and reversed period", () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem("leavingDate", "2023-02-01");
    (
      document.querySelector(
        '[name="career[0].entranceDate"]',
      ) as HTMLInputElement
    ).value = "2024.01";
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  });
});

/** Education dates (CF-177 C5): the policy accepts the section's YM or YMD
 * precision token. Synthetic values only. */
function educationReviewAll(profile: Profile) {
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
/** `section` is college | graduateSchool | highschool; first row or entity. */
function educationControl(section: string, name: string, profile: Profile) {
  const state = educationReviewAll(profile);
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
function writeEducation(section: string, name: string, profile: Profile) {
  const { handle, item } = educationControl(section, name, profile);
  return {
    result: nativeWriteAdapter.tryWrite(handle, item),
    value: handle.elements[0].value,
  };
}
function datedProfile(): Profile {
  const profile = educationProfile();
  profile.education = [highschoolEntry(), ...profile.education];
  profile.education[1].values.startDate = "2013-03-01";
  profile.education[1].values.endDate = "2017-02-10";
  profile.education[3].values.endDate = "2025-02-20";
  return profile;
}
describe("nativeForm education dates", () => {
  afterEach(() => {
    disposeLinkedForms();
    document.body.replaceChildren();
  });
  it.each([
    ["YM", "2013.03", "2017.02"],
    ["YMD", "2013.03.01", "2017.02.10"],
  ] as const)(
    "writes college dates for the %s section token",
    (format, entrance, graduation) => {
      mountEducation(1, 1, false, { dateInputFormat: format });
      const profile = datedProfile();
      expect(writeEducation("college", "entranceDate", profile)).toEqual({
        result: { handled: true, written: true },
        value: entrance,
      });
      expect(writeEducation("college", "graduationDate", profile)).toEqual({
        result: { handled: true, written: true },
        value: graduation,
      });
    },
  );
  it.each([
    ["YM", "2023.03", "2025.02"],
    ["YMD", "2023.03.01", "2025.02.20"],
  ] as const)(
    "writes graduate school dates for the %s section token",
    (format, entrance, graduation) => {
      mountEducation(1, 1, false, { dateInputFormat: format });
      const profile = datedProfile();
      expect(writeEducation("graduateSchool", "entranceDate", profile)).toEqual(
        {
          result: { handled: true, written: true },
          value: entrance,
        },
      );
      expect(
        writeEducation("graduateSchool", "graduationDate", profile),
      ).toEqual({
        result: { handled: true, written: true },
        value: graduation,
      });
    },
  );
  it.each([
    ["YM", "2016.03", "2019.02"],
    ["YMD", "2016.03.01", "2019.02.01"],
  ] as const)(
    "writes high-school dates for the %s token with its two-space separator",
    (format, entrance, graduation) => {
      mountEducation(1, 1, false, {
        dateInputFormat: format,
        highschool: {},
      });
      expect(
        document
          .querySelector('[name="highschool.entranceDate"]')!
          .getAttribute("data-dates"),
      ).toBe(`highschoolDate:${format}  highschool graduationCriteriaDate`);
      const profile = datedProfile();
      expect(
        writeEducation("highschool", "graduationTypeCode", profile).result,
      ).toEqual({ handled: true, written: true });
      expect(writeEducation("highschool", "entranceDate", profile)).toEqual({
        result: { handled: true, written: true },
        value: entrance,
      });
      expect(writeEducation("highschool", "graduationDate", profile)).toEqual({
        result: { handled: true, written: true },
        value: graduation,
      });
    },
  );
  it.each([
    ["2017.02.28", true, "2017.02.10"],
    ["2017.02.05", false, ""],
  ] as const)(
    "applies the YMD max graduation date %s",
    (max, written, value) => {
      mountEducation(1, 1, false, { dateInputFormat: "YMD" });
      document
        .querySelector("[data-loop=college]")!
        .insertAdjacentHTML(
          "beforeend",
          `<div class="row in-span"><div class="msg"><strong>${max}</strong></div></div>`,
        );
      expect(
        writeEducation("college", "graduationDate", datedProfile()),
      ).toEqual({ result: { handled: true, written }, value });
    },
  );
});
