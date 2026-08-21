import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

function createRepository(): ProfileRepository {
  return {
    load: vi.fn(async () => createEmptyProfile()),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("options App", () => {
  it("shows all ten categories in layout A and keeps data when switching to B", async () => {
    const repository = createRepository();
    render(<App repository={repository} />);

    await screen.findByRole("heading", { name: "프로필 관리" });
    expect(
      screen.getAllByRole("button", {
        name: /기본 인적사항|연락처와 주소|학력|어학|자격증·면허증|프로젝트|병역|보훈|장애|건강/,
      }),
    ).toHaveLength(10);
    expect(screen.getByRole("button", { name: "A형" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "비식별 성" },
    });
    fireEvent.click(screen.getByRole("button", { name: "B형" }));

    expect(repository.saveLayout).toHaveBeenCalledWith("b");
    expect(screen.getByLabelText("국문 성")).toHaveValue("비식별 성");
  });

  it("adds a repeated card and removes it only after confirmation", async () => {
    const repository = createRepository();
    const confirm = vi.fn(() => false);
    render(<App repository={repository} confirmDelete={confirm} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    fireEvent.click(screen.getByRole("button", { name: "프로젝트" }));
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 추가" }));
    expect(
      screen.getByRole("heading", { name: "프로젝트 1" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "프로젝트 1 삭제" }));
    expect(confirm).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "프로젝트 1" }),
    ).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 1 삭제" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "프로젝트 1" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("renders every field from the shared definition in layout B", async () => {
    const repository = createRepository();
    repository.loadLayout = vi.fn(async () => "b" as const);
    render(<App repository={repository} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    expect(screen.getByLabelText("국문 이름")).toBeInTheDocument();
    expect(screen.getByLabelText("이메일주소")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "고등학교 추가" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "공인외국어시험 추가" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "자격증·면허증 추가" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "프로젝트 추가" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("병역 상태")).toBeInTheDocument();
    expect(screen.getByLabelText("보훈 대상 여부")).toBeInTheDocument();
    expect(screen.getByLabelText("장애 여부")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "건강정보 추가" }),
    ).toBeInTheDocument();
  });

  it("reports a layout preference save failure without discarding the selected layout", async () => {
    const repository = createRepository();
    repository.saveLayout = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    render(<App repository={repository} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    fireEvent.click(screen.getByRole("button", { name: "B형" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "레이아웃 선택을 저장하지 못했습니다",
    );
    expect(screen.getByRole("button", { name: "B형" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("lets the user keep accordion categories open or closed while editing layout B", async () => {
    const repository = createRepository();
    repository.loadLayout = vi.fn(async () => "b" as const);
    render(<App repository={repository} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    const personalSection = screen.getByRole("group", {
      name: "기본 인적사항",
    });
    expect(personalSection).not.toHaveAttribute("open");
    personalSection.setAttribute("open", "");

    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "비식별 성" },
    });
    expect(personalSection).toHaveAttribute("open");
  });
});
