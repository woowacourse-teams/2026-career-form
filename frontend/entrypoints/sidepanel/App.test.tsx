import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
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

/** One saved value in each profile category, built from the category definitions. */
function everyCategoryRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  for (const category of PROFILE_CATEGORIES) {
    const section = category.sections[0];
    const field = section.fields.find(
      (candidate) => !["select", "date"].includes(candidate.inputType),
    );
    if (!field) throw new Error(`No text field in ${category.id}`);
    const values = { [field.id]: `비식별 ${category.id}` };
    const categoryValues = profile[category.id];
    if (Array.isArray(categoryValues)) {
      categoryValues.push({
        id: `${category.id}-1`,
        sectionId: section.id,
        values,
      });
    } else {
      Object.assign(categoryValues, values);
    }
  }
  return { ...createRepository(), load: vi.fn(async () => profile) };
}

const selectTab = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("tab", { name }));
const openSettings = () =>
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
async function showProfile() {
  selectTab("내 정보");
  await screen.findByText("copy@example.com");
}

function nextMutation(node: Node) {
  return new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      observer.disconnect();
      resolve();
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error("the copy status was not updated"));
    }, 2000);
    observer.observe(node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

describe("side panel App", () => {
  it("keeps personal values read-only while retaining copy and profile management", async () => {
    const repository = createRepository();
    const copyText = vi.fn(async () => undefined);
    render(<App repository={repository} copyText={copyText} />);
    selectTab("내 정보");
    const value = await screen.findByText("지원");
    expect(value.closest("button")).toBeNull();
    fireEvent.click(value);
    expect(screen.queryByRole("form")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^(수정|저장|취소)$/ }),
    ).toBeNull();
    expect(screen.queryByText("값을 누르면 바로 수정할 수 있어요.")).toBeNull();
    openSettings();
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

    selectTab("내 정보");
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
    await showProfile();

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
    await showProfile();

    openSettings();
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
    await showProfile();

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로필 관리 화면을 열지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("copy@example.com");
  });

  it("groups the profile into scannable summary sections", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);

    await showProfile();
    expect(
      screen.queryByRole("heading", { name: "내 지원 정보" }),
    ).not.toBeInTheDocument();
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
    await showProfile();

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
    await showProfile();

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
    await showProfile();

    expect(copyText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이메일주소 복사" }));
    expect(copyText).toHaveBeenCalledWith("copy@example.com");
  });

  it("shows a saved military value directly and copies only on request", async () => {
    const copyText = vi.fn(async () => undefined);
    render(<App repository={createRepository()} copyText={copyText} />);
    await showProfile();

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
    await showProfile();

    expect(
      screen.queryByText("직접 복사하거나 자동 기입을 시작하세요"),
    ).not.toBeInTheDocument();
    selectTab("자동 기입");
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
    await showProfile();

    selectTab("자동 기입");
    fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));

    expect(openAutofill).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("dialog", { name: "지원서 자동 기입" }),
    ).not.toBeInTheDocument();
    selectTab("내 정보");
    expect(screen.getByText("copy@example.com")).toBeInTheDocument();
  });

  it("keeps the autofill action outside the scrollable profile list", async () => {
    render(<App repository={createRepository()} copyText={vi.fn()} />);
    await showProfile();

    const profileList = screen.getByRole("main", {
      name: "지원 정보 목록",
    });
    expect(
      within(profileList).queryByRole("button", { name: "자동 기입" }),
    ).toBeNull();

    selectTab("자동 기입");
    const autofillButton = screen.getByRole("button", { name: "자동 기입" });
    expect(autofillButton.closest("main")).toBeNull();
    expect(screen.getByRole("tabpanel")).toContainElement(autofillButton);
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
    await showProfile();

    selectTab("자동 기입");
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
    selectTab("내 정보");

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
    await showProfile();

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
    await showProfile();

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
    await showProfile();

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
    await showProfile();

    const copy = screen.getByRole("button", { name: "이메일주소 복사" });
    expect(copy.closest('[role="group"]')).toBeNull();
  });

  it("reports clipboard failure without exposing the copied value", async () => {
    const copyText = vi.fn(async () => {
      throw new Error("clipboard unavailable");
    });
    render(<App repository={createRepository()} copyText={copyText} />);
    await showProfile();

    fireEvent.click(screen.getByRole("button", { name: "이메일주소 복사" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "클립보드에 복사하지 못했습니다",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("copy@example.com");
  });
});

it("공고 관리 진입을 마감 공고 탭 하단에 하나로 둔다", async () => {
  const openPostings = vi.fn(async () => undefined);
  render(<App repository={createRepository()} openPostings={openPostings} />);
  selectTab(/마감 공고/);
  const manage = await screen.findByRole("button", { name: "공고 관리" });
  expect(
    screen.queryByRole("button", { name: "공고 저장" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "저장한 공고 보기" }),
  ).not.toBeInTheDocument();
  fireEvent.click(manage);
  expect(openPostings).toHaveBeenCalledWith(false);
});

it("공고 관리 버튼에 미확인 공고 개수를 보여 주고 저장소 변경에 따라 갱신한다", async () => {
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
  selectTab(/마감 공고/);
  const manage = await screen.findByRole("button", { name: /공고 관리/ });
  await waitFor(() =>
    expect(manage).toHaveAccessibleName("공고 관리 새 공고 3건"),
  );
  act(() => notify?.(0));
  await waitFor(() => expect(manage).toHaveAccessibleName("공고 관리"));
});

it("shows every profile category exactly once across the panel groups", async () => {
  render(<App repository={everyCategoryRepository()} copyText={vi.fn()} />);
  selectTab("내 정보");
  await screen.findByText("비식별 personal");

  const list = screen.getByRole("main", { name: "지원 정보 목록" });
  for (const toggle of within(list).getAllByRole("button", {
    expanded: false,
  })) {
    fireEvent.click(toggle);
  }

  const rows = screen.getAllByRole("article");
  expect(rows).toHaveLength(PROFILE_CATEGORIES.length);
  for (const category of PROFILE_CATEGORIES) {
    expect(
      rows.filter((row) => within(row).queryByText(`비식별 ${category.id}`)),
    ).toHaveLength(1);
  }
});

it("searches the careers, publications and compensation categories by label, not by value", async () => {
  const repository = createRepository();
  const profile = await repository.load();
  profile.careers = [
    {
      id: "career-1",
      sectionId: "career",
      values: { companyName: "비식별 회사" },
    },
  ];
  profile.publications = [
    {
      id: "pub-1",
      sectionId: "publicationPatent",
      values: { title: "비식별 논문" },
    },
  ];
  profile.compensation.desiredPosition = "비식별 직위";
  const copyText = vi.fn(async () => undefined);
  render(<App repository={repository} copyText={copyText} />);
  await showProfile();
  const search = screen.getByRole("searchbox", { name: "프로필 검색" });

  fireEvent.change(search, { target: { value: "직장명" } });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "직장경력 1 직장명 복사" }),
    );
  });
  expect(copyText).toHaveBeenLastCalledWith("비식별 회사");

  fireEvent.change(search, { target: { value: "제목" } });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "논문·특허 1 제목 복사" }),
    );
  });
  expect(copyText).toHaveBeenLastCalledWith("비식별 논문");

  fireEvent.change(search, { target: { value: "희망직위" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "희망직위 복사" }));
  });
  expect(copyText).toHaveBeenLastCalledWith("비식별 직위");

  fireEvent.change(search, { target: { value: "비식별 회사" } });
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});

