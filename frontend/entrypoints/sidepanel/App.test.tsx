import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "김";
  profile.personal.koreanGivenName = "지원";
  profile.contact.email = "copy@example.com";
  profile.contact.phoneNumber = "010-0000-0000";
  profile.education = [
    {
      id: "education-1",
      sectionId: "university",
      values: { schoolName: "비식별 대학교" },
    },
  ];
  profile.military.militaryStatus = "비식별 병역 상태";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("side panel App", () => {
  it("closes the side panel from the header action", async () => {
    const closePanel = vi.fn();
    render(
      <App
        repository={createRepository()}
        copyText={vi.fn()}
        closePanel={closePanel}
      />,
    );
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(closePanel).toHaveBeenCalledOnce();
  });

  it("opens profile management from the side panel header", async () => {
    const openOptions = vi.fn(async () => undefined);
    render(
      <App
        repository={createRepository()}
        copyText={vi.fn()}
        openOptions={openOptions}
      />,
    );
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(openOptions).toHaveBeenCalledOnce();
  });

  it("reports profile management navigation failure without exposing profile values", async () => {
    const openOptions = vi.fn(async () => {
      throw new Error("options unavailable");
    });
    render(
      <App
        repository={createRepository()}
        copyText={vi.fn()}
        openOptions={openOptions}
      />,
    );
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로필 관리 화면을 열지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("copy@example.com");
  });

  it("groups the profile into scannable summary sections", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "내 지원 정보" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 / 10 범주 등록")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "기본 인적사항 접기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "연락처와 주소 접기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "학력 1건 펼치기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "어학, 자격증, 프로젝트 0건 펼치기",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "민감정보 펼치기" }),
    ).toBeInTheDocument();
    expect(screen.getByText("••••••••, 값 가림")).toBeInTheDocument();

    expect(screen.getByText("김")).toBeInTheDocument();
    expect(screen.getByText("copy@example.com")).toBeInTheDocument();
    expect(screen.queryByText("비식별 대학교")).not.toBeInTheDocument();
    expect(screen.queryByText("병역 상태")).not.toBeInTheDocument();
  });

  it("expands a collapsed group without flattening its fields", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "학력 1건 펼치기" }));

    expect(screen.getByText("비식별 대학교")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "학력 1건 접기" }),
    ).toBeInTheDocument();
  });

  it("filters saved fields by category and field labels", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    fireEvent.change(screen.getByRole("searchbox", { name: "프로필 검색" }), {
      target: { value: "병역" },
    });

    expect(screen.queryByText("copy@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("병역 상태")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "민감정보 검색 결과" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "기본 인적사항 접기" }),
    ).not.toBeInTheDocument();
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
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "민감정보 펼치기" }));
    expect(screen.getByText("병역 상태")).toBeInTheDocument();

    expect(screen.queryByText("비식별 병역 상태")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "병역 상태 복사" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "병역 상태 펼치기" }));
    expect(screen.getByText("비식별 병역 상태")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "병역 상태 복사" }));
    expect(copyText).toHaveBeenCalledWith("비식별 병역 상태");
  });

  it("opens the mock autofill flow in a modal without replacing manual copy", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    expect(screen.queryByText("지원서 분석 중")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));

    const dialog = screen.getByRole("dialog", { name: "지원서 자동 기입" });
    expect(
      within(dialog).getByRole("heading", { name: "지원서 분석 중" }),
    ).toBeInTheDocument();
    expect(screen.getByText("copy@example.com")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "분석 결과 보기" }),
    );
    expect(
      within(dialog).getByRole("heading", { name: "입력 예정 항목 검토" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "자동 기입 모달 닫기" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "프로필 검색" }),
    ).toBeInTheDocument();
  });

  it("keeps modal navigation separate from the inert side panel and closes on Escape", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));

    expect(
      screen.getByRole("dialog", { name: "지원서 자동 기입" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: "프로필 검색" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "프로필 검색" }),
    ).toBeInTheDocument();
  });

  it("returns focus to the autofill trigger after the modal closes", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");
    const trigger = screen.getByRole("button", { name: "자동 기입" });

    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { name: "자동 기입 모달 닫기" }),
    ).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveFocus());
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
