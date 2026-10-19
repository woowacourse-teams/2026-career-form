import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type Profile } from "../../profile/model";
import type { GenericFieldsResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWrites } from "../write/executor";
import {
  analyzeGenericFields,
  applyGenericGrade,
  createGenericAnalysisCache,
  type GenericAnalysisApi,
} from "./generic-analysis";

afterEach(() => document.body.replaceChildren());

type Override = Partial<GenericFieldsResponse["fields"][number]>;
type Recipe = Extract<
  NonNullable<GenericFieldsResponse["fields"][number]["binding"]>,
  { type: "DERIVED" }
>["recipe"];

const READY: Override = {
  confidence: 0.95,
  categoryConfirmed: true,
  autofillPolicy: "ALLOWED",
  interactionStatus: "READY",
  writePlan: { command: "SET_TEXT" },
};
const recipe = (value: Recipe): Override => ({
  ...READY,
  profileFieldKey: null,
  binding: { type: "DERIVED", recipe: value },
});
const direct = (profileFieldKey: string): Override => ({ ...READY, profileFieldKey });

function api(responses: Readonly<Record<string, Override>>): GenericAnalysisApi {
  return {
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        category: "PERSONAL",
        confidence: 1,
      })),
    }),
    analyzeGenericFields: async (request) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      fields: request.sections.flatMap((section) =>
        section.fields.map((field) => ({
          candidateId: field.candidateId,
          profileFieldKey: null,
          confidence: 0,
          categoryConfirmed: true,
          interactionStatus: "BLOCKED" as const,
          ...responses[field.domName ?? ""],
        })),
      ),
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
    }),
  };
}

function profile(): Profile {
  const value = createEmptyProfile();
  value.personal.koreanFamilyName = "합성";
  value.personal.koreanGivenName = "이름";
  value.personal.englishFamilyName = "Synthfamily";
  value.personal.englishGivenName = "Synthgiven";
  return value;
}

/** Analyzes the mounted document, then approves every item and executes the writes. */
async function approveAll(responses: Readonly<Record<string, Override>>) {
  const snapshot = collectFieldsSnapshot(document);
  const user = profile();
  const result = await analyzeGenericFields(
    snapshot,
    document,
    api(responses),
    user,
    createGenericAnalysisCache(),
  );
  const plan = buildReviewPlan({
    analysis: result.analysis,
    profile: user,
    registry: snapshot.registry,
  });
  const items = plan.items.map((item) =>
    applyGenericGrade(item, result.grades.get(item.candidateId)),
  );
  const writes = executeApprovedWrites({
    items,
    approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
    registry: snapshot.registry,
  });
  const idOf = (name: string) => {
    const field = result.analysis.fields.find((entry) => {
      const lookup = snapshot.registry.lookupField(entry.candidateId);
      return "handle" in lookup && lookup.handle.candidate.domName === name;
    });
    if (!field) throw new Error(`missing ${name}`);
    return field.candidateId;
  };
  return {
    grade: (name: string) => result.grades.get(idOf(name)),
    item: (name: string) => items.find((entry) => entry.candidateId === idOf(name)),
    written: (name: string) =>
      writes.some((write) => write.candidateId === idOf(name) && write.status === "written"),
  };
}

const input = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
const OTHER = { grade: "BLOCKED", reason: "OTHER_PERSON_CONTEXT" };

describe("other-person composite name fields", () => {
  it.each([
    ["보호자 성명", "KOREAN_FULL_NAME"],
    ["Referee full name", "ENGLISH_FULL_NAME_GIVEN_FIRST"],
    ["비상연락 영문 성명", "ENGLISH_FULL_NAME_FAMILY_FIRST"],
  ] as const)("blocks a field labelled %s bound to %s and never writes it", async (label, value) => {
    document.body.innerHTML = `<form><h2>인적사항</h2><label>${label}<input name="other"></label></form>`;
    const run = await approveAll({ other: recipe(value) });
    expect(run.grade("other")).toEqual(OTHER);
    expect(run.item("other")).toMatchObject({ selected: false, disabled: true });
    expect(run.written("other")).toBe(false);
    expect(input("other").value).toBe("");
  });

  it("keeps the applicant's own name fields composed and written", async () => {
    document.body.innerHTML =
      '<form><h2>인적사항</h2><label>성명<input name="ko"></label><label>영문 이름<input name="en"></label></form>';
    const run = await approveAll({
      ko: recipe("KOREAN_FULL_NAME"),
      en: recipe("ENGLISH_FULL_NAME_GIVEN_FIRST"),
    });
    expect(run.grade("ko")).toEqual({ grade: "AUTO" });
    expect(run.grade("en")).toEqual({ grade: "AUTO" });
    expect(input("ko").value).toBe("합성이름");
    expect(input("en").value).toBe("Synthgiven Synthfamily");
  });

  it("blocks the other person's name but keeps the applicant's in one document", async () => {
    document.body.innerHTML =
      '<form><h2>인적사항</h2><label>성명<input name="own"></label><label>보증인 성명<input name="other"></label></form>';
    const run = await approveAll({
      own: recipe("KOREAN_FULL_NAME"),
      other: recipe("KOREAN_FULL_NAME"),
    });
    expect(run.grade("own")).toEqual({ grade: "AUTO" });
    expect(run.grade("other")).toEqual(OTHER);
    expect(input("own").value).toBe("합성이름");
    expect(input("other").value).toBe("");
  });
});

