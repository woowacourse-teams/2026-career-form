import { resolveValueBinding } from "../profile/value-binding";
import { createEmptyProfile } from "../../profile/model";
import { afterEach, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { getWriteAdapter } from "../adapters/write";
import { getWorkflowAdapter } from "../adapters/workflow";
import { nativeOwnership } from "./native-form-collection";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
afterEach(() => installExecutionPolicy(document));
const search = (prefix: string, type: string) =>
  `<div class="span"><div class="search"><label><input type="search" data-type="${type}"></label><div class="searchResult"></div></div><input type="hidden" name="${prefix}.academyName"><span class="searchResultName"></span><input class="hidden" name="${prefix}.academyCode"></div>`;
const college = (name: string, index: number) =>
  `<div class="loop" data-loop="${name}" data-index="${index}"><label><input type="radio" name="${name}[${index}].degreeTypeCode" value="${name === "college" ? "50" : "62"}">${name === "college" ? "학사" : "석사"}</label>${search(`${name}[${index}]`, "college")}<input name="${name}[${index}].entranceDate" data-dates="${name}[${index}].date:YM college graduationCriteriaDate"><input name="${name}[${index}].graduationDate" data-dates="${name}[${index}].date:END"><div data-loop="collegeMajor"><input name="${name}[${index}].collegeMajor[0].majorName" type="hidden"><input type="search" data-type="major"><button type="button" data-button="add"></button></div></div>`;
function mount() {
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume"><section class="writeResume" data-code="140"><label><input type="radio" name="highschool.graduationTypeCode" value="01">졸업</label>${search("highschool", "highschool")}<input name="highschool.entranceDate" data-dates="highschoolDate:YM highschool graduationCriteriaDate"><input name="highschool.graduationDate" data-dates="highschoolDate:END"></section>${["college", "graduateSchool"].map((name, i) => `<section class="writeResume" data-code="${141 + i}"><div data-wrap="collegeLoop" data-type="${name}">${college(name, 0)}</div><div class="collegeBtnSet"><button type="button" data-button="addCollege" data-loopname="${name}">추가</button><button type="button" data-button="removeCollege" data-loopname="${name}">삭제</button></div></section>`).join("")}<section class="writeResume" data-code="18"><div class="subject" data-code="168" data-wrap="license"><div class="loop" data-loop="license"><div class="span"><div class="search"><label><input type="search" data-type="license"></label><div class="searchResult"></div></div><input type="hidden" name="license[0].licenseName"><span class="searchResultName"></span><input class="hidden" name="license[0].licenseCode"></div><input name="license[0].organization" maxlength="64"><div data-privateremove="test"><input name="license[0].registNumber" maxlength="32"></div><input name="license[0].acquireDate" data-dates="license[0].licenseDate:YMD"><button type="button" data-button="add"></button></div></div></section></div></form>`;
  installExecutionPolicy(
    document,
    structuredClone(seed.executionPolicy) as unknown as ExecutionPolicy,
  );
}
function item(suffix: string, value: string) {
  const snap = collectFieldsSnapshot(document),
    field = snap.request.sections
      .flatMap((s) => [
        ...s.fields,
        ...(s.items ?? []).flatMap((i) => i.fields),
      ])
      .find((f) => f.domName === suffix);
  expect(field).toBeDefined();
  const l = snap.registry.lookupField(field!.candidateId);
  if (!("handle" in l)) throw new Error();
  const binding = nativeOwnership(l.handle)!.field.binding;
  return {
    handle: l.handle,
    item: {
      candidateId: field!.candidateId,
      profileValue: value,
      profileFieldKey: binding.profileFieldKey,
      selected: true,
      disabled: false,
      analysis: {
        candidateId: field!.candidateId,
        matchType: "MATCH",
        valueBinding: binding,
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SET_TEXT" },
      },
    } as ReviewPlanItem,
  };
}
it("collects one highschool and separate college/graduateSchool parents, excluding nested major", () => {
  mount();
  const sections = collectFieldsSnapshot(document).request.sections;
  expect(sections.map((s) => s.sectionId)).toEqual([
    "hplace-mrs2-highschool",
    "hplace-mrs2-college",
    "hplace-mrs2-graduateSchool",
    "hplace-mrs2-license",
  ]);
  expect(sections[0].fields).toHaveLength(4);
  expect(sections[1].items).toHaveLength(1);
  expect(sections[2].items).toHaveLength(1);
  expect(
    sections
      .flatMap((s) => s.items ?? [])
      .flatMap((i) => i.fields)
      .some((f) => f.domName?.includes("majorName")),
  ).toBe(false);
});
it.each(["college", "graduateSchool"])(
  "adds %s using its section button without touching nested or sibling rows",
  async (name) => {
    mount();
    const root = document.querySelector(
      `[data-type="${name}"][data-wrap="collegeLoop"]`,
    )!;
    document
      .querySelector(`[data-button="addCollege"][data-loopname="${name}"]`)!
      .addEventListener("click", () =>
        root.insertAdjacentHTML(
          "beforeend",
          college(name, root.children.length),
        ),
      );
    function collect() {
      const c = collectPreparationSnapshot(document);
      return {
        registry: c.registry,
        isTargetSectionVisible: c.isSectionVisible,
        countRepeatableGroups: (p) =>
          c.countRepeatableGroups(p.actionCandidateId),
        repeatableGroupState: (p) =>
          c.repeatableGroupState(p.actionCandidateId),
      } satisfies PreparationSnapshot;
    }
    const c = collectPreparationSnapshot(document),
      action = c.request.sections.find(
        (s) => s.sectionId === `hplace-mrs2-${name}`,
      )?.actionCandidates[0];
    expect(action).toBeDefined();
    const result = await executeApprovedPreparationPlans({
      document,
      initialSnapshot: collect(),
      refreshSnapshot: async () => collect(),
      countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
      approvedPlans: [
        {
          approved: true,
          localItemCount: 2,
          plan: {
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            actionCandidateId: action!.candidateId,
          },
        },
      ],
    });
    expect(result.status).toBe("completed");
    expect(root.children.length).toBe(2);
    expect(
      document.querySelectorAll('[data-loop="collegeMajor"]'),
    ).toHaveLength(3);
  },
);
it.each(["highschool", "college", "graduateSchool"])(
  "writes YM dates with live %s constraints and retains period order",
  (name) => {
    mount();
    const { handle, item: review } = item(
      `hplace.mrs2.${name}.entranceDate`,
      "2020-03-02",
    );
    expect(getWriteAdapter(document).tryWrite(handle, review)).toEqual({
      handled: true,
      written: true,
    });
    expect(handle.elements[0].value).toBe("2020.03");
    const end = item(`hplace.mrs2.${name}.graduationDate`, "2019-02-01");
    expect(getWriteAdapter(document).tryWrite(end.handle, end.item)).toEqual({
      handled: true,
      written: false,
    });
  },
);
it.each([true, false])(
  "license selection respects privateinfo=%s and single YMD date",
  async (registration) => {
    mount();
    const { handle, item: review } = item(
      "hplace.mrs2.license.licenseName",
      "가상자격증",
    );
    handle.elements[0].addEventListener("keypress", () => {
      const span = handle.elements[0].closest(".span")!,
        box = span.querySelector(".searchResult")!;
      box.innerHTML =
        '<ul class="searchResultList"><li><button type="button" class="ellipsis" data-code="123" title="가상자격증" data-usescore="false" data-privateinfo="' +
        registration +
        '">가상자격증</button></li></ul>';
      box.querySelector("button")!.addEventListener("click", () => {
        (
          span.querySelector('[name$="licenseName"]') as HTMLInputElement
        ).value = "가상자격증";
        (
          span.querySelector('[name$="licenseCode"]') as HTMLInputElement
        ).value = "123";
        span.querySelector(".searchResultName")!.textContent = "가상자격증";
        if (!registration)
          (
            document.querySelector("[data-privateremove]") as HTMLElement
          ).style.display = "none";
      });
    });
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        review,
        new AbortController().signal,
      ),
    ).toBe(true);
    const names = collectFieldsSnapshot(document)
      .request.sections.flatMap((s) => s.items ?? [])
      .flatMap((i) => i.fields)
      .map((f) => f.domName);
    expect(names.includes("hplace.mrs2.license.registNumber")).toBe(
      registration,
    );
    const date = item("hplace.mrs2.license.acquireDate", "2024-02-29");
    expect(getWriteAdapter(document).tryWrite(date.handle, date.item)).toEqual({
      handled: true,
      written: true,
    });
    expect(date.handle.elements[0].value).toBe("2024.02.29");
  },
);
it("keeps an authenticated exam placeholder at its real index when adding a new last row", async () => {
  mount();
  const examRow = (i: number, auth = false) =>
    `<div class="loop" data-loop="languageExam" data-index="${i}"><div class="span"><div class="search"><label><input type="search" data-type="foreignExam"></label><div class="searchResult"></div></div><input type="hidden" name="languageExam[${i}].languageExamName"><span class="searchResultName"></span><input class="hidden" name="languageExam[${i}].languageExamCode"></div>${auth ? '<span class="ybmValidateDone">인증</span>' : ""}<div data-template="detail"><input type="hidden" name="languageExam[${i}].languageExamSn"></div><button type="button" data-button="add"></button></div>`;
  document
    .querySelector('section[data-code="18"]')!
    .insertAdjacentHTML(
      "beforeend",
      `<div class="subject" data-code="165" data-wrap="foreignExam">${examRow(0, true)}</div>`,
    );
  const c = collectPreparationSnapshot(document),
    action = c.request.sections.find(
      (s) => s.sectionId === "hplace-mrs2-foreignExam",
    )!.actionCandidates[0];
  const root = document.querySelector('[data-wrap="foreignExam"]')!;
  root.querySelector("button")!.addEventListener("click", () => {
    (root.querySelector("button") as HTMLButtonElement).hidden = true;
    root.insertAdjacentHTML("beforeend", examRow(1));
  });
  function collect() {
    const c = collectPreparationSnapshot(document);
    return {
      registry: c.registry,
      isTargetSectionVisible: c.isSectionVisible,
      countRepeatableGroups: (p) =>
        c.countRepeatableGroups(p.actionCandidateId),
      repeatableGroupState: (p) => c.repeatableGroupState(p.actionCandidateId),
    } satisfies PreparationSnapshot;
  }
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: action.candidateId,
        },
      },
    ],
  });
  expect(result.status).toBe("completed");
  const section = collectFieldsSnapshot(document).request.sections.find(
    (s) => s.sectionId === "hplace-mrs2-foreignExam",
  )!;
  expect(
    section.items!.map((i) => i.fields[0].semanticContext!.repeat),
  ).toEqual([
    { groupId: "hplace.mrs2.foreignExam", rowIndex: 0, rowCount: 2 },
    { groupId: "hplace.mrs2.foreignExam", rowIndex: 1, rowCount: 2 },
  ]);
  expect(section.items![0].fields[0]).toMatchObject({
    inert: true,
    displayName: "입력 불가(인증 시험 — 사용자 처리)",
  });
  expect(section.items![1].fields[0].inert).toBeUndefined();
});
it("uses the full observed regional code table without treating country as schoolRegion", () => {
  mount();
  document
    .querySelector('section[data-code="140"]')!
    .insertAdjacentHTML(
      "beforeend",
      '<select name="highschool.locationCode"><option value=""></option><option value="102">부산</option></select>',
    );
  const { handle, item: review } = item(
    "hplace.mrs2.highschool.locationCode",
    "부산",
  );
  review.analysis!.writePlan = { command: "SELECT_OPTION" };
  expect(getWriteAdapter(document).tryWrite(handle, review)).toEqual({
    handled: true,
    written: true,
  });
  expect(handle.elements[0].value).toBe("102");
});

