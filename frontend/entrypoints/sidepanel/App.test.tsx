import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.contact.email = "copy@example.com";
  profile.military.militaryStatus = "비식별 병역 상태";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("side panel App", () => {
  it("filters saved fields by category and field labels", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    fireEvent.change(screen.getByRole("searchbox", { name: "프로필 검색" }), {
      target: { value: "병역" },
    });

    expect(screen.queryByText("copy@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("병역 상태")).toBeInTheDocument();
  });

  it("copies a general value only after the user clicks copy", async () => {
    const copyText = vi.fn(async () => undefined);
    render(<App repository={createRepository()} copyText={copyText} />);
    await screen.findByText("copy@example.com");

    expect(copyText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이메일주소 복사" }));
    expect(copyText).toHaveBeenCalledWith("copy@example.com");
  });

  it("masks a sensitive value until its individual reveal action", async () => {
    const copyText = vi.fn(async () => undefined);
    render(<App repository={createRepository()} copyText={copyText} />);
    await screen.findByText("병역 상태");

    expect(screen.queryByText("비식별 병역 상태")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "병역 상태 복사" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "병역 상태 펼치기" }));
    expect(screen.getByText("비식별 병역 상태")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "병역 상태 복사" }));
    expect(copyText).toHaveBeenCalledWith("비식별 병역 상태");
  });

  it("enters the mock autofill flow only after an explicit action", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    expect(screen.queryByText("지원서 분석 중")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));
    expect(
      screen.getByRole("heading", { name: "지원서 분석 중" }),
    ).toBeInTheDocument();
  });

  it("distinguishes profile load failure from loading", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    render(<App repository={repository} copyText={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로필을 불러오지 못했습니다",
    );
    expect(
      screen.queryByText("프로필을 불러오는 중입니다."),
    ).not.toBeInTheDocument();
  });

  it("reports clipboard failure without exposing the copied value", async () => {
    const copyText = vi.fn(async () => {
      throw new Error("clipboard unavailable");
    });
    render(<App repository={createRepository()} copyText={copyText} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "이메일주소 복사" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "클립보드에 복사하지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("copy@example.com");
  });
});
