import { afterEach, describe, expect, it, vi } from "vitest";
import { setAutofillDebugEnabled } from "../../debug/autofill-debug";
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
import {
  isRegisterRow,
  isRegisterShape,
  v1HistoryGpaBlocked,
  writeV1History,
} from "./v1-history-write";
import { hplaceUnverifiedRows } from "./unverified-structure";
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
import { createProgressTracker } from "../../workflow/progress-model";
import { written } from "../../write/write-result";
import {
  addControl,
  levelContainer,
  appendCard,
  appendMajor,
  chipText,
  pickChip,
  searchInput,
  v1HistoryProfile,
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

  it("adds cards as direct children of each level container (fresh, first, second)", async () => {
    const page = mountV1Step2();
    const result = await prepare({
      "hplace.v1.highschool.add": 1,
      "hplace.v1.college.add": 2,
      "hplace.v1.graduateSchool.add": 2,
      "hplace.v1.career.add": 2,
    });
    expect(result.status).toBe("completed");
    expect(page.addClicks()).toEqual([
      "고등학교",
      "대학교",
      "대학교",
      "대학원",
      "대학원",
      "직장경력",
      "직장경력",
    ]);
    for (const [level, count] of [
      ["고등학교", 1],
      ["대학교", 2],
      ["대학원", 2],
      ["직장경력", 2],
    ] as const) {
      const box = levelContainer(level);
      expect(cards(level)).toHaveLength(count);
      for (const c of cards(level)) expect(c.parentElement).toBe(box);
      // The add control is a direct child and has become the div shape.
      expect(addControl(level).parentElement).toBe(box);
      expect(addControl(level).matches('div[tabindex="0"]')).toBe(true);
    }
    expect(cardNamed(card("직장경력", 1), "position").name).toBe(
      "careerGroupAnswers.1.position",
    );
    const levels = v1HistoryLevels(document);
    expect(levels.map((l) => [l.group, l.status, l.cards.length])).toEqual([
      ["highschool", "ok", 1],
      ["college", "ok", 2],
      ["graduateSchool", "ok", 2],
      ["career", "ok", 2],
    ]);
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("adds one major sub-row only to the card that has none", async () => {
    const page = mountV1Step2();
    const u0 = appendCard("대학교");
    const u1 = appendCard("대학교");
    appendMajor(u0);
    const snapshot = collectPreparationSnapshot(document);
    const sent = snapshot.request.sections[0].actionCandidates;
    expect(sent.map((a) => a.domName)).toEqual([
      "hplace.v1.highschool.add",
      "hplace.v1.college.add",
      "hplace.v1.graduateSchool.add",
      "hplace.v1.career.add",
      "hplace.v1.college.1.major.add",
    ]);
    const major = sent.at(-1)!;
    expect(major).toMatchObject({
      domId: "hplace.v1.college.1.major.add",
      element: "button",
      control: "button",
    });
    expect(snapshot.countRepeatableGroups(major.candidateId)).toBe(0);
    expect(snapshot.repeatableGroupLimit(major.candidateId)).toBe(1);
    const before = u0.innerHTML;
    const result = await prepare({ "hplace.v1.college.1.major.add": 1 });
    expect(result.status).toBe("completed");
    expect(page.majorAdds()).toEqual(["대학교 1"]);
    expect(cardRow(u1, "전공").querySelectorAll(".x-major")).toHaveLength(1);
    expect(cardNamed(u1, "majorGrade.score").name).toBe(
      "collegeGroupAnswers.1.collegeMajorList.0.majorGrade.score",
    );
    expect(u0.innerHTML).toBe(before);
    expect(page.forbiddenClicks()).toEqual([]);
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
    // Career first: its drivers run before the school searches.
    expect(sent).toEqual([
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
      ...[
        "academyName",
        "graduationTypeCode",
        "locationCode",
        "dayOrNight",
        "entranceDate",
        "graduationDate",
      ].map((f) => `hplace.v1.highschool.0.${f}`),
      ...[
        "academyName",
        "degreeTypeCode",
        "entranceDate",
        "graduationTypeCode",
        "graduationDate",
        "entranceTypeCode",
        "score",
        "perfectScore",
      ].map((f) => `hplace.v1.college.0.${f}`),
      ...[
        "academyName",
        "degreeTypeCode",
        "entranceDate",
        "graduationTypeCode",
        "graduationDate",
        "entranceTypeCode",
        "score",
        "perfectScore",
      ].map((f) => `hplace.v1.graduateSchool.0.${f}`),
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
    expect(sent.some((n) => /majorName|leavingDate/.test(n!))).toBe(false);
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
      // As review and the automatic run shape it: CONDITIONAL needs review
      // and the automatic run selects it.
      status:
        "autofillPolicy" in analysis &&
        analysis.autofillPolicy === "CONDITIONAL"
          ? "needs-review"
          : "available",
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
    expect(cardSelected(hs, "졸업구분")).toEqual(["졸업"]);
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
    page.lateSuggestions();
    const next = appendCard("직장경력");
    expect(await write("hplace.v1.career.1.company", "두번째회사")).toBe(
      "written",
    );
    // The late list was waited for and closed without a pick.
    expect(page.suggestionLists()).toBe(2);
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
    // The applicant's own non-default choice is an existing value.
    cardToggle(c, "근무기간", "퇴사").click();
    expect(await write("hplace.v1.career.0.workingStatus", "재직중")).toBe(
      "failed",
    );
    expect(cardSelected(c, "근무기간")).toEqual(["퇴사"]);
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

function itemsFor(entries: [string, string][]) {
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((s) => s.fields);
  const items = entries.map(([name, value]) => {
    const field = fields.find((f) => f.domName === name);
    if (!field) throw new Error(`not collected: ${name}`);
    const analysis = v1HistoryAnalysis({
      ...snapshot.request,
      sections: [{ sectionId: "hplace-v1-history", fields: [field] }],
    }).fields[0];
    return {
      candidateId: field.candidateId,
      fieldLabel: field.displayName ?? name,
      profileValue: value,
      currentValue: "",
      previewValue: value,
      status:
        "autofillPolicy" in analysis &&
        analysis.autofillPolicy === "CONDITIONAL"
          ? "needs-review"
          : "available",
      selected: true,
      disabled: false,
      revealed: false,
      analysis,
    } as unknown as ReviewPlanItem;
  });
  return { registry: snapshot.registry, items };
}

/** Runs a search field as the workflow does: stage-1 driver, then its settle. */
async function drive(name: string, value: string) {
  const { handle, item } = itemFor(name, value);
  const adapter = getWorkflowAdapter(document);
  const signal = new AbortController().signal;
  const codes: string[] = [];
  expect(adapter.isStateDriver(item, name)).toBe(true);
  expect(adapter.stateDriverStage?.(item, handle)).toBe(1);
  const ok = await adapter.executeStateDriver!(
    document,
    handle,
    item,
    signal,
    (code) => codes.push(code),
  );
  const settled =
    ok &&
    (await adapter.settleStateDriver!(document, handle, undefined, {
      item,
      signal,
    }));
  return { ok, settled, codes };
}

describe("v1 step 2 school and major search", () => {
  it("sends open search inputs and keeps the rest of a row after a pick", () => {
    mountV1Step2();
    const hs = appendCard("고등학교");
    const u0 = appendCard("대학교");
    expect(names()).toEqual(
      expect.arrayContaining([
        "hplace.v1.highschool.0.academyName",
        "hplace.v1.college.0.academyName",
      ]),
    );
    expect(names()).not.toContain("hplace.v1.college.0.major0.majorName");
    appendMajor(u0);
    expect(names()).toContain("hplace.v1.college.0.major0.majorName");
    pickChip(hs, "학교정보", "합성고등학교");
    pickChip(u0, "전공", "합성공학");
    const after = names();
    expect(after).not.toContain("hplace.v1.highschool.0.academyName");
    expect(after).not.toContain("hplace.v1.college.0.major0.majorName");
    expect(after).toEqual(
      expect.arrayContaining([
        "hplace.v1.highschool.0.locationCode",
        "hplace.v1.highschool.0.dayOrNight",
        "hplace.v1.college.0.academyName",
      ]),
    );
  });

  it("picks the single exact row and verifies the chip", async () => {
    const page = mountV1Step2();
    const u0 = appendCard("대학교");
    const r = await drive("hplace.v1.college.0.academyName", "합성대학교");
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(chipText(u0, "학교정보")).toEqual(["합성대학교"]);
    expect(searchInput(u0, "학교정보")).toBeNull();
    expect(page.searchQueries()).toEqual(["합성대학교"]);
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it.each([
    ["없는학교", "SEARCH_NO_EXACT_MATCH"],
    ["동명학교", "SEARCH_AMBIGUOUS"],
    ["목록없음", "SEARCH_TIMEOUT"],
  ])(
    "leaves %s unpicked, cleared and closed (%s)",
    async (query, code) => {
      const page = mountV1Step2();
      const hs = appendCard("고등학교");
      const r = await drive("hplace.v1.highschool.0.academyName", query);
      expect(r).toEqual({ ok: false, settled: false, codes: [code] });
      expect(searchInput(hs, "학교정보")!.value).toBe("");
      expect(chipText(hs, "학교정보")).toEqual([]);
      expect(document.querySelector("#dropdown-body")).toBeNull();
      // One search, then the clear: never a second query.
      expect(page.searchQueries()).toEqual([query, ""]);
      expect(page.forbiddenClicks()).toEqual([]);
    },
    15_000,
  );

  it("searches a major in its own card while another card's list is open", async () => {
    const page = mountV1Step2();
    const u0 = appendCard("대학교");
    const u1 = appendCard("대학교");
    appendMajor(u0);
    appendMajor(u1);
    const other = searchInput(u0, "전공")!;
    other.value = "합성공학";
    other.dispatchEvent(new Event("input", { bubbles: true }));
    await until(() => !!cardRow(u0, "전공").querySelector("#dropdown-body li"));
    const r = await drive("hplace.v1.college.1.major0.majorName", "합성경영");
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(chipText(u1, "전공")).toEqual(["합성경영"]);
    expect(searchInput(u1, "전공")).toBeNull();
    expect(other.value).toBe("합성공학");
    expect(page.searchQueries()).toEqual(["합성공학", "합성경영"]);
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("reports an existing chip: same name kept, a different one as a conflict", () => {
    const page = mountV1Step2();
    const u0 = appendCard("대학교");
    const u1 = appendCard("대학교");
    pickChip(u0, "학교정보", "합성대학교");
    pickChip(u1, "학교정보", "다른대학교");
    const snapshot = collectFieldsSnapshot(document);
    const sent = snapshot.request.sections.flatMap((s) =>
      s.fields.map((f) => f.domName),
    );
    expect(sent.some((n) => n?.endsWith("academyName"))).toBe(false);
    const rows = hplaceUnverifiedRows(
      document,
      snapshot.request,
      v1HistoryProfile(),
    ).filter((row) => row.fieldLabel === "학교명");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "conflict",
      currentValue: "다른대학교",
      profileValue: "합성전문대학",
      selected: false,
    });
    expect(page.searchQueries()).toEqual([]);
  });
});

describe("v1 step 2 pair and status rules", () => {
  it("clears a typed score when its scale cannot be chosen", async () => {
    const page = mountV1Step2();
    const u0 = appendCard("대학교");
    page.dropOption("scale", "4.5");
    const { registry, items } = itemsFor([
      ["hplace.v1.college.0.score", "3.8"],
      ["hplace.v1.college.0.perfectScore", "4.5"],
    ]);
    const results = await executeApprovedWritesAfterPageSettles({
      items,
      approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
      registry,
      document,
    });
    expect(results.map((r) => r.status)).toEqual(["skipped", "skipped"]);
    expect(cardNamed(u0, "collegeGrade.score").value).toBe("");
    expect(cardDropdown(u0, "scale").textContent).toBe("만점기준");
    expect(document.querySelector("#dropdown-body")).toBeNull();
  });

  it("writes the score and the scale together", async () => {
    mountV1Step2();
    const u0 = appendCard("대학교");
    const { registry, items } = itemsFor([
      ["hplace.v1.college.0.score", "3.8"],
      ["hplace.v1.college.0.perfectScore", "4.5"],
    ]);
    const results = await executeApprovedWritesAfterPageSettles({
      items,
      approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
      registry,
      document,
    });
    expect(results.map((r) => r.status)).toEqual(["written", "written"]);
    expect(cardNamed(u0, "collegeGrade.score").value).toBe("3.8");
    expect(cardDropdown(u0, "scale").textContent).toBe("4.5");
  });

  it("does not write 퇴사일 unless the profile status is 퇴사", async () => {
    mountV1Step2();
    const c = appendCard("직장경력");
    // The applicant chose 퇴사; no profile status was applied this run.
    cardToggle(c, "근무기간", "퇴사").click();
    await until(() => !cardInput(c, "퇴사일").disabled);
    expect(await write("hplace.v1.career.0.leavingDate", "2020-12-31")).toBe(
      "failed",
    );
    expect(cardInput(c, "퇴사일").value).toBe("");
  });
});

describe("v1 step 2 page defaults and diagnostics", () => {
  it("replaces only the measured fresh-card defaults", async () => {
    mountV1Step2();
    const u0 = appendCard("대학교");
    const c = appendCard("직장경력");
    expect(cardSelected(u0, "학위구분")).toEqual(["학사"]);
    expect(cardSelected(u0, "졸업구분")).toEqual(["졸업"]);
    expect(cardSelected(u0, "입학구분")).toEqual(["입학"]);
    expect(cardSelected(c, "근무기간")).toEqual(["재직중"]);
    const adapter = getWorkflowAdapter(document);
    const degree = itemFor("hplace.v1.college.0.degreeTypeCode", "전문학사");
    expect(
      adapter.prefersProfileValue?.(degree.handle, degree.item.analysis!),
    ).toBe(true);
    expect(await writeV1History(degree.handle, degree.item, () => true)).toBe(
      "written",
    );
    expect(cardSelected(u0, "학위구분")).toEqual(["전문학사"]);
    // 전문학사 is not the page default: now it is an existing value.
    const back = itemFor("hplace.v1.college.0.degreeTypeCode", "학사");
    expect(
      adapter.prefersProfileValue?.(back.handle, back.item.analysis!),
    ).toBe(false);
    expect(await writeV1History(back.handle, back.item, () => true)).toBe(
      "failed",
    );
    expect(cardSelected(u0, "학위구분")).toEqual(["전문학사"]);
    // The same value as the default is kept, not a conflict.
    expect(await write("hplace.v1.college.0.entranceTypeCode", "입학")).toBe(
      "written",
    );
  });

  it("logs every step-2 write that is not written, value-free", async () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mountV1Step2();
      appendCard("고등학교");
      appendCard("대학교");
      await write("hplace.v1.college.0.entranceDate", "2009-03");
      await write("hplace.v1.highschool.0.graduationTypeCode", "수료");
      await drive("hplace.v1.highschool.0.academyName", "없는학교");
      const lines = log.mock.calls.map(([line]) => String(line));
      expect(lines).toEqual(
        expect.arrayContaining([
          "[CareerForm] skip stage=write key=hplace.v1.college.0.entranceDate reason=unit-mismatch detail=v1-history-date-not-full-day",
          "[CareerForm] skip stage=write key=hplace.v1.highschool.0.graduationTypeCode reason=option-mismatch detail=v1-history-option-unmatched",
          expect.stringMatching(
            /^\[CareerForm\] skip stage=write key=hplace\.v1\.highschool\.0\.academyName reason=result-not-unique detail=v1-history-search-ms\d+-li\d+-regno-textno-branch-no-exact-match failureCode=SEARCH_NO_EXACT_MATCH$/,
          ),
        ]),
      );
      for (const line of lines) expect(line).not.toMatch(/없는학교|2009|수료/);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });
});

describe("v1 step 2 with the real backend analyses", () => {
  it.each([
    ["hplace.v1.career.0.company", "합성회사"],
    ["hplace.v1.highschool.0.locationCode", "서울"],
    ["hplace.v1.highschool.0.dayOrNight", "야간"],
    ["hplace.v1.highschool.0.graduationTypeCode", "졸업예정"],
    ["hplace.v1.college.0.degreeTypeCode", "전문학사"],
    ["hplace.v1.college.0.graduationTypeCode", "졸업예정"],
    ["hplace.v1.college.0.entranceTypeCode", "편입"],
  ])("writes the CONDITIONAL field %s", async (name, value) => {
    mountV1Step2();
    appendCard("고등학교");
    appendCard("대학교");
    appendCard("직장경력");
    const { item } = itemFor(name, value);
    expect(item.analysis?.autofillPolicy).toBe("CONDITIONAL");
    expect(item.status).toBe("needs-review");
    expect(await write(name, value)).toBe("written");
  });

  it("keeps a CONDITIONAL default that equals the profile as written", async () => {
    mountV1Step2();
    const hs = appendCard("고등학교");
    expect(
      await write("hplace.v1.highschool.0.graduationTypeCode", "졸업"),
    ).toBe("written");
    expect(await write("hplace.v1.highschool.0.dayOrNight", "주간")).toBe(
      "written",
    );
    expect(cardSelected(hs, "졸업구분")).toEqual(["졸업"]);
  });

  it("names the failing approval condition in the diagnostic, value-free", async () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mountV1Step2();
      appendCard("대학교");
      const { handle, item } = itemFor(
        "hplace.v1.college.0.degreeTypeCode",
        "전문학사",
      );
      const blocked = {
        ...item,
        analysis: { ...item.analysis!, interactionStatus: "BLOCKED" },
      } as ReviewPlanItem;
      expect(await writeV1History(handle, blocked, () => true)).toBe("failed");
      expect(log.mock.calls.map(([l]) => String(l))).toContain(
        "[CareerForm] skip stage=write key=hplace.v1.college.0.degreeTypeCode reason=blocked detail=v1-history-not-approved-interaction-BLOCKED-policy-CONDITIONAL-binding-LOOKUP-status-needs-review-value-yes",
      );
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });
});

describe("v1 step 2 university and major search widgets", () => {
  it("waits past a transient register row (held 600 ms) for the long, scroll-wrapped results", async () => {
    const page = mountV1Step2();
    page.slowCatalog();
    // The transient register row (held 600 ms) is never pressed.
    const u0 = appendCard("대학교");
    const r = await drive("hplace.v1.college.0.academyName", "합성대학교");
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(chipText(u0, "학교정보")).toEqual(["합성대학교"]);
    expect(page.searchQueries()).toEqual(["합성대학교"]);
    expect(page.registerClicks()).toBe(0);
    expect(document.querySelector("#dropdown-body")).toBeNull();
  });

  it("does the same for the major sub-row next to its disabled inputs", async () => {
    mountV1Step2();
    const u0 = appendCard("대학교");
    appendMajor(u0);
    const r = await drive("hplace.v1.college.0.major0.majorName", "합성공학");
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(chipText(u0, "전공")).toEqual(["합성공학"]);
  });

  it("names the row shape it could not verify, value-free", async () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const page = mountV1Step2();
      const u0 = appendCard("대학교");
      const r = await drive("hplace.v1.college.0.academyName", "구조다름");
      expect(r).toEqual({
        ok: false,
        settled: false,
        codes: ["SEARCH_FORM_UNVERIFIED"],
      });
      expect(log.mock.calls.map(([l]) => String(l))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^\[CareerForm\] skip stage=write key=hplace\.v1\.college\.0\.academyName reason=control-shape detail=v1-history-search-rows-li1-button2-span0-span0-answered-yes-ms\d+-li1-regno-textno-branch-rows failureCode=SEARCH_FORM_UNVERIFIED$/,
          ),
        ]),
      );
      expect(searchInput(u0, "학교정보")!.value).toBe("");
      expect(document.querySelector("#dropdown-body")).toBeNull();
      expect(page.forbiddenClicks()).toEqual([]);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });

  it("confirms a written search field by the chip that replaced its input", async () => {
    mountV1Step2();
    appendCard("대학교");
    const { registry, items } = itemsFor([
      ["hplace.v1.college.0.academyName", "합성대학교"],
    ]);
    const [item] = items;
    const lookup = registry.lookupField(item.candidateId);
    if (!("handle" in lookup)) throw new Error("no handle");
    const signal = new AbortController().signal;
    expect(
      await getWorkflowAdapter(document).executeStateDriver!(
        document,
        lookup.handle,
        item,
        signal,
      ),
    ).toBe(true);
    const tracker = createProgressTracker();
    const [entry] = tracker.record(item, written(item.candidateId), registry);
    expect(tracker.progressStateFor(entry.id)).toBe(true);
  });
});

describe("v1 step 2 register row (no catalog match: pressed by decision)", () => {
  it.each([
    ["hplace.v1.college.0.academyName", "학교정보"],
    ["hplace.v1.college.0.major0.majorName", "전공"],
  ])(
    "presses 등록하기 once for %s and verifies the chip",
    async (name, title) => {
      setAutofillDebugEnabled(true);
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        const page = mountV1Step2();
        const u0 = appendCard("대학교");
        appendMajor(u0);
        const started = Date.now();
        const r = await drive(name, "목록에없는이름");
        expect(r).toEqual({ ok: true, settled: true, codes: [] });
        expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
        expect(page.registerClicks()).toBe(1);
        expect(chipText(u0, title)).toEqual(["목록에없는이름"]);
        expect(searchInput(u0, title)).toBeNull();
        expect(page.searchQueries()).toEqual(["목록에없는이름"]);
        expect(page.forbiddenClicks()).toEqual([]);
        const lines = log.mock.calls.map(([l]) => String(l));
        expect(lines).toContain(
          `[CareerForm] skip stage=write key=${name} reason=unselected detail=v1-history-search-registered`,
        );
        for (const line of lines) expect(line).not.toMatch(/목록에없는이름/);
      } finally {
        setAutofillDebugEnabled(false);
        log.mockRestore();
      }
    },
  );

  it.each([
    ["다른등록", "search-register-other-name"],
    ["섞인목록", "search-register-mixed"],
  ])("never presses a register row for %s", async (query, detail) => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const page = mountV1Step2();
      const u0 = appendCard("대학교");
      const r = await drive("hplace.v1.college.0.academyName", query);
      expect(r).toEqual({
        ok: false,
        settled: false,
        codes: ["SEARCH_FORM_UNVERIFIED"],
      });
      expect(page.registerClicks()).toBe(0);
      expect(searchInput(u0, "학교정보")!.value).toBe("");
      expect(document.querySelector("#dropdown-body")).toBeNull();
      expect(log.mock.calls.map(([l]) => String(l))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            new RegExp(
              `^\\[CareerForm\\] skip stage=write key=hplace\\.v1\\.college\\.0\\.academyName reason=control-shape detail=v1-history-${detail}-ms\\d+-li\\d+-reg(yes|no)-text(yes|no)-branch-[a-z-]+ failureCode=SEARCH_FORM_UNVERIFIED$`,
            ),
          ),
        ]),
      );
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });

  it("reports a register press whose chip shows another name as unverified", async () => {
    const page = mountV1Step2();
    appendCard("대학교");
    page.registerChip("엉뚱한이름");
    const r = await drive("hplace.v1.college.0.academyName", "목록에없는이름");
    expect(r).toEqual({
      ok: false,
      settled: false,
      codes: ["SEARCH_SELECTION_UNVERIFIED"],
    });
    expect(page.registerClicks()).toBe(1);
  });
});

