import { describe, expect, it } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import {
  ImportConflictError,
  mergeImportSelection,
  saveImportSelection,
  type ImportSelection,
} from "./merge";

function base() {
  const profile = createEmptyProfile();
  profile.personal = { koreanFamilyName: "기존", koreanGivenName: "이름" };
  profile.contact = { email: "old@example.invalid", addressLine1: "보존" };
  profile.education = [
    {
      id: "university-1",
      sectionId: "university",
      values: {
        schoolName: "기존 대학",
        startDate: "2020-03-01",
        major: "보존 전공",
      },
      identity: {
        status: "selected",
        catalogId: "school-1",
        displayName: "기존 대학",
        originalText: "기존 대학",
        catalogVersion: "1",
      },
    },
  ];
  profile.careers = [
    {
      id: "career-1",
      sectionId: "career",
      values: { companyName: "보존 회사" },
    },
  ];
  return profile;
}
const contact: ImportSelection = {
  contact: { email: "new@example.invalid" },
  education: [],
};
const row = (sourceRow = 0) => ({
  sourceRow,
  values: {
    schoolName: "합성 대학",
    startDate: "2022-03-01",
    endDate: "2026-02-20",
  },
});

describe("mergeImportSelection", () => {
  it("rejects new university without a selected school name", () => {
    expect(() =>
      mergeImportSelection(base(), {
        education: [{ sourceRow: 0, values: { startDate: "2020-03-01" } }],
      }),
    ).toThrow();
  });
  it("allows selected dates alone for an explicitly chosen existing university", () => {
    const original = base();
    const result = mergeImportSelection(original, {
      education: [
        {
          sourceRow: 0,
          targetId: "university-1",
          values: { endDate: "2024-02-20" },
        },
      ],
    });
    expect(result.education[0]).toEqual({
      ...original.education[0],
      values: { ...original.education[0].values, endDate: "2024-02-20" },
    });
  });
  it("merges selected contact without mutating input or unrelated fields", () => {
    const original = base();
    const merged = mergeImportSelection(original, contact);
    expect(merged.contact).toEqual({
      email: "new@example.invalid",
      addressLine1: "보존",
    });
    expect(original.contact.email).toBe("old@example.invalid");
    expect(merged.education).toEqual(original.education);
    expect(merged.careers).toEqual(original.careers);
    merged.careers[0].values.companyName = "수정";
    expect(original.careers[0].values.companyName).toBe("보존 회사");
  });
  it("accepts only explicitly separated name fields and preserves unselected name", () => {
    expect(
      mergeImportSelection(base(), {
        personal: { koreanGivenName: "확인 이름" },
        education: [],
      }).personal,
    ).toEqual({ koreanFamilyName: "기존", koreanGivenName: "확인 이름" });
  });
  it("updates only the chosen university by id and preserves identity for unchanged school", () => {
    const original = base();
    const merged = mergeImportSelection(original, {
      education: [
        {
          sourceRow: 1,
          targetId: "university-1",
          values: { endDate: "2024-02-20", schoolName: "기존 대학" },
        },
      ],
    });
    expect(merged.education[0]).toEqual({
      ...original.education[0],
      values: { ...original.education[0].values, endDate: "2024-02-20" },
    });
  });
  it("replaces catalog identity with manual identity when school changes", () => {
    expect(
      mergeImportSelection(base(), {
        education: [
          {
            sourceRow: 0,
            targetId: "university-1",
            values: { schoolName: "다른 대학" },
          },
        ],
      }).education[0].identity,
    ).toEqual({ status: "manual", originalText: "다른 대학" });
  });
  it("adds new university with unique id and manual identity", () => {
    const merged = mergeImportSelection(
      base(),
      { education: [row()] },
      () => "new-id",
    );
    expect(merged.education[1]).toEqual({
      id: "new-id",
      sectionId: "university",
      values: row().values,
      identity: { status: "manual", originalText: "합성 대학" },
    });
  });
  it("allows same school with different dates rather than school-name matching", () => {
    const original = base();
    expect(
      mergeImportSelection(
        original,
        {
          education: [
            {
              sourceRow: 0,
              values: { schoolName: "기존 대학", startDate: "2024-03-01" },
            },
          ],
        },
        () => "new-id",
      ).education,
    ).toHaveLength(2);
  });
  it.each([
    { education: [] },
    { contact: { email: "" }, education: [] },
    { contact: { email: "not-email" }, education: [] },
    { contact: { phoneNumber: "+82-10-1234-5678" }, education: [] },
    { personal: { fullName: "추측 금지" }, education: [] },
    { contact: { addressLine1: "범위 밖" }, education: [] },
    { education: [{ sourceRow: 0, values: { startDate: "2020-03" } }] },
    { education: [{ sourceRow: 0, values: { startDate: "2020-02-30" } }] },
    { education: [{ sourceRow: 0, values: { major: "범위 밖" } }] },
    { education: [{ sourceRow: 0, values: {} }] },
    {
      education: [
        { sourceRow: 0, targetId: "missing", values: { schoolName: "대학" } },
      ],
    },
    { education: [row(), row()] },
    { education: [row(), row(1)] },
    {
      education: [
        { ...row(), targetId: "university-1" },
        { ...row(1), targetId: "university-1" },
      ],
    },
    { education: [{ sourceRow: -1, values: { schoolName: "대학" } }] },
  ])("rejects invalid, empty or ambiguous selection %j", (selection) => {
    expect(() =>
      mergeImportSelection(base(), selection as ImportSelection),
    ).toThrow();
  });
  it("rejects a non-university target", () => {
    const original = base();
    original.education[0].sectionId = "highSchool";
    expect(() =>
      mergeImportSelection(original, {
        education: [{ ...row(), targetId: "university-1" }],
      }),
    ).toThrow();
  });
  it("rejects exact duplicate added university against existing entries", () => {
    const original = base();
    original.education.push({
      id: "second",
      sectionId: "university",
      values: row().values,
    });
    expect(() =>
      mergeImportSelection(original, { education: [row()] }),
    ).toThrow();
  });
  it("rejects reused ids without losing existing entries", () => {
    expect(() =>
      mergeImportSelection(
        base(),
        { education: [row()] },
        () => "university-1",
      ),
    ).toThrow();
  });
});

