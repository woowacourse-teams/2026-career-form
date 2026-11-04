import { describe, expect, it } from "vitest";
import {
  JobCategoryStore,
  matchesSelectedRoles,
  parseJobCategoriesView,
  pruneRoles,
  PUSH_JOB_CATEGORIES_KEY,
} from "./job-roles";
import { PushApiError, type JobCategories } from "./push-api";

const categories: JobCategories = {
  version: 1,
  categories: [
    {
      code: "IT",
      label: "IT/개발",
      roles: [
        { code: "IT.BACKEND", label: "백엔드" },
        { code: "IT.FRONTEND", label: "프론트엔드" },
      ],
    },
    {
      code: "DESIGN",
      label: "디자인",
      roles: [{ code: "DESIGN.UX_UI", label: "UX/UI" }],
    },
  ],
};

function harness() {
  const store: Record<string, unknown> = {};
  let failWith: Error | undefined;
  let served = categories;
  let calls = 0;
  const jobStore = new JobCategoryStore({
    api: {
      jobCategories: async () => {
        calls += 1;
        if (failWith) throw failWith;
        return served;
      },
    },
    storage: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => {
        Object.assign(store, items);
      },
    },
    now: () => 1_700_000_000_000,
  });
  return {
    jobStore,
    store,
    calls: () => calls,
    fail: (error?: Error) => {
      failWith = error;
    },
    serve: (next: JobCategories) => {
      served = next;
    },
  };
}

describe("JobCategoryStore", () => {
  it("서버 분류를 받아 버전·시각과 함께 캐시한다", async () => {
    const h = harness();
    expect(await h.jobStore.load()).toEqual({ categories, error: null });
    expect(h.store[PUSH_JOB_CATEGORIES_KEY]).toEqual({
      ...categories,
      fetchedAt: 1_700_000_000_000,
    });
  });
  it.each([
    ["ENDPOINT_UNAVAILABLE", new PushApiError("ENDPOINT_UNAVAILABLE")],
    ["NOT_CONFIGURED", new PushApiError("NOT_CONFIGURED")],
    ["NETWORK", new PushApiError("NETWORK")],
    ["NETWORK", new Error("storage")],
  ] as const)(
    "조회에 실패하면 캐시를 유지한 채 오류 %s를 함께 돌려준다",
    async (code, error) => {
      const h = harness();
      await h.jobStore.load();
      h.fail(error);
      expect(await h.jobStore.load()).toEqual({ categories, error: code });
      expect(h.store[PUSH_JOB_CATEGORIES_KEY]).toMatchObject(categories);
    },
  );
  it("캐시가 없으면 분류 없이 오류만 돌려준다", async () => {
    const h = harness();
    h.fail(new PushApiError("ENDPOINT_UNAVAILABLE"));
    expect(await h.jobStore.load()).toEqual({
      categories: null,
      error: "ENDPOINT_UNAVAILABLE",
    });
    expect(h.store[PUSH_JOB_CATEGORIES_KEY]).toBeUndefined();
  });
  it("손상된 캐시는 무시한다", async () => {
    const h = harness();
    h.store[PUSH_JOB_CATEGORIES_KEY] = { version: "x", categories: [] };
    h.fail(new PushApiError("NETWORK"));
    expect(await h.jobStore.load()).toEqual({
      categories: null,
      error: "NETWORK",
    });
  });
  it("새 서버 응답은 캐시를 덮어쓴다", async () => {
    const h = harness();
    await h.jobStore.load();
    const next = { ...categories, version: 2 };
    h.serve(next);
    expect(await h.jobStore.load()).toEqual({ categories: next, error: null });
    expect(h.store[PUSH_JOB_CATEGORIES_KEY]).toMatchObject({ version: 2 });
    expect(h.calls()).toBe(2);
  });
});

describe("matchesSelectedRoles", () => {
  it("roles 없는 기존 공고는 선택과 무관하게 보여 준다", () => {
    expect(matchesSelectedRoles(undefined, [])).toBe(true);
    expect(matchesSelectedRoles(undefined, ["IT.BACKEND"])).toBe(true);
  });
  it("선택값과 겹치는 공고만 통과하고 미선택이면 거른다", () => {
    expect(matchesSelectedRoles(["IT.BACKEND", "IT.QA"], ["IT.QA"])).toBe(true);
    expect(matchesSelectedRoles(["IT.BACKEND"], ["DESIGN.UX_UI"])).toBe(false);
    expect(matchesSelectedRoles(["IT.BACKEND"], [])).toBe(false);
    expect(matchesSelectedRoles([], ["IT.BACKEND"])).toBe(false);
  });
});

describe("pruneRoles", () => {
  it("분류에 없는 코드를 선택값에서 버린다", () => {
    expect(
      pruneRoles(["IT.BACKEND", "IT.GONE", "DESIGN.UX_UI"], categories),
    ).toEqual(["IT.BACKEND", "DESIGN.UX_UI"]);
  });
});

describe("parseJobCategoriesView", () => {
  it("분류와 오류 코드를 검증한다", () => {
    expect(parseJobCategoriesView({ categories, error: null })).toEqual({
      categories,
      error: null,
    });
    expect(
      parseJobCategoriesView({ categories: null, error: "NETWORK" }),
    ).toEqual({ categories: null, error: "NETWORK" });
    expect(parseJobCategoriesView({ categories, error: "weird" })).toBe(
      undefined,
    );
    expect(parseJobCategoriesView({ categories: "x", error: null })).toBe(
      undefined,
    );
    expect(parseJobCategoriesView(null)).toBeUndefined();
  });
});
