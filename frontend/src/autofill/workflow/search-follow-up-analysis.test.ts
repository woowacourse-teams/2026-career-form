import { describe, expect, it } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type { ReviewPlanItem } from "../review/review-plan";
import type { GenericSearchFollowUp } from "./workflow-analysis-types";
import {
  completedSearchFollowUpsAreCurrent,
  rebindSearchFollowUps,
  searchFollowUpIsCurrent,
} from "./search-follow-up-analysis";

function setupFollowUp(
  id: string,
  index: number,
): {
  followUp: GenericSearchFollowUp;
  item: ReviewPlanItem;
  target: HTMLInputElement;
  grade: HTMLSelectElement;
} {
  const row = document.createElement("div");
  row.dataset.repeaterItem = "";
  const target = document.createElement("input");
  target.value = `자격 ${index}`;
  const grade = document.createElement("select");
  grade.name = "certificate-grade";
  grade.append(new Option("선택", ""), new Option("기사", "engineer"));
  row.append(target, grade);
  document.body.append(row);
  const item = {
    candidateId: `target-${id}`,
    profileEntryId: id,
    profileFieldKey: "certifications.certificate.name",
    profileValue: `자격 ${index}`,
    currentValue: `자격 ${index}`,
    fieldLabel: "자격증명",
    previewValue: `자격 ${index}`,
    status: "available",
    selected: false,
    disabled: false,
    analysis: {
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "certifications.certificate.name",
      },
    },
  } as ReviewPlanItem;
  return {
    target,
    grade,
    item,
    followUp: {
      item,
      target,
      repeatRow: row,
      controls: [grade],
      profileEntryId: id,
      profileFieldKey: "certifications.certificate.name",
      profileValue: `자격 ${index}`,
      actualValue: `자격 ${index}`,
      valid: true,
    },
  };
}

describe("completed search follow-ups", () => {
  it("rebinds every completed row so each search item remains disabled on review", () => {
    const first = setupFollowUp("cert-1", 1);
    const second = setupFollowUp("cert-2", 2);
    const fields = [
      { candidateId: first.item.candidateId, element: first.target },
      { candidateId: "grade-1", element: first.grade },
      { candidateId: second.item.candidateId, element: second.target },
      { candidateId: "grade-2", element: second.grade },
    ];
    const snapshot = {
      request: { sections: [{ fields, items: [] }] },
      registry: {
        lookupField: (candidateId: string) => {
          const field = fields.find(
            (current) => current.candidateId === candidateId,
          );
          return field
            ? {
                status: "ready" as const,
                handle: { elements: [field.element] },
              }
            : { status: "missing" as const };
        },
      },
    } as never;
    const completed = { current: [] as readonly GenericSearchFollowUp[] };

    const rebound = rebindSearchFollowUps(
      [first.followUp, second.followUp],
      [first.item, second.item],
      snapshot,
      completed,
    );

    expect(rebound?.map((item) => item.candidateId)).toEqual([
      first.item.candidateId,
      second.item.candidateId,
    ]);
    expect(completed.current).toEqual([first.followUp, second.followUp]);
  });

  it("rejects a stale completed row before granting a fresh review", () => {
    const test = setupFollowUp("cert-1", 1);
    const profile = createEmptyProfile();
    profile.certifications.push({
      id: "cert-1",
      sectionId: "certificate",
      values: { name: "자격 1" },
    });
    test.target.remove();

    expect(searchFollowUpIsCurrent(test.followUp, profile, document)).toBe(
      false,
    );
  });

  it("rejects a completed follow-up control moved to another row", () => {
    const test = setupFollowUp("cert-1", 1);
    const profile = createEmptyProfile();
    profile.certifications.push({
      id: "cert-1",
      sectionId: "certificate",
      values: { name: "자격 1" },
    });
    const otherRow = document.createElement("div");
    otherRow.dataset.repeaterItem = "";
    document.body.append(otherRow);
    otherRow.append(test.grade);

    expect(
      completedSearchFollowUpsAreCurrent([test.followUp], profile, document),
    ).toBe(false);
  });
});
