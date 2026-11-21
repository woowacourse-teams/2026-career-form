import { afterEach, describe, expect, it } from "vitest";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../../dom/collect";
import type { FieldCandidateHandle } from "../../dom/types";
import { buildReviewPlan, type ReviewPlanItem } from "../../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
import type { Profile } from "../../../profile/model";
import {
  isUnsupportedHplace,
  resolveDocumentCompany,
  unsupportedHplaceKind,
} from "../company";
import { getWorkflowAdapter } from "../workflow";
import {
  renderHplaceLogin,
  resetHplacePage,
} from "../../workflow/test-utils/hplace.fixture";
import { mountDetail } from "./detail.test-fixtures";
import { hplaceUnverifiedRows } from "./unverified-structure";
import {
  dateInput,
  dropdownTrigger,
  mountV1Step1,
  named,
  rowOf,
  selectedToggle,
  toggleButton,
  unlockDependents,
  v1Analysis,
  v1Profile,
} from "./v1-basic.test-fixtures";

afterEach(resetHplacePage);

const name = (key: string) => `hplace.v1.${key}`;
const lockedNames = [
  "englishName.familyFirst",
  "birthday",
  "gender",
  "emergencyPhone",
  "militaryStatus",
  "disabilityStatus",
  "veteranStatus",
  "nationality",
].map(name);
const allNames = [
  "englishName.familyFirst",
  "birthday",
  "gender",
  "emergencyPhone",
  "militaryStatus",
  "serviceStartDate",
  "serviceEndDate",
  "militarySpecialty",
  "militaryRank",
  "dischargeType",
  "militaryBranch",
  "disabilityStatus",
  "disabilityRegistrationNumber",
  "disabilityGrade",
  "disabilityType",
  "veteranStatus",
  "veteranNumber",
  "veteranRelation",
  "nationality",
].map(name);

function fieldNames() {
  return collectFieldsSnapshot(document)
    .request.sections.flatMap((s) => s.fields)
    .map((f) => f.domName);
}

/** One analysis pass the way workflow-analysis builds its plan. */
function analyzePass(profile: Profile) {
  const snapshot = collectFieldsSnapshot(document);
  const analysis = v1Analysis(snapshot.request);
  const adapter = getWorkflowAdapter(document);
  const ignore = new Set(
    analysis.fields.flatMap((field) => {
      if (field.matchType !== "MATCH") return [];
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return lookup.status === "ready" &&
        adapter.prefersProfileValue?.(lookup.handle, field)
        ? [field.candidateId]
        : [];
    }),
  );
  const plan = buildReviewPlan({
    analysis,
    profile,
    registry: snapshot.registry,
    ignoreCurrentValueCandidateIds: ignore,
  });
  const handleOf = (item: ReviewPlanItem) => {
    const lookup = snapshot.registry.lookupField(item.candidateId);
    return lookup.status === "ready" ? lookup.handle : undefined;
  };
  const item = (key: string) =>
    plan.items.find((i) => handleOf(i)?.candidate.domName === name(key))!;
  return { snapshot, plan, item, handleOf, adapter };
}

/** Approves every item that has a profile value, as a user would. */
async function writeAll(
  pass: ReturnType<typeof analyzePass>,
  onlyAvailable = false,
) {
  const items = pass.plan.items.filter(
    (i) =>
      i.profileValue &&
      (!onlyAvailable ||
        i.status === "available" ||
        i.status === "needs-review"),
  );
  for (const i of items) if (i.status !== "conflict") i.selected = true;
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    registry: pass.snapshot.registry,
    approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
    document,
    beforeMutation: async () => true,
  });
  const resultOf = (key: string) =>
    results.find((r) => r.candidateId === pass.item(key)?.candidateId);
  return { results, resultOf };
}

describe("recognition", () => {
  it("supports step 1 of the v1 resume form as Hplace", () => {
    mountV1Step1();
    expect(resolveDocumentCompany(document)).toBe("hplace");
    expect(isUnsupportedHplace(document)).toBe(false);
    expect(unsupportedHplaceKind(document)).toBeUndefined();
  });

  it.each([
    ["2", undefined],
    ["3", undefined],
    ["4", undefined],
    ["1", "/v1/applicant/resume-form/4242/preview"],
    ["1", "/v1/applicant/resume-form/abc"],
    ["1", "/v1/applicant/my-page"],
  ])("keeps step %s at %s unsupported", (step, path) => {
    mountV1Step1(step, path);
    expect(resolveDocumentCompany(document)).toBe("hplace");
    expect(isUnsupportedHplace(document)).toBe(true);
    expect(unsupportedHplaceKind(document)).toBe("v1");
    expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
  });

  it("keeps the v1 login page unsupported", () => {
    renderHplaceLogin();
    expect(isUnsupportedHplace(document)).toBe(true);
    expect(unsupportedHplaceKind(document)).toBe("v1");
  });

  it("keeps step 1 unsupported when no control verifies", () => {
    mountV1Step1();
    document.querySelectorAll(".x-row").forEach((r) => r.remove());
    expect(isUnsupportedHplace(document)).toBe(true);
    expect(unsupportedHplaceKind(document)).toBe("v1");
  });

  it("leaves MRS2 detail collection unchanged", () => {
    mountDetail(true);
    expect(isUnsupportedHplace(document)).toBe(false);
    expect(fieldNames()).toEqual([
      "hplace.detail.englishName.familyFirst",
      "hplace.detail.birthday",
      "hplace.detail.detailAddress",
      "hplace.detail.emergencyPhone",
    ]);
  });
});

