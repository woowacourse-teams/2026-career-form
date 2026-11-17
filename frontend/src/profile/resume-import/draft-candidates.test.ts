import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../catalog-search";
import { createEmptyProfile } from "../model";
import { destination } from "../page-import/review-fields";
import {
  buildReviewModel,
  defaultSelection,
  initialDecisions,
} from "../page-import/review-model";
import { draftToCandidates } from "./draft-candidates";
import type { ResumeDraft } from "./resume-import-client";

const CATALOG: readonly CatalogEntry[] = [
  {
    id: "u1",
    kind: "university",
    name: "합성대학교",
    detail: "서울",
    aliases: ["합성대"],
  },
  {
    id: "u2",
    kind: "university",
    name: "합성공과대학교",
    detail: "부산",
    aliases: [],
  },
  {
    id: "c1",
    kind: "certificate",
    name: "합성기사",
    detail: "합성공단 · 국가기술",
    aliases: [],
  },
  {
    id: "l1",
    kind: "languageTest",
    name: "TOEIC",
    detail: "어학 시험",
    aliases: ["토익"],
  },
];

const draft = (patch: Partial<ResumeDraft>): ResumeDraft =>
  ({
    ...createEmptyProfile(),
    education: [],
    ...patch,
  }) as ResumeDraft;

describe("draftToCandidates", () => {
  it("turns single values into rows the existing review model accepts", () => {
    const { candidates, stats } = draftToCandidates(
      draft({
        personal: { koreanFamilyName: "김", koreanGivenName: "합성" },
        contact: {
          email: "synthetic@example.test",
          phoneNumber: "01012345678",
        },
      }),
      CATALOG,
    );
    expect(candidates.map((c) => c.profileFieldKey)).toEqual([
      "personal.personal.koreanFamilyName",
      "personal.personal.koreanGivenName",
      "contact.contact.email",
      "contact.contact.phoneNumber",
    ]);
    expect(candidates.every((c) => destination(c))).toBe(true);
    expect(stats.draftCounts).toMatchObject({
      personal: 2,
      contact: 2,
      education: 0,
    });
    const profile = createEmptyProfile();
    const model = buildReviewModel(
      candidates,
      profile,
      initialDecisions(candidates, profile),
    );
    expect(model.rows.map((row) => [row.fieldId, row.status])).toEqual([
      ["koreanFamilyName", "new"],
      ["koreanGivenName", "new"],
      ["email", "new"],
      ["phoneNumber", "new"],
    ]);
    expect(Object.keys(defaultSelection(model.rows))).toHaveLength(4);
  });

  it("numbers repeated entries per section so each becomes its own entry", () => {
    const { candidates, stats } = draftToCandidates(
      draft({
        education: [
          {
            sectionId: "university",
            values: { schoolName: "합성대", startDate: "2015-03-02" },
          },
          { sectionId: "highSchool", values: { schoolName: "없는고등학교" } },
          { sectionId: "university", values: { schoolName: "합성공과대학교" } },
        ],
        careers: [{ sectionId: "career", values: { companyName: "합성상사" } }],
      }),
      CATALOG,
    );
    expect(
      candidates.map((c) => [
        c.profileFieldKey,
        c.rowIndex,
        c.value,
        c.precision,
      ]),
    ).toEqual([
      ["education.university.schoolName", 0, "합성대학교", undefined],
      ["education.university.startDate", 0, "2015-03-02", "day"],
      ["education.university.schoolName", 1, "합성공과대학교", undefined],
      ["careers.career.companyName", 0, "합성상사", undefined],
    ]);
    expect(new Set(candidates.map((c) => c.source)).size).toBe(
      candidates.length,
    );
    expect(stats).toMatchObject({
      draftCounts: { education: 3, careers: 1 },
      catalogMatched: 2,
      catalogEmptied: 1,
    });
  });

  it("fills catalog fields only with a catalog value and leaves unmatched ones empty", () => {
    const { candidates, skipped, stats } = draftToCandidates(
      draft({
        certifications: [
          {
            sectionId: "certificate",
            values: { name: "합성기사", acquisitionDate: "2020-05-01" },
          },
          {
            sectionId: "certificate",
            values: { name: "없는자격", acquisitionDate: "2021-01-01" },
          },
        ],
        languages: [
          {
            sectionId: "languageTest",
            values: { testName: "토익", grade: "900" },
          },
        ],
        education: [
          // "합성" matches two universities, so it is ambiguous and stays empty.
          { sectionId: "university", values: { schoolName: "합성" } },
        ],
      }),
      CATALOG,
    );
    const names = candidates
      .filter((c) =>
        /\.(name|testName|schoolName)$/.test(c.profileFieldKey ?? ""),
      )
      .map((c) => c.value);
    // Repeated categories follow the profile order: languages, then certifications.
    expect(names).toEqual(["TOEIC", "합성기사"]);
    expect(candidates.find((c) => c.value === "없는자격")).toBeUndefined();
    expect(candidates.find((c) => c.value === "2021-01-01")).toMatchObject({
      profileFieldKey: "certifications.certificate.acquisitionDate",
      rowIndex: 1,
    });
    expect(skipped).toEqual({ catalog_unmatched: 2 });
    expect(stats).toMatchObject({ catalogMatched: 2, catalogEmptied: 2 });
  });

  it("drops values the profile cannot store and keeps empty dates out", () => {
    const { candidates, skipped } = draftToCandidates(
      draft({
        personal: {
          birthDate: "1999-02",
          nationality: "  ",
          unknownField: "x",
        },
        contact: { phoneNumber: "021234567", email: "not-an-email" },
        projects: [
          {
            sectionId: "project",
            values: {
              projectName: "합성 프로젝트",
              startDate: "",
              endDate: "2024-13-40",
            },
          },
          { sectionId: "unknownSection", values: { projectName: "x" } },
        ],
      }),
      CATALOG,
    );
    expect(candidates.map((c) => [c.profileFieldKey, c.value])).toEqual([
      ["projects.project.projectName", "합성 프로젝트"],
    ]);
    expect(skipped).toEqual({ invalid_value: 6 });
  });

  it("tolerates a draft missing categories", () => {
    const { candidates, stats } = draftToCandidates(
      { personal: { koreanGivenName: "합성" } } as unknown as ResumeDraft,
      CATALOG,
    );
    expect(candidates).toHaveLength(1);
    expect(stats.draftCounts.education).toBe(0);
  });
});
