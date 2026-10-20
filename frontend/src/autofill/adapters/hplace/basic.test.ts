import { afterEach, expect, it } from "vitest";
import { mountBasicDetail, activateBasicDetails } from "./basic.test-fixtures";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { collectFieldsSnapshot } from "../../dom/collect";
afterEach(resetHplacePage);

it("collects verified basic choice groups with exact native options", () => {
  mountBasicDetail();
  const fields = collectFieldsSnapshot(document).request.sections.flatMap(
    (s) => s.fields,
  );
  expect(fields.map((f) => f.domName)).toEqual(
    expect.arrayContaining([
      "hplace.detail.gender",
      "hplace.detail.nationality",
      "hplace.detail.veteranStatus",
      "hplace.detail.disabilityStatus",
      "hplace.detail.militaryStatus",
    ]),
  );
  expect(
    fields.find((f) => f.domName === "hplace.detail.gender")?.control,
  ).toBe("radio");
});
it("omits malformed optional groups while preserving mandatory anchors", () => {
  mountBasicDetail();
  (document.querySelector('[name="genderFlag"]') as HTMLInputElement).value =
    "X";
  const fields = collectFieldsSnapshot(document).request.sections.flatMap(
    (s) => s.fields,
  );
  expect(fields.some((f) => f.domName === "hplace.detail.gender")).toBe(false);
  expect(fields.some((f) => f.domName === "hplace.detail.birthday")).toBe(true);
});
it("collects enabled details only under the matching parent choice", () => {
  mountBasicDetail();
  activateBasicDetails();
  const names = () =>
    collectFieldsSnapshot(document)
      .request.sections.flatMap((s) => s.fields)
      .map((f) => f.domName);
  expect(names()).toEqual(
    expect.arrayContaining(
      [
        "veteranNumber",
        "veteranRelation",
        "disabilityGrade",
        "disabilityType",
        "militaryRank",
        "serviceStartDate",
        "serviceEndDate",
        "dischargeType",
      ].map((k) => `hplace.detail.${k}`),
    ),
  );
  expect(names()).not.toContain("hplace.detail.exemptionReason");
  (
    document.querySelector(
      '[name="military.militaryTypeCode"][value="03"]',
    ) as HTMLInputElement
  ).checked = true;
  expect(names()).toContain("hplace.detail.exemptionReason");
  expect(names()).not.toContain("hplace.detail.militaryRank");
});
import { basicAnalysis } from "./basic.test-fixtures";
import { createEmptyProfile } from "../../../profile/model";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
it("writes approved basic choices and conditional details without touching forbidden controls", async () => {
  mountBasicDetail();
  activateBasicDetails();
  const profile = createEmptyProfile();
  Object.assign(profile.personal, { gender: "남성", nationality: "대한민국" });
  Object.assign(profile.veteran, {
    veteranStatus: "대상",
    veteranNumber: "1234",
    veteranRelation: "본인",
  });
  Object.assign(profile.disability, {
    disabilityStatus: "대상",
    disabilityGrade: "심한 장애인",
    disabilityType: "지체장애",
  });
  Object.assign(profile.military, {
    militaryStatus: "군필",
    militaryRank: "병장",
    serviceStartDate: "2020-01-10",
    serviceEndDate: "2022-01-10",
    dischargeType: "만기제대",
  });
  const snapshot = collectFieldsSnapshot(document);
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  });
  const items = plan.items.filter((i) => i.profileValue);
  for (const i of items) i.selected = true;
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    registry: snapshot.registry,
    approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
    document,
  });
  expect(results.filter((r) => r.status === "written")).toHaveLength(13);
  expect(
    (
      document.querySelector(
        '[name="military.militaryStartDate"]',
      ) as HTMLInputElement
    ).value,
  ).toBe("2020.01");
  expect(
    (document.querySelector('[type="password"]') as HTMLInputElement).value,
  ).toBe("");
});
import { writeBasic } from "./basic-write";
async function singleGender(fault?: string) {
  mountBasicDetail();
  const profile = createEmptyProfile();
  profile.personal.gender = "남성";
  const snapshot = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  }).items.find(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey === "personal.personal.gender",
  )!;
  item.selected = true;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("missing fixture");
  if (fault === "existing")
    (
      document.querySelector(
        '[name="genderFlag"][value="F"]',
      ) as HTMLInputElement
    ).checked = true;
  if (fault === "binding" && item.analysis?.valueBinding?.type === "LOOKUP")
    item.analysis.valueBinding.optionMap = { 여성: "남" };
  if (fault === "duplicate")
    document
      .getElementById("frm")!
      .append(lookup.handle.elements[0].cloneNode());
  if (fault === "disabled")
    (lookup.handle.elements[0] as HTMLInputElement).disabled = true;
  if (fault === "unselected") item.selected = false;
  const result = await writeBasic(
    lookup.handle,
    item,
    () => true,
    fault === "profile"
      ? async () => {
          item.profileValue = "여";
          return true;
        }
      : undefined,
  );
  return {
    result,
    checked: (
      document.querySelector(
        '[name="genderFlag"][value="M"]',
      ) as HTMLInputElement
    ).checked,
  };
}
it.each([
  "existing",
  "binding",
  "duplicate",
  "disabled",
  "unselected",
  "profile",
])("refuses %s basic writes", async (fault) => {
  expect(await singleGender(fault)).toEqual({ result: false, checked: false });
});
it("writes a fresh approved radio group", async () =>
  expect(await singleGender()).toEqual({ result: true, checked: true }));
