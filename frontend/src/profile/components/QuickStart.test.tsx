import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { QuickStart } from "./QuickStart";

async function next() {
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    ).toBeEnabled(),
  );
}

function memoryRepository(initial = createEmptyProfile()) {
  let stored = structuredClone(initial);
  let failing = false;
  const repository: ProfileRepository = {
    load: async () => structuredClone(stored),
    save: async (profile) => {
      if (failing) throw new Error("synthetic storage failure");
      stored = structuredClone(profile);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  return {
    repository,
    fail: (value: boolean) => {
      failing = value;
    },
  };
}
async function renderForm(initial?: Profile) {
  const memory = memoryRepository(initial);
  const track = vi.fn();
  const open = vi.fn();
  const view = render(
    <QuickStart
      repository={memory.repository}
      track={track}
      onOpenProfile={open}
    />,
  );
  await screen.findByLabelText("국문 성");
  return { ...memory, track, open, ...view };
}

describe("QuickStart", () => {
  it("starts with only optional name fields and allows leaving immediately", async () => {
    const { track } = await renderForm();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    for (const field of screen.getAllByRole("textbox"))
      expect(field).not.toBeRequired();
    expect(screen.queryByText(/13개 범주/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
    expect(screen.getByText(/저장한 정보가 없다면/)).toBeVisible();
    expect(track).toHaveBeenCalledWith("quick_profile_skipped", {
      surface: "extension_onboarding",
    });
    expect(track).not.toHaveBeenCalledWith(
      "profile_first_saved",
      expect.anything(),
    );
  });
  it("saves partial contact information preserving unrelated fields and entries", async () => {
    const initial = createEmptyProfile();
    initial.personal.nationality = "합성 국적";
    initial.education = [
      {
        id: "synthetic-school",
        sectionId: "university",
        values: { schoolName: "합성대학교" },
      },
    ];
    const { repository, track } = await renderForm(initial);
    await next();
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
    expect(await repository.load()).toEqual({
      ...initial,
      contact: { email: "learner@example.test" },
    });
    expect(track).toHaveBeenCalledWith("profile_first_saved", {
      surface: "extension_onboarding",
    });
  });
  it("retains failed input and retries before leaving registration", async () => {
    const { repository, fail, track } = await renderForm();
    fail(true);
    await next();
    await next();
    fireEvent.change(screen.getByLabelText("전화번호"), {
      target: { value: "01012345678" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("전화번호")).toHaveValue("01012345678");
    expect(
      screen.queryByRole("heading", {
        name: "지원서에서 자동 기입을 시작하세요",
      }),
    ).toBeNull();
    expect((await repository.load()).contact).toEqual({});
    expect(track).not.toHaveBeenCalledWith(
      "profile_first_saved",
      expect.anything(),
    );
    fail(false);
    fireEvent.click(screen.getByRole("button", { name: "다시 저장하기" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect((await repository.load()).contact.phoneNumber).toBe("01012345678");
    fireEvent.click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
  });
  it("autosaves and restores values on reopening", async () => {
    const { repository, unmount } = await renderForm();
    fireEvent.change(screen.getByLabelText("국문 성"), {
      target: { value: "김" },
    });
    fireEvent.change(screen.getByLabelText("국문 이름"), {
      target: { value: "테스트" },
    });
    await waitFor(async () =>
      expect((await repository.load()).personal.koreanGivenName).toBe("테스트"),
    );
    unmount();
    render(<QuickStart repository={repository} onOpenProfile={() => {}} />);
    expect(await screen.findByLabelText("국문 성")).toHaveValue("김");
    expect(screen.getByLabelText("국문 이름")).toHaveValue("테스트");
  });
  it("flushes pending changes before opening full editor and stays on save failure", async () => {
    const { repository, open, fail } = await renderForm();
    fail(true);
    await next();
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "전체 프로필 편집" }));
    await screen.findByRole("alert");
    expect(open).not.toHaveBeenCalled();
    fail(false);
    fireEvent.click(screen.getByRole("button", { name: "전체 프로필 편집" }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect((await repository.load()).contact.email).toBe(
      "learner@example.test",
    );
  });
  it("waits for storage and disables input during transition", async () => {
    const memory = memoryRepository();
    let finish: (() => void) | undefined;
    const original = memory.repository.save;
    memory.repository.save = async (profile) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      await original(profile);
    };
    render(
      <QuickStart repository={memory.repository} onOpenProfile={() => {}} />,
    );
    await screen.findByLabelText("국문 성");
    await next();
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByLabelText("이메일")).toBeDisabled();
    expect(
      screen.queryByRole("heading", {
        name: "지원서에서 자동 기입을 시작하세요",
      }),
    ).toBeNull();
    await act(async () => finish?.());
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
  });
  it("flushes the latest edit even if an older autosave reports success", async () => {
    const memory = memoryRepository();
    const save = memory.repository.save;
    let finishFirst: (() => void) | undefined;
    let first = true;
    memory.repository.save = async (profile) => {
      if (first) {
        first = false;
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      await save(profile);
    };
    render(
      <QuickStart repository={memory.repository} onOpenProfile={() => {}} />,
    );
    await screen.findByLabelText("국문 성");
    await next();
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "old@example.test" },
    });
    await waitFor(() => expect(finishFirst).toBeDefined());
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "latest@example.test" },
    });
    await act(async () => finishFirst?.());
    fireEvent.click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
    expect((await memory.repository.load()).contact.email).toBe(
      "latest@example.test",
    );
  });
  it("does not replace unreadable profile with an empty form", async () => {
    const { repository } = memoryRepository();
    repository.load = async () => {
      throw new Error("synthetic load failure");
    };
    render(<QuickStart repository={repository} onOpenProfile={() => {}} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

it("does not count a pending empty save as the newer nonempty profile's first save", async () => {
  const memory = memoryRepository();
  const save = memory.repository.save;
  const finishes: (() => void)[] = [];
  memory.repository.save = async (profile) => {
    await new Promise<void>((resolve) => finishes.push(resolve));
    await save(profile);
  };
  const events: string[] = [];
  render(
    <QuickStart
      repository={memory.repository}
      onOpenProfile={() => {}}
      track={(event) => events.push(event)}
    />,
  );
  fireEvent.change(await screen.findByLabelText("국문 성"), {
    target: { value: " " },
  });
  await waitFor(() => expect(finishes).toHaveLength(1));
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "새이름" },
  });
  await act(async () => finishes[0]());
  expect(events).not.toContain("profile_first_saved");
  await waitFor(() => expect(finishes).toHaveLength(2));
  expect(events).not.toContain("profile_first_saved");
  await act(async () => finishes[1]());
  expect((await memory.repository.load()).personal.koreanGivenName).toBe(
    "새이름",
  );
  expect(
    events.filter((event) => event === "profile_first_saved"),
  ).toHaveLength(1);
});
it.each([false, true])(
  "continues registration when analytics throws (hasInput=%s)",
  async (hasInput) => {
    const memory = memoryRepository();
    render(
      <QuickStart
        repository={memory.repository}
        onOpenProfile={() => {}}
        track={() => {
          throw new Error("tracking unavailable");
        }}
      />,
    );
    const email = await screen.findByLabelText("국문 성");
    if (hasInput)
      fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: hasInput ? "지금 자동 기입 사용하기" : "지금 자동 기입 사용하기",
      }),
    );
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("moves one question at a time, keeps previous answers and ignores composition Enter", async () => {
  await renderForm();
  const name = screen.getByLabelText("국문 이름");
  fireEvent.change(name, { target: { value: "테스트" } });
  fireEvent.keyDown(name, { key: "Enter", isComposing: true, keyCode: 229 });
  expect(screen.queryByLabelText("이메일")).toBeNull();
  fireEvent.keyDown(name, { key: "Enter" });
  await screen.findByLabelText("이메일");
  expect(screen.queryByLabelText("국문 이름")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(await screen.findByLabelText("국문 이름")).toHaveValue("테스트");
});

it("does not create empty repeated entries when skipping chapters", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "학력 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "대학교" }));
  await screen.findByRole("combobox", { name: "학교명" });
  for (let i = 0; i < 4; i++) {
    fireEvent.click(screen.getByRole("button", { name: "이 질문 건너뛰기" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
      ).toBeEnabled(),
    );
  }
  expect((await repository.load()).education).toEqual([]);
});

it("adds university details without replacing an existing school and preserves manual identity", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    {
      id: "old",
      sectionId: "highSchool",
      values: { schoolName: "기존고등학교" },
    },
  ];
  const { repository } = await renderForm(initial);
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "학력 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "대학교" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "학교명" }), {
    target: { value: "합성대학교" },
  });
  await next();
  fireEvent.change(screen.getByLabelText("전공"), {
    target: { value: "컴퓨터공학" },
  });
  await next();
  fireEvent.click(screen.getByRole("button", { name: "졸업" }));
  await next();
  fireEvent.change(screen.getByLabelText("입학일"), {
    target: { value: "2020-03-01" },
  });
  fireEvent.change(screen.getByLabelText("졸업일"), {
    target: { value: "2024-02-01" },
  });
  await next();
  const saved = await repository.load();
  expect(saved.education).toHaveLength(2);
  expect(saved.education[0]).toEqual(initial.education[0]);
  expect(saved.education[1]).toMatchObject({
    sectionId: "university",
    identity: { status: "manual", originalText: "합성대학교" },
    values: {
      schoolName: "합성대학교",
      majorName: "컴퓨터공학",
      completionStatus: "졸업",
      startDate: "2020-03-01",
      endDate: "2024-02-01",
    },
  });
});

