import { collectFieldsSnapshot } from "../../dom/collect";
import type { ReviewPlanItem } from "../../review/review-plan";
import { syntheticNativePolicy } from "./hplace-mrs2-native.synthetic";
export function nativeTestItem(
  suffix: string,
  value: string,
  command = "SET_TEXT",
) {
  const snap = collectFieldsSnapshot(document);
  const field = snap.request.sections
    .flatMap((s) => [...s.fields, ...(s.items ?? []).flatMap((i) => i.fields)])
    .find((f) => f.domName?.endsWith(suffix))!;
  const lookup = snap.registry.lookupField(field.candidateId);
  if (!("handle" in lookup)) throw new Error("fixture target missing");
  const policy = syntheticNativePolicy().browserPolicy!;
  const rule =
    policy.schemaVersion === 2
      ? policy.nativeForm.sections
          .flatMap((s) => s.fields)
          .find((f) => f.name === field.domName)!
      : undefined;
  const item = {
    candidateId: field.candidateId,
    selected: true,
    disabled: false,
    profileValue: value,
    analysis: {
      candidateId: field.candidateId,
      matchType: "MATCH",
      valueBinding: rule!.binding,
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command },
    },
  } as ReviewPlanItem;
  return { handle: lookup.handle, item, snap };
}