import { basicValue, basicTarget } from "./basic-write";
it("rejects an unverified selected option even with the expected label", () => {
  mountBasicDetail();
  const select = document.querySelector<HTMLSelectElement>(
    '[name="nationality"]',
  )!;
  select.add(new Option("대한민국", "ZZ", false, true));
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections[0].fields.find(
    (f) => f.domName === "hplace.detail.nationality",
  )!;
  const lookup = snapshot.registry.lookupField(field.candidateId);
  expect(lookup.status).toBe("ready");
  if (lookup.status === "ready")
    expect(basicValue(lookup.handle)).toBeUndefined();
});
it.each(["2020-02-30", "2020-13-01", "2020-00-01", "1899-12-01"])(
  "rejects invalid service date %s",
  (value) => expect(basicTarget("serviceStartDate", value)).toBeUndefined(),
);
it("does not collect disabled dependents or dependencies with the wrong relation", () => {
  mountBasicDetail();
  activateBasicDetails();
  document.querySelector<HTMLInputElement>(
    '[name="patriot.patriotNumber"]',
  )!.disabled = true;
  document
    .querySelector('[name="patriot.relationship"]')!
    .setAttribute("data-rel-target", "handicap");
  expect(
    collectFieldsSnapshot(document).request.sections[0].fields.map(
      (f) => f.domName,
    ),
  ).not.toEqual(
    expect.arrayContaining([
      "hplace.detail.veteranNumber",
      "hplace.detail.veteranRelation",
    ]),
  );
});
it("does not map service end date when the site's date precision is unverified", () => {
  mountBasicDetail();
  activateBasicDetails();
  // YM and YMD are verified (huonsgroup uses YMD); anything else fails closed.
  document
    .querySelector('[name="military.militaryStartDate"]')!
    .setAttribute("data-dates", "military.militaryDate:Y");
  expect(
    collectFieldsSnapshot(document).request.sections[0].fields.map(
      (f) => f.domName,
    ),
  ).not.toContain("hplace.detail.serviceEndDate");
});
import { matchesResultValue } from "../../workflow/result-value-match";
it("recognizes the verified month precision when comparing an existing service date", () => {
  mountBasicDetail();
  activateBasicDetails();
  const profile = createEmptyProfile();
  profile.military.serviceStartDate = "2020-01-10";
  const snapshot = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  }).items.find(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey ===
      "military.military.serviceStartDate",
  )!;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture missing");
  expect(matchesResultValue(item, "2020.01", "2020-01-10", lookup.handle)).toBe(
    true,
  );
});
it("recognizes the day precision of a YMD tenant when comparing a service date", () => {
  mountBasicDetail();
  activateBasicDetails();
  document
    .querySelector('[name="military.militaryStartDate"]')!
    .setAttribute("data-dates", "military.militaryDate:YMD");
  const profile = createEmptyProfile();
  profile.military.serviceStartDate = "2020-01-10";
  const snapshot = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  }).items.find(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey ===
      "military.military.serviceStartDate",
  )!;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture missing");
  expect(
    matchesResultValue(item, "2020.01.10", "2020-01-10", lookup.handle),
  ).toBe(true);
  expect(matchesResultValue(item, "2020.01", "2020-01-10", lookup.handle)).toBe(
    false,
  );
});
it.each(["beforeMutation", "focus", "change"])(
  "rechecks the opposite service date after %s",
  async (phase) => {
    mountBasicDetail();
    activateBasicDetails();
    const profile = createEmptyProfile();
    profile.military.serviceStartDate = "2020-01-10";
    const snapshot = collectFieldsSnapshot(document);
    const item = buildReviewPlan({
      registry: snapshot.registry,
      profile,
      analysis: basicAnalysis(snapshot.request),
    }).items.find(
      (i) =>
        i.analysis?.valueBinding?.profileFieldKey ===
        "military.military.serviceStartDate",
    )!;
    item.selected = true;
    const lookup = snapshot.registry.lookupField(item.candidateId);
    if (lookup.status !== "ready") throw new Error("fixture missing");
    const change = () => {
      document.querySelector<HTMLInputElement>(
        '[name="military.militaryEndDate"]',
      )!.value = "2019.01";
    };
    if (phase !== "beforeMutation")
      lookup.handle.elements[0].addEventListener(phase, change, { once: true });
    expect(
      await writeBasic(
        lookup.handle,
        item,
        () => true,
        phase === "beforeMutation"
          ? async () => {
              change();
              return true;
            }
          : undefined,
      ),
    ).toBe(false);
    if (phase !== "change") expect(lookup.handle.elements[0].value).toBe("");
  },
);
import { getWorkflowAdapter } from "../workflow";
it("does not report a settled positive status when its dependent controls remain disabled", async () => {
  mountBasicDetail();
  activateBasicDetails();
  document.querySelector<HTMLInputElement>(
    '[name="patriot.patriotNumber"]',
  )!.disabled = true;
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections[0].fields.find(
    (f) => f.domName === "hplace.detail.veteranStatus",
  )!;
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture missing");
  const profile = createEmptyProfile();
  profile.veteran.veteranStatus = "대상";
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  }).items.find((i) => i.candidateId === candidate.candidateId)!;
  item.selected = true;
  expect(
    await getWorkflowAdapter(document).settleStateDriver?.(
      document,
      lookup.handle,
      undefined,
      { item, signal: new AbortController().signal },
    ),
  ).toBe(false);
});
it("does not retain success when a later write makes the service period invalid", async () => {
  mountBasicDetail();
  activateBasicDetails();
  const profile = createEmptyProfile();
  profile.military.serviceStartDate = "2020-01-10";
  profile.veteran.veteranNumber = "1234";
  const snapshot = collectFieldsSnapshot(document);
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  });
  const items = plan.items
    .filter((i) => i.profileValue)
    .sort((a) =>
      a.analysis?.valueBinding?.profileFieldKey ===
      "military.military.serviceStartDate"
        ? -1
        : 1,
    );
  items.forEach((i) => {
    i.selected = true;
  });
  document
    .querySelector('[name="patriot.patriotNumber"]')!
    .addEventListener("change", () => {
      document.querySelector<HTMLInputElement>(
        '[name="military.militaryEndDate"]',
      )!.value = "2019.01";
    });
  const result = await executeApprovedWritesAfterPageSettles({
    items,
    registry: snapshot.registry,
    approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
    document,
  });
  expect(result[0].status).toBe("skipped");
});
it("does not click a state driver whose linked targets escape its subject", async () => {
  mountBasicDetail();
  const profile = createEmptyProfile();
  profile.veteran.veteranStatus = "대상";
  const snapshot = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  }).items.find(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey ===
      "veteran.veteran.veteranStatus",
  )!;
  item.selected = true;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture missing");
  document.body.insertAdjacentHTML(
    "beforeend",
    '<input data-rel-target="patriot" disabled>',
  );
  expect(await writeBasic(lookup.handle, item, () => true)).toBe(false);
  expect(
    (
      document.querySelector(
        '[name="patriot.patriotYn"][value="true"]',
      ) as HTMLInputElement
    ).checked,
  ).toBe(false);
});
it("fails settling a basic driver whose previously collected radio group was removed", async () => {
  mountBasicDetail();
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections[0].fields.find(
    (f) => f.domName === "hplace.detail.veteranStatus",
  )!;
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture missing");
  lookup.handle.elements[0].closest(".subject")!.remove();
  expect(
    await getWorkflowAdapter(document).settleStateDriver?.(
      document,
      lookup.handle,
    ),
  ).toBe(false);
});
it("fails settling a driver reverted by a later status interaction", async () => {
  mountBasicDetail();
  activateBasicDetails();
  const profile = createEmptyProfile();
  profile.veteran.veteranStatus = "대상";
  const snapshot = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: basicAnalysis(snapshot.request),
  }).items.find(
    (i) =>
      i.analysis?.valueBinding?.profileFieldKey ===
      "veteran.veteran.veteranStatus",
  )!;
  item.selected = true;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("fixture missing");
  document.querySelector<HTMLInputElement>(
    '[name="patriot.patriotYn"][value="false"]',
  )!.checked = true;
  expect(
    await getWorkflowAdapter(document).settleStateDriver?.(
      document,
      lookup.handle,
      undefined,
      { item, signal: new AbortController().signal },
    ),
  ).toBe(false);
});