describe("collection", () => {
  it("sends one section with the exact wire shape and skips locked dependents", () => {
    mountV1Step1();
    const { request } = collectFieldsSnapshot(document);
    expect(request.site.pathPattern).toBe("/v1/applicant/resume-form/*");
    expect(request.sections.map((s) => s.sectionId)).toEqual([
      "hplace-v1-basic",
    ]);
    const statusOptions = (labels: string[]) =>
      labels.map((l) => ({ optionId: l, displayName: l }));
    expect(request.sections[0].fields).toEqual([
      {
        candidateId: "field-1",
        domId: name("englishName.familyFirst"),
        domName: name("englishName.familyFirst"),
        element: "input",
        control: "text",
        displayName: "영문이름",
        visibility: "visible",
      },
      {
        candidateId: "field-2",
        domId: name("birthday"),
        domName: name("birthday"),
        element: "input",
        control: "text",
        displayName: "생년월일",
        visibility: "visible",
      },
      {
        candidateId: "field-3",
        domId: name("gender"),
        domName: name("gender"),
        element: "input",
        control: "radio",
        displayName: "성별",
        visibility: "visible",
        options: [
          { optionId: "M", displayName: "남" },
          { optionId: "F", displayName: "여" },
        ],
      },
      {
        candidateId: "field-4",
        domId: name("emergencyPhone"),
        domName: name("emergencyPhone"),
        element: "input",
        control: "text",
        displayName: "비상연락처",
        visibility: "visible",
      },
      {
        candidateId: "field-5",
        domId: name("militaryStatus"),
        domName: name("militaryStatus"),
        element: "input",
        control: "radio",
        displayName: "병역",
        visibility: "visible",
        options: statusOptions(["비대상", "군필", "미필", "면제", "복무중"]),
      },
      {
        candidateId: "field-6",
        domId: name("disabilityStatus"),
        domName: name("disabilityStatus"),
        element: "input",
        control: "radio",
        displayName: "장애여부",
        visibility: "visible",
        options: statusOptions(["비대상", "대상"]),
      },
      {
        candidateId: "field-7",
        domId: name("veteranStatus"),
        domName: name("veteranStatus"),
        element: "input",
        control: "radio",
        displayName: "보훈여부",
        visibility: "visible",
        options: statusOptions(["비대상", "대상"]),
      },
      {
        candidateId: "field-8",
        domId: name("nationality"),
        domName: name("nationality"),
        element: "select",
        control: "select",
        displayName: "국적",
        visibility: "visible",
        options: [{ optionId: "KR", displayName: "대한민국" }],
      },
    ]);
    expect(collectPreparationSnapshot(document).request.sections).toEqual([
      { sectionId: "hplace-v1-basic", actionCandidates: [] },
    ]);
    // Locked dependents are neither collected nor reported as unverified.
    expect(hplaceUnverifiedRows(document, request, v1Profile())).toEqual([]);
  });

  it("collects unlocked dependents with the known option catalogs", async () => {
    mountV1Step1();
    await unlockDependents();
    const fields = collectFieldsSnapshot(document).request.sections[0].fields;
    expect(fields.map((f) => f.domName)).toEqual(allNames);
    const field = (key: string) => fields.find((f) => f.domName === name(key))!;
    expect(field("serviceStartDate")).toMatchObject({
      element: "input",
      control: "text",
      displayName: "입대일",
    });
    expect(field("militarySpecialty")).toMatchObject({
      element: "input",
      control: "text",
    });
    expect(field("militaryRank")).toMatchObject({
      element: "select",
      control: "select",
      displayName: "계급",
    });
    expect(field("militaryRank").options).toHaveLength(21);
    expect(field("militaryRank").options![3]).toEqual({
      optionId: "04",
      displayName: "병장",
    });
    expect(field("dischargeType").options![0]).toEqual({
      optionId: "01",
      displayName: "만기제대",
    });
    expect(
      field("militaryBranch").options!.find((o) => o.optionId === "04"),
    ).toEqual({ optionId: "04", displayName: "해병" });
    expect(field("disabilityGrade").options).toEqual([
      { optionId: "100", displayName: "심한 장애인" },
      { optionId: "200", displayName: "심하지 않은 장애인" },
    ]);
    expect(field("disabilityType").options).toHaveLength(16);
    expect(field("veteranRelation").options).toHaveLength(11);
    expect(field("veteranRelation").options![0]).toEqual({
      optionId: "부",
      displayName: "부",
    });
    for (const f of fields) {
      expect(f.domId).toBe(f.domName);
      expect(f.visibility).toBe("visible");
      expect(f).not.toHaveProperty("disabled");
    }
  });

  it.each([
    [
      "emergencyPhone",
      () =>
        named(
          "basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber",
        ).after(
          named(
            "basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber",
          ).cloneNode(),
        ),
    ],
    [
      "veteranStatus",
      () =>
        toggleButton("보훈여부", "대상")
          .closest("li")!
          .insertAdjacentHTML(
            "afterend",
            '<li class="ats-list-none"><button type="button">기타</button></li>',
          ),
    ],
    [
      "nationality",
      () => (dropdownTrigger("nationality").textContent = "알 수 없는 값"),
    ],
    [
      "gender",
      () => (rowOf("성별").querySelector("label span")!.textContent = "남자"),
    ],
    ["birthday", () => (dateInput("YYYY.MM.DD").type = "password")],
  ])("drops only a malformed %s and reports it as unverified", (key, fault) => {
    mountV1Step1();
    fault();
    const { request } = collectFieldsSnapshot(document);
    expect(request.sections[0].fields.map((f) => f.domName)).toEqual(
      lockedNames.filter((n) => n !== name(key)),
    );
    expect(isUnsupportedHplace(document)).toBe(false);
    const rows = hplaceUnverifiedRows(document, request, v1Profile());
    expect(rows.map((r) => r.candidateId)).toEqual([
      `hplace-unverified-v1-${key}`,
    ]);
    expect(rows.every((r) => r.failureCode === "STRUCTURE_UNVERIFIED")).toBe(
      true,
    );
  });

  it("does not guess a control whose row title is missing", () => {
    mountV1Step1();
    // The same rows without their aria-hidden titles: nothing is guessed.
    for (const title of ["생년월일", "병역", "국적"])
      rowOf(title).querySelector('span[aria-hidden="true"]')!.remove();
    expect(fieldNames()).toEqual(
      lockedNames.filter(
        (n) =>
          ![
            name("birthday"),
            name("militaryStatus"),
            name("nationality"),
          ].includes(n),
      ),
    );
  });
});

