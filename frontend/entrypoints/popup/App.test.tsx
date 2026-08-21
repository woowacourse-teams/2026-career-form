import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "화면에 보이면 안 되는 값";
  profile.contact.email = "hidden@example.com";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("popup App", () => {
  it("shows readiness without exposing profile values", async () => {
    render(
      <App
        repository={createRepository()}
        navigation={{ openOptions: vi.fn(), openSidePanel: vi.fn() }}
      />,
    );

    expect(
      await screen.findByText("10개 범주 중 2개 준비됨"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("화면에 보이면 안 되는 값"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("hidden@example.com")).not.toBeInTheDocument();
  });

  it("opens profile management and the side panel from explicit buttons", async () => {
    const navigation = {
      openOptions: vi.fn(async () => undefined),
      openSidePanel: vi.fn(async () => undefined),
    };
    render(<App repository={createRepository()} navigation={navigation} />);
    await screen.findByText("10개 범주 중 2개 준비됨");

    fireEvent.click(screen.getByRole("button", { name: "사이드 패널 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(navigation.openSidePanel).toHaveBeenCalledOnce();
    expect(navigation.openOptions).toHaveBeenCalledOnce();
  });

  it("does not present a load failure as an empty profile", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    render(
      <App
        repository={repository}
        navigation={{ openOptions: vi.fn(), openSidePanel: vi.fn() }}
      />,
    );

    expect(await screen.findByText("준비 상태 확인 실패")).toBeInTheDocument();
    expect(
      screen.queryByText("10개 범주 중 0개 준비됨"),
    ).not.toBeInTheDocument();
  });
});
