import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import {
  ProfileWriteConflictError,
  type ProfileRepository,
} from "../../src/profile/profile-repository";
import { App } from "./App";
import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";

function createRepository(): ProfileRepository {
  return {
    load: vi.fn(async () => createEmptyProfile()),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

function createJsonFile(contents: string): File {
  const file = new File([], "profile.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: vi.fn(async () => contents),
  });
  return file;
}

it("recovers from an initial read failure with an in-screen retry", async () => {
  const repository = createRepository();
  const resolveRetry =
    vi.fn<(profile: ReturnType<typeof createEmptyProfile>) => void>();
  const retry = new Promise<ReturnType<typeof createEmptyProfile>>(
    (resolve) => {
      resolveRetry.mockImplementation(resolve);
    },
  );
  vi.mocked(repository.load)
    .mockRejectedValueOnce(new Error("synthetic read failure"))
    .mockImplementationOnce(() => retry);
  await act(async () => {
    render(<App repository={repository} />);
  });
  const alert = screen.getByRole("alert");
  expect(within(alert).getByRole("heading")).toBeVisible();
  fireEvent.click(within(alert).getByRole("button", { name: "다시 불러오기" }));
  expect(screen.getByRole("status")).toBeVisible();
  await act(async () => {
    resolveRetry(createEmptyProfile());
  });
  expect(screen.getByRole("heading", { name: "프로필 관리" })).toBeVisible();
  expect(repository.load).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps the hidden file input out of tab order while the visible import button opens it", async () => {
  await act(async () => {
    render(<App repository={createRepository()} />);
  });
  const input = screen.getByLabelText("프로필 JSON 파일");
  expect(input).toHaveAttribute("tabindex", "-1");
  const openPicker = vi.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
  expect(openPicker).toHaveBeenCalledTimes(1);
});

describe("options App", () => {
  it("puts the category count, save state and transfer buttons in the title row", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => ({
      ...createEmptyProfile(),
      personal: { koreanFamilyName: "예시" },
      contact: { email: "example@example.test" },
    }));
    render(<App repository={repository} />);
    const heading = await screen.findByRole("heading", { name: "프로필 관리" });
    const titleRow = within(heading.closest("header") as HTMLElement);

    expect(titleRow.getByText(`2/${PROFILE_CATEGORIES.length}`)).toBeVisible();
    expect(titleRow.getByRole("status")).toHaveTextContent("자동 저장");
    expect(titleRow.getByRole("button", { name: "내보내기" })).toBeVisible();
    expect(titleRow.getByRole("button", { name: "가져오기" })).toBeVisible();
    expect(screen.getByText("이 브라우저에 저장 (암호화 안 됨)")).toBeVisible();
  });

  it("shows no explanatory sentences on the profile page", async () => {
    render(<App repository={createRepository()} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    for (const sentence of [
      /한 번 정리해 두면/,
      /필요한 정보만 입력하세요/,
      /자동 저장됩니다/,
      /나의 프로필/,
      /범주에 정보 입력/,
      /필요한 항목만 채워도 괜찮아요/,
      /지원서에 사용할 이름과 기본 정보를 정리해 주세요/,
      /내 정보는 암호화 없이 이 브라우저에 저장돼요/,
    ]) {
      expect(screen.queryByText(sentence)).toBeNull();
    }
  });

  it("shows sidebar rows and the section card as name and count without description", async () => {
    render(<App repository={createRepository()} />);
    await screen.findByRole("heading", { name: "프로필 관리" });
    const nav = within(screen.getByRole("navigation", { name: "프로필 범주" }));
    const health = nav.getByRole("button", { name: "건강" });
    const empty = within(health).getByText("미입력");

    expect(empty).toHaveAttribute("data-empty", "true");
    expect(empty.className).not.toMatch(/danger/i);
    const appCss = readFileSync("entrypoints/options/App.module.css", "utf8");
    const emptyRule = appCss.match(/\[data-empty="true"\][^{]*\{[^}]*\}/g);
    expect(emptyRule).not.toBeNull();
    expect(emptyRule!.join("")).toContain("var(--color-text-muted)");
    expect(emptyRule!.join("")).not.toMatch(/danger/);

    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "예시" },
    });
    const section = screen.getByRole("region", { name: "기본 인적사항" });
    expect(within(section).getByText("1개")).toBeVisible();
    expect(
      within(section).getByRole("button", { name: "다음: 연락처와 주소 →" }),
    ).toBeVisible();

    fireEvent.click(nav.getByRole("button", { name: "연락처와 주소" }));
    const contact = screen.getByRole("region", { name: "연락처와 주소" });
    expect(
      within(contact).getByRole("button", { name: "← 이전" }),
    ).toBeVisible();
  });

  it("places the developer mode row at the bottom of the sidebar", async () => {
    render(<App repository={createRepository()} />);
    await screen.findByRole("heading", { name: "프로필 관리" });
    const sidebar = screen
      .getByRole("navigation", { name: "프로필 범주" })
      .closest("aside") as HTMLElement;

    expect(
      within(sidebar).getByRole("switch", { name: "개발자 모드" }),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText("개발 빌드만")).toBeVisible();
  });

  it("shows every category and keeps data when switching views", async () => {
    const repository = createRepository();
    render(<App repository={repository} />);

    await screen.findByRole("heading", { name: "프로필 관리" });
    const navigation = within(
      screen.getByRole("navigation", { name: "프로필 범주" }),
    );
    for (const category of PROFILE_CATEGORIES) {
      expect(
        navigation.getByRole("button", { name: category.label }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "항목별 보기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "비식별 성" },
    });
    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));

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

    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "레이아웃 선택을 저장하지 못했습니다",
    );
    expect(screen.getByRole("button", { name: "전체 보기" })).toHaveAttribute(
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
    expect(personalSection).toHaveAttribute("open");
    personalSection.setAttribute("open", "");

    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "비식별 성" },
    });
    expect(personalSection).toHaveAttribute("open");
  });

  it("finds a category by its field label and preserves input across navigation", async () => {
    render(<App repository={createRepository()} />);
    await screen.findByRole("heading", { name: "프로필 관리" });
    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "예시" },
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "입력 항목 찾기" }),
      {
        target: { value: "비상연락처" },
      },
    );
    const nav = within(screen.getByRole("navigation", { name: "프로필 범주" }));
    expect(nav.queryByRole("button", { name: "학력" })).not.toBeInTheDocument();
    fireEvent.click(nav.getByRole("button", { name: "연락처와 주소" }));
    expect(screen.getByLabelText("비상연락처")).toBeInTheDocument();
    fireEvent.click(nav.getByRole("button", { name: "기본 인적사항" }));
    expect(screen.getByLabelText("국문 성")).toHaveValue("예시");
  });

  it("focuses a new record and preserves its values after collapsing and reopening", async () => {
    render(<App repository={createRepository()} />);
    await screen.findByRole("heading", { name: "프로필 관리" });
    fireEvent.click(screen.getByRole("button", { name: "프로젝트" }));
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 추가" }));
    await waitFor(() =>
      expect(screen.getByLabelText("활동 시작일")).toHaveFocus(),
    );
    fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
      target: { value: "예시 프로젝트" },
    });
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 1 접기" }));
    expect(
      screen.queryByRole("textbox", { name: "프로젝트 이름" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 1 펼치기" }));
    expect(screen.getByLabelText("프로젝트 이름")).toHaveValue("예시 프로젝트");
  });

  it("exports the current profile as a versioned JSON file", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => ({
      ...createEmptyProfile(),
      personal: { koreanGivenName: "예시" },
    }));
    const downloadProfile = vi.fn();
    render(<App repository={repository} downloadProfile={downloadProfile} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));

    expect(downloadProfile).toHaveBeenCalledWith(
      "career-form-profile-v1.json",
      expect.stringContaining('"schemaVersion": 1'),
    );
    expect(JSON.parse(vi.mocked(downloadProfile).mock.calls[0][1])).toEqual({
      schemaVersion: 1,
      profile: expect.objectContaining({
        personal: { koreanGivenName: "예시" },
      }),
    });
  });

  it("confirms and replaces the complete profile from an imported JSON file", async () => {
    const repository = createRepository();
    const importedProfile = {
      ...createEmptyProfile(),
      contact: { email: "example@example.test" },
    };
    const confirmImport = vi.fn(() => true);
    render(<App repository={repository} confirmImport={confirmImport} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    fireEvent.change(screen.getByLabelText("프로필 JSON 파일"), {
      target: {
        files: [
          createJsonFile(
            JSON.stringify({ schemaVersion: 1, profile: importedProfile }),
          ),
        ],
      },
    });

    await waitFor(() =>
      expect(repository.save).toHaveBeenLastCalledWith(importedProfile),
    );
    expect(confirmImport).toHaveBeenCalledWith(
      "현재 프로필 전체를 덮어씁니다. 계속할까요?",
    );
    expect(
      await screen.findByText("프로필을 가져왔습니다."),
    ).toBeInTheDocument();
  });

  it("keeps the current profile when an import file is invalid", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => ({
      ...createEmptyProfile(),
      personal: { koreanFamilyName: "기존 값" },
    }));
    const confirmImport = vi.fn(() => true);
    render(<App repository={repository} confirmImport={confirmImport} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    fireEvent.change(screen.getByLabelText("프로필 JSON 파일"), {
      target: { files: [createJsonFile("{")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "가져오기 파일을 읽을 수 없습니다.",
    );
    expect(confirmImport).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("국문 성")).toHaveValue("기존 값");
  });

  it("keeps the current profile when the user cancels an import", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => ({
      ...createEmptyProfile(),
      personal: { koreanFamilyName: "기존 값" },
    }));
    const confirmImport = vi.fn(() => false);
    render(<App repository={repository} confirmImport={confirmImport} />);
    await screen.findByRole("heading", { name: "프로필 관리" });

    fireEvent.change(screen.getByLabelText("프로필 JSON 파일"), {
      target: {
        files: [
          createJsonFile(
            JSON.stringify({
              schemaVersion: 1,
              profile: {
                ...createEmptyProfile(),
                personal: { koreanFamilyName: "가져온 값" },
              },
            }),
          ),
        ],
      },
    });

    await waitFor(() => expect(confirmImport).toHaveBeenCalled());
    expect(repository.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("국문 성")).toHaveValue("기존 값");
  });
});