it("saves a current career without asking an end date and keeps multiline Enter", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "직장경력" }));
  fireEvent.change(await screen.findByLabelText("직장명"), {
    target: { value: "합성회사" },
  });
  await next();
  fireEvent.click(screen.getByRole("button", { name: "정규" }));
  fireEvent.click(screen.getByRole("button", { name: "재직중" }));
  await next();
  expect(screen.queryByLabelText("퇴사일")).toBeNull();
  fireEvent.change(screen.getByLabelText("입사일"), {
    target: { value: "2025-01-01" },
  });
  await next();
  const details = screen.getByLabelText("담당업무");
  fireEvent.change(details, { target: { value: "테스트 업무" } });
  fireEvent.keyDown(details, { key: "Enter" });
  expect(details).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
  );
  await screen.findByRole("heading", {
    name: "지원서에서 자동 기입을 시작하세요",
  });
  expect((await repository.load()).careers[0]).toMatchObject({
    sectionId: "career",
    values: {
      companyName: "합성회사",
      employmentType: "정규",
      employmentStatus: "재직중",
      startDate: "2025-01-01",
      responsibilities: "테스트 업무",
    },
  });
});

it("previous stays on failed save and retries successfully", async () => {
  const { fail } = await renderForm();
  await next();
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "new@example.test" },
  });
  fail(true);
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("이메일")).toHaveValue("new@example.test");
  fail(false);
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByLabelText("국문 성");
});
it("restores the selected school when returning from the career chapter", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "학력 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "고등학교" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "학교명" }), {
    target: { value: "합성고등학교" },
  });
  await next();
  expect(screen.queryByLabelText("전공")).toBeNull();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "직장경력" }));
  fireEvent.change(await screen.findByLabelText("직장명"), {
    target: { value: "합성회사" },
  });
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByRole("button", { name: "프로젝트" });
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByText("합성고등학교");
  expect(screen.queryByText("합성회사")).toBeNull();
  expect((await repository.load()).careers[0].values.companyName).toBe(
    "합성회사",
  );
});
it("skipping all information does not claim a saved profile", async () => {
  await renderForm();
  await next();
  await next();
  await next();
  expect(screen.queryByText("✓ 여기까지 저장했어요")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "이 묶음 건너뛰기" }));
  await screen.findByText(/아직 입력한 정보가 없어요/);
  expect(screen.queryByText("✓ 여기까지 저장했어요")).toBeNull();
});
it("explicitly edits an existing project without replacing its id or extra values", async () => {
  const initial = createEmptyProfile();
  initial.projects = [
    {
      id: "existing-project",
      sectionId: "project",
      values: {
        projectName: "합성프로젝트",
        role: "설계",
        activityDetails: "원래 내용",
        custom: "보존",
      },
    },
  ];
  const { repository } = await renderForm(initial);
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  fireEvent.click(
    screen.getByRole("button", { name: "기존 항목 수정: 합성프로젝트" }),
  );
  expect(screen.getByLabelText("프로젝트 이름")).toHaveValue("합성프로젝트");
  await next();
  fireEvent.change(screen.getByLabelText("담당 역할"), {
    target: { value: "개발" },
  });
  await next();
  fireEvent.change(screen.getByLabelText("활동 시작일"), {
    target: { value: "2025-02-01" },
  });
  fireEvent.change(screen.getByLabelText("활동 종료일"), {
    target: { value: "2025-03-01" },
  });
  await next();
  fireEvent.change(screen.getByLabelText("활동 상세내역"), {
    target: { value: "수정한 내용" },
  });
  await next();
  expect((await repository.load()).projects).toEqual([
    {
      id: "existing-project",
      sectionId: "project",
      values: {
        projectName: "합성프로젝트",
        role: "개발",
        activityDetails: "수정한 내용",
        custom: "보존",
        startDate: "2025-02-01",
        endDate: "2025-03-01",
      },
    },
  ]);
});
it("clearing the only new school field removes the empty new row", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "학력 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "대학교" }));
  const school = await screen.findByRole("combobox", { name: "학교명" });
  fireEvent.change(school, { target: { value: "합성학교" } });
  fireEvent.change(school, { target: { value: "" } });
  fireEvent.click(
    screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
  );
  await screen.findByRole("heading", {
    name: "지원서에서 자동 기입을 시작하세요",
  });
  expect((await repository.load()).education).toEqual([]);
});
it("selects a catalog school with Enter without advancing and preserves identity", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "학력 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "대학교" }));
  const school = await screen.findByRole("combobox", { name: "학교명" });
  fireEvent.change(school, { target: { value: "서울대학교" } });
  fireEvent.keyDown(school, { key: "ArrowDown" });
  fireEvent.keyDown(school, { key: "Enter" });
  expect(school).toBeVisible();
  expect(screen.queryByLabelText("전공")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
  );
  await screen.findByRole("heading", {
    name: "지원서에서 자동 기입을 시작하세요",
  });
  expect((await repository.load()).education[0].identity).toMatchObject({
    status: "selected",
    displayName: "남서울대학교",
  });
});

