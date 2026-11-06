import { describe, expect, it } from "vitest";
import type { PushStateView } from "../../src/job-postings/push-messages";
import { guidanceFor } from "./PostingsGuidance";

const state = (patch: Partial<PushStateView> = {}): PushStateView => ({
  enabled: true,
  supported: true,
  status: { code: "registered", attempts: 0, updatedAt: 0 },
  permission: "granted",
  visibility: { result: "unknown" },
  unread: 0,
  roles: [],
  ...patch,
});

describe("guidanceFor", () => {
  it("상태를 모르면 안내하지 않는다", () => {
    expect(guidanceFor(undefined)).toBeUndefined();
  });
  it("받을 직무를 고르지 않아도 등록됐으면 직무 안내 없이 저장한 공고 없음으로 본다", () => {
    expect(guidanceFor(state())).toBe("none");
    expect(guidanceFor(state({ roles: ["IT.BACKEND"] }))).toBe("none");
  });
  it("알림이 꺼졌거나 등록에 실패했으면 그 원인을 안내한다", () => {
    expect(guidanceFor(state({ enabled: false }))).toBe("off");
    expect(
      guidanceFor(
        state({ status: { code: "failed", attempts: 3, updatedAt: 0 } }),
      ),
    ).toBe("failed");
  });
});
