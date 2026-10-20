import { afterEach, expect, it } from "vitest";
import {
  educationProfile,
  mountEducation,
} from "../policy/__fixtures__/hplace-mrs2-education.synthetic";
import { disposeLinkedForms } from "../policy/__fixtures__/hplace-mrs2-linked-form";
import { nativeOwnership } from "../policy/native-form-collection";
import { nativeWriteAdapter } from "../policy/native-form-write";
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

function reviewed(name: string, profile: Profile) {
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
          command: f.control === "select" ? "SELECT_OPTION" : "SET_TEXT",
        },
      };
    }),
  };
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis,
  });
  const candidate = fields.find(
    (f) => f.domName === `hplace.mrs2.college.${name}`,
  );
  if (!candidate) throw new Error(`missing ${name}`);
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (!("handle" in lookup)) throw new Error("no handle");
  return {
    handle: lookup.handle,
    item: plan.items.find((i) => i.candidateId === candidate.candidateId)!,
  };
}

/** Writes the score with the run's own adapter, then reviews the page again. */
function writtenScore(profileScore: string) {
  mountEducation(1);
  const profile = educationProfile();
  profile.education[0].values.gpaScore = profileScore;
  const first = reviewed("score", profile);
  expect(first.item.status).toBe("available");
  expect(nativeWriteAdapter.tryWrite(first.handle, first.item)).toEqual({
    handled: true,
    written: true,
  });
  return { profile, score: first.handle.elements[0] as HTMLInputElement };
}

it.each(["3.750", "4.000", "3.75"])(
  "does not report the run's own normalized score write of %s as an existing value",
  (profileScore) => {
    const { profile, score } = writtenScore(profileScore);
    expect(score.value).toBe(String(Number(profileScore)));
    expect(reviewed("score", profile).item.status).toBe("available");
  },
);

it("never treats a different decimal as the run's own write", () => {
  const { profile, score } = writtenScore("3.750");
  score.value = "3.7";
  const { item } = reviewed("score", profile);
  expect([item.status === "available", item.selected]).toEqual([false, false]);
});