it("flushes latest repeated input behind a pending initial save without duplicating the row", async () => {
  const memory = memoryRepository();
  const original = memory.repository.save;
  let finish: (() => void) | undefined;
  let first = true;
  memory.repository.save = async (profile) => {
    if (first) {
      first = false;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    }
    await original(profile);
  };
  render(
    <QuickStart repository={memory.repository} onOpenProfile={() => {}} />,
  );
  await screen.findByLabelText("국문 성");
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "학력 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "대학교" }));
  const school = await screen.findByRole("combobox", { name: "학교명" });
  fireEvent.change(school, { target: { value: "합" } });
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.change(school, { target: { value: "합성학교" } });
  fireEvent.click(
    screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
  );
  expect(school).toBeDisabled();
  expect(
    screen.queryByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    }),
  ).toBeNull();
  await act(async () => finish?.());
  await screen.findByRole("heading", {
    name: "지원서에서 자동 기입을 시작하세요",
  });
  const saved = await memory.repository.load();
  expect(saved.education).toHaveLength(1);
  expect(saved.education[0].values.schoolName).toBe("합성학교");
});
it("keeps composition submit on the question and preserves international phone input", async () => {
  await renderForm();
  const name = screen.getByLabelText("국문 이름");
  fireEvent.keyDown(name, { key: "Enter", isComposing: true, keyCode: 229 });
  fireEvent.submit(name.closest("form")!);
  expect(name).toBeVisible();
  await next();
  await next();
  const phone = screen.getByLabelText("전화번호");
  expect(phone).toHaveAttribute("autocomplete", "tel");
  expect(phone).toHaveAttribute("inputmode", "tel");
  fireEvent.change(phone, { target: { value: "01012345678" } });
  expect(screen.getByText("010-1234-5678")).toBeVisible();
  fireEvent.change(phone, { target: { value: "+44 20 1234 5678" } });
  expect(phone).toHaveValue("+44 20 1234 5678");
});

it("does not resurrect a cleared new project from navigation history", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  fireEvent.click(screen.getByRole("button", { name: "프로젝트" }));
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "지울 프로젝트" },
  });
  await next();
  await next();
  await next();
  await next();
  fireEvent.click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  fireEvent.click(
    screen.getByRole("button", { name: "기존 항목 수정: 지울 프로젝트" }),
  );
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByRole("button", { name: "직장경력" });
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByText(/아직 입력한 정보가 없어요/);
  expect(screen.queryByText("지울 프로젝트")).toBeNull();
  expect((await repository.load()).projects).toEqual([]);
});
