import { afterEach, expect, it } from "vitest";
import {
  careerEntries,
  mountCareer,
} from "../policy/__fixtures__/hplace-mrs2-career.synthetic";
import { educationProfile } from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import { nativeOwnership } from "../policy/native-form-collection";
import { nativeWriteAdapter } from "../policy/native-form-write";
import type { Profile } from "../../profile/model";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "./review-plan";
import { savedResultValues } from "../workflow/result-preview";
import { installExecutionPolicy } from "../workflow/execution-policy";
import type { FieldsAnalyzeResponse } from "../api/types";

afterEach(() => {
  disposeLinkedForms();
  document.body.replaceChildren();
  installExecutionPolicy(document);
});

function review(profile: Profile) {
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((s) => [
    ...(s.fields ?? []),
    ...(s.items?.flatMap((i) => i.fields) ?? []),
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
  return plan.items.flatMap((item) => {
    const lookup = snapshot.registry.lookupField(item.candidateId);
    return "handle" in lookup
      ? [
          {
            item,
            handle: lookup.handle,
            name: (lookup.handle.elements[0] as HTMLInputElement).name,
          },
        ]
      : [];
  });
}

function reviewedByName(rawName: string) {
  mountCareer(2);
  const profile = educationProfile();
  profile.education = [];
  profile.careers = careerEntries();
  // The run chooses each row's employment type first; the site then enables the row.
  for (const { item, handle } of review(profile))
    expect(nativeWriteAdapter.tryWrite(handle, item)).toMatchObject({
      written: true,
    });
  document
    .querySelectorAll<HTMLInputElement>('[data-rel-target^="career["]')
    .forEach((e) => (e.disabled = false));
  const found = review(profile).find((r) => r.name === rawName);
  if (!found) throw new Error(`missing ${rawName}`);
  return { item: found.item, profile };
}

it("keeps an unfilled row's own entry so another row's value is not its saved value", () => {
  const { item, profile } = reviewedByName("career[1].retirementReason");
  expect(item).toMatchObject({ status: "unavailable", itemIndex: 1 });
  expect(savedResultValues(item, profile)).toEqual([]);
});

it("still resolves the row that has the value", () => {
  const { item, profile } = reviewedByName("career[0].retirementReason");
  expect(item.status).toBe("available");
  expect(savedResultValues(item, profile)).toEqual([
    { value: "가상 퇴직사유", sensitive: false },
  ]);
});