it("keeps an unsaved draft when reload confirmation is cancelled and restores latest data after approval", async () => {
  const repository = createRepository();
  vi.mocked(repository.save).mockRejectedValueOnce(
    new ProfileWriteConflictError(),
  );
  const latest = createEmptyProfile();
  latest.personal.koreanFamilyName = "다른 화면 값";
  vi.mocked(repository.load)
    .mockResolvedValueOnce(createEmptyProfile())
    .mockResolvedValueOnce(latest);
  const confirmReload = vi.fn(() => false);
  render(<App repository={repository} confirmReload={confirmReload} />);
  await screen.findByRole("heading", { name: "프로필 관리" });
  fireEvent.change(screen.getByLabelText("국문 성"), {
    target: { value: "미저장 편집" },
  });
  const reload = await screen.findByRole("button", {
    name: "최신 프로필 다시 불러오기",
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "다른 화면에서 프로필이 변경",
  );
  fireEvent.click(reload);
  expect(confirmReload).toHaveBeenCalledWith(
    expect.stringContaining("저장되지 않은 편집"),
  );
  expect(screen.getByLabelText("국문 성")).toHaveValue("미저장 편집");
  expect(repository.load).toHaveBeenCalledTimes(1);
  confirmReload.mockReturnValue(true);
  fireEvent.click(reload);
  await waitFor(() =>
    expect(screen.getByLabelText("국문 성")).toHaveValue("다른 화면 값"),
  );
  fireEvent.change(screen.getByLabelText("국문 성"), {
    target: { value: "재편집" },
  });
  await waitFor(() =>
    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ personal: { koreanFamilyName: "재편집" } }),
    ),
  );
});
