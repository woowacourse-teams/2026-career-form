import { describe, expect, it } from "vitest";

import { buildLocalSearchValuePlan } from "./search-value-plan";

describe("local search value plan", () => {
  it("keeps an exact original-name form when the profile grade is absent", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "synthetic certificate",
        gradeCandidates: [],
      }),
    ).toMatchObject({
      profileEntryId: "certificate-1",
      originalName: "synthetic certificate",
      forms: [
        {
          kind: "original-exact",
          name: "synthetic certificate",
        },
      ],
    });
  });

  it("adds one split name and grade form only when the same entry grade reversibly suffixes the original", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "synthetic certificate level 2",
        gradeCandidates: [
          { profileEntryId: "certificate-1", grade: "level 2" },
        ],
      }),
    ).toMatchObject({
      grade: "level 2",
      forms: [
        { kind: "original-exact", name: "synthetic certificate level 2" },
        {
          kind: "name-and-grade",
          name: "synthetic certificate",
          grade: "level 2",
        },
      ],
    });
  });

  it("adds a name-with-grade form when the original name does not end with the same-entry grade", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "synthetic certificate",
        gradeCandidates: [
          { profileEntryId: "certificate-1", grade: "level 2" },
        ],
      }),
    ).toMatchObject({
      grade: "level 2",
      forms: [
        { kind: "original-exact", name: "synthetic certificate" },
        { kind: "name-with-grade", name: "synthetic certificate level 2" },
      ],
    });
  });

  it("normalizes whitespace into a single space for the name-with-grade form", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "  synthetic   certificate ",
        gradeCandidates: [
          { profileEntryId: "certificate-1", grade: " level   2 " },
        ],
      }).forms,
    ).toEqual([
      { kind: "original-exact", name: "  synthetic   certificate " },
      { kind: "name-with-grade", name: "synthetic certificate level 2" },
    ]);
  });

  it("keeps only the original form when the grade is empty", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "synthetic certificate",
        gradeCandidates: [{ profileEntryId: "certificate-1", grade: "  " }],
      }).forms,
    ).toEqual([{ kind: "original-exact", name: "synthetic certificate" }]);
  });

  it("permits reversible whitespace normalization without rewriting either profile value", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "synthetic   certificate  level 2",
        gradeCandidates: [
          { profileEntryId: "certificate-1", grade: " level 2 " },
        ],
      }).forms,
    ).toEqual([
      {
        kind: "original-exact",
        name: "synthetic   certificate  level 2",
      },
      {
        kind: "name-and-grade",
        name: "synthetic certificate",
        grade: "level 2",
      },
    ]);
  });

  it.each([
    [
      "a grade from another entry",
      [{ profileEntryId: "certificate-2", grade: "level 2" }],
    ],
    [
      "multiple grade candidates",
      [
        { profileEntryId: "certificate-1", grade: "level 2" },
        { profileEntryId: "certificate-1", grade: "level 2" },
      ],
    ],
  ] as const)(
    "does not infer a split form for %s",
    (_reason, gradeCandidates) => {
      expect(
        buildLocalSearchValuePlan({
          profileEntryId: "certificate-1",
          originalName: "synthetic certificate level 2",
          gradeCandidates,
        }).forms,
      ).toEqual([
        {
          kind: "original-exact",
          name: "synthetic certificate level 2",
        },
      ]);
    },
  );

  it("never splits a name that ends with a different grade", () => {
    expect(
      buildLocalSearchValuePlan({
        profileEntryId: "certificate-1",
        originalName: "synthetic certificate level 2",
        gradeCandidates: [
          { profileEntryId: "certificate-1", grade: "level 3" },
        ],
      }).forms.map((form) => form.kind),
    ).toEqual(["original-exact", "name-with-grade"]);
  });

  it("returns frozen local provenance so later execution cannot mutate an approved plan", () => {
    const plan = buildLocalSearchValuePlan({
      profileEntryId: "certificate-1",
      originalName: "synthetic certificate level 2",
      gradeCandidates: [{ profileEntryId: "certificate-1", grade: "level 2" }],
    });

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.forms)).toBe(true);
    expect(Object.isFrozen(plan.forms[0])).toBe(true);
  });
});
