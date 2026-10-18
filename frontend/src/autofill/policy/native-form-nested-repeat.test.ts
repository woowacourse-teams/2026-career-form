import { afterEach, expect, it } from "vitest";
import {
  mountEducation,
  educationProfile,
  educationReview,
  educationItem,
  majorRow,
} from "./__fixtures__/hplace-mrs2-education.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { collectPreparationSnapshot } from "../dom/collect";
import { nativeRepeatableProfileCount } from "./native-form-row-assignment";
import { nativeWriteAdapter } from "./native-form-write";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
afterEach(() => installExecutionPolicy(document));
function action(index = 0) {
  const c = collectPreparationSnapshot(document);
  const a = c.request.sections
    .find((s) => s.sectionId === "hplace-mrs2-college")
    ?.items?.find((i) => i.itemId === `hplace-mrs2-college-item-${index}`)
    ?.actionCandidates[0];
  expect(a).toBeDefined();
  return { c, a: a! };
}
function prep(): PreparationSnapshot {
  const c = collectPreparationSnapshot(document);
  return {
    registry: c.registry,
    isTargetSectionVisible: c.isSectionVisible,
    countRepeatableGroups: (p) => c.countRepeatableGroups(p.actionCandidateId),
    repeatableGroupState: (p) => c.repeatableGroupState(p.actionCandidateId),
  };
}
it("flattens three profile role slots within two colleges and one graduate parent", () => {
  mountEducation(2, 3);
  const { snapshot, review } = educationReview();
  expect(snapshot.request.sections.map((s) => s.items?.length)).toEqual([2, 1]);
  expect(educationItem(".major0.majorName").item.profileValue).toBe(
    "소프트웨어융합",
  );
  expect(educationItem(".major0.majorName").item.profileEntryId).toBe(
    "college-a",
  );
  expect(
    review.items.filter((i) => i.profileValue === "가상연구전공"),
  ).toHaveLength(1);
  expect(JSON.stringify(snapshot.request)).not.toContain("소프트웨어융합");
  expect(educationItem(".major0.majorTypeCode").item.profileValue).toBe(
    "주전공",
  );
  expect(educationItem(".major1.majorTypeCode").item.profileValue).toBe(
    "복수전공",
  );
  expect(educationItem(".major2.majorTypeCode").item.profileValue).toBe(
    "부전공",
  );
});
it("compacts a minor-only additional major without copying main attendance", () => {
  mountEducation(2, 3);
  const p = educationProfile();
  p.education[0].values.doubleMajorStatus = "없음";
  p.education[0].values.additionalMajorName = "";
  expect(educationItem(".major1.majorName", 0, p).item.profileValue).toBe(
    "가상부전공",
  );
  expect(educationItem(".major1.majorTypeCode", 0, p).item.profileValue).toBe(
    "부전공",
  );
  expect(
    educationReview(p).snapshot.request.sections[0].items![0].fields.filter(
      (f) => f.domName?.endsWith(".dayOrNight"),
    ),
  ).toHaveLength(1);
});
it("adds two blank children only to the assigned parent", async () => {
  mountEducation();
  const { a } = action();
  expect(
    nativeRepeatableProfileCount(document, a.domId, educationProfile()),
  ).toBe(3);
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: prep(),
    refreshSnapshot: async () => prep(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 3,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: a.candidateId,
        },
      },
    ],
  });
  expect(result).toMatchObject({ status: "completed", executedPlanCount: 2 });
  expect(
    document.querySelectorAll(
      '[data-loop=college][data-index="0"] [data-loop=collegeMajor]',
    ),
  ).toHaveLength(3);
  expect(
    document.querySelectorAll(
      '[data-loop=college][data-index="1"] [data-loop=collegeMajor]',
    ),
  ).toHaveLength(1);
  expect(
    nativeRepeatableProfileCount(document, a.domId, educationProfile()),
  ).toBe(3);
});
it.each([0, 2])("rejects child delta %s", async (delta) => {
  mountEducation();
  const { a, c } = action();
  nativeRepeatableProfileCount(document, a.domId, educationProfile());
  const lookup = c.registry.lookupAction(a.candidateId);
  if (!("handle" in lookup)) throw new Error();
  (lookup.handle.element as HTMLButtonElement).onclick = () => {
    const root = lookup.handle.element.closest("[data-wrap=major]")!;
    for (let j = 0; j < delta; j++)
      root.insertAdjacentHTML("beforeend", majorRow("college[0]", j + 1));
  };
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: prep(),
    refreshSnapshot: async () => prep(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: a.candidateId,
        },
      },
    ],
  });
  expect(result.status).toBe("failed");
});
it("preserves an existing major role and refuses nested additions in its parent", () => {
  mountEducation();
  document.querySelector<HTMLInputElement>(
    '[name="college[0].collegeMajor[0].majorTypeCode"][value="02"]',
  )!.checked = true;
  const { a } = action();
  expect(
    nativeRepeatableProfileCount(document, a.domId, educationProfile()),
  ).toBeNull();
  expect(educationItem(".major0.majorName").item.disabled).toBe(true);
});
it("rejects stale parent replacement and child deletion/reindexing", () => {
  mountEducation(2, 3);
  const x = educationItem(".major1.majorTypeCode");
  const parent = x.handle.elements[0].closest("[data-loop=college]")!;
  parent.replaceWith(parent.cloneNode(true));
  expect(nativeWriteAdapter.tryWrite(x.handle, x.item)).toEqual({
    handled: true,
    written: false,
  });
  mountEducation(2, 3);
  const y = educationItem(".major1.majorTypeCode");
  document.querySelector("[data-loop=collegeMajor]")!.remove();
  expect(nativeWriteAdapter.tryWrite(y.handle, y.item)).toEqual({
    handled: true,
    written: false,
  });
});