it("announces each successful copy politely without the copied value", async () => {
  const copyText = vi.fn(async () => undefined);
  render(<App repository={createRepository()} copyText={copyText} />);
  await showProfile();
  const status = screen.getByRole("status", { name: "복사 상태" });
  const copy = screen.getByRole("button", { name: "이메일주소 복사" });
  expect(status).toBeEmptyDOMElement();

  copy.focus();
  const first = nextMutation(status);
  await act(async () => {
    fireEvent.click(copy);
  });
  await first;
  expect(status).not.toBeEmptyDOMElement();
  expect(status).not.toHaveTextContent("copy@example.com");
  expect(copy).toHaveFocus();
  expect(copy).toHaveAccessibleName("이메일주소 복사");

  const second = nextMutation(status);
  await act(async () => {
    fireEvent.click(copy);
  });
  await second;
  expect(copyText).toHaveBeenCalledTimes(2);
});

it("does not announce a failed copy as a success or duplicate its alert", async () => {
  const copyText = vi.fn(async () => {
    throw new Error("clipboard unavailable");
  });
  render(<App repository={createRepository()} copyText={copyText} />);
  await showProfile();
  const status = screen.getByRole("status", { name: "복사 상태" });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "이메일주소 복사" }));
  });

  await screen.findByRole("alert");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(status).toBeEmptyDOMElement();
});

it("shows scalar compensation without claiming zero records", async () => {
  const repository = createRepository();
  const profile = await repository.load();
  profile.compensation.desiredPosition = "비식별 직위";
  render(<App repository={repository} copyText={vi.fn()} />);
  await showProfile();

  const group = screen.getByRole("button", {
    name: /직장경력, 논문·특허, 처우/,
  });
  expect(group).not.toHaveAccessibleName(/0건/);
  fireEvent.click(group);
  expect(screen.getByRole("button", { name: "희망직위 복사" })).toBeVisible();
});
