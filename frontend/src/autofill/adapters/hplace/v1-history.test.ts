import { afterEach, describe, expect, it } from "vitest";
import type { PreparationPlan } from "../../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../../dom/collect";
import type { FieldCandidateHandle } from "../../dom/types";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../../preparation/executor";
import type { ReviewPlanItem } from "../../review/review-plan";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { isUnsupportedHplace } from "../company";
import { getWorkflowAdapter } from "../workflow";
import { mountV1Step1 } from "./v1-basic.test-fixtures";
import {
  isV1HistoryPage,
  v1HistoryControls,
  v1HistoryLevels,
} from "./v1-history-controls";
import { v1HistoryGpaBlocked, writeV1History } from "./v1-history-write";
import {
  addControl,
  appendCard,
  card,
  cardDropdown,
  cardInput,
  cardNamed,
  cardRow,
  cardSelected,
  cardToggle,
  cards,
  mountV1Step2,
  nextYear,
  until,
  v1HistoryAnalysis,
  v1HistoryPreparation,
} from "./v1-history.test-fixtures";

afterEach(resetHplacePage);

const names = () =>
  collectFieldsSnapshot(document).request.sections.flatMap((s) =>
    s.fields.map((f) => f.domName),
  );

describe("v1 step 2 page gate", () => {
  it("supports step 2 with zero cards and keeps steps 1 and 3 unchanged", () => {
    mountV1Step2();
    expect(isV1HistoryPage(document)).toBe(true);
    expect(isUnsupportedHplace(document)).toBe(false);
    expect(v1HistoryControls(document)).toEqual([]);
    // No fields: the fields pass sends nothing.
    expect(collectFieldsSnapshot(document).request.sections).toEqual([]);

    mountV1Step2("3");
    expect(isV1HistoryPage(document)).toBe(false);
    expect(isUnsupportedHplace(document)).toBe(true);

    mountV1Step1();
    expect(isV1HistoryPage(document)).toBe(false);
    expect(isUnsupportedHplace(document)).toBe(false);
  });

  it("requires both section headers", () => {
    mountV1Step2();
    Array.from(document.querySelectorAll("h5"))
      .find((h) => h.textContent === "경력사항")!
      .remove();
    expect(isV1HistoryPage(document)).toBe(false);
    expect(isUnsupportedHplace(document)).toBe(true);
  });
});