it("maps the actual profile 재학중 value to the observed 재학 radio", () => {
  mount();
  document
    .querySelector('section[data-code="140"]')!
    .insertAdjacentHTML(
      "beforeend",
      '<label><input type="radio" name="highschool.graduationTypeCode" value="07">재학</label>',
    );
  const { handle, item: review } = item(
    "hplace.mrs2.highschool.graduationTypeCode",
    "재학중",
  );
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "school",
      sectionId: "highSchool",
      values: { completionStatus: "재학중" },
    },
  ];
  const resolved = resolveValueBinding(
    profile,
    review.analysis!.valueBinding!,
    0,
  );
  expect(resolved.status).toBe("resolved");
  if (resolved.status !== "resolved") throw new Error();
  review.profileValue = resolved.value;
  review.analysis!.writePlan = { command: "CHECK_RADIO" };
  expect(getWriteAdapter(document).tryWrite(handle, review)).toEqual({
    handled: true,
    written: true,
  });
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="highschool.graduationTypeCode"][value="07"]',
    )!.checked,
  ).toBe(true);
});

it.each(["score", "grade"])(
  "retains a real repeat exam row's committed search before writing fresh %s",
  async (kind) => {
    mount();
    document
      .querySelector('section[data-code="18"]')!
      .insertAdjacentHTML(
        "beforeend",
        `<div class="subject" data-code="165" data-wrap="foreignExam"><div class="loop" data-loop="languageExam" data-index="0"><div class="span"><div class="search"><label><input type="search" data-type="foreignExam"></label><div class="searchResult"></div></div><input type="hidden" name="languageExam[0].languageExamName"><span class="searchResultName"></span><input class="hidden" name="languageExam[0].languageExamCode"></div><span class="ybmValidateDone hide" style="display:none"></span><div data-template="detail"><input type="hidden" name="languageExam[0].languageExamSn"></div><button type="button" data-button="add"></button></div></div>`,
      );
    const query = document.querySelector<HTMLInputElement>(
      '[data-type="foreignExam"]',
    )!;
    query.addEventListener("keypress", () => {
      const results = query
        .closest("div.search")!
        .querySelector(".searchResult")!;
      results.innerHTML = `<ul class="searchResultList"><li><button class="ellipsis" type="button" data-code="EX001" title="합성 어학시험" data-gradeflag="${kind === "grade"}" data-scoreflag="${kind === "score"}" data-setupcode="" data-setupvalue="" data-perfactgrade="200">합성 어학시험</button></li></ul>`;
      results.querySelector("button")!.addEventListener("click", () => {
        const row = query.closest("[data-loop]")!;
        row.querySelector<HTMLInputElement>(
          '[name$=".languageExamName"]',
        )!.value = "합성 어학시험";
        row.querySelector<HTMLInputElement>(
          '[name$=".languageExamCode"]',
        )!.value = "EX001";
        row.querySelector(".searchResultName")!.textContent = "합성 어학시험";
        row.querySelector('[data-template="detail"]')!.innerHTML =
          kind === "score"
            ? '<input type="number" name="languageExam[0].score" min="0" max="9999"><input type="number" name="languageExam[0].perfectScore"><input name="languageExam[0].examDate"><input type="hidden" name="languageExam[0].languageExamSn">'
            : '<select name="languageExam[0].gradeCode"><option value=""></option><option value="G2">2급</option></select><input type="hidden" name="languageExam[0].languageExamSn">';
      });
    });
    const searchItem = item(
      "hplace.mrs2.foreignExam.languageExamName",
      "합성 어학시험",
    );
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        searchItem.handle,
        searchItem.item,
        new AbortController().signal,
      ),
    ).toBe(true);
    const detail = item(
      `hplace.mrs2.foreignExam.${kind === "grade" ? "gradeCode" : "score"}`,
      kind === "grade" ? "2급" : "150",
    );
    if (kind === "grade")
      detail.item.analysis!.writePlan = { command: "SELECT_OPTION" };
    expect(
      getWriteAdapter(document).tryWrite(detail.handle, detail.item),
    ).toEqual({ handled: true, written: true });
    expect(
      getWriteAdapter(document).verifyRetained?.(
        searchItem.handle,
        searchItem.item,
      ),
    ).toBe(true);
  },
);

