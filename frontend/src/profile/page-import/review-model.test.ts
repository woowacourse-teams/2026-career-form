import { describe, expect, it } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ImportCandidate } from "./reader";
import {
  buildReviewModel,
  defaultSelection,
  effectiveSelection,
  initialDecisions,
  toImportSelection,
  type ReviewDecisions,
} from "./review-model";

const email = (value: string): ImportCandidate => ({
  source: "basicInformation.email",
  profileFieldKey: "contact.contact.email",
  status: "available",
  reason: "direct",
  value,
});
const school: ImportCandidate = {
  source: "educationalBackground.universities.0.schoolName",
  rowIndex: 0,
  profileFieldKey: "education.university.schoolName",
  status: "review",
  reason: "catalog_unverified",
  value: "예시대학교",
};
const monthStart: ImportCandidate = {
  source: "educationalBackground.universities.0.enrollmentPeriod.startDate",
  rowIndex: 0,
  profileFieldKey: "education.university.startDate",
  status: "review",
  reason: "month_precision",
  precision: "month",
  value: "2020-03",
};
const dayStart: ImportCandidate = {
  ...monthStart,
  status: "available",
  reason: "direct",
  precision: "day",
  value: "2020-03-02",
};
const koreanName: ImportCandidate = {
  source: "basicInformation.name",
  status: "review",
  reason: "name_unsplittable",
  value: "김예시",
};
const certificate: ImportCandidate = {
  source: "certificates.0.name",
  rowIndex: 0,
  profileFieldKey: "certifications.certificate.name",
  status: "available",
  reason: "direct",
  value: "예시자격",
};
const military: ImportCandidate = {
  source: "militaryService.status",
  profileFieldKey: "military.military.militaryStatus",
  status: "available",
  reason: "direct",
  value: "military-status:not-applicable",
};

const withEmail = (value: string): Profile => ({
  ...createEmptyProfile(),
  contact: { email: value },
});
const withUniversity = (): Profile => ({
  ...createEmptyProfile(),
  education: [
    {
      id: "u1",
      sectionId: "university",
      values: { schoolName: "예시대학교", startDate: "2019-03-02" },
    },
  ],
});
const decide = (
  base: ReviewDecisions,
  next: Partial<ReviewDecisions>,
): ReviewDecisions => ({ ...base, ...next });

