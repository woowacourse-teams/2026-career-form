import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
import { isUnsupportedHplace } from "../company";
import { getWorkflowAdapter } from "../workflow";
import { hplaceUnverifiedRows } from "./unverified-structure";
import { isV1HistoryPage } from "./v1-history-controls";
import { mountV1Step2 } from "./v1-history.test-fixtures";
import { isV1ExtraPage, v1ExtraChip } from "./v1-extra-controls";
import { setAutofillDebugEnabled } from "../../debug/autofill-debug";
import { createProgressTracker } from "../../workflow/progress-model";
import { resultFieldState } from "../../workflow/result-field-state";
import { written } from "../../write/write-result";
import {
  appendSubRow,
  blockRow,
  certChip,
  certInput,
  languageTrigger,
  mountV1Step3,
  pickCertificate,
  resetHplacePage,
  subRowAt,
  subRows,
  v1ExtraAnalysis,
  v1ExtraPreparation,
  v1ExtraProfile,
} from "./v1-extra.test-fixtures";

afterEach(resetHplacePage);

const names = () =>
  collectFieldsSnapshot(document).request.sections.flatMap((s) =>
    s.fields.map((f) => f.domName),
  );

describe("v1 step 3 page gate", () => {
  it("supports step 3 with zero rows and keeps steps 2 and 4 unchanged", () => {
    mountV1Step3();
    expect(isV1ExtraPage(document)).toBe(true);
    expect(isUnsupportedHplace(document)).toBe(false);
    expect(collectFieldsSnapshot(document).request.sections).toEqual([]);

    mountV1Step3("4");
    expect(isV1ExtraPage(document)).toBe(false);
    expect(isUnsupportedHplace(document)).toBe(true);

    mountV1Step2();
    expect(isV1ExtraPage(document)).toBe(false);
    expect(isV1HistoryPage(document)).toBe(true);
  });

  it("needs one known step-3 header, none repeated, and one in-scope block", () => {
    const header = (t: string) =>
      Array.from(document.querySelectorAll("h5")).find(
        (h) => h.textContent === t,
      )!;
    mountV1Step3();
    header("경험").textContent = "기타";
    expect(isV1ExtraPage(document)).toBe(true);
    header("어학").textContent = "기타";
    header("자격/지식/기술").textContent = "기타";
    expect(isV1ExtraPage(document)).toBe(false);
    expect(isUnsupportedHplace(document)).toBe(true);
    mountV1Step3();
    header("경험").insertAdjacentHTML("afterend", "<h5>경험</h5>");
    expect(isV1ExtraPage(document)).toBe(false);
    mountV1Step3();
    blockRow("자격증").remove();
    blockRow("외국어활용능력").remove();
    expect(isV1ExtraPage(document)).toBe(false);
    expect(isUnsupportedHplace(document)).toBe(true);
  });
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
  const plans = v1ExtraPreparation(snapshot.request).preparationPlans;
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

describe("v1 step 3 preparation", () => {
  it("offers only the 자격증 and 외국어활용능력 adds, with their row counts", () => {
    mountV1Step3();
    appendSubRow("외국어활용능력");
    const snapshot = collectPreparationSnapshot(document);
    expect(snapshot.request.sections).toHaveLength(1);
    const [section] = snapshot.request.sections;
    expect(section.sectionId).toBe("hplace-v1-extra");
    expect(
      section.actionCandidates.map((a) => [
        a.domId,
        a.domName,
        a.element,
        a.control,
      ]),
    ).toEqual([
      [
        "hplace.v1.certificate.add",
        "hplace.v1.certificate.add",
        "button",
        "button",
      ],
      [
        "hplace.v1.languageSkill.add",
        "hplace.v1.languageSkill.add",
        "button",
        "button",
      ],
    ]);
    const ids = section.actionCandidates.map((a) => a.candidateId);
    expect(ids.map((id) => snapshot.countRepeatableGroups(id))).toEqual([0, 1]);
    const lookup = snapshot.registry.lookupAction(ids[0]);
    expect("handle" in lookup && lookup.handle.element).toBe(
      blockRow("자격증").querySelector(".x-block-add"),
    );
  });

  it("counts profile entries per row group (never the language tests)", () => {
    mountV1Step3();
    const adapter = getWorkflowAdapter(document);
    const profile = v1ExtraProfile();
    expect(
      adapter.repeatableProfileCount?.("hplace.v1.certificate.add", profile),
    ).toBe(2);
    expect(
      adapter.repeatableProfileCount?.("hplace.v1.languageSkill.add", profile),
    ).toBe(2);
    expect(
      adapter.repeatableProfileCount?.("hplace.v1.languageTest.add", profile),
    ).toBeNull();
  });

  it("adds entries minus existing rows, one verified row per click, and touches nothing else", async () => {
    const page = mountV1Step3();
    const existing = appendSubRow("자격증");
    existing.querySelector("input")!.value = "직접입력";
    const result = await prepare({
      "hplace.v1.certificate.add": 2,
      "hplace.v1.languageSkill.add": 2,
    });
    expect(result.status).toBe("completed");
    expect(page.addClicks()).toEqual([
      "자격증",
      "외국어활용능력",
      "외국어활용능력",
    ]);
    expect(subRows("자격증")).toHaveLength(2);
    expect(subRowAt("자격증", 0)).toBe(existing);
    expect(existing.querySelector("input")!.value).toBe("직접입력");
    expect(subRows("외국어활용능력")).toHaveLength(2);
    expect(subRows("공인외국어시험")).toHaveLength(0);
    expect(subRows("컴퓨터활용능력")).toHaveLength(0);
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("fails closed when a click adds no row", async () => {
    const page = mountV1Step3();
    page.stall("자격증");
    const result = await prepare({ "hplace.v1.certificate.add": 1 });
    expect(result).toMatchObject({
      status: "failed",
      reason: "group-count-not-incremented",
    });
    expect(page.addClicks()).toEqual(["자격증"]);
  });

  it("offers no add for a block whose shape differs", () => {
    mountV1Step3();
    blockRow("자격증")
      .querySelector(".x-list")!
      .insertAdjacentHTML("beforeend", "<span>x</span>");
    expect(
      collectPreparationSnapshot(
        document,
      ).request.sections[0].actionCandidates.map((a) => a.domName),
    ).toEqual(["hplace.v1.languageSkill.add"]);
  });
});

describe("v1 step 3 collection", () => {
  it("sends the search and the dropdown per row, the picked row's inputs, and item counts", () => {
    mountV1Step3();
    appendSubRow("자격증");
    appendSubRow("자격증");
    pickCertificate(1, "정보처리기사");
    appendSubRow("외국어활용능력");
    appendSubRow("공인외국어시험");
    appendSubRow("컴퓨터활용능력");
    const snapshot = collectFieldsSnapshot(document);
    expect(snapshot.request.sections.map((s) => s.sectionId)).toEqual([
      "hplace-v1-extra",
    ]);
    const fields = snapshot.request.sections[0].fields;
    expect(fields.map((f) => [f.domName, f.element, f.control])).toEqual([
      ["hplace.v1.certificate.0.licenseName", "input", "text"],
      ["hplace.v1.certificate.1.organization", "input", "text"],
      ["hplace.v1.certificate.1.acquireDate", "input", "text"],
      ["hplace.v1.certificate.1.registNumber", "input", "text"],
      ["hplace.v1.languageSkill.0.language", "select", "select"],
    ]);
    expect(fields.every((f) => f.domId === f.domName)).toBe(true);
    expect(fields[4].options?.map((o) => o.displayName)).toContain("영어");
    for (const f of fields) {
      const lookup = snapshot.registry.lookupField(f.candidateId);
      if (!("handle" in lookup)) throw new Error("no handle");
      expect(lookup.handle.sectionId).toBe("hplace-v1-extra");
      expect(lookup.handle.itemGroupId).toBe(f.domName!.split(".")[2]);
      expect(lookup.handle.itemIndex).toBe(Number(f.domName!.split(".")[3]));
      expect(snapshot.registry.fieldItemCount(f.candidateId)).toBe(
        f.domName!.includes("certificate") ? 2 : 1,
      );
    }
  });

  it("never sends a control whose shape differs from the measured one", () => {
    mountV1Step3();
    pickCertificate(0, "정보처리기사");
    appendSubRow("자격증");
    // A second 등록번호 input in the first row: that field only is skipped.
    subRowAt("자격증", 0).firstElementChild!.insertAdjacentHTML(
      "beforeend",
      '<input type="text" placeholder="등록번호를 입력해주세요." name="licenseGroupAnswer.licenseAnsw">',
    );
    certInput(0, "발급기관을 입력해주세요.")!.name = "other.name";
    expect(names()).toEqual([
      "hplace.v1.certificate.0.acquireDate",
      "hplace.v1.certificate.1.licenseName",
    ]);
  });
});

function itemsFor(entries: [string, string][]) {
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((s) => s.fields);
  const items = entries.map(([name, value]) => {
    const field = fields.find((f) => f.domName === name);
    if (!field) throw new Error(`not collected: ${name}`);
    const analysis = v1ExtraAnalysis({
      ...snapshot.request,
      sections: [{ sectionId: "hplace-v1-extra", fields: [field] }],
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

function handleOf(name: string, value: string) {
  const { registry, items } = itemsFor([[name, value]]);
  const lookup = registry.lookupField(items[0].candidateId);
  if (!("handle" in lookup)) throw new Error("no handle");
  return { handle: lookup.handle as FieldCandidateHandle, item: items[0] };
}

/** Runs a search field as the workflow does, on fake timers. */
async function drive(name: string, value: string) {
  const { handle, item } = handleOf(name, value);
  const adapter = getWorkflowAdapter(document);
  const signal = new AbortController().signal;
  const codes: string[] = [];
  expect(adapter.isStateDriver(item, name)).toBe(true);
  expect(adapter.stateDriverStage?.(item, handle)).toBe(1);
  const run = (async () => {
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
  })();
  await vi.runAllTimersAsync();
  return run;
}

describe("v1 step 3 certificate search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("picks the single exact row and verifies the chip of its re-rendered row", async () => {
    const page = mountV1Step3();
    appendSubRow("자격증");
    appendSubRow("자격증");
    const r = await drive(
      "hplace.v1.certificate.1.licenseName",
      "정보처리기사",
    );
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(certChip(1)).toEqual(["정보처리기사"]);
    expect(certInput(0, "자격증명을 검색해주세요.")!.value).toBe("");
    expect(page.searchQueries()).toEqual(["정보처리기사"]);
    expect(page.registerClicks()).toBe(0);
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it.each([
    ["합성자격", "SEARCH_NO_EXACT_MATCH"],
    ["동명자격", "SEARCH_AMBIGUOUS"],
    ["다른등록", "SEARCH_FORM_UNVERIFIED"],
  ])(
    "never picks for %s: clears the input and closes the list",
    async (query, code) => {
      const page = mountV1Step3();
      appendSubRow("자격증");
      const r = await drive("hplace.v1.certificate.0.licenseName", query);
      expect(r).toEqual({ ok: false, settled: false, codes: [code] });
      expect(certInput(0, "자격증명을 검색해주세요.")!.value).toBe("");
      expect(certChip(0)).toEqual([]);
      expect(page.registerClicks()).toBe(0);
      expect(document.querySelector("#dropdown-body")).toBeNull();
      expect(page.forbiddenClicks()).toEqual([]);
    },
  );

  it("presses a lone register row for exactly the name once, no earlier than 1 s after typing", async () => {
    const page = mountV1Step3();
    appendSubRow("자격증");
    const started = Date.now();
    const r = await drive(
      "hplace.v1.certificate.0.licenseName",
      "목록에없는자격",
    );
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    expect(page.registerClicks()).toBe(1);
    expect(certChip(0)).toEqual(["목록에없는자격"]);
  });

  it("never types into an input that already holds text", async () => {
    const page = mountV1Step3();
    appendSubRow("자격증");
    const { handle, item } = handleOf(
      "hplace.v1.certificate.0.licenseName",
      "정보처리기사",
    );
    certInput(0, "자격증명을 검색해주세요.")!.value = "직접입력";
    const adapter = getWorkflowAdapter(document);
    const run = adapter.executeStateDriver!(
      document,
      handle,
      item,
      new AbortController().signal,
    );
    await vi.runAllTimersAsync();
    expect(await run).toBe(false);
    expect(page.searchQueries()).toEqual([]);
    expect(certInput(0, "자격증명을 검색해주세요.")!.value).toBe("직접입력");
  });
});

/** The write executor over a batch, as the workflow runs it. */
async function writeBatch(entries: [string, string][]) {
  const { registry, items } = itemsFor(entries);
  return executeApprovedWritesAfterPageSettles({
    items,
    approvedCandidateIds: new Set(items.map((i) => i.candidateId)),
    registry,
    document,
  });
}

describe("v1 step 3 writes", () => {
  it("writes the picked row's 발급기관, 취득일 and 등록번호, and an exact language", async () => {
    const page = mountV1Step3();
    pickCertificate(0, "정보처리기사");
    appendSubRow("외국어활용능력");
    const results = await writeBatch([
      ["hplace.v1.certificate.0.organization", "합성기관"],
      ["hplace.v1.certificate.0.acquireDate", "2020-05-01"],
      ["hplace.v1.certificate.0.registNumber", "A-1234"],
      ["hplace.v1.languageSkill.0.language", "영어"],
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "written",
      "written",
      "written",
      "written",
    ]);
    expect(certInput(0, "발급기관을 입력해주세요.")!.value).toBe("합성기관");
    expect(certInput(0, "취득일")!.value).toBe("2020.05.01");
    expect(certInput(0, "등록번호를 입력해주세요.")!.value).toBe("A-1234");
    expect(languageTrigger(0).textContent).toBe("영어");
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("never overwrites a value, checks maxLength and writes only full past days", async () => {
    mountV1Step3();
    pickCertificate(0, "정보처리기사");
    pickCertificate(1, "정보처리기사");
    certInput(0, "발급기관을 입력해주세요.")!.value = "기존기관";
    const future = `${new Date().getFullYear() + 1}-01-01`;
    const results = await writeBatch([
      ["hplace.v1.certificate.0.organization", "합성기관"],
      ["hplace.v1.certificate.0.registNumber", "X".repeat(31)],
      ["hplace.v1.certificate.0.acquireDate", "2021-07"],
      ["hplace.v1.certificate.1.acquireDate", future],
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(certInput(0, "발급기관을 입력해주세요.")!.value).toBe("기존기관");
    expect(certInput(0, "등록번호를 입력해주세요.")!.value).toBe("");
    expect(certInput(0, "취득일")!.value).toBe("");
    expect(certInput(1, "취득일")!.value).toBe("");
  });

  it("selects a language only on an exact option and keeps a chosen one", async () => {
    mountV1Step3();
    appendSubRow("외국어활용능력");
    appendSubRow("외국어활용능력");
    languageTrigger(1).innerHTML = "<p>중국어</p>";
    const results = await writeBatch([
      ["hplace.v1.languageSkill.0.language", "클링온어"],
      ["hplace.v1.languageSkill.1.language", "영어"],
    ]);
    expect(results.map((r) => r.status)).toEqual(["skipped", "skipped"]);
    expect(languageTrigger(0).textContent).toBe(
      "활용가능한 외국어를 선택해주세요.",
    );
    expect(languageTrigger(1).textContent).toBe("중국어");
    expect(document.querySelector("#dropdown-body")).toBeNull();
  });
});

describe("v1 step 3 unverified structure", () => {
  it("reports a 자격증 block that cannot be verified, and a chip with another name", () => {
    mountV1Step3();
    pickCertificate(0, "다른자격");
    const request = collectFieldsSnapshot(document).request;
    const rows = hplaceUnverifiedRows(document, request, v1ExtraProfile());
    expect(rows.map((r) => [r.fieldLabel, r.status])).toEqual([
      ["자격증명", "conflict"],
    ]);
    blockRow("외국어활용능력")
      .querySelector(".x-list")!
      .insertAdjacentHTML("beforeend", "<span>x</span>");
    expect(
      hplaceUnverifiedRows(document, request, v1ExtraProfile()).map((r) => [
        r.fieldLabel,
        r.status,
        r.failureCode,
      ]),
    ).toEqual([
      ["자격증명", "conflict", undefined],
      ["외국어활용능력", "unavailable", "STRUCTURE_UNVERIFIED"],
    ]);
  });
});

describe("v1 step 3 on a second tenant (k-step3-skeleton.json)", () => {
  it("supports a step 3 with only 자격/지식/기술 and 경험, whatever the nav reads", () => {
    mountV1Step3("3", "k");
    expect(isV1ExtraPage(document)).toBe(true);
    expect(isUnsupportedHplace(document)).toBe(false);
    const [section] = collectPreparationSnapshot(document).request.sections;
    expect(section.actionCandidates.map((a) => a.domName)).toEqual([
      "hplace.v1.certificate.add",
    ]);
    appendSubRow("자격증");
    expect(names()).toEqual(["hplace.v1.certificate.0.licenseName"]);
    expect(
      getWorkflowAdapter(document).repeatableProfileCount?.(
        "hplace.v1.certificate.add",
        v1ExtraProfile(),
      ),
    ).toBe(2);
  });
});

describe("v1 step 3 certificate search on the second tenant (k-step3-cert-list.json)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes the one list outside the input's row, without review-key spans, and verifies the pick", async () => {
    const page = mountV1Step3("3", "k");
    appendSubRow("자격증");
    expect(document.querySelector("span[data-review-key]")).toBeNull();
    const r = await drive(
      "hplace.v1.certificate.0.licenseName",
      "정보처리기사",
    );
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(certChip(0)).toEqual(["정보처리기사"]);
    expect(page.searchQueries()).toEqual(["정보처리기사"]);
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(page.forbiddenClicks()).toEqual([]);
  });

  it("presses the lone register row there too", async () => {
    const page = mountV1Step3("3", "k");
    appendSubRow("자격증");
    const r = await drive(
      "hplace.v1.certificate.0.licenseName",
      "목록에없는자격",
    );
    expect(r).toEqual({ ok: true, settled: true, codes: [] });
    expect(page.registerClicks()).toBe(1);
    expect(certChip(0)).toEqual(["목록에없는자격"]);
  });

  it("fails closed when two new lists appear in the section", async () => {
    const page = mountV1Step3("3", "k");
    appendSubRow("자격증");
    const r = await drive("hplace.v1.certificate.0.licenseName", "두목록");
    expect(r).toEqual({ ok: false, settled: false, codes: ["SEARCH_TIMEOUT"] });
    expect(certChip(0)).toEqual([]);
    expect(certInput(0, "자격증명을 검색해주세요.")!.value).toBe("");
    expect(document.querySelector("#dropdown-body")).toBeNull();
    expect(page.forbiddenClicks()).toEqual([]);
  });
});

describe("v1 step 3 second tenant, run 4 (k-step3-after.txt)", () => {
  it("reads the picked name from a sub-row without review-key spans", () => {
    mountV1Step3("3", "k");
    pickCertificate(0, "정보처리기사");
    expect(document.querySelector("span[data-review-key]")).toBeNull();
    expect(v1ExtraChip(document, 0)).toBe("정보처리기사");
  });

  it("keeps a 취득일 the page cuts to its year and month as one written outcome", async () => {
    mountV1Step3("3", "k");
    pickCertificate(0, "정보처리기사");
    const results = await writeBatch([
      ["hplace.v1.certificate.0.acquireDate", "2020-05-01"],
      ["hplace.v1.certificate.0.registNumber", "A-1234"],
    ]);
    expect(results.map((r) => r.status)).toEqual(["written", "written"]);
    expect(certInput(0, "취득일")!.value).toBe("2020.05");
  });

  it("logs a value-free skip line when a written value is not kept", async () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mountV1Step3("3", "k");
      pickCertificate(0, "정보처리기사");
      const number = certInput(0, "등록번호를 입력해주세요.")!;
      number.addEventListener("blur", () =>
        queueMicrotask(() => {
          number.value = "Z-0000";
        }),
      );
      const results = await writeBatch([
        ["hplace.v1.certificate.0.registNumber", "A-1234"],
      ]);
      expect(results.map((r) => r.status)).toEqual(["skipped"]);
      const lines = log.mock.calls.map(([l]) => String(l));
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^\[CareerForm\] skip stage=write key=hplace\.v1\.certificate\.0\.registNumber reason=control-shape detail=v1-extra-retained-value-x-9999$/,
          ),
        ]),
      );
      for (const line of lines) expect(line).not.toMatch(/A-1234|Z-0000/);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });
});

describe("v1 step 3 second tenant, month-level 취득일 (baa3384)", () => {
  it("writes a month-only profile date as YYYY.MM where the page keeps months", async () => {
    mountV1Step3("3", "k");
    pickCertificate(0, "정보처리기사");
    const results = await writeBatch([
      ["hplace.v1.certificate.0.acquireDate", "2021-07"],
    ]);
    expect(results.map((r) => r.status)).toEqual(["written"]);
    expect(certInput(0, "취득일")!.value).toBe("2021.07");
  });

  it("never accepts a different year or month", async () => {
    mountV1Step3("3", "k");
    pickCertificate(0, "정보처리기사");
    const date = certInput(0, "취득일")!;
    date.addEventListener("blur", () =>
      queueMicrotask(() =>
        queueMicrotask(() => {
          date.value = "2020.06";
        }),
      ),
    );
    const results = await writeBatch([
      ["hplace.v1.certificate.0.acquireDate", "2020-05-01"],
    ]);
    expect(results.map((r) => r.status)).toEqual(["skipped"]);
  });

  it("never writes a month-only date in the future", async () => {
    mountV1Step3("3", "k");
    pickCertificate(0, "정보처리기사");
    const results = await writeBatch([
      [
        "hplace.v1.certificate.0.acquireDate",
        `${new Date().getFullYear() + 1}-01`,
      ],
    ]);
    expect(results.map((r) => r.status)).toEqual(["skipped"]);
    expect(certInput(0, "취득일")!.value).toBe("");
  });
});

describe("v1 step 3 picked 자격증명 on the result screen (k-step3-after.txt)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["the second tenant, no review-key spans", "k" as const],
    ["the first tenant, review-key chip", "bbq" as const],
  ])("confirms the picked name on %s", async (_label, variant) => {
    mountV1Step3("3", variant);
    appendSubRow("자격증");
    const { registry, items } = itemsFor([
      ["hplace.v1.certificate.0.licenseName", "정보처리기사"],
    ]);
    const [item] = items;
    const lookup = registry.lookupField(item.candidateId);
    if (!("handle" in lookup)) throw new Error("no handle");
    const run = getWorkflowAdapter(document).executeStateDriver!(
      document,
      lookup.handle,
      item,
      new AbortController().signal,
    );
    await vi.runAllTimersAsync();
    expect(await run).toBe(true);
    // Measured: the name block, then 발급기관 and 취득일, then 등록번호.
    expect(certChip(0)).toEqual(["정보처리기사"]);
    const tracker = createProgressTracker();
    const [entry] = tracker.record(item, written(item.candidateId), registry);
    expect(tracker.progressStateFor(entry.id)).toBe(true);
    expect(resultFieldState(registry, document, item.candidateId)?.value).toBe(
      "정보처리기사",
    );
  });

  it("reads nothing when the name block also holds an input", () => {
    mountV1Step3("3", "k");
    pickCertificate(0, "정보처리기사");
    const name = Array.from(subRowAt("자격증", 0).querySelectorAll("p")).find(
      (p) => p.textContent === "정보처리기사",
    )!;
    name.parentElement!.insertAdjacentHTML(
      "beforeend",
      '<input type="text" name="other">',
    );
    expect(v1ExtraChip(document, 0)).toBeUndefined();
  });
});

describe("v1 step 3 picked-unread diagnostic (phase 8)", () => {
  const unreadLine =
    /^\[CareerForm\] skip stage=result key=hplace\.v1\.certificate\.0\.licenseName reason=picked-unread detail=status-[a-z-]+-leaves\d+-nameblock(?:\d+|x)-parentInputs\d+-parentButtons\d+-svg\d+-blocks(?:\d+|x)-depth\d+-search\d+-rk\d+$/;

  it("names the shape when the picked 자격증명 cannot be read, value-free", () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mountV1Step3("3", "k");
      appendSubRow("자격증");
      const { registry, items } = itemsFor([
        ["hplace.v1.certificate.0.licenseName", "정보처리기사"],
      ]);
      const [item] = items;
      pickCertificate(0, "정보처리기사");
      // A second text leaf: the name block can no longer be told apart.
      subRowAt("자격증", 0).firstElementChild!.insertAdjacentHTML(
        "beforeend",
        "<div><p>합성추가문구</p></div>",
      );
      const tracker = createProgressTracker();
      const [entry] = tracker.record(item, written(item.candidateId), registry);
      expect(tracker.progressStateFor(entry.id)).toBe(false);
      expect(
        resultFieldState(registry, document, item.candidateId),
      ).toBeUndefined();
      const lines = log.mock.calls.map(([l]) => String(l));
      const unread = lines.filter((l) => unreadLine.test(l));
      // Logged once per shape, however often the result screen reads it.
      expect(unread).toHaveLength(1);
      expect(unread[0]).toContain("-leaves2-");
      for (const line of lines)
        expect(line).not.toMatch(/정보처리기사|합성추가문구/);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });

  it("logs nothing when the picked name is read", () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mountV1Step3("3", "k");
      appendSubRow("자격증");
      const { registry, items } = itemsFor([
        ["hplace.v1.certificate.0.licenseName", "정보처리기사"],
      ]);
      pickCertificate(0, "정보처리기사");
      const tracker = createProgressTracker();
      const [entry] = tracker.record(
        items[0],
        written(items[0].candidateId),
        registry,
      );
      expect(tracker.progressStateFor(entry.id)).toBe(true);
      expect(
        log.mock.calls.map(([l]) => String(l)).filter((l) => /picked-/.test(l)),
      ).toEqual([]);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });

  it("says when a read name differs from the profile, by length only", () => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mountV1Step3("3", "k");
      appendSubRow("자격증");
      const { registry, items } = itemsFor([
        ["hplace.v1.certificate.0.licenseName", "정보처리기사"],
      ]);
      pickCertificate(0, "정보처리기사(필기)");
      const tracker = createProgressTracker();
      const [entry] = tracker.record(
        items[0],
        written(items[0].candidateId),
        registry,
      );
      expect(tracker.progressStateFor(entry.id)).toBe(false);
      const lines = log.mock.calls.map(([l]) => String(l));
      expect(lines).toContain(
        "[CareerForm] skip stage=result key=hplace.v1.certificate.0.licenseName reason=label-mismatch detail=v1-picked-mismatch-len10-len6",
      );
      for (const line of lines) expect(line).not.toMatch(/정보처리기사/);
    } finally {
      setAutofillDebugEnabled(false);
      log.mockRestore();
    }
  });
});