const searchLevels = [
  [
    "고등학교",
    "hplace.v1.highschool.0.academyName",
    "학교정보",
    "합성고등학교",
  ],
  ["대학교", "hplace.v1.college.0.academyName", "학교정보", "합성대학교"],
  [
    "대학원",
    "hplace.v1.graduateSchool.0.academyName",
    "학교정보",
    "합성대학원",
  ],
  ["대학교", "hplace.v1.college.0.major0.majorName", "전공", "합성공학"],
] as const;

describe("v1 step 2 search with a slow catalog", () => {
  it.each(
    searchLevels.flatMap((l) => [600, 900].map((ms) => [...l, ms] as const)),
  )(
    "%s %s: picks the real row after a transient register row held %s/%s ms (%i)",
    async (level, name, title, value, ms) => {
      const page = mountV1Step2();
      page.slowCatalog(ms);
      const c = appendCard(level);
      if (title === "전공") appendMajor(c);
      const r = await drive(name, value);
      expect(r).toEqual({ ok: true, settled: true, codes: [] });
      expect(chipText(c, title)).toEqual([value]);
      expect(page.registerClicks()).toBe(0);
    },
    15_000,
  );

  it.each(searchLevels)(
    "%s %s: presses the final register row only after 1000 ms",
    async (level, name, title) => {
      const page = mountV1Step2();
      page.slowCatalog(900);
      const c = appendCard(level);
      if (title === "전공") appendMajor(c);
      const started = Date.now();
      const r = await drive(name, "목록에없는이름");
      expect(r).toEqual({ ok: true, settled: true, codes: [] });
      expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
      expect(page.registerClicks()).toBe(1);
      expect(chipText(c, title)).toEqual(["목록에없는이름"]);
    },
    15_000,
  );

  it("never presses a register-like row quoted with other characters (fails closed)", async () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const page = mountV1Step2();
      page.curlyRegisterQuotes();
      const hs = appendCard("고등학교");
      // The catalog answers after the transient row: the real row is picked.
      expect(
        await drive("hplace.v1.highschool.0.academyName", "합성고등학교"),
      ).toEqual({ ok: true, settled: true, codes: [] });
      expect(chipText(hs, "학교정보")).toEqual(["합성고등학교"]);
      // No catalog match: a register row whose text differs is not pressed.
      const u0 = appendCard("대학교");
      expect(
        await drive("hplace.v1.college.0.academyName", "목록에없는이름"),
      ).toEqual({
        ok: false,
        settled: false,
        codes: ["SEARCH_FORM_UNVERIFIED"],
      });
      expect(page.registerClicks()).toBe(0);
      expect(searchInput(u0, "학교정보")!.value).toBe("");
      const lines = log.mock.calls.map(([l]) => String(l));
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^\[CareerForm\] skip stage=write key=hplace\.v1\.college\.0\.academyName reason=control-shape detail=v1-history-search-rows-\S+-ms\d+-li1-regno-textno-branch-rows failureCode=SEARCH_FORM_UNVERIFIED$/,
          ),
        ]),
      );
      for (const line of lines) expect(line).not.toMatch(/목록에없는이름|합성/);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });
});

describe("v1 step 2 register row, live DOM", () => {
  it("recognises 등록하기 outside the quoted-name span (three text nodes)", () => {
    mountV1Step2();
    const li = document.createElement("li");
    li.innerHTML =
      '<button type="button"><span><div><svg><path></path><path></path></svg><span></span></div></span></button>';
    const label = li.querySelector("div > span")!;
    for (const part of ["'", "합성이름", "'"])
      label.append(document.createTextNode(part));
    label.after(document.createTextNode("등록하기"));
    expect(label.childNodes).toHaveLength(3);
    expect(label.textContent).not.toContain("등록하기");
    expect(isRegisterShape(li)).toBeTruthy();
    expect(isRegisterRow(li, "합성이름")).toBe(true);
    expect(isRegisterRow(li, "다른이름")).toBe(false);
    // 등록하기 anywhere else (here: a second button text) is not the register row.
    li.querySelector("button")!.append(document.createTextNode("x"));
    expect(isRegisterShape(li)).toBeFalsy();
  });
});
