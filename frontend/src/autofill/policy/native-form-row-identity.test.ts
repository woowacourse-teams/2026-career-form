import { afterEach, expect, it } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { createEmptyProfile } from "../../profile/model";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { localItemCount } from "../workflow/workflow-model";
import { getWorkflowAdapter } from "../adapters/workflow";
import { getWriteAdapter } from "../adapters/write";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import { nativeOwnership } from "./native-form-collection";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { nativeTestItem } from "./__fixtures__/native-test-item";
import {
  educationProfile,
  mountEducation,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import { nativeRepeatableProfileCount } from "./native-form-row-assignment";
import type { FieldsAnalyzeResponse, PreparationPlan } from "../api/types";
afterEach(() => installExecutionPolicy(document));
function mount(rows = 2) {
  mountSyntheticNative(rows);
  document.querySelectorAll("script").forEach((s, i) => {
    s.src = seed.executionPolicy.browserPolicy.nativeForm.assetPaths[i];
  });
  installExecutionPolicy(
    document,
    structuredClone(seed.executionPolicy) as ExecutionPolicy,
  );
}
function control(index: number, name: string) {
  return document.querySelector<HTMLInputElement>(
    `[name="career[${index}].${name}"]`,
  )!;
}
const career = (id: string, company: string, date: string) => ({
  id,
  sectionId: "career",
  values: { companyName: company, startDate: date },
});
function state(entries: ReturnType<typeof career>[]) {
  const profile = createEmptyProfile();
  profile.careers = entries;
  const snapshot = collectFieldsSnapshot(document);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: snapshot.request.sections
      .flatMap((s) => s.items?.flatMap((i) => i.fields) ?? [])
      .map((f) => {
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
            command: f.control === "select" ? "SELECT_OPTION" : "SET_TEXT",
          },
        };
      }),
  };
  const review = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis,
  });
  const prep = collectPreparationSnapshot(document),
    action = prep.request.sections.flatMap((s) => s.actionCandidates)[0];
  const plan = {
    command: "ADD_REPEATABLE_GROUP",
    actionCandidateId: action.candidateId,
  } as PreparationPlan;
  return {
    review,
    snapshot,
    count: localItemCount(plan, prep, profile, getWorkflowAdapter(document)),
  };
}
it.each(["entranceDate", "company", "salary", "careerSn"])(
  "refuses the entire existing row when %s is already populated",
  (name) => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    control(0, name).value = name === "entranceDate" ? "2020.01" : "1234";
    const { handle, item } = nativeTestItem(
      name === "company" ? "entranceDate" : "company",
      name === "company" ? "2021-01-01" : "합성회사",
    );
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  },
);
it("excludes a unique existing identity and assigns the remaining profile to the blank physical row", () => {
  mount();
  control(0, "company").value = "합성회사 B";
  control(0, "entranceDate").value = "2021.01";
  const { review, snapshot, count } = state([
    career("a", "합성회사 A", "2020-01-01"),
    career("b", "합성회사 B", "2021-01-01"),
  ]);
  expect(count).toBe(2);
  const companyItems = review.items.filter(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey ===
      "careers.career.companyName",
  );
  expect(companyItems[0].disabled).toBe(true);
  expect(companyItems[0].reason).toContain("이미 입력된 항목");
  expect(companyItems[1].profileValue).toBe("합성회사 A");
  expect(companyItems[1].profileEntryId).toBe("a");
  expect(snapshot.registry.fieldItemCount(companyItems[1].candidateId)).toBe(2);
});
it("counts an unrelated completed row without assigning any profile into it", () => {
  mount();
  control(0, "company").value = "합성회사 C";
  control(0, "entranceDate").value = "2019.01";
  const { review, count } = state([career("a", "합성회사 A", "2020-01-01")]);
  expect(count).toBe(2);
  const items = review.items.filter(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey ===
      "careers.career.companyName",
  );
  expect(items[0].disabled).toBe(true);
  expect(items[1].profileEntryId).toBe("a");
});
it.each(["partial", "duplicate", "conflicting-detail"])(
  "requires manual section review for %s identity",
  (fault) => {
    mount();
    control(0, "company").value = "합성회사 A";
    if (fault !== "partial") control(0, "entranceDate").value = "2020.01";
    if (fault === "conflicting-detail")
      control(0, "leavingDate").value = "2022.01";
    const entries = [career("a", "합성회사 A", "2020-01-01")];
    if (fault === "duplicate")
      entries.push(career("b", "합성회사 A", "2020-01-01"));
    const { review, count } = state(entries);
    expect(count).toBeUndefined();
    expect(review.items.every((i) => i.disabled)).toBe(true);
  },
);
it("continues its own writes but rejects a later user value elsewhere in the row", () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  const first = nativeTestItem("company", "합성회사");
  expect(getWriteAdapter(document).tryWrite(first.handle, first.item)).toEqual({
    handled: true,
    written: true,
  });
  const next = nativeTestItem("entranceDate", "2020-01-01");
  expect(getWriteAdapter(document).tryWrite(next.handle, next.item)).toEqual({
    handled: true,
    written: true,
  });
  control(0, "salary").value = "5000";
  const last = nativeTestItem("leavingDate", "2021-01-01");
  expect(getWriteAdapter(document).tryWrite(last.handle, last.item)).toEqual({
    handled: true,
    written: false,
  });
});