import { buildReviewPlan } from "../review/review-plan";
import type { ProfileEntry } from "../../profile/model";
function educationReview(
  entry: ProfileEntry,
  sectionId = "hplace-mrs2-highschool",
) {
  const profile = createEmptyProfile();
  profile.education = [entry];
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections
    .filter((s) => s.sectionId === sectionId)
    .flatMap((s) => [...s.fields, ...(s.items ?? []).flatMap((i) => i.fields)]);
  const review = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: {
      snapshotId: snapshot.request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: fields.map((f) => {
        const l = snapshot.registry.lookupField(f.candidateId);
        if (!("handle" in l)) throw new Error();
        return {
          candidateId: f.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: nativeOwnership(l.handle)!.field.binding,
          writePlan: {
            command:
              f.control === "radio"
                ? "CHECK_RADIO"
                : f.control === "select"
                  ? "SELECT_OPTION"
                  : "SET_TEXT",
          },
        };
      }),
    },
  });
  return { snapshot, items: review.items };
}
const highschoolProfile = () => ({
  id: "synthetic-highschool",
  sectionId: "highSchool",
  values: {
    schoolName: "합성고등학교",
    completionStatus: "졸업",
    startDate: "2020-03-01",
    endDate: "2023-02-01",
  },
});
function existingSchool(prefix: string, name: string, code: string) {
  const input = document.querySelector<HTMLInputElement>(
    `[name="${prefix}.academyName"]`,
  )!;
  input.value = name;
  document.querySelector<HTMLInputElement>(
    `[name="${prefix}.academyCode"]`,
  )!.value = code;
  input.parentElement!.querySelector(".searchResultName")!.textContent = name;
}
it.each(["different-school", "date-only", "status-only"])(
  "blocks the highschool entity when existing values have %s identity",
  (fault) => {
    mount();
    if (fault === "different-school")
      existingSchool("highschool", "다른 합성고등학교", "H001");
    if (fault === "date-only")
      document.querySelector<HTMLInputElement>(
        '[name="highschool.entranceDate"]',
      )!.value = "2018.03";
    if (fault === "status-only")
      document.querySelector<HTMLInputElement>(
        '[name="highschool.graduationTypeCode"]',
      )!.checked = true;
    const { items } = educationReview(highschoolProfile());
    expect(items.every((i) => i.disabled)).toBe(true);
    expect(items.some((i) => i.reason.includes("신원"))).toBe(true);
  },
);
it("preserves the entire highschool entity even when its committed identity matches", () => {
  mount();
  existingSchool("highschool", "합성고등학교", "H001");
  const { items } = educationReview(highschoolProfile());
  expect(items.every((i) => i.disabled)).toBe(true);
  expect(items.every((i) => i.reason.includes("이미 입력"))).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>(
      '[name="highschool.graduationDate"]',
    )!.value,
  ).toBe("");
});
it("blocks an existing highschool row at the writer even without a local profile assignment", () => {
  mount();
  document.querySelector<HTMLInputElement>(
    '[name="highschool.entranceDate"]',
  )!.value = "2018.03";
  const end = item("hplace.mrs2.highschool.graduationDate", "2023-02-01");
  expect(getWriteAdapter(document).tryWrite(end.handle, end.item)).toEqual({
    handled: true,
    written: false,
  });
  expect(end.handle.elements[0].value).toBe("");
});
it("keeps matching existing college and highschool entities protected consistently", () => {
  mount();
  existingSchool("college[0]", "합성대학교", "U001");
  document.querySelector<HTMLInputElement>(
    '[name="college[0].degreeTypeCode"]',
  )!.checked = true;
  document.querySelector<HTMLInputElement>(
    '[name="college[0].entranceDate"]',
  )!.value = "2020.03";
  const { items } = educationReview(
    {
      id: "synthetic-college",
      sectionId: "university",
      values: {
        schoolName: "합성대학교",
        degreeLevel: "학사",
        startDate: "2020-03-01",
        endDate: "2024-02-01",
      },
    },
    "hplace-mrs2-college",
  );
  expect(items.every((i) => i.disabled)).toBe(true);
  expect(items.every((i) => i.reason.includes("이미 입력된 항목"))).toBe(true);
});