describe("single English name part", () => {
  const REVIEW = { grade: "REVIEW", reason: "UNPAIRED_NAME_PART" };

  it.each(["englishGivenName", "englishFamilyName"])(
    "leaves a lone %s match unselected for review",
    async (field) => {
      document.body.innerHTML =
        '<form><h2>인적사항</h2><label>영문 이름<input name="en"></label><label>이메일<input name="mail"></label></form>';
      const run = await approveAll({
        en: direct(`personal.personal.${field}`),
        mail: direct("contact.contact.email"),
      });
      expect(run.grade("en")).toEqual(REVIEW);
      expect(run.item("en")).toMatchObject({ selected: false });
    },
  );

  it("keeps both keys AUTO when the document splits family and given names", async () => {
    document.body.innerHTML =
      '<form><h2>인적사항</h2><label>Family name<input name="fam"></label><label>Given name<input name="giv"></label></form>';
    const run = await approveAll({
      fam: direct("personal.personal.englishFamilyName"),
      giv: direct("personal.personal.englishGivenName"),
    });
    expect(run.grade("fam")).toEqual({ grade: "AUTO" });
    expect(run.grade("giv")).toEqual({ grade: "AUTO" });
    expect(input("fam").value).toBe("Synthfamily");
    expect(input("giv").value).toBe("Synthgiven");
  });

  it("grades each repeat row's keys by their own row", async () => {
    document.body.innerHTML =
      '<form><h2>가족</h2><div class="list"><div data-repeater-item><input name="fam" aria-label="Family name"><input name="giv" aria-label="Given name"></div><div data-repeater-item><input name="fam2" aria-label="Family name"><input name="other" aria-label="Other name"></div><button type="button">추가</button></div></form>';
    const run = await approveAll({
      fam: direct("personal.personal.englishFamilyName"),
      giv: direct("personal.personal.englishGivenName"),
      fam2: direct("personal.personal.englishFamilyName"),
    });
    expect(run.grade("fam")).toEqual({ grade: "AUTO" });
    expect(run.grade("giv")).toEqual({ grade: "AUTO" });
    expect(run.grade("fam2")).toEqual(REVIEW);
  });

  it("writes the composed full name when the response is an English recipe", async () => {
    document.body.innerHTML =
      '<form><h2>인적사항</h2><label>영문 이름<input name="en"></label></form>';
    const run = await approveAll({ en: recipe("ENGLISH_FULL_NAME_FAMILY_FIRST") });
    expect(run.grade("en")).toEqual({ grade: "AUTO" });
    expect(input("en").value).toBe("Synthfamily Synthgiven");
  });
});

describe.each([
  ["ahnlab-write-resume-form", "englishName"],
  ["lg-ai-research-birth-split-email", "name"],
])("name safety on the sanitized %s structure", (fixture, fieldId) => {
  function mount(labelText: string) {
    document.body.innerHTML = readFileSync(
      join(process.cwd(), `fixtures/dom-snapshots/${fixture}/sanitized.html`),
      "utf8",
    );
    const field = document.getElementById(fieldId) as HTMLInputElement;
    field.name = "subject";
    document.querySelector(`label[for="${fieldId}"]`)!.textContent = labelText;
    return field;
  }

  it("blocks an unrelated person's recipe and keeps the applicant's recipe writable", async () => {
    const other = mount("보호자 영문 성명");
    const blocked = await approveAll({
      subject: recipe("ENGLISH_FULL_NAME_GIVEN_FIRST"),
    });
    expect(blocked.grade("subject")).toEqual(OTHER);
    expect(blocked.written("subject")).toBe(false);
    expect(other.value).toBe("");

    const own = mount("지원자 영문 이름");
    const allowed = await approveAll({
      subject: recipe("ENGLISH_FULL_NAME_GIVEN_FIRST"),
    });
    expect(allowed.grade("subject")).toEqual({ grade: "AUTO" });
    expect(own.value).toBe("Synthgiven Synthfamily");
  });

  it.each(["englishGivenName", "englishFamilyName"])(
    "does not automatically select the unpaired %s mapping",
    async (part) => {
      mount("영문 이름");
      const run = await approveAll({
        subject: direct(`personal.personal.${part}`),
      });
      expect(run.grade("subject")).toEqual({
        grade: "REVIEW",
        reason: "UNPAIRED_NAME_PART",
      });
      expect(run.item("subject")).toMatchObject({ selected: false });
    },
  );
});