it("rechecks the whole row after focus before setting a blank value", () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  const { handle, item } = nativeTestItem("company", "합성회사");
  handle.elements[0].addEventListener(
    "focus",
    () => {
      control(0, "entranceDate").value = "2019.01";
    },
    { once: true },
  );
  expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
    handled: true,
    written: false,
  });
  expect(handle.elements[0].value).toBe("");
});
it("refuses additions beyond the section contract limit", () => {
  mount(1);
  const { count } = state(
    Array.from({ length: 21 }, (_, i) =>
      career(`c${i}`, `합성회사 ${i}`, "2020-01-01"),
    ),
  );
  expect(count).toBeUndefined();
});

import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
import { nativeCareerRow } from "./__fixtures__/hplace-mrs2-native.synthetic";
it("adds only the missing profile after a matched existing row and writes only the new row", async () => {
  mount(1);
  control(0, "company").value = "합성회사 A";
  control(0, "entranceDate").value = "2020.01";
  const entries = [
    career("a", "합성회사 A", "2020-01-01"),
    career("b", "합성회사 B", "2021-01-01"),
  ];
  const count = state(entries).count;
  expect(count).toBe(2);
  const root = document.querySelector('[data-wrap="career"]')!;
  let clicks = 0;
  root.querySelector("button")!.addEventListener("click", () => {
    clicks++;
    (root.querySelector("button") as HTMLButtonElement).hidden = true;
    root.insertAdjacentHTML("beforeend", nativeCareerRow(1));
  });
  const collect = () => {
    const c = collectPreparationSnapshot(document);
    return {
      registry: c.registry,
      isTargetSectionVisible: c.isSectionVisible,
      countRepeatableGroups: (p) =>
        c.countRepeatableGroups(p.actionCandidateId),
      repeatableGroupState: (p) => c.repeatableGroupState(p.actionCandidateId),
    } satisfies PreparationSnapshot;
  };
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: count,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result.status).toBe("completed");
  expect(clicks).toBe(1);
  const { review, snapshot } = state(entries);
  const items = review.items.filter(
    (i) => i.profileEntryId === "b" && i.profileValue,
  );
  expect(items).toHaveLength(2);
  for (const item of items) {
    item.selected = true;
    const l = snapshot.registry.lookupField(item.candidateId);
    if (!("handle" in l)) throw new Error();
    expect(getWriteAdapter(document).tryWrite(l.handle, item)).toEqual({
      handled: true,
      written: true,
    });
  }
  expect(control(0, "company").value).toBe("합성회사 A");
  expect(control(0, "entranceDate").value).toBe("2020.01");
  expect(control(1, "company").value).toBe("합성회사 B");
  expect(control(1, "entranceDate").value).toBe("2021.01");
  expect(state(entries).count).toBe(2);
});

it("invalidates an approved add when the user edits an existing row after counting", () => {
  mount(1);
  state([
    career("a", "합성회사 A", "2020-01-01"),
    career("b", "합성회사 B", "2021-01-01"),
  ]);
  const snapshot = collectPreparationSnapshot(document),
    action = snapshot.request.sections.flatMap((s) => s.actionCandidates)[0];
  expect(snapshot.registry.lookupAction(action.candidateId).status).toBe(
    "ready",
  );
  control(0, "company").value = "사용자 입력";
  expect(snapshot.registry.lookupAction(action.candidateId).status).toBe(
    "stale",
  );
});
it("does not suppress a profile when a populated mapped option is unverified", () => {
  mount();
  control(0, "company").value = "합성회사 A";
  control(0, "entranceDate").value = "2020.01";
  const select = document.querySelector<HTMLSelectElement>(
    '[name="career[0].careerCriteriaCodeSn"]',
  )!;
  select.add(new Option("알 수 없음", "unverified", false, true));
  expect(
    state([career("a", "합성회사 A", "2020-01-01")]).count,
  ).toBeUndefined();
});

it("rejects overlap between an earlier existing row and a later prior assignment", () => {
  mount(2);
  control(0, "company").value = "합성회사 B";
  control(0, "entranceDate").value = "2021.01";
  const entries = [career("a", "합성회사 A", "2020-01-01")];
  expect(state(entries).count).toBe(2); // The blank second row is assigned A.
  control(0, "company").value = "합성회사 A";
  control(0, "entranceDate").value = "2020.01";
  const next = state(entries);
  expect(next.count).toBeUndefined();
  expect(next.review.items.every((i) => i.disabled)).toBe(true);
});

/** CF-177 C5: an occupied college row keeps its identity under the section's
 * YMD date token, so the same school is not planned twice. Synthetic values. */
it.each([
  ["YM", "2020.03"],
  ["YMD", "2020.03.01"],
] as const)(
  "recognizes an occupied %s college row as the matching profile entry",
  (format, entrance) => {
    mountEducation(1, 1, false, { dateInputFormat: format });
    const set = (name: string, value: string) =>
      (document.querySelector<HTMLInputElement>(
        `[name="college[0].${name}"]`,
      )!.value = value);
    set("academyName", "합성대학 A");
    set("academyCode", "SYN001");
    document.querySelector(
      "[data-loop=college] .searchResultName",
    )!.textContent = "합성대학 A";
    document.querySelector<HTMLInputElement>(
      '[name="college[0].degreeTypeCode"][value="50"]',
    )!.checked = true;
    set("entranceDate", entrance);
    expect(
      nativeRepeatableProfileCount(
        document,
        "hplace.mrs2.college.add",
        educationProfile(),
      ),
    ).toBe(2);
  },
);