it("accepts same-child linked controls from the public template and rejects a sibling target", () => {
  mountEducation();
  for (const e of document.querySelectorAll(
    '[name^="college[0].collegeMajor[0]."][data-rel-target]',
  ))
    e.setAttribute("data-rel-target", "college[0].collegeMajor[0]");
  expect(educationItem(".major0.majorTypeCode").item.disabled).toBe(false);
  document
    .querySelector('[name="college[0].collegeMajor[0].majorTypeCode"]')!
    .setAttribute("data-rel-target", "college[1]");
  expect(
    educationReview().snapshot.request.sections[0].items![0].fields.some((f) =>
      f.domName?.includes("major0"),
    ),
  ).toBe(false);
});
it("blocks duplicate profile major names and a changed child topology after reassignment", () => {
  mountEducation(2, 3);
  const p = educationProfile();
  p.education[0].values.additionalMajorName = p.education[0].values.majorName;
  expect(educationItem(".major1.majorName", 0, p).item.disabled).toBe(true);
  mountEducation(2, 3);
  educationReview();
  const root = document.querySelector("[data-wrap=major]")!;
  root.replaceChild(root.children[1].cloneNode(true), root.children[1]);
  expect(educationItem(".major1.majorName").item.disabled).toBe(true);
});
it("fails when the add handler mutates a sibling school", async () => {
  mountEducation();
  const { a, c } = action();
  nativeRepeatableProfileCount(document, a.domId, educationProfile());
  const l = c.registry.lookupAction(a.candidateId);
  if (!("handle" in l)) throw new Error();
  const button = l.handle.element as HTMLButtonElement;
  const original = button.onclick!;
  button.onclick = function (e) {
    original.call(this, e);
    document.querySelector<HTMLInputElement>(
      '[name="college[1].score"]',
    )!.value = "2";
  };
  const r = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: prep(),
    refreshSnapshot: async () => prep(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: a.candidateId,
        },
      },
    ],
  });
  expect(r.status).toBe("failed");
});