describe("v1 step 2 preparation", () => {
  it("offers the four exact add actions with their card counts", () => {
    mountV1Step2();
    const snapshot = collectPreparationSnapshot(document);
    expect(snapshot.request.sections).toHaveLength(1);
    const [section] = snapshot.request.sections;
    expect(section.sectionId).toBe("hplace-v1-history");
    expect(
      section.actionCandidates.map((a) => [
        a.domId,
        a.domName,
        a.element,
        a.control,
        a.displayName,
      ]),
    ).toEqual(
      (
        [
          ["highschool", "고등학교"],
          ["college", "대학교"],
          ["graduateSchool", "대학원"],
          ["career", "직장경력"],
        ] as const
      ).map(([group, label]) => [
        `hplace.v1.${group}.add`,
        `hplace.v1.${group}.add`,
        "button",
        "button",
        label,
      ]),
    );
    const ids = section.actionCandidates.map((a) => a.candidateId);
    expect(ids.map((id) => snapshot.countRepeatableGroups(id))).toEqual([
      0, 0, 0, 0,
    ]);
    expect(ids.map((id) => snapshot.repeatableGroupLimit(id))).toEqual([
      1,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("finds the add control in both shapes", () => {
    mountV1Step2();
    appendCard("대학교");
    expect(addControl("대학교").matches('div[tabindex="0"]')).toBe(true);
    const snapshot = collectPreparationSnapshot(document);
    const college = snapshot.request.sections[0].actionCandidates.find(
      (a) => a.domName === "hplace.v1.college.add",
    )!;
    const lookup = snapshot.registry.lookupAction(college.candidateId);
    expect(lookup.status).toBe("ready");
    expect("handle" in lookup && lookup.handle.element).toBe(
      addControl("대학교"),
    );
    expect(snapshot.countRepeatableGroups(college.candidateId)).toBe(1);
  });

  const snapshotOf = (
    s: ReturnType<typeof collectPreparationSnapshot>,
  ): PreparationSnapshot => ({
    registry: s.registry,
    isTargetSectionVisible: (id) => s.isSectionVisible(id),
    countRepeatableGroups: (plan) =>
      s.countRepeatableGroups(plan.actionCandidateId),
    repeatableGroupState: (plan) =>
      s.repeatableGroupState(plan.actionCandidateId),
  });
  const prepare = (counts: Record<string, number>) => {
    const snapshot = collectPreparationSnapshot(document);
    const plans = v1HistoryPreparation(snapshot.request).preparationPlans;
    const domName = (plan: PreparationPlan) =>
      snapshot.request.sections[0].actionCandidates.find(
        (a) => a.candidateId === plan.actionCandidateId,
      )!.domName!;
    return executeApprovedPreparationPlans({
      document,
      approvedPlans: plans
        .filter((plan) => domName(plan) in counts)
        .map((plan) => ({
          plan,
          approved: true,
          localItemCount: counts[domName(plan)],
        })),
      initialSnapshot: snapshotOf(snapshot),
      refreshSnapshot: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return snapshotOf(collectPreparationSnapshot(document));
      },
      countRepeatableGroups: (s, plan) => s.countRepeatableGroups?.(plan) ?? -1,
    });
  };

  it("adds profile entries minus existing cards, one verified card per click", async () => {
    const page = mountV1Step2();
    const existing = appendCard("대학교");
    cardNamed(existing, "collegeGrade.score").value = "3.1";
    const result = await prepare({
      "hplace.v1.college.add": 2,
      "hplace.v1.career.add": 1,
    });
    expect(result.status).toBe("completed");
    expect(page.addClicks()).toEqual(["대학교", "직장경력"]);
    expect(cards("대학교")).toHaveLength(2);
    expect(cards("직장경력")).toHaveLength(1);
    expect(card("대학교", 0)).toBe(existing);
    expect(cardNamed(existing, "collegeGrade.score").value).toBe("3.1");
    expect(cardNamed(card("대학교", 1), "collegeGrade.score").name).toBe(
      "collegeGroupAnswers.1.collegeGrade.score",
    );
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("fails closed when a click adds no card", async () => {
    const page = mountV1Step2();
    page.stall("직장경력");
    const result = await prepare({ "hplace.v1.career.add": 2 });
    expect(result).toMatchObject({
      status: "failed",
      reason: "group-count-not-incremented",
    });
    expect(page.addClicks()).toEqual(["직장경력"]);
  });
});

describe("v1 step 2 card levels", () => {
  it("decides each level from the card's own rows", () => {
    mountV1Step2();
    appendCard("대학교");
    appendCard("직장경력");
    // A level whose card shows an unknown row is not entered at all.
    cardRow(card("대학교", 0), "이수학점").insertAdjacentHTML(
      "afterend",
      '<div class="x-row"><span aria-hidden="true">합성행</span><div></div><div></div></div>',
    );
    const levels = v1HistoryLevels(document);
    expect(levels.find((l) => l.group === "college")?.status).toBe("malformed");
    expect(levels.find((l) => l.group === "career")?.status).toBe("ok");
    expect(names().some((n) => n?.startsWith("hplace.v1.college."))).toBe(
      false,
    );
    expect(names()).toContain("hplace.v1.career.0.department");
    expect(
      collectPreparationSnapshot(
        document,
      ).request.sections[0].actionCandidates.map((a) => a.domName),
    ).not.toContain("hplace.v1.college.add");
  });

  it("rejects a page index that disagrees with the card order", () => {
    mountV1Step2();
    appendCard("직장경력");
    appendCard("직장경력");
    cardNamed(card("직장경력", 1), "position").name =
      "careerGroupAnswers.0.position";
    expect(
      v1HistoryLevels(document).find((l) => l.group === "career")?.status,
    ).toBe("malformed");
    expect(names()).toEqual([]);
  });

  it("ignores the attachment containers", () => {
    mountV1Step2();
    expect(v1HistoryLevels(document).map((l) => [l.group, l.status])).toEqual([
      ["highschool", "ok"],
      ["college", "ok"],
      ["graduateSchool", "ok"],
      ["career", "ok"],
    ]);
  });
});

describe("v1 step 2 collection", () => {
  it("sends indexed exact names per card and the item count per level", () => {
    mountV1Step2();
    appendCard("고등학교");
    appendCard("대학교");
    appendCard("대학원");
    appendCard("직장경력");
    appendCard("직장경력");
    const snapshot = collectFieldsSnapshot(document);
    const [section] = snapshot.request.sections;
    expect(section.sectionId).toBe("hplace-v1-history");
    expect(section.items).toBeUndefined();
    const sent = section.fields.map((f) => f.domName);
    expect(sent).toEqual([
      ...[
        "graduationTypeCode",
        "locationCode",
        "dayOrNight",
        "entranceDate",
        "graduationDate",
      ].map((f) => `hplace.v1.highschool.0.${f}`),
      ...[
        "degreeTypeCode",
        "entranceDate",
        "graduationTypeCode",
        "graduationDate",
        "entranceTypeCode",
        "perfectScore",
        "score",
      ].map((f) => `hplace.v1.college.0.${f}`),
      ...[
        "degreeTypeCode",
        "entranceDate",
        "graduationTypeCode",
        "graduationDate",
        "entranceTypeCode",
        "perfectScore",
        "score",
      ].map((f) => `hplace.v1.graduateSchool.0.${f}`),
      ...[0, 1].flatMap((i) =>
        [
          "employmentType",
          "workingStatus",
          "entranceDate",
          "company",
          "department",
          "position",
          "assignedTask",
        ].map((f) => `hplace.v1.career.${i}.${f}`),
      ),
    ]);
    for (const f of section.fields) expect(f.domId).toBe(f.domName);
    const byName = (n: string) => section.fields.find((f) => f.domName === n)!;
    expect(byName("hplace.v1.college.0.degreeTypeCode")).toMatchObject({
      element: "input",
      control: "radio",
      options: [
        { optionId: "학사", displayName: "학사" },
        { optionId: "전문학사", displayName: "전문학사" },
      ],
    });
    expect(byName("hplace.v1.career.0.employmentType")).toMatchObject({
      element: "select",
      control: "select",
    });
    expect(byName("hplace.v1.career.1.company")).toMatchObject({
      element: "input",
      control: "text",
    });
    const handle = (n: string) => {
      const lookup = snapshot.registry.lookupField(byName(n).candidateId);
      return "handle" in lookup ? lookup.handle : undefined;
    };
    expect(handle("hplace.v1.career.1.position")).toMatchObject({
      sectionId: "hplace-v1-history",
      itemGroupId: "career",
      itemIndex: 1,
    });
    expect(
      snapshot.registry.fieldItemCount(
        byName("hplace.v1.career.1.position").candidateId,
      ),
    ).toBe(2);
    expect(
      snapshot.registry.fieldItemCount(
        byName("hplace.v1.college.0.score").candidateId,
      ),
    ).toBe(1);
    // Out of scope or not yet supported: never sent.
    expect(
      sent.some((n) => /academyName|majorName|퇴사|leavingDate/.test(n!)),
    ).toBe(false);
  });

  it("collects 퇴사일 once 퇴사 unlocks it", async () => {
    mountV1Step2();
    const c = appendCard("직장경력");
    cardToggle(c, "근무기간", "퇴사").click();
    await until(() => !cardInput(c, "퇴사일").disabled);
    expect(names()).toContain("hplace.v1.career.0.leavingDate");
  });
});

function itemFor(
  name: string,
  profileValue: string,
): { handle: FieldCandidateHandle; item: ReviewPlanItem } {
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections
    .flatMap((s) => s.fields)
    .find((f) => f.domName === name);
  if (!field) throw new Error(`not collected: ${name}`);
  const analysis = v1HistoryAnalysis({
    ...snapshot.request,
    sections: [{ sectionId: "hplace-v1-history", fields: [field] }],
  }).fields[0];
  const lookup = snapshot.registry.lookupField(field.candidateId);
  if (!("handle" in lookup)) throw new Error("no handle");
  return {
    handle: lookup.handle,
    item: {
      candidateId: field.candidateId,
      fieldLabel: field.displayName ?? name,
      profileValue,
      currentValue: "",
      previewValue: profileValue,
      status: "available",
      selected: true,
      disabled: false,
      revealed: false,
      analysis,
    } as unknown as ReviewPlanItem,
  };
}
const write = (name: string, value: string) => {
  const { handle, item } = itemFor(name, value);
  return writeV1History(handle, item, () => true);
};

describe("v1 step 2 writes", () => {
  it("selects exact toggle and dropdown labels", async () => {
    mountV1Step2();
    const hs = appendCard("고등학교");
    const univ = appendCard("대학교");
    expect(await write("hplace.v1.college.0.degreeTypeCode", "학사")).toBe(
      "written",
    );
    expect(cardSelected(univ, "학위구분")).toEqual(["학사"]);
    expect(
      await write("hplace.v1.highschool.0.graduationTypeCode", "수료"),
    ).toBe("option-unmatched");
    expect(cardSelected(hs, "졸업구분")).toEqual([]);
    expect(await write("hplace.v1.college.0.perfectScore", "4.5")).toBe(
      "written",
    );
    expect(cardDropdown(univ, "scale").textContent).toBe("4.5");
    expect(await write("hplace.v1.highschool.0.locationCode", "서울")).toBe(
      "written",
    );
    expect(cardDropdown(hs, "region").textContent).toBe("서울");
    expect(document.querySelector("#dropdown-body")).toBeNull();
  });

  it("writes only full past days, and a future 졸업일 only for 졸업예정", async () => {
    mountV1Step2();
    const univ = appendCard("대학교");
    const career = appendCard("직장경력");
    expect(await write("hplace.v1.college.0.entranceDate", "2009-03")).toBe(
      "failed",
    );
    expect(cardInput(univ, "입학일").value).toBe("");
    expect(await write("hplace.v1.college.0.entranceDate", "2009-03-02")).toBe(
      "written",
    );
    expect(cardInput(univ, "입학일").value).toBe("2009.03.02");
    expect(
      await write("hplace.v1.career.0.entranceDate", `${nextYear()}-01-02`),
    ).toBe("failed");
    expect(cardInput(career, "입사일").value).toBe("");
    const future = `${nextYear()}-02-20`;
    expect(await write("hplace.v1.college.0.graduationDate", future)).toBe(
      "failed",
    );
    cardToggle(univ, "졸업구분", "졸업예정").click();
    expect(await write("hplace.v1.college.0.graduationDate", future)).toBe(
      "written",
    );
    expect(cardInput(univ, "졸업일").value).toBe(`${nextYear()}.02.20`);
  });

  it("keeps a typed 회사명 and closes its suggestions without picking", async () => {
    const page = mountV1Step2();
    const c = appendCard("직장경력");
    expect(await write("hplace.v1.career.0.company", "합성회사")).toBe(
      "written",
    );
    expect(cardInput(c, "회사명을 입력해주세요.").value).toBe("합성회사");
    await until(() => !c.querySelector("#dropdown-body"));
    page.stickySuggestions();
    const next = appendCard("직장경력");
    expect(await write("hplace.v1.career.1.company", "두번째회사")).toBe(
      "written",
    );
    expect(next.querySelector("#dropdown-body")).toBeNull();
    expect(cardInput(next, "회사명을 입력해주세요.").value).toBe("두번째회사");
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("never overwrites a value and checks the page maxLength", async () => {
    mountV1Step2();
    const c = appendCard("직장경력");
    cardNamed(c, "department").value = "기존부서";
    expect(await write("hplace.v1.career.0.department", "합성부서")).toBe(
      "failed",
    );
    expect(cardNamed(c, "department").value).toBe("기존부서");
    expect(
      await write("hplace.v1.career.0.assignedTask", "가".repeat(101)),
    ).toBe("failed");
    expect(cardNamed(c, "assignedTask").value).toBe("");
    cardToggle(c, "근무기간", "재직중").click();
    expect(await write("hplace.v1.career.0.workingStatus", "퇴사")).toBe(
      "failed",
    );
    expect(cardSelected(c, "근무기간")).toEqual(["재직중"]);
  });

  it("runs 재직중/퇴사 as a stage-1 driver that unlocks 퇴사일", async () => {
    mountV1Step2();
    const c = appendCard("직장경력");
    const { handle, item } = itemFor(
      "hplace.v1.career.0.workingStatus",
      "퇴사",
    );
    const adapter = getWorkflowAdapter(document);
    expect(adapter.isStateDriver(item, handle.candidate.domName)).toBe(true);
    expect(adapter.stateDriverStage?.(item, handle)).toBe(1);
    const signal = new AbortController().signal;
    expect(
      await adapter.executeStateDriver!(document, handle, item, signal),
    ).toBe(true);
    expect(
      await adapter.settleStateDriver!(document, handle, undefined, {
        item,
        signal,
      }),
    ).toBe(true);
    expect(cardInput(c, "퇴사일").disabled).toBe(false);
    expect(await write("hplace.v1.career.0.leavingDate", "2020-12-31")).toBe(
      "written",
    );
  });

  it("writes a GPA only as a score and scale pair", () => {
    mountV1Step2();
    appendCard("대학교");
    const score = itemFor("hplace.v1.college.0.score", "3.8");
    const scale = itemFor("hplace.v1.college.0.perfectScore", "4.5");
    const registry = collectFieldsSnapshot(document).registry;
    // Same collection order: the candidate IDs are stable across snapshots.
    const ids = (items: ReviewPlanItem[]) =>
      new Set(items.map((i) => i.candidateId));
    expect(
      v1HistoryGpaBlocked([score.item], registry, ids([score.item])),
    ).toEqual(new Set([score.item.candidateId]));
    expect(
      v1HistoryGpaBlocked(
        [scale.item, score.item],
        registry,
        ids([scale.item, score.item]),
      ),
    ).toEqual(new Set());
    const high = { ...score.item, profileValue: "4.8" };
    expect(
      v1HistoryGpaBlocked(
        [scale.item, high],
        registry,
        ids([scale.item, high]),
      ),
    ).toEqual(new Set([scale.item.candidateId, high.candidateId]));
  });
});
