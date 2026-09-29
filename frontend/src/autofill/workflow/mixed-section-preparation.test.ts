import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import { createMixedEducationLayerFixture } from "./test-utils/mixed-education-layer.fixture";
import { prepareMixedSectionRows } from "./mixed-section-preparation";

let fixture: ReturnType<typeof createMixedEducationLayerFixture> | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

function profile(
  ...sections: Array<[string, Record<string, string>?]>
): Profile {
  return {
    ...createEmptyProfile(),
    education: sections.map(([sectionId, values = {}], index) => ({
      id: `entry-${index}`,
      sectionId,
      values,
    })),
  };
}

const kinds = () =>
  fixture!
    .rows()
    .map(
      (row) =>
        row.querySelector<HTMLSelectElement>("select")!.selectedOptions[0]
          ?.textContent,
    );

describe("prepareMixedSectionRows", () => {
  it("selects each row's kind from the profile order before other fields", async () => {
    fixture = createMixedEducationLayerFixture({ rows: [{}, {}] });
    const recordOperation = vi.fn();
    const result = await prepareMixedSectionRows({
      document,
      profile: profile(
        ["highSchool"],
        ["university", { schoolType: "대학교" }],
      ),
      signal: new AbortController().signal,
      recordOperation,
    });
    expect(result).toEqual(["selected", "selected"]);
    expect(kinds()).toEqual(["고등학교", "대학교"]);
    expect(recordOperation).toHaveBeenCalledTimes(2);
  });

  it("keeps a user's different kind and skips that row", async () => {
    fixture = createMixedEducationLayerFixture({
      rows: [{ kind: "대학교" }, {}],
    });
    const result = await prepareMixedSectionRows({
      document,
      profile: profile(
        ["highSchool"],
        ["university", { schoolType: "대학교" }],
      ),
      signal: new AbortController().signal,
      recordOperation: vi.fn(),
    });
    expect(result).toEqual(["action-not-ready", "selected"]);
    expect(kinds()).toEqual(["대학교", "대학교"]);
  });

  it("leaves an unmapped row untouched", async () => {
    fixture = createMixedEducationLayerFixture({ rows: [{}, {}] });
    const result = await prepareMixedSectionRows({
      document,
      profile: profile(["highSchool"], ["graduateSchool"]),
      signal: new AbortController().signal,
      recordOperation: vi.fn(),
    });
    expect(result).toEqual(["selected", "option-label-mismatch"]);
    expect(kinds()).toEqual(["고등학교", "구분"]);
  });

  it("does nothing when the row count differs from the assignment", async () => {
    fixture = createMixedEducationLayerFixture({ rows: [{}] });
    const result = await prepareMixedSectionRows({
      document,
      profile: profile(
        ["highSchool"],
        ["university", { schoolType: "대학교" }],
      ),
      signal: new AbortController().signal,
      recordOperation: vi.fn(),
    });
    expect(result).toBeUndefined();
    expect(kinds()).toEqual(["구분"]);
  });

  it("stops when aborted", async () => {
    fixture = createMixedEducationLayerFixture({ rows: [{}, {}] });
    const controller = new AbortController();
    controller.abort();
    const result = await prepareMixedSectionRows({
      document,
      profile: profile(
        ["highSchool"],
        ["university", { schoolType: "대학교" }],
      ),
      signal: controller.signal,
      recordOperation: vi.fn(),
    });
    expect(result).toBeUndefined();
    expect(kinds()).toEqual(["구분", "구분"]);
  });

  it("returns undefined for a document without a browsing context", async () => {
    const detached = document.implementation.createHTMLDocument("application");
    detached.body.innerHTML =
      '<section><input aria-label="이메일" /></section>';
    await expect(
      prepareMixedSectionRows({
        document: detached,
        profile: profile(["highSchool"]),
        signal: new AbortController().signal,
        recordOperation: vi.fn(),
      }),
    ).resolves.toBeUndefined();
  });
});
