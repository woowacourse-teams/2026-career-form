import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PushStateView } from "../../src/job-postings/push-messages";
import { guidanceFor, PostingsEmptyGuidance } from "./PostingsGuidance";

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

describe("PostingsEmptyGuidance", () => {
  const renderNone = (roles: string[]) =>
    render(
      <PostingsEmptyGuidance
        guidance="none"
        state={state({ roles })}
        unread={0}
        busy={false}
        onEnable={() => {}}
        onOpenSettings={() => {}}
        onOpenPostings={() => {}}
      />,
    );
  it("받을 직무를 고르지 않았으면 모든 공고를 받는 중이라고 알린다", () => {
    renderNone([]);
    expect(
      screen.getByText(
        "받을 직무를 고르지 않아 모든 공고의 알림을 받고 있어요.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/받지 않아요/)).toBeNull();
  });
  it("직무를 골랐으면 그 안내를 보이지 않는다", () => {
    renderNone(["IT.BACKEND"]);
    expect(screen.queryByText(/모든 공고의 알림을 받고 있어요/)).toBeNull();
  });
});
