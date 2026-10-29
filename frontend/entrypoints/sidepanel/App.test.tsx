import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function schoolsRepository(): ProfileRepository {
  const repository = createRepository();
  const load = repository.load;
  repository.load = vi.fn(async () => {
    const profile = await load();
    profile.education = [
      {
        id: "education-0",
        sectionId: "highSchool",
        values: { schoolName: "비식별고등학교" },
      },
      ...profile.education,
    ];
    return profile;
  });
  return repository;
}

describe("side panel App", () => {
  it("keeps personal values read-only while retaining copy and profile management", async () => {
    const repository = createRepository();
    const copyText = vi.fn(async () => undefined);
    render(<App repository={repository} copyText={copyText} />);
    const value = await screen.findByText("지원");
    expect(value.closest("button")).toBeNull();
    fireEvent.click(value);
    expect(screen.queryByRole("form")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^(수정|저장|취소)$/ }),
    ).toBeNull();
    expect(screen.queryByText("값을 누르면 바로 수정할 수 있어요.")).toBeNull();
    expect(screen.getByRole("button", { name: "프로필 관리" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "국문 이름 복사" }));
    expect(copyText).toHaveBeenCalledWith("지원");
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("renders in-page mode without viewport-height panel sizing", async () => {
    render(
      <App
        inPage
        logoUrl="chrome-extension://test-extension/side-panel-launcher-logo.png"
        repository={createRepository()}
        openOptions={vi.fn()}
        openAutofill={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("지원 정보 목록")).toHaveAttribute(
      "data-panel-mode",
      "in-page",
    );
    expect(screen.getByRole("img", { name: "커리어폼" })).toHaveAttribute(
      "src",
      "chrome-extension://test-extension/side-panel-launcher-logo.png",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

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
    expect(screen.queryByText(/개 범주 등록/)).not.toBeInTheDocument();
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
      screen.getByRole("button", { name: "병역, 보훈, 장애와 건강 펼치기" }),
    ).toBeInTheDocument();

    expect(screen.getByText("김")).toBeInTheDocument();
    expect(screen.getByText("copy@example.com")).toBeInTheDocument();
    expect(screen.queryByText("비식별 대학교")).not.toBeInTheDocument();
    expect(screen.queryByText("병역 상태")).not.toBeInTheDocument();
  });

  it("expands a collapsed group without flattening its fields", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "학력 1건 펼치기" }));

    expect(screen.getByRole("group", { name: "대학교 1" })).toHaveTextContent(
      "비식별 대학교",
    );
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
      screen.getByRole("button", {
        name: "병역, 보훈, 장애와 건강 검색 결과",
      }),
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

  it("shows a saved military value directly and copies only on request", async () => {
    const copyText = vi.fn(async () => undefined);
    render(<App repository={createRepository()} copyText={copyText} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(
      screen.getByRole("button", { name: "병역, 보훈, 장애와 건강 펼치기" }),
    );
    expect(screen.getByText("병역 상태")).toBeInTheDocument();
    expect(screen.getByText("비식별 병역 상태")).toBeInTheDocument();
    expect(copyText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "병역 상태 복사" }));
    expect(copyText).toHaveBeenCalledWith("비식별 병역 상태");
  });

  it("shows the autofill action without an experimental environment gate", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    expect(
      screen.queryByText("직접 복사하거나 자동 기입을 시작하세요"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "자동 기입" }),
    ).toBeInTheDocument();
  });

  it("asks the active webpage to open autofill without adding a side panel dialog", async () => {
    const openAutofill = vi.fn(async () => undefined);
    render(
      <App
        repository={createRepository()}
        copyText={vi.fn()}
        openAutofill={openAutofill}
      />,
    );
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));

    expect(openAutofill).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("dialog", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("copy@example.com")).toBeInTheDocument();
  });

  it("keeps the autofill action outside the scrollable profile list", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    const profileList = screen.getByRole("main", {
      name: "지원 정보 목록",
    });
    const autofillButton = screen.getByRole("button", { name: "자동 기입" });

    expect(profileList).not.toContainElement(autofillButton);
    expect(autofillButton.closest("header")).not.toBeNull();
  });

  it("reports when the current webpage cannot open the autofill overlay", async () => {
    const openAutofill = vi.fn(async () => {
      throw new Error("content script unavailable");
    });
    render(
      <App
        repository={createRepository()}
        copyText={vi.fn()}
        openAutofill={openAutofill}
      />,
    );
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "현재 페이지에 자동 기입 화면을 열지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("copy@example.com");
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

  it("선택형 코드값을 라벨로 보여 주고 라벨로 복사한다", async () => {
    const repository = createRepository();
    const profile = await repository.load();
    profile.education[0].values = {
      ...profile.education[0].values,
      attendanceType: "attendance:day",
      schoolRegion: "region:seoul",
    };
    profile.military.militaryStatus = "military-status:served";
    const copyText = vi.fn(async () => undefined);
    render(<App repository={repository} copyText={copyText} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "학력 1건 펼치기" }));
    expect(screen.getByText("주간")).toBeInTheDocument();
    expect(screen.getByText("서울")).toBeInTheDocument();
    expect(screen.queryByText(/attendance:|region:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /주·야간 복사$/ }));
    expect(copyText).toHaveBeenLastCalledWith("주간");

    fireEvent.click(
      screen.getByRole("button", { name: "병역, 보훈, 장애와 건강 펼치기" }),
    );
    expect(screen.getByText("군필")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "병역 상태 복사" }));
    expect(copyText).toHaveBeenLastCalledWith("군필");
    expect(repository.save).not.toHaveBeenCalled();
    expect(profile.military.militaryStatus).toBe("military-status:served");
  });

  it("고등학교와 대학교를 항목별 소제목으로 나눠 보여 준다", async () => {
    const copyText = vi.fn(async () => undefined);
    render(<App repository={schoolsRepository()} copyText={copyText} />);
    await screen.findByText("copy@example.com");

    fireEvent.click(screen.getByRole("button", { name: "학력 2건 펼치기" }));

    const highSchool = screen.getByRole("group", { name: "고등학교 1" });
    const university = screen.getByRole("group", { name: "대학교 2" });
    expect(highSchool).toHaveTextContent("비식별고등학교");
    expect(highSchool).not.toHaveTextContent("비식별 대학교");
    expect(university).toHaveTextContent("비식별 대학교");
    expect(university).not.toHaveTextContent("비식별고등학교");
    fireEvent.click(
      within(highSchool).getByRole("button", {
        name: "고등학교 1 학교명 복사",
      }),
    );
    expect(copyText).toHaveBeenLastCalledWith("비식별고등학교");
    fireEvent.click(
      within(university).getByRole("button", { name: "대학교 2 학교명 복사" }),
    );
    expect(copyText).toHaveBeenLastCalledWith("비식별 대학교");
  });

  it("검색 결과에서도 학교별 구분을 유지한다", async () => {
    render(<App repository={schoolsRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    fireEvent.change(screen.getByRole("searchbox", { name: "프로필 검색" }), {
      target: { value: "학교명" },
    });

    for (const name of ["고등학교 1", "대학교 2"]) {
      const group = screen.getByRole("group", { name });
      expect(within(group).getAllByRole("article")).toHaveLength(1);
    }
  });

  it("반복 항목이 아닌 값은 소제목 없이 기존 버튼 이름을 유지한다", async () => {
    render(<App repository={schoolsRepository()} copyText={vi.fn()} />);
    await screen.findByText("copy@example.com");

    const copy = screen.getByRole("button", { name: "이메일주소 복사" });
    expect(copy.closest('[role="group"]')).toBeNull();
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

it("공고 관리 진입을 하나로 합치고 자동 기입 앞에 배치한다", async () => {
  const openPostings = vi.fn(async () => undefined);
  render(<App repository={createRepository()} openPostings={openPostings} />);
  const manage = await screen.findByRole("button", { name: "지원 공고 관리" });
  expect(
    screen.queryByRole("button", { name: "공고 저장" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "저장한 공고 보기" }),
  ).not.toBeInTheDocument();
  const autofill = screen.getByRole("button", { name: "자동 기입" });
  expect(
    manage.compareDocumentPosition(autofill) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(manage);
  expect(openPostings).toHaveBeenCalledWith(false);
});

it("지원 공고 관리 버튼에 미확인 공고 개수를 보여 주고 저장소 변경에 따라 갱신한다", async () => {
  let notify: ((count: number) => void) | undefined;
  render(
    <App
      repository={createRepository()}
      unreadPostings={{
        count: async () => 3,
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
      }}
    />,
  );
  const manage = await screen.findByRole("button", { name: /지원 공고 관리/ });
  await waitFor(() =>
    expect(manage).toHaveAccessibleName("지원 공고 관리 새 공고 3건"),
  );
  act(() => notify?.(0));
  await waitFor(() => expect(manage).toHaveAccessibleName("지원 공고 관리"));
});