it("prepares both parents in one approved sequence without stale sibling guards", async () => {
  mountEducation();
  const p = educationProfile();
  p.education[1].values.minorStatus = "있음";
  p.education[1].values.minorName = "두번째 부전공";
  const first = action(0),
    second = action(1);
  expect(nativeRepeatableProfileCount(document, first.a.domId, p)).toBe(3);
  expect(nativeRepeatableProfileCount(document, second.a.domId, p)).toBe(2);
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: prep(),
    refreshSnapshot: async () => prep(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [first.a, second.a].map((a, i) => ({
      approved: true,
      localItemCount: i ? 2 : 3,
      plan: {
        command: "ADD_REPEATABLE_GROUP",
        expectedEffect: "GROUP_COUNT_INCREMENT",
        actionCandidateId: a.candidateId,
      },
    })),
  });
  expect(result).toMatchObject({ status: "completed", executedPlanCount: 3 });
});

it("reruns a completed major preparation without another click", async () => {
  mountEducation();
  const { a } = action();
  const profile = educationProfile();
  const run = async () => {
    const count = nativeRepeatableProfileCount(document, a.domId, profile);
    return executeApprovedPreparationPlans({
      document,
      initialSnapshot: prep(),
      refreshSnapshot: async () => prep(),
      countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
      approvedPlans: [
        {
          approved: true,
          localItemCount: count!,
          plan: {
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
            actionCandidateId: a.candidateId,
          },
        },
      ],
    });
  };
  expect(await run()).toMatchObject({
    status: "completed",
    executedPlanCount: 2,
  });
  expect(await run()).toMatchObject({
    status: "completed",
    executedPlanCount: 0,
  });
});

it("collects majors through arbitrary non-loop wrappers but never from another parent", () => {
  mountEducation();
  const root = document.querySelector("[data-wrap=major]")!;
  const wrapper = document.createElement("div");
  root.replaceWith(wrapper);
  wrapper.append(root);
  expect(
    educationReview().review.items.filter(
      (i) => i.profileValue === "소프트웨어융합",
    ),
  ).toHaveLength(1);
  const alien = document.createElement("div");
  alien.dataset.loop = "graduateSchool";
  root.replaceWith(alien);
  alien.append(root);
  expect(
    educationReview().snapshot.request.sections[0].items![0].fields.some((f) =>
      f.domName?.includes("major0"),
    ),
  ).toBe(false);
});
it.each(["majorCategoryCode", "ranking"])(
  "accepts exact rank dependency %s but rejects a sibling major dependency",
  (suffix) => {
    mountEducation();
    const root = document.querySelector("[data-wrap=major]")!;
    root.closest("[data-loop=college]")!.append(root);
    const child = document.querySelector("[data-loop=collegeMajor]")!;
    const rank = document.createElement("div");
    rank.dataset.relTarget = `college[0].collegeMajor[0].${suffix}`;
    child.append(rank);
    expect(
      educationReview().snapshot.request.sections[0].items![0].fields.some(
        (f) => f.domName?.includes("major0"),
      ),
    ).toBe(true);
    rank.dataset.relTarget = `college[0].collegeMajor[1].${suffix}`;
    expect(
      educationReview().snapshot.request.sections[0].items![0].fields.some(
        (f) => f.domName?.includes("major0"),
      ),
    ).toBe(false);
  },
);

it("rejects a second empty major wrapper instead of choosing the populated wrapper", () => {
  mountEducation();
  const wrapper = document.querySelector("[data-wrap=major]")!;
  wrapper.after(wrapper.cloneNode(false));
  expect(
    educationReview().snapshot.request.sections[0].items![0].fields.some((f) =>
      f.domName?.includes("major0"),
    ),
  ).toBe(false);
});

it("rejects a malformed nearest major wrapper instead of skipping it", () => {
  mountEducation();
  const child = document.querySelector("[data-loop=collegeMajor]")!;
  const wrapper = document.createElement("section");
  wrapper.dataset.wrap = "major";
  child.replaceWith(wrapper);
  wrapper.append(child);
  expect(
    educationReview().snapshot.request.sections[0].items![0].fields.some((f) =>
      f.domName?.includes("major0"),
    ),
  ).toBe(false);
});