describe("writing", () => {
  it("writes every approved control and verifies each by readback", async () => {
    const page = mountV1Step1();
    await unlockDependents();
    const pass = analyzePass(v1Profile());
    const { results } = await writeAll(pass);
    expect(results.filter((r) => r.status !== "written")).toEqual([]);
    expect(results).toHaveLength(19);
    expect(named("basicInfoGroupAnswers.englishName").value).toBe(
      "Tester Synthetic",
    );
    expect(dateInput("YYYY.MM.DD").value).toBe("1990.01.31");
    expect(
      document.querySelector<HTMLInputElement>('[value="M"]')!.checked,
    ).toBe(true);
    expect(
      named("basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber")
        .value,
    ).toBe("010-1234-5678");
    // The page keeps month precision for service dates.
    expect(dateInput("입대일").value).toBe("2010.03");
    expect(dateInput("제대일").value).toBe("2012.01");
    expect(
      named("militaryGroupAnswers.militaryItemAnswer.militaryRole").value,
    ).toBe("합성병과");
    expect(
      [
        "rank",
        "discharge",
        "branch",
        "grade",
        "type",
        "relation",
        "nationality",
      ].map((l) => dropdownTrigger(l).textContent),
    ).toEqual([
      "병장",
      "만기제대",
      "육군",
      "심한 장애인",
      "지체장애",
      "부",
      "대한민국",
    ]);
    expect(
      named(
        "preferentialEmploymentGroupResumeItemAnswers.handicapAnswer.handicapRegistrationNumber",
      ).value,
    ).toBe("1234-5678");
    expect(
      named(
        "preferentialEmploymentGroupResumeItemAnswers.patriotAnswer.patriotNumber",
      ).value,
    ).toBe("12-345678");
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(page.forbiddenClicks()).toEqual([]);
    // Out-of-scope controls stay untouched.
    expect(named("etcGroupResumeItemAnswers.hobby").value).toBe("");
    expect(dropdownTrigger("convenience").textContent).toBe(
      "편의 제공 여부 선택",
    );
    expect(dropdownTrigger("rate").textContent).toBe(
      "보훈비율을 선택해주세요.",
    );
  });

  it("does not write a dropdown label the page does not offer and closes it", async () => {
    const page = mountV1Step1();
    page.dropOption("rank", "병장");
    await unlockDependents();
    const { results, resultOf } = await writeAll(analyzePass(v1Profile()));
    expect(resultOf("militaryRank")).toMatchObject({
      status: "skipped",
      failureCode: "OPTION_UNMATCHED",
    });
    expect(dropdownTrigger("rank").textContent).toBe("계급을 선택해주세요.");
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(results.filter((r) => r.status === "written")).toHaveLength(18);
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("does not overwrite existing page values", async () => {
    const page = mountV1Step1();
    await unlockDependents();
    named("basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber").value =
      "010-9999-9999";
    dropdownTrigger("relation").click();
    const body = () =>
      dropdownTrigger("relation").parentElement!.querySelector(
        "#dropdown-body",
      );
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (body()) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    Array.from(body()!.querySelectorAll("button"))
      .find((b) => b.textContent === "모")!
      .click();
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!body()) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    const pass = analyzePass(v1Profile());
    expect(pass.item("emergencyPhone").status).toBe("conflict");
    expect(pass.item("emergencyPhone").currentValue).toBe("010-9999-9999");
    expect(pass.item("veteranRelation").status).toBe("conflict");
    expect(pass.item("veteranRelation").currentValue).toBe("모");
    // Even a forced approval of a conflicting item writes nothing.
    for (const key of ["emergencyPhone", "veteranRelation"])
      pass.item(key).selected = true;
    const { resultOf } = await writeAll(pass);
    expect(resultOf("emergencyPhone")?.status).toBe("skipped");
    expect(resultOf("veteranRelation")?.status).toBe("skipped");
    expect(
      named("basicInfoGroupAnswers.emergencyContact.emergencyPhoneNumber")
        .value,
    ).toBe("010-9999-9999");
    expect(dropdownTrigger("relation").textContent).toBe("모");
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("keeps a non-default status toggle and overrides only the page default", async () => {
    mountV1Step1();
    toggleButton("병역", "미필").click();
    const pass = analyzePass(v1Profile());
    expect(pass.item("militaryStatus").status).toBe("conflict");
    expect(pass.item("militaryStatus").currentValue).toBe("미필");
    expect(pass.item("veteranStatus").status).toBe("available");
    expect(pass.item("veteranStatus").selected).toBe(true);
    const { resultOf } = await writeAll(pass);
    expect(resultOf("militaryStatus")?.status).toBe("skipped");
    expect(selectedToggle("병역")).toEqual(["미필"]);
    expect(resultOf("veteranStatus")?.status).toBe("written");
    expect(selectedToggle("보훈여부")).toEqual(["대상"]);
  });
});

describe("state drivers", () => {
  it("writes the status drivers first and their dependents on the next pass", async () => {
    const page = mountV1Step1();
    const profile = v1Profile();
    const first = analyzePass(profile);
    const drivers = first.plan.items.filter((item) => {
      const handle = first.handleOf(item);
      return handle && first.adapter.stateDriverStage?.(item, handle) === 1;
    });
    expect(drivers.map((d) => first.handleOf(d)!.candidate.domName)).toEqual([
      name("militaryStatus"),
      name("disabilityStatus"),
      name("veteranStatus"),
    ]);
    const signal = new AbortController().signal;
    for (const item of drivers) {
      const handle = first.handleOf(item) as FieldCandidateHandle;
      expect(
        await first.adapter.executeStateDriver!(document, handle, item, signal),
      ).toBe(true);
      expect(
        await first.adapter.settleStateDriver!(document, handle, undefined, {
          item,
          signal,
        }),
      ).toBe(true);
      expect(first.adapter.stateDriverFailureGroup?.(item, handle)).toBe(
        handle.customElements![0].closest(".x-row"),
      );
    }
    expect(selectedToggle("병역")).toEqual(["군필"]);
    expect(selectedToggle("장애여부")).toEqual(["대상"]);
    expect(selectedToggle("보훈여부")).toEqual(["대상"]);
    // The settle waited for the page to unlock the dependents.
    expect(dateInput("입대일").disabled).toBe(false);
    const second = analyzePass(profile);
    expect(
      second.snapshot.request.sections[0].fields.map((f) => f.domName),
    ).toEqual(allNames);
    const { results } = await writeAll(second);
    expect(results.filter((r) => r.status !== "written")).toEqual([]);
    expect(dropdownTrigger("branch").textContent).toBe("육군");
    expect(dateInput("입대일").value).toBe("2010.03");
    expect(page.forbiddenClicks()).toEqual([]);
  });
});
