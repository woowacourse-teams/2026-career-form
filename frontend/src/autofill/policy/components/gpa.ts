import { componentRules, componentName, namedSelector } from "../runtime-rules";
import { componentPolicy, componentCapability } from "../component-policy";
import { executionPolicy } from "../../workflow/execution-policy";
import type { CandidateRegistry } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

export interface ComponentGpaApproval {
  rowName: string;
  score: string;
  scale: string;
}
const gpaName = (handle?: FieldCandidateHandle) => {
  const document = (handle?.elements[0] ?? handle?.customElements?.[0])
    ?.ownerDocument;
  const pattern =
    document &&
    componentCapability(document, "pairedNumber") &&
    executionPolicy(document)?.componentPolicy?.patterns.gpa;
  return new RegExp(pattern || "(?!)");
};
const number = (value: string) =>
  /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;

/** Resolve both values locally from the same reviewed profile entry. */
export function approveComponentGpaPairs(
  items: ReviewPlanItem[],
  registry: CandidateRegistry,
): ReviewPlanItem[] {
  const names = new Map<string, ReviewPlanItem[]>();
  for (const item of items) {
    const lookup = registry.lookupField(item.candidateId);
    const name =
      "handle" in lookup ? lookup.handle.candidate.domName : undefined;
    if (
      name &&
      gpaName("handle" in lookup ? lookup.handle : undefined).test(name)
    )
      names.set(name, [...(names.get(name) ?? []), item]);
  }
  return items.map((item) => {
    const lookup = registry.lookupField(item.candidateId);
    const name =
      "handle" in lookup ? lookup.handle.candidate.domName : undefined;
    const match = name?.match(
      gpaName("handle" in lookup ? lookup.handle : undefined),
    );
    if (!match) return item;
    const handle = "handle" in lookup ? lookup.handle : undefined;
    const document = (handle?.elements[0] ?? handle?.customElements?.[0])!
      .ownerDocument;
    if (!componentRules(document).gpa.requirePair) return item;
    const pair = componentPolicy(document).gpa;
    const rowName = match[1];
    const scores =
      names.get(componentName(document, rowName, pair.scoreSuffix)) ?? [];
    const scales =
      names.get(componentName(document, rowName, pair.scaleSuffix)) ?? [];
    const score = scores[0];
    const scale = scales[0];
    if (
      scores.length !== 1 ||
      scales.length !== 1 ||
      !score.profileValue ||
      !scale.profileValue ||
      score.disabled ||
      scale.disabled ||
      !score.profileEntryId ||
      score.profileEntryId !== scale.profileEntryId ||
      score.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
      scale.analysis?.mappingStatus !== "ADAPTER_VERIFIED" ||
      !Number.isFinite(number(score.profileValue)) ||
      !(number(scale.profileValue) > 0) ||
      number(score.profileValue) > number(scale.profileValue)
    ) {
      return {
        ...item,
        selected: false,
        disabled: true,
        status: "unavailable",
        reason:
          "평점과 만점기준을 같은 프로필 항목에서 함께 확인할 수 없어 자동 기입하지 않았습니다.",
      };
    }
    return {
      ...item,
      componentGpaApproval: {
        rowName,
        score: score.profileValue,
        scale: scale.profileValue,
      },
    };
  });
}

/** A score is writable only after its scale is selected; a scale preserves an existing score. */
export function componentGpaSafe(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const match = handle.candidate.domName?.match(gpaName(handle));
  if (!match) return true;
  const approval = item.componentGpaApproval;
  const document = (handle.elements[0] ?? handle.customElements?.[0])
    ?.ownerDocument;
  if (!document) return false;
  if (!componentRules(document).gpa.requirePair) return true;
  if (!approval || approval.rowName !== match[1]) return false;
  const pair = componentPolicy(document).gpa;
  const scores = document.querySelectorAll<HTMLInputElement>(
    namedSelector(
      componentRules(document).gpa.scoreSelector,
      componentName(document, approval.rowName, pair.scoreSuffix),
    ),
  );
  const scales = document.querySelectorAll<HTMLButtonElement>(
    namedSelector(
      componentRules(document).gpa.scaleSelector,
      componentName(document, approval.rowName, pair.scaleSuffix),
    ),
  );
  if (
    scores.length !== 1 ||
    scales.length !== 1 ||
    scores[0].disabled ||
    scores[0].readOnly ||
    scales[0].disabled
  )
    return false;
  const score = scores[0].value.trim();
  const scaleText = scales[0].textContent?.trim() ?? "";
  const placeholder = componentPolicy(
    document,
  ).widget.placeholderAttributes.some((name) => {
    const marker = scales[0].getAttribute(name);
    return marker !== null && marker !== "false";
  });
  const scale = placeholder || scaleText === pair.placeholder ? "" : scaleText;
  if (
    (score && number(score) !== number(approval.score)) ||
    (scale && number(scale) !== number(approval.scale))
  )
    return false;
  return (
    !componentRules(document).gpa.scaleBeforeScore ||
    match[2] === pair.scalePart ||
    number(scale) === number(approval.scale)
  );
}