describe("review model", () => {
  it("classifies new, changed and same values against the baseline", () => {
    const changed = buildReviewModel(
      [email("new@example.test")],
      withEmail("old@example.test"),
      initialDecisions([]),
    );
    expect(changed.rows[0]).toMatchObject({
      status: "changed",
      current: "old@example.test",
      value: "new@example.test",
    });
    const same = buildReviewModel(
      [email("old@example.test")],
      withEmail("old@example.test"),
      initialDecisions([]),
    );
    expect(same.rows[0].status).toBe("same");
    const fresh = buildReviewModel(
      [email("new@example.test")],
      createEmptyProfile(),
      initialDecisions([]),
    );
    expect(fresh.rows[0].status).toBe("new");
  });

  it("preselects only new values outside sensitive categories", () => {
    const model = buildReviewModel(
      [email("new@example.test"), school, military],
      withEmail("old@example.test"),
      initialDecisions([school]),
    );
    const selected = defaultSelection(model.rows);
    expect(selected["basicInformation.email"]).toBeFalsy();
    expect(selected[school.source]).toBe(true);
    expect(selected[military.source]).toBeFalsy();
    expect(model.rows.find((r) => r.key === military.source)).toMatchObject({
      status: "new",
      sensitive: true,
    });
  });

  it("keeps names, month dates and undecided targets pending until decided", () => {
    const found = [koreanName, school, monthStart];
    const decisions = initialDecisions(found);
    const model = buildReviewModel(found, createEmptyProfile(), decisions);
    expect(model.rows.find((r) => r.key === "koreanFamilyName")).toMatchObject({
      status: "pending",
      pending: "name",
      value: "김",
    });
    expect(model.rows.find((r) => r.key === monthStart.source)).toMatchObject({
      status: "pending",
      pending: "date",
    });
    expect(model.confirmations.map((c) => c.kind)).toEqual(["name", "date"]);
    expect(model.confirmations[1]).toMatchObject({ month: "2020-03" });

    const decided = buildReviewModel(
      found,
      createEmptyProfile(),
      decide(decisions, {
        names: {
          "basicInformation.name": {
            familyName: "김",
            givenName: "예시",
            confirmed: true,
          },
        },
        dates: { [monthStart.source]: "2020-03-02" },
      }),
    );
    expect(decided.rows.find((r) => r.key === "koreanGivenName")).toMatchObject(
      { status: "new", value: "예시" },
    );
    expect(decided.rows.find((r) => r.key === monthStart.source)).toMatchObject(
      { status: "new", value: "2020-03-02" },
    );
    expect(decided.confirmations).toEqual([]);
  });

  it("drops a month date the user chose to exclude without inventing a day", () => {
    const found = [school, monthStart];
    const decisions = decide(initialDecisions(found), {
      dates: { [monthStart.source]: null },
    });
    const model = buildReviewModel(found, createEmptyProfile(), decisions);
    expect(model.rows.find((r) => r.key === monthStart.source)?.status).toBe(
      "excluded",
    );
    const chosen = effectiveSelection(
      model,
      defaultSelection(model.rows),
      createEmptyProfile(),
    );
    expect(toImportSelection(model, chosen).entries).toEqual([
      {
        categoryId: "education",
        sectionId: "university",
        sourceRow: 0,
        values: { schoolName: "예시대학교" },
      },
    ]);
  });

  it("asks for a target instead of linking a same-name existing entry", () => {
    const decisions = initialDecisions([school]);
    const model = buildReviewModel([school], withUniversity(), decisions);
    expect(model.rows[0]).toMatchObject({
      status: "pending",
      pending: "target",
    });
    expect(model.confirmations[0]).toMatchObject({
      kind: "target",
      id: "education.university.0",
      name: "예시대학교",
      primary: "schoolName",
      fields: [{ fieldId: "schoolName", label: "학교명", value: "예시대학교" }],
    });

    const target = (value: string) =>
      buildReviewModel(
        [school],
        withUniversity(),
        decide(decisions, { targets: { "education.university.0": value } }),
      ).rows[0];
    expect(target("existing:u1")).toMatchObject({
      status: "same",
      current: "예시대학교",
    });
    expect(target("new").status).toBe("new");
    expect(target("skip").status).toBe("excluded");
  });

  it("links an existing entry only through its explicit target ID", () => {
    const model = buildReviewModel(
      [school, dayStart],
      withUniversity(),
      decide(initialDecisions([school, dayStart]), {
        targets: { "education.university.0": "existing:u1" },
      }),
    );
    const chosen = effectiveSelection(
      model,
      { [dayStart.source]: true },
      withUniversity(),
    );
    expect(toImportSelection(model, chosen).entries).toEqual([
      {
        categoryId: "education",
        sectionId: "university",
        sourceRow: 0,
        targetId: "u1",
        values: { startDate: "2020-03-02" },
      },
    ]);
  });

  it("drops a new repeated row whose primary name was turned off", () => {
    const found = [school, dayStart];
    const model = buildReviewModel(
      found,
      createEmptyProfile(),
      initialDecisions(found),
    );
    expect(
      effectiveSelection(
        model,
        { [dayStart.source]: true, [school.source]: false },
        createEmptyProfile(),
      ),
    ).toEqual({});
  });

  it("removes duplicate new rows that saving would reject", () => {
    const second = {
      ...certificate,
      source: "certificates.1.name",
      rowIndex: 1,
    };
    const model = buildReviewModel(
      [certificate, second],
      createEmptyProfile(),
      initialDecisions([certificate, second]),
    );
    const chosen = effectiveSelection(
      model,
      defaultSelection(model.rows),
      createEmptyProfile(),
    );
    expect(chosen).toEqual({ [certificate.source]: true });
  });

  it("writes confirmed name parts to the personal category", () => {
    const decisions = decide(initialDecisions([koreanName]), {
      names: {
        "basicInformation.name": {
          familyName: " 김 ",
          givenName: "예시",
          confirmed: true,
        },
      },
    });
    const model = buildReviewModel(
      [koreanName],
      createEmptyProfile(),
      decisions,
    );
    const chosen = effectiveSelection(
      model,
      defaultSelection(model.rows),
      createEmptyProfile(),
    );
    expect(toImportSelection(model, chosen).single).toEqual({
      personal: { koreanFamilyName: "김", koreanGivenName: "예시" },
    });
  });

  it("uses plain labels without middle dots", () => {
    const model = buildReviewModel(
      [certificate],
      createEmptyProfile(),
      initialDecisions([certificate]),
    );
    expect(model.rows[0].label).not.toContain("·");
    expect(model.rows[0].groupLabel).toBe("자격증과 면허증 1");
  });
});