it.each([
  ["남", "M"],
  ["남성", "M"],
  ["남자", "M"],
  [" m ", "M"],
  [" MaLe ", "M"],
  ["여", "F"],
  ["여성", "F"],
  ["여자", "F"],
  [" f ", "F"],
  [" FeMaLe ", "F"],
])(
  "maps run-1 gender synonym %s to %s with the legacy writer",
  async (gender, expected) => {
    mountBasicDetail();
    const p = createEmptyProfile();
    p.personal.gender = gender;
    const snapshot = collectFieldsSnapshot(document);
    const items = buildReviewPlan({
      registry: snapshot.registry,
      profile: p,
      analysis: basicAnalysis(snapshot.request),
    }).items.filter((i) => i.fieldLabel === "성별");
    items.forEach((i) => {
      i.selected = true;
    });
    await executeApprovedWritesAfterPageSettles({
      items,
      registry: snapshot.registry,
      document,
      approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
    });
    expect(
      document.querySelector<HTMLInputElement>('[name="genderFlag"]:checked')
        ?.value,
    ).toBe(expected);
  },
);
it.each(["unknown", "남녀", "male-other"])(
  "leaves unknown gender %s unmatched",
  async (gender) => {
    mountBasicDetail();
    const p = createEmptyProfile();
    p.personal.gender = gender;
    const snapshot = collectFieldsSnapshot(document);
    const items = buildReviewPlan({
      registry: snapshot.registry,
      profile: p,
      analysis: basicAnalysis(snapshot.request),
    }).items;
    expect(
      items.find((i) => i.fieldLabel === "성별")?.profileValue,
    ).toBeUndefined();
  },
);
