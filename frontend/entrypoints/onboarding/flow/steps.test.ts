import { describe, expect, it } from "vitest";
import {
  createStepStore,
  ONBOARDING_STEP_KEY,
  ONBOARDING_STEPS,
  STEP_LABELS,
} from "./steps";

function memory(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    },
  };
}

describe("온보딩 단계", () => {
  it("이름, 이메일, 직무 선택, 알림 안내, Greeting, 사용법 순서다", () => {
    expect(ONBOARDING_STEPS.map((step) => STEP_LABELS[step])).toEqual([
      "이름",
      "이메일",
      "직무 선택",
      "알림 안내",
      "Greeting",
      "사용법",
    ]);
  });
  it("저장한 단계 이름을 다시 읽는다", async () => {
    const storage = memory();
    const store = createStepStore(storage);
    expect(await store.read()).toBeUndefined();
    await store.write("roles");
    expect(storage.data).toEqual({ [ONBOARDING_STEP_KEY]: "roles" });
    expect(await store.read()).toBe("roles");
  });
  it("알 수 없는 값이나 읽기 실패는 저장한 단계가 없는 것으로 본다", async () => {
    expect(
      await createStepStore(memory({ [ONBOARDING_STEP_KEY]: "phone" })).read(),
    ).toBeUndefined();
    const broken = {
      get: async () => {
        throw new Error("storage");
      },
      set: async () => {
        throw new Error("storage");
      },
    };
    const store = createStepStore(broken);
    expect(await store.read()).toBeUndefined();
    await expect(store.write("email")).resolves.toBeUndefined();
  });
});
