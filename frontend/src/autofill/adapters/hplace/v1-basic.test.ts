import { afterEach, describe, expect, it, vi } from "vitest";
import { setAutofillDebugEnabled } from "../../debug/autofill-debug";
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
import { writeV1 } from "./v1-basic-write";
import {
  V1_ADDRESS_MANUAL_REASON,
  V1_ADDRESS_ZIP_MISMATCH_REASON,
} from "./v1-address";
import {
  addressNames,
  confirmAddressRow,
  dateInput,
  dropdownTrigger,
  mountV1Step1,
  named,
  rowOf,
  selectedToggle,
  toggleButton,
  unlockDependents,
  until,
  v1Address,
  v1AddressProfile,
  v1Analysis,
  v1Profile,
} from "./v1-basic.test-fixtures";

afterEach(() => {
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
  resetHplacePage();
});

const unverifiedIds = () =>
  hplaceUnverifiedRows(
    document,
    collectFieldsSnapshot(document).request,
    v1Profile(),
  ).map((r) => r.candidateId);

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
  "postalCode",
  "addressLine1",
  "addressLine2",
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
  "postalCode",
  "addressLine1",
  "addressLine2",
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
      // The address inputs are disabled on the page: they are sent as
      // visible targets that only the address dialog writes.
      ...[
        ["postalCode", "우편번호"],
        ["addressLine1", "기본주소"],
        ["addressLine2", "상세주소"],
      ].map(([key, displayName], i) => ({
        candidateId: `field-${9 + i}`,
        domId: name(key),
        domName: name(key),
        element: "input",
        control: "text",
        displayName,
        visibility: "visible",
      })),
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

  it("treats a duplicated row title as malformed and reports the field as unverified", () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    mountV1Step1();
    rowOf("국적").after(rowOf("국적").cloneNode(true));
    expect(fieldNames()).toEqual(
      lockedNames.filter((n) => n !== name("nationality")),
    );
    expect(
      log.mock.calls.some(([line]) =>
        String(line).includes(`key=${name("nationality")} reason=row-identity`),
      ),
    ).toBe(true);
    expect(unverifiedIds()).toEqual(["hplace-unverified-v1-nationality"]);
  });

  it.each([
    [
      "militaryRank",
      () => (dropdownTrigger("rank").textContent = "알 수 없는 값"),
    ],
    ["serviceStartDate", () => (dateInput("입대일").readOnly = true)],
  ])(
    "does not report a malformed %s as unverified while its row is locked",
    async (key, fault) => {
      mountV1Step1();
      fault();
      expect(unverifiedIds()).toEqual([]);
      // Its own element open, but the row's status is still 비대상.
      for (const control of rowOf("병역").querySelectorAll<
        HTMLInputElement | HTMLButtonElement
      >(".x-input, .x-dd > button"))
        control.disabled = false;
      expect(unverifiedIds()).toEqual([]);
      await unlockDependents();
      expect(unverifiedIds()).toEqual([`hplace-unverified-v1-${key}`]);
    },
  );

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

  it("gives an option-unmatched dropdown its own reason", async () => {
    const page = mountV1Step1();
    page.dropOption("rank", "병장");
    await unlockDependents();
    const { resultOf } = await writeAll(analyzePass(v1Profile()));
    const result = resultOf("militaryRank");
    expect(result).toMatchObject({
      status: "skipped",
      failureCode: "OPTION_UNMATCHED",
    });
    expect(result?.status === "skipped" && result.reason).not.toMatch(
      /검증된 .*필드만/,
    );
  });

  it("reports an approved label outside the v1 catalog as option-unmatched without opening it", async () => {
    mountV1Step1();
    await unlockDependents();
    const pass = analyzePass(v1Profile());
    const item = pass.item("disabilityType");
    // A label the MRS2 map produces but the v1 catalog lacks.
    const unoffered = { ...item, profileValue: "췌장장애", selected: true };
    let clicks = 0;
    dropdownTrigger("type").addEventListener("click", () => clicks++);
    expect(await writeV1(pass.handleOf(item)!, unoffered, () => true)).toBe(
      "option-unmatched",
    );
    expect(clicks).toBe(0);
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(dropdownTrigger("type").textContent).toBe("장애 유형");
  });

  it("fails a dropdown the page keeps open and reports it", async () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const page = mountV1Step1();
    page.dropOption("rank", "병장");
    page.ignoreClose("rank");
    await unlockDependents();
    const pass = analyzePass(v1Profile());
    const item = pass.item("militaryRank");
    item.selected = true;
    expect(await writeV1(pass.handleOf(item)!, item, () => true)).toBe(
      "failed",
    );
    expect(
      log.mock.calls.some(([line]) =>
        String(line).includes(
          `key=${name("militaryRank")} reason=cleanup-failed`,
        ),
      ),
    ).toBe(true);
    expect(dropdownTrigger("rank").textContent).toBe("계급을 선택해주세요.");
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it.each([
    [
      "an out-of-scope dropdown",
      () => (dropdownTrigger("rate").textContent = "10%"),
    ],
    [
      "an unverified input",
      () => {
        const input = named(
          "preferentialEmploymentGroupResumeItemAnswers.patriotAnswer.patriotNumber",
        );
        input.type = "password";
        input.value = "00-000000";
      },
    ],
  ])(
    "keeps the 비대상 default when %s of its row holds a value",
    async (_, fault) => {
      mountV1Step1();
      fault();
      const pass = analyzePass(v1Profile());
      expect(pass.item("veteranStatus").status).toBe("conflict");
      const { resultOf } = await writeAll(pass);
      expect(resultOf("veteranStatus")?.status).toBe("skipped");
      expect(selectedToggle("보훈여부")).toEqual(["비대상"]);
    },
  );

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

const addressKeys = ["postalCode", "addressLine1", "addressLine2"];
const pageAddress = () => [
  named(addressNames.zip).value,
  named(addressNames.address).value,
  named(addressNames.detail).value,
];
const openDialogs = () =>
  document.querySelectorAll('#overlay-root [role="dialog"]').length;
/** [disabled, readOnly] of the zip, address and detail inputs. */
const addressShape = () =>
  [addressNames.zip, addressNames.address, addressNames.detail].map((n) => [
    named(n).disabled,
    named(n).readOnly,
  ]);

/** Approves only the given items (with a profile value), as a user would. */
async function writeKeys(pass: ReturnType<typeof analyzePass>, keys: string[]) {
  const items = keys
    .map((key) => pass.item(key))
    .filter((item) => item?.profileValue);
  for (const i of items) if (i.status !== "conflict") i.selected = true;
  const results = await executeApprovedWritesAfterPageSettles({
    items,
    registry: pass.snapshot.registry,
    approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
    document,
    beforeMutation: async () => true,
  });
  return (key: string) =>
    results.find((r) => r.candidateId === pass.item(key)?.candidateId);
}
const reason = (result: unknown) =>
  (result as { reason?: string } | undefined)?.reason;

describe("current address", () => {
  it("fills the three inputs through the dialog for the one exact result", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    const result = await writeKeys(
      analyzePass(v1AddressProfile()),
      addressKeys,
    );
    for (const key of addressKeys) expect(result(key)?.status).toBe("written");
    // The page writes the result's road text with its legal-dong reference.
    expect(pageAddress()).toEqual([
      "04524",
      "서울특별시 중구 세종대로 110 (태평로1가)",
      "합성동 101호",
    ]);
    expect(page.addressClicks()).toBe(1);
    expect(page.dialogClicks()).toEqual(["검색", "확인"]);
    expect(openDialogs()).toBe(0);
    expect(page.forbiddenClicks()).toEqual([]);
    // The page re-renders the row in its confirmed shape, which still verifies.
    await until(() => named(addressNames.zip).readOnly);
    expect(addressShape()).toEqual([
      [false, true],
      [false, true],
      [false, false],
    ]);
    expect(pageAddress()).toEqual([
      "04524",
      "서울특별시 중구 세종대로 110 (태평로1가)",
      "합성동 101호",
    ]);
    expect(fieldNames()).toEqual(lockedNames);
  });

  it("types no detail when the profile has none", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    const result = await writeKeys(
      analyzePass(v1AddressProfile({ addressLine2: "" })),
      addressKeys,
    );
    expect(result("postalCode")?.status).toBe("written");
    expect(result("addressLine1")?.status).toBe("written");
    expect(pageAddress()).toEqual([
      "04524",
      "서울특별시 중구 세종대로 110 (태평로1가)",
      "",
    ]);
    expect(page.dialogClicks()).toEqual(["검색", "확인"]);
  });

  it.each([
    ["no result", "서울특별시 중구 합성로 9"],
    ["two results", "서울특별시 중구 합성로 2"],
  ])(
    "cancels and leaves the page untouched when %s matches",
    async (_, query) => {
      const page = mountV1Step1();
      page.addressDialog();
      const result = await writeKeys(
        analyzePass(v1AddressProfile({ addressLine1: query })),
        addressKeys,
      );
      for (const key of addressKeys) {
        expect(result(key)?.status).toBe("skipped");
        expect(reason(result(key))).toBe(V1_ADDRESS_MANUAL_REASON);
      }
      expect(pageAddress()).toEqual(["", "", ""]);
      expect(page.dialogClicks()).toEqual(["검색", "취소"]);
      expect(openDialogs()).toBe(0);
      expect(page.forbiddenClicks()).toEqual([]);
    },
  );

  it.each([
    [
      "no row",
      "서울특별시 중구 합성로 (없음) 7",
      "v1-search-results",
      0,
      0,
      true,
    ],
    [
      "no exact row",
      "서울특별시 중구 합성로 9",
      "v1-result-unique",
      1,
      1,
      false,
    ],
  ])(
    "reports the search shape without address text when %s is listed",
    async (_, query, step, rows, parsed, paren) => {
      setAutofillDebugEnabled(true);
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const page = mountV1Step1();
      page.addressDialog();
      await writeKeys(
        analyzePass(v1AddressProfile({ addressLine1: query })),
        addressKeys,
      );
      const lines = log.mock.calls.map(([line]) => String(line));
      const details = lines.flatMap(
        (line) =>
          /key=hplace\.v1\.addressLine1 reason=staging-mismatch detail=(\S+)$/.exec(
            line,
          )?.[1] ?? [],
      );
      expect(details).toHaveLength(1);
      const [head, shape] = details[0].split(":");
      expect(head).toBe(step);
      const fields = Object.fromEntries(
        shape.split(",").map((pair) => pair.split("=")),
      );
      expect(fields).toEqual({
        rows: String(rows),
        parsed: String(parsed),
        matched: "0",
        ms: expect.stringMatching(/^\d+$/),
        open: "true",
        only: "true",
        owned: "true",
        kept: "true",
        len: String(query.length),
        paren: String(paren),
        tokens: String(query.split(" ").length),
      });
      // An empty result list is awaited for the whole window, not cut short.
      if (rows === 0) expect(Number(fields.ms)).toBeGreaterThanOrEqual(6000);
      expect(lines.some((line) => line.includes("합성"))).toBe(false);
      expect(page.dialogClicks()).toEqual(["검색", "취소"]);
    },
    15000,
  );

  it.each([
    ["the chosen road", "서울특별시 중구 세종대로 110", "written"],
    ["a different road", "서울특별시 중구 세종대로 111", "skipped"],
  ])(
    "reads back %s that the page writes with legal dong and building",
    async (_, pageRoad, roadStatus) => {
      const page = mountV1Step1();
      page.addressDialog({
        catalog: {
          [v1Address.addressLine1]: [
            {
              road: "서울특별시 중구 세종대로 110 (태평로1가)",
              jibun: "서울특별시 중구 태평로1가 31 합성청사",
              zip: "04524",
              page: `${pageRoad} (태평로1가, 합성청사)`,
            },
          ],
        },
      });
      const result = await writeKeys(
        analyzePass(v1AddressProfile()),
        addressKeys,
      );
      expect(result("postalCode")?.status).toBe("written");
      expect(result("addressLine2")?.status).toBe("written");
      expect(result("addressLine1")?.status).toBe(roadStatus);
      expect(page.dialogClicks()).toEqual(["검색", "확인"]);
    },
  );

  it("cancels a detail line longer than the dialog accepts", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    const result = await writeKeys(
      analyzePass(v1AddressProfile({ addressLine2: "가".repeat(101) })),
      addressKeys,
    );
    for (const key of addressKeys) expect(result(key)?.status).toBe("skipped");
    expect(pageAddress()).toEqual(["", "", ""]);
    expect(page.dialogClicks()).toEqual(["검색", "취소"]);
    expect(openDialogs()).toBe(0);
  });

  it("reports a zip the page fills differently and keeps the other two", async () => {
    const page = mountV1Step1();
    page.addressDialog({ zip: "99999" });
    const result = await writeKeys(
      analyzePass(v1AddressProfile()),
      addressKeys,
    );
    expect(result("postalCode")).toMatchObject({ status: "skipped" });
    expect(reason(result("postalCode"))).toBe(V1_ADDRESS_ZIP_MISMATCH_REASON);
    expect(result("addressLine1")?.status).toBe("written");
    expect(result("addressLine2")?.status).toBe("written");
    // Nothing tries to undo the dialog.
    expect(page.dialogClicks()).toEqual(["검색", "확인"]);
    expect(page.addressClicks()).toBe(1);
  });

  it("does not open the dialog when the page already holds another address", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    named(addressNames.address).value = "서울특별시 중구 다른로 1";
    const pass = analyzePass(v1AddressProfile());
    expect(pass.item("addressLine1").status).toBe("conflict");
    const result = await writeKeys(pass, addressKeys);
    for (const key of addressKeys) expect(result(key)?.status).toBe("skipped");
    expect(page.addressClicks()).toBe(0);
    expect(pageAddress()).toEqual(["", "서울특별시 중구 다른로 1", ""]);
  });

  it("keeps an address the page already shows", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    named(addressNames.zip).value = v1Address.postalCode;
    named(addressNames.address).value = v1Address.addressLine1;
    named(addressNames.detail).value = v1Address.addressLine2;
    const result = await writeKeys(
      analyzePass(v1AddressProfile()),
      addressKeys,
    );
    for (const key of addressKeys) expect(result(key)?.status).toBe("written");
    expect(page.addressClicks()).toBe(0);
  });

  it.each([
    [
      "the profile's address",
      [v1Address.postalCode, v1Address.addressLine1, v1Address.addressLine2],
      "written",
    ],
    [
      "another address",
      ["04500", "서울특별시 중구 다른로 1 (다른동)", ""],
      "skipped",
    ],
  ])(
    "reports a confirmed row holding %s instead of dropping it",
    async (_, values, status) => {
      const page = mountV1Step1();
      page.addressDialog();
      confirmAddressRow(values);
      const { request } = collectFieldsSnapshot(document);
      expect(request.sections[0].fields.map((f) => f.domName)).toEqual(
        lockedNames,
      );
      expect(
        hplaceUnverifiedRows(document, request, v1AddressProfile()),
      ).toEqual([]);
      const result = await writeKeys(
        analyzePass(v1AddressProfile()),
        addressKeys,
      );
      for (const key of addressKeys) expect(result(key)?.status).toBe(status);
      expect(page.addressClicks()).toBe(0);
      expect(pageAddress()).toEqual(values);
    },
  );

  it.each([
    ["legal dong and building", "(태평로1가, 합성청사)", "", [] as string[]],
    ["legal dong", "(태평로1가)", "", [] as string[]],
    ["another road", "(태평로1가, 합성청사)", "1", ["addressLine1"]],
    ["a detail with a reference", "(태평로1가)", "", ["addressLine2"]],
  ])(
    "retains the page form of the profile road on a re-run (%s)",
    async (_, reference, otherNumber, conflicts) => {
      const page = mountV1Step1();
      page.addressDialog();
      confirmAddressRow([
        v1Address.postalCode,
        `${v1Address.addressLine1}${otherNumber} ${reference}`,
        conflicts.includes("addressLine2")
          ? `${v1Address.addressLine2} (태평로1가)`
          : v1Address.addressLine2,
      ]);
      const pass = analyzePass(v1AddressProfile());
      for (const key of addressKeys)
        expect([key, pass.item(key).status === "conflict"]).toEqual([
          key,
          conflicts.includes(key),
        ]);
      const result = await writeKeys(pass, addressKeys);
      for (const key of addressKeys)
        expect([key, result(key)?.status]).toEqual([
          key,
          conflicts.includes(key) ? "skipped" : "written",
        ]);
      expect(page.addressClicks()).toBe(0);
    },
  );

  it.each([
    [
      "a second 주소입력 button",
      () =>
        rowOf("현주소")
          .querySelector(".x-content")!
          .insertAdjacentHTML(
            "beforeend",
            '<button type="button">주소입력</button>',
          ),
    ],
    [
      "an extra input",
      () =>
        rowOf("현주소")
          .querySelector(".x-content")!
          .insertAdjacentHTML("beforeend", '<input type="text" disabled>'),
    ],
    [
      "an enabled address input",
      () => (named(addressNames.address).disabled = false),
    ],
    [
      "a disabled zip beside a read-only address",
      () => {
        confirmAddressRow(["", "", ""]);
        named(addressNames.zip).readOnly = false;
        named(addressNames.zip).disabled = true;
      },
    ],
    [
      "an editable address input without read-only",
      () => {
        confirmAddressRow(["", "", ""]);
        named(addressNames.address).readOnly = false;
      },
    ],
  ])("drops the three fields for %s and reports them", (_, fault) => {
    mountV1Step1();
    fault();
    const { request } = collectFieldsSnapshot(document);
    expect(request.sections[0].fields.map((f) => f.domName)).toEqual(
      lockedNames.filter((n) => !addressKeys.map(name).includes(n)),
    );
    expect(
      hplaceUnverifiedRows(document, request, v1AddressProfile()).map(
        (r) => r.candidateId,
      ),
    ).toEqual(addressKeys.map((key) => `hplace-unverified-v1-${key}`));
  });

  it("reports a dialog that never opens and presses nothing", async () => {
    const page = mountV1Step1();
    page.addressDialog({ neverOpens: true });
    const result = await writeKeys(
      analyzePass(v1AddressProfile()),
      addressKeys,
    );
    for (const key of addressKeys) expect(result(key)?.status).toBe("skipped");
    expect(page.addressClicks()).toBe(1);
    expect(page.dialogClicks()).toEqual([]);
  }, 10000);

  it("reports a dialog that does not close after 확인 and cancels it", async () => {
    const page = mountV1Step1();
    page.addressDialog({ stuck: true });
    const result = await writeKeys(
      analyzePass(v1AddressProfile()),
      addressKeys,
    );
    for (const key of addressKeys) expect(result(key)?.status).toBe("skipped");
    expect(pageAddress()).toEqual(["", "", ""]);
    expect(page.dialogClicks()).toEqual(["검색", "확인", "취소"]);
    expect(openDialogs()).toBe(0);
    expect(page.forbiddenClicks()).toEqual([]);
  }, 10000);

  it("does not open over another open dialog", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    page.openDialog("사진 등록", "저장");
    const result = await writeKeys(
      analyzePass(v1AddressProfile()),
      addressKeys,
    );
    for (const key of addressKeys) expect(result(key)?.status).toBe("skipped");
    expect(page.addressClicks()).toBe(0);
    expect(page.dialogClicks()).toEqual([]);
  }, 10000);

  it("writes nothing when the road address item is not approved", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    const result = await writeKeys(analyzePass(v1AddressProfile()), [
      "postalCode",
      "addressLine2",
    ]);
    expect(result("postalCode")?.status).toBe("skipped");
    expect(result("addressLine2")?.status).toBe("skipped");
    expect(page.addressClicks()).toBe(0);
  });

  it("writes the address together with every other control", async () => {
    const page = mountV1Step1();
    page.addressDialog();
    await unlockDependents();
    const { results } = await writeAll(analyzePass(v1AddressProfile()));
    expect(results.filter((r) => r.status !== "written")).toEqual([]);
    expect(results).toHaveLength(22);
    expect(pageAddress()[0]).toBe("04524");
    expect(page.forbiddenClicks()).toEqual([]);
  });
});
