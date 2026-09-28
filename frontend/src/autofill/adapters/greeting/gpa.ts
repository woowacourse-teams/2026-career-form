import type { CandidateRegistry } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";

export interface GreetingGpaApproval {
  rowName: string;
  score: string;
  scale: string;
}
const gpaName =
  /^(educationalBackground\.(?:universities|graduateSchools)\.(?:0|[1-9]\d*))\.gpa\.(score|scoreScale)$/;
const number = (value: string) =>
  /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;

/** Resolve both values locally from the same reviewed profile entry. */
export function approveGreetingGpaPairs(
  items: ReviewPlanItem[],
  registry: CandidateRegistry,
): ReviewPlanItem[] {
  const names = new Map<string, ReviewPlanItem[]>();
  for (const item of items) {
    const lookup = registry.lookupField(item.candidateId);
    const name =
      "handle" in lookup ? lookup.handle.candidate.domName : undefined;
    if (name && gpaName.test(name))
      names.set(name, [...(names.get(name) ?? []), item]);
  }
  return items.map((item) => {
    const lookup = registry.lookupField(item.candidateId);
    const name =
      "handle" in lookup ? lookup.handle.candidate.domName : undefined;
    const match = name?.match(gpaName);
    if (!match) return item;
    const rowName = match[1];
    const scores = names.get(`${rowName}.gpa.score`) ?? [];
    const scales = names.get(`${rowName}.gpa.scoreScale`) ?? [];
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
      greetingGpaApproval: {
        rowName,
        score: score.profileValue,
        scale: scale.profileValue,
      },
    };
  });
}

/** A score is writable only after its scale is selected; a scale preserves an existing score. */
export function greetingGpaSafe(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
): boolean {
  const match = handle.candidate.domName?.match(gpaName);
  if (!match) return true;
  const approval = item.greetingGpaApproval;
  const document = (handle.elements[0] ?? handle.customElements?.[0])
    ?.ownerDocument;
  if (!approval || approval.rowName !== match[1] || !document) return false;
  const scores = document.querySelectorAll<HTMLInputElement>(
    `input[name="${approval.rowName}.gpa.score"]`,
  );
  const scales = document.querySelectorAll<HTMLButtonElement>(
    `button[name="${approval.rowName}.gpa.scoreScale"]`,
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
  const placeholder = ["data-placeholder", "data-placeholder-shown"].some(
    (name) => {
      const marker = scales[0].getAttribute(name);
      return marker !== null && marker !== "false";
    },
  );
  const scale = placeholder || scaleText === "선택" ? "" : scaleText;
  if (
    (score && number(score) !== number(approval.score)) ||
    (scale && number(scale) !== number(approval.scale))
  )
    return false;
  return match[2] === "scoreScale" || number(scale) === number(approval.scale);
}