function memory(initial: Profile): ProfileRepository {
  let saved = structuredClone(initial);
  return {
    load: async () => structuredClone(saved),
    save: async (value) => {
      saved = structuredClone(value);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
}
describe("saveImportSelection", () => {
  it("persists merge and returns the saved result", async () => {
    const original = base();
    const repository = memory(original);
    const result = await saveImportSelection(repository, original, contact);
    expect((await repository.load()).contact.email).toBe("new@example.invalid");
    expect(result).toEqual(await repository.load());
  });
  it("rejects stale baseline without overwriting newer data", async () => {
    const original = base();
    const repository = memory(original);
    const newer = base();
    newer.contact.phoneNumber = "01012345678";
    await repository.save(newer);
    await expect(
      saveImportSelection(repository, original, contact),
    ).rejects.toBeInstanceOf(ImportConflictError);
    expect(await repository.load()).toEqual(newer);
  });
  it("compares object structure independent of property order", async () => {
    const original = base();
    const reordered = base();
    reordered.contact = { addressLine1: "보존", email: "old@example.invalid" };
    expect(
      (await saveImportSelection(memory(reordered), original, contact)).contact
        .email,
    ).toBe("new@example.invalid");
  });
  it("does not report success when persistence fails", async () => {
    const original = base();
    const repository = memory(original);
    repository.save = async () => {
      throw new Error("synthetic failure");
    };
    await expect(
      saveImportSelection(repository, original, contact),
    ).rejects.toThrow("synthetic failure");
    expect(await repository.load()).toEqual(original);
  });
});

it("uses atomic compare-and-save and rejects a race after the preview load", async () => {
  const original = base();
  const repository = memory(original);
  const atomic = Object.assign(repository, {
    saveIfUnchanged: async (_expected: Profile, _next: Profile) => {
      const concurrent = base();
      concurrent.contact.phoneNumber = "01012345678";
      await repository.save(concurrent);
      return false;
    },
  });
  await expect(
    saveImportSelection(atomic, original, contact),
  ).rejects.toBeInstanceOf(ImportConflictError);
  expect((await repository.load()).contact).toEqual({
    email: "old@example.invalid",
    addressLine1: "보존",
    phoneNumber: "01012345678",
  });
});
