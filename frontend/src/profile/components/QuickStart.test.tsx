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
import {
  parseProfileImport,
  serializeProfileExport,
} from "../profile-transfer";
import { QuickStart } from "./QuickStart";

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

async function next() {
  await click(
    screen.getByRole("button", { name: /^(다음|확인하고 돌아가기)$/ }),
  );
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
  await screen.findByRole("heading", {
    level: 1,
    name: /이름|저장한 정보부터/,
  });
  return { ...memory, track, open, ...view };
}

describe("QuickStart", () => {
  it("accepts typed date digits and blocks leaving with an incomplete or impossible date", async () => {
    const { repository } = await renderForm();
    await next();
    await next();
    await next();
    await click(screen.getByRole("button", { name: "학력 추가하기" }));
    await click(screen.getByRole("button", { name: "대학교" }));
    await next();
    await next();
    await next();
    await click(screen.getByRole("button", { name: "입학·졸업일 추가" }));
    const start = screen.getByLabelText("입학일");
    fireEvent.change(start, { target: { value: "20240229" } });
    expect(start).toHaveValue("2024-02-29");
    fireEvent.keyDown(start, { key: "Enter" });
    const end = screen.getByLabelText("졸업일");
    expect(end).toHaveFocus();
    fireEvent.change(end, { target: { value: "20230229" } });
    await click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    expect(end).toHaveFocus();
    expect(screen.getByRole("alert")).toBeVisible();
    await waitFor(async () =>
      expect((await repository.load()).education[0]?.values.startDate).toBe(
        "2024-02-29",
      ),
    );
    expect(
      (await repository.load()).education[0].values.endDate,
    ).toBeUndefined();
    fireEvent.change(end, { target: { value: "2024" } });
    await next();
    expect(end).toHaveValue("2024");
    fireEvent.change(end, { target: { value: "20250302" } });
    await next();
    expect((await repository.load()).education[0].values).toMatchObject({
      startDate: "2024-02-29",
      endDate: "2025-03-02",
    });
  });
  it("can skip an incomplete date without replacing a previously saved date", async () => {
    const initial = createEmptyProfile();
    initial.education = [
      {
        id: "school-date",
        sectionId: "university",
        values: { schoolName: "합성대학교", startDate: "2020-03-02" },
      },
    ];
    const { repository } = await renderForm(initial);
    await click(screen.getByRole("button", { name: "학력 추가하기" }));
    await click(
      screen.getByRole("button", { name: "기존 항목 수정: 합성대학교" }),
    );
    await click(screen.getByRole("button", { name: "입학·졸업일 추가" }));
    fireEvent.change(screen.getByLabelText("입학일"), {
      target: { value: "2024" },
    });
    await click(screen.getByRole("button", { name: "이 질문 건너뛰기" }));
    await screen.findByRole("heading", { name: "학력도 준비됐어요" });
    expect((await repository.load()).education[0].values.startDate).toBe(
      "2020-03-02",
    );
  });
  it("moves Enter through both name fields before leaving the question", async () => {
    await renderForm();
    fireEvent.keyDown(screen.getByLabelText("국문 성"), { key: "Enter" });
    expect(screen.getByLabelText("국문 이름")).toHaveFocus();
    expect(screen.queryByLabelText("이메일")).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("국문 이름"), { key: "Enter" });
    await waitFor(() => expect(screen.getByLabelText("이메일")).toHaveFocus());
  });
  it("completes only a chosen email domain and saves it without advancing", async () => {
    const { repository } = await renderForm();
    await next();
    const email = screen.getByLabelText("이메일");
    fireEvent.change(email, { target: { value: "learner@g" } });
    expect(
      screen.queryByRole("button", { name: "learner@naver.com" }),
    ).toBeNull();
    expect(email).toHaveValue("learner@g");
    await click(screen.getByRole("button", { name: "learner@gmail.com" }));
    expect(email).toHaveValue("learner@gmail.com");
    expect(email).toHaveFocus();
    expect(screen.queryByLabelText("전화번호")).toBeNull();
    await next();
    expect((await repository.load()).contact.email).toBe("learner@gmail.com");
  });
  it.each(["", "@g", "a@@g", "a b@g", "learner@company.test"])(
    "preserves manually entered email %s without offering unrelated domains",
    async (value) => {
      const { repository } = await renderForm();
      await next();
      fireEvent.change(screen.getByLabelText("이메일"), { target: { value } });
      expect(
        screen.queryByRole("group", { name: "이메일 빠른 완성" }),
      ).toBeNull();
      await next();
      expect((await repository.load()).contact.email ?? "").toBe(value);
    },
  );
  it("puts the autofill exit before optional chapters and stays on save failure", async () => {
    const { fail } = await renderForm();
    fireEvent.change(screen.getByLabelText("국문 이름"), {
      target: { value: "시연" },
    });
    await next();
    await next();
    await next();
    const exit = screen.getByRole("button", {
      name: "지금 자동 기입 사용하기",
    });
    const education = screen.getByRole("button", { name: "학력 추가하기" });
    expect(
      exit.compareDocumentPosition(education) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fail(true);
    await click(exit);
    await screen.findByRole("alert");
    expect(education).toBeVisible();
    fail(false);
    await click(exit);
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
  });
  it("focuses each new question without stealing focus while editing", async () => {
    await renderForm();
    expect(screen.getByLabelText("국문 성")).toHaveFocus();
    screen.getByLabelText("국문 이름").focus();
    fireEvent.change(screen.getByLabelText("국문 이름"), {
      target: { value: "시연" },
    });
    expect(screen.getByLabelText("국문 이름")).toHaveFocus();
    await next();
    await waitFor(() => expect(screen.getByLabelText("이메일")).toHaveFocus());
    await next();
    await waitFor(() =>
      expect(screen.getByLabelText("전화번호")).toHaveFocus(),
    );
    await click(screen.getByRole("button", { name: "이전" }));
    await waitFor(() => expect(screen.getByLabelText("이메일")).toHaveFocus());
    await next();
    await next();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    await click(screen.getByRole("button", { name: "학력 추가하기" }));
    expect(screen.getByRole("button", { name: "고등학교" })).toHaveFocus();
    await click(screen.getByRole("button", { name: "대학교" }));
    expect(screen.getByRole("combobox")).toHaveFocus();
    await click(
      screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "지원서에서 자동 기입을 시작하세요",
        }),
      ).toHaveFocus(),
    );
  });
  it("starts with only optional name fields and allows leaving immediately", async () => {
    const { track } = await renderForm();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    for (const field of screen.getAllByRole("textbox"))
      expect(field).not.toBeRequired();
    expect(screen.queryByText(/13개 범주/)).toBeNull();
    await click(
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
    await click(screen.getByRole("button", { name: "이메일 수정" }));
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    await click(
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
    await click(
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
    await click(screen.getByRole("button", { name: "다시 저장하기" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect((await repository.load()).contact.phoneNumber).toBe("01012345678");
    await click(
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
    await screen.findByRole("heading", {
      name: "저장한 정보부터 이어서 준비해요",
    });
    await click(screen.getByRole("button", { name: "이름 수정" }));
    expect(screen.getByLabelText("국문 성")).toHaveValue("김");
    expect(screen.getByLabelText("국문 이름")).toHaveValue("테스트");
  });
  it("flushes pending changes before opening full editor and stays on save failure", async () => {
    const { repository, open, fail } = await renderForm();
    fail(true);
    await next();
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    await click(screen.getByRole("button", { name: "전체 프로필 편집" }));
    await screen.findByRole("alert");
    expect(open).not.toHaveBeenCalled();
    fail(false);
    await click(screen.getByRole("button", { name: "전체 프로필 편집" }));
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
    await click(
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
    await click(
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
    await click(
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
  await click(screen.getByRole("button", { name: "이전" }));
  expect(await screen.findByLabelText("국문 이름")).toHaveValue("테스트");
});

it("does not create empty repeated entries when skipping chapters", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  await screen.findByRole("combobox", { name: "학교명" });
  for (let i = 0; i < 3; i++) {
    await click(screen.getByRole("button", { name: "이 질문 건너뛰기" }));
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
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "학교명" }), {
    target: { value: "합성대학교" },
  });
  await next();
  fireEvent.change(screen.getByLabelText("전공"), {
    target: { value: "컴퓨터공학" },
  });
  await next();
  await click(screen.getByRole("button", { name: "졸업" }));
  await next();
  await click(screen.getByRole("button", { name: "입학·졸업일 추가" }));
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
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(screen.getByRole("button", { name: "직장경력" }));
  fireEvent.change(await screen.findByLabelText("직장명"), {
    target: { value: "합성회사" },
  });
  await next();
  await click(screen.getByRole("button", { name: "정규" }));
  await click(screen.getByRole("button", { name: "재직중" }));
  await next();
  await click(screen.getByRole("button", { name: "기간 추가" }));
  expect(screen.queryByLabelText("퇴사일")).toBeNull();
  fireEvent.change(screen.getByLabelText("입사일"), {
    target: { value: "2025-01-01" },
  });
  await next();
  await click(screen.getByRole("button", { name: "활동 내용 추가" }));
  const details = screen.getByLabelText("담당업무");
  fireEvent.change(details, { target: { value: "테스트 업무" } });
  fireEvent.keyDown(details, { key: "Enter" });
  expect(details).toBeVisible();
  await click(screen.getByRole("button", { name: "지금 자동 기입 사용하기" }));
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
  await click(screen.getByRole("button", { name: "이전" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("이메일")).toHaveValue("new@example.test");
  fail(false);
  await click(screen.getByRole("button", { name: "이전" }));
  await screen.findByLabelText("국문 성");
});
it("restores the selected school when returning from the career chapter", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "고등학교" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "학교명" }), {
    target: { value: "합성고등학교" },
  });
  await next();
  expect(screen.queryByLabelText("전공")).toBeNull();
  await next();
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(screen.getByRole("button", { name: "직장경력" }));
  fireEvent.change(await screen.findByLabelText("직장명"), {
    target: { value: "합성회사" },
  });
  await click(screen.getByRole("button", { name: "이전" }));
  await screen.findByRole("button", { name: "프로젝트" });
  await click(screen.getByRole("button", { name: "이전" }));
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
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(screen.getByRole("button", { name: "이 묶음 건너뛰기" }));
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
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(
    screen.getByRole("button", { name: "기존 항목 수정: 합성프로젝트" }),
  );
  await click(screen.getByRole("button", { name: "담당 역할 수정" }));
  fireEvent.change(screen.getByLabelText("담당 역할"), {
    target: { value: "개발" },
  });
  await next();
  await click(screen.getByRole("button", { name: "기간 추가" }));
  fireEvent.change(screen.getByLabelText("활동 시작일"), {
    target: { value: "2025-02-01" },
  });
  fireEvent.change(screen.getByLabelText("활동 종료일"), {
    target: { value: "2025-03-01" },
  });
  await next();
  await click(screen.getByRole("button", { name: "활동 내용 추가" }));
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
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  const school = await screen.findByRole("combobox", { name: "학교명" });
  fireEvent.change(school, { target: { value: "합성학교" } });
  fireEvent.change(school, { target: { value: "" } });
  await click(screen.getByRole("button", { name: "지금 자동 기입 사용하기" }));
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
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  const school = await screen.findByRole("combobox", { name: "학교명" });
  fireEvent.change(school, { target: { value: "서울대학교" } });
  fireEvent.keyDown(school, { key: "ArrowDown" });
  fireEvent.keyDown(school, { key: "Enter" });
  expect(school).toBeVisible();
  expect(screen.queryByLabelText("전공")).toBeNull();
  await click(screen.getByRole("button", { name: "지금 자동 기입 사용하기" }));
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
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  const school = await screen.findByRole("combobox", { name: "학교명" });
  fireEvent.change(school, { target: { value: "합" } });
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.change(school, { target: { value: "합성학교" } });
  await click(screen.getByRole("button", { name: "지금 자동 기입 사용하기" }));
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
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(screen.getByRole("button", { name: "프로젝트" }));
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "지울 프로젝트" },
  });
  await next();
  await next();
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(
    screen.getByRole("button", { name: "기존 항목 수정: 지울 프로젝트" }),
  );
  await click(screen.getByRole("button", { name: "프로젝트 이름 수정" }));
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "" },
  });
  await next();
  expect(screen.queryByText("지울 프로젝트")).toBeNull();
  await click(screen.getByRole("button", { name: "프로젝트 이름 수정" }));
  expect(screen.getByLabelText("프로젝트 이름")).toHaveValue("");
  await click(screen.getByRole("button", { name: "이전" }));
  await screen.findByText(/아직 입력한 정보가 없어요/);
  expect(screen.queryByText("지울 프로젝트")).toBeNull();
  expect((await repository.load()).projects).toEqual([]);
});

it("reopens saved information at an overview and returns directly after editing email", async () => {
  const initial = createEmptyProfile();
  initial.contact.email = "before@example.test";
  const memory = memoryRepository(initial);
  render(
    <QuickStart repository={memory.repository} onOpenProfile={() => {}} />,
  );
  await screen.findByRole("heading", {
    name: "저장한 정보부터 이어서 준비해요",
  });
  expect(screen.queryByLabelText("국문 성")).toBeNull();
  await click(screen.getByRole("button", { name: "이메일 수정" }));
  const email = screen.getByLabelText("이메일");
  expect(email).toHaveFocus();
  fireEvent.change(email, { target: { value: "after@example.test" } });
  memory.fail(true);
  await click(screen.getByRole("button", { name: "확인하고 돌아가기" }));
  await screen.findByRole("alert");
  expect(email).toHaveValue("after@example.test");
  memory.fail(false);
  await click(screen.getByRole("button", { name: "확인하고 돌아가기" }));
  await screen.findByRole("heading", {
    name: "저장한 정보부터 이어서 준비해요",
  });
  expect((await memory.repository.load()).contact.email).toBe(
    "after@example.test",
  );
});

it("finishes the short education flow before asking optional dates", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  fireEvent.change(screen.getByRole("combobox", { name: "학교명" }), {
    target: { value: "합성대학교" },
  });
  await next();
  fireEvent.change(screen.getByLabelText("전공"), {
    target: { value: "컴퓨터공학" },
  });
  await next();
  await click(screen.getByRole("button", { name: "졸업" }));
  await next();
  expect(
    screen.getByRole("heading", { name: "학력도 준비됐어요" }),
  ).toBeVisible();
  expect(screen.queryByLabelText("입학일")).toBeNull();
  expect(
    screen.getByRole("button", { name: "입학·졸업일 추가" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "학위·학교 정보 추가" }),
  ).toBeVisible();
  expect((await repository.load()).education).toHaveLength(1);
  await click(screen.getByRole("button", { name: "학력 추가하기" }));
  await click(screen.getByRole("button", { name: "고등학교" }));
  fireEvent.change(screen.getByRole("combobox", { name: "학교명" }), {
    target: { value: "합성고등학교" },
  });
  await next();
  await next();
  expect((await repository.load()).education).toHaveLength(2);
});

it("resumes an existing career summary and clears its hidden end date only explicitly", async () => {
  const initial = createEmptyProfile();
  initial.careers = [
    {
      id: "kept-career",
      sectionId: "career",
      values: {
        companyName: "합성회사",
        employmentStatus: "재직중",
        endDate: "2024-12-31",
        custom: "보존",
      },
    },
  ];
  const { repository } = await renderForm(initial);
  await click(screen.getByRole("button", { name: "합성회사 이어서 채우기" }));
  expect(
    screen.getByText("재직중인데 이전 퇴사일이 남아 있어요."),
  ).toBeVisible();
  expect((await repository.load()).careers[0].values.endDate).toBe(
    "2024-12-31",
  );
  await click(screen.getByRole("button", { name: "기간 추가" }));
  expect(screen.queryByLabelText("퇴사일")).toBeNull();
  fireEvent.change(screen.getByLabelText("입사일"), {
    target: { value: "20200101" },
  });
  await next();
  expect((await repository.load()).careers[0].values.endDate).toBe(
    "2024-12-31",
  );
  await click(screen.getByRole("button", { name: "퇴사일 지우기" }));
  await waitFor(async () =>
    expect((await repository.load()).careers[0].values.endDate ?? "").toBe(""),
  );
  const saved = await repository.load();
  expect(saved.careers).toHaveLength(1);
  expect(saved.careers[0]).toMatchObject({
    id: "kept-career",
    values: { custom: "보존", startDate: "2020-01-01" },
  });
  await click(screen.getByRole("button", { name: "저장한 정보 보기" }));
  await screen.findByRole("heading", {
    name: "저장한 정보부터 이어서 준비해요",
  });
});

it.each(["재학중", "휴학"])(
  "keeps an old graduation date until explicitly cleared for %s",
  async (completionStatus) => {
    const initial = createEmptyProfile();
    initial.education = [
      {
        id: "kept-school",
        sectionId: "university",
        values: {
          schoolName: "합성대학교",
          completionStatus,
          endDate: "2024-02-29",
        },
      },
    ];
    const { repository } = await renderForm(initial);
    await click(
      screen.getByRole("button", { name: "합성대학교 이어서 채우기" }),
    );
    expect(screen.getByRole("button", { name: "졸업일 지우기" })).toBeVisible();
    expect((await repository.load()).education[0].values.endDate).toBe(
      "2024-02-29",
    );
    await click(screen.getByRole("button", { name: "입학·졸업일 추가" }));
    expect(screen.queryByLabelText("졸업일")).toBeNull();
    await next();
    expect((await repository.load()).education[0].values.endDate).toBe(
      "2024-02-29",
    );
    await click(screen.getByRole("button", { name: "졸업일 지우기" }));
    await waitFor(async () =>
      expect((await repository.load()).education[0].values.endDate ?? "").toBe(
        "",
      ),
    );
  },
);

it("ignores empty saved rows when deciding the initial question", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    { id: "blank", sectionId: "university", values: { schoolName: " " } },
  ];
  const { repository } = await renderForm(initial);
  expect(screen.getByLabelText("국문 성")).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "저장한 정보부터 이어서 준비해요" }),
  ).toBeNull();
  expect((await repository.load()).education).toEqual(initial.education);
});

it("finishes a project after its name and role and adds details only on request", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(screen.getByRole("button", { name: "프로젝트" }));
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "합성프로젝트" },
  });
  await next();
  fireEvent.change(screen.getByLabelText("담당 역할"), {
    target: { value: "개발" },
  });
  await next();
  expect(screen.queryByLabelText("활동 시작일")).toBeNull();
  expect(screen.queryByLabelText("활동 상세내역")).toBeNull();
  await click(screen.getByRole("button", { name: "활동 내용 추가" }));
  fireEvent.change(screen.getByLabelText("활동 상세내역"), {
    target: { value: "테스트 구현" },
  });
  await next();
  expect(
    screen.getByRole("button", { name: "저장한 정보 보기" }),
  ).toBeVisible();
  expect((await repository.load()).projects).toHaveLength(1);
  expect((await repository.load()).projects[0].values).toMatchObject({
    projectName: "합성프로젝트",
    role: "개발",
    activityDetails: "테스트 구현",
  });
});

it("edits a basic summary answer and returns without repeating later questions", async () => {
  const { repository } = await renderForm();
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "시연" },
  });
  await next();
  await next();
  await next();
  await click(screen.getByRole("button", { name: "이름 수정" }));
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "수정" },
  });
  fireEvent.keyDown(screen.getByLabelText("국문 이름"), { key: "Enter" });
  await screen.findByRole("heading", { name: "기본 정보가 준비됐어요" });
  expect(screen.queryByLabelText("이메일")).toBeNull();
  expect((await repository.load()).personal.koreanGivenName).toBe("수정");
});

it("adds optional school choices to the selected row without changing its identity", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    {
      id: "options-school",
      sectionId: "university",
      values: { schoolName: "합성대학교" },
    },
  ];
  const { repository } = await renderForm(initial);
  await click(screen.getByRole("button", { name: "합성대학교 이어서 채우기" }));
  await click(screen.getByRole("button", { name: "학위·학교 정보 추가" }));
  await click(screen.getByRole("button", { name: "대학교" }));
  await click(screen.getByRole("button", { name: "학사" }));
  await click(screen.getByRole("button", { name: "주간" }));
  await next();
  await screen.findByRole("heading", { name: "학력도 준비됐어요" });
  expect((await repository.load()).education).toEqual([
    {
      id: "options-school",
      sectionId: "university",
      values: {
        schoolName: "합성대학교",
        schoolType: "대학교",
        degreeLevel: "학사",
        attendanceType: "attendance:day",
      },
    },
  ]);
});

it("offers missing basics from a partial summary without repeating the wizard", async () => {
  const { repository } = await renderForm();
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "시연" },
  });
  await next();
  await next();
  await next();
  const email = screen.getByRole("button", { name: "이메일 수정" });
  expect(email).toHaveTextContent("이메일 추가");
  expect(
    screen.getByRole("button", { name: "전화번호 수정" }),
  ).toHaveTextContent("전화번호 추가");
  await click(email);
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "added@example.test" },
  });
  await next();
  await screen.findByRole("heading", { name: "기본 정보가 준비됐어요" });
  expect((await repository.load()).contact.email).toBe("added@example.test");
});

it("offers missing school basics on a partial saved school's summary", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    {
      id: "partial-school",
      sectionId: "university",
      values: { schoolName: "합성대학교" },
    },
  ];
  const { repository } = await renderForm(initial);
  await click(screen.getByRole("button", { name: "합성대학교 이어서 채우기" }));
  const major = screen.getByRole("button", { name: "주전공명 수정" });
  expect(major).toHaveTextContent("주전공명 추가");
  expect(
    screen.getByRole("button", { name: "재학 상태 수정" }),
  ).toHaveTextContent("재학 상태 추가");
  await click(major);
  fireEvent.change(screen.getByLabelText("전공"), {
    target: { value: "컴퓨터공학" },
  });
  await next();
  await screen.findByRole("heading", { name: "학력도 준비됐어요" });
  expect((await repository.load()).education).toHaveLength(1);
  expect((await repository.load()).education[0]).toMatchObject({
    id: "partial-school",
    values: { schoolName: "합성대학교", majorName: "컴퓨터공학" },
  });
});

it("creates valid distinct project ids when adding information after skipping a chapter", async () => {
  const { repository } = await renderForm();
  await next();
  await next();
  await next();
  for (const projectName of ["첫 프로젝트", "둘째 프로젝트"]) {
    await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
    await click(screen.getByRole("button", { name: "이 묶음 건너뛰기" }));
    await click(screen.getByRole("button", { name: "프로젝트 이름 수정" }));
    fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
      target: { value: projectName },
    });
    await next();
    const saved = await repository.load();
    expect(saved.projects.every((row) => row.id.trim().length > 0)).toBe(true);
    expect(parseProfileImport(serializeProfileExport(saved))).toEqual(saved);
  }
  const saved = await repository.load();
  expect(saved.projects).toHaveLength(2);
  expect(new Set(saved.projects.map((row) => row.id)).size).toBe(2);
  expect(saved.projects.map((row) => row.values.projectName)).toEqual([
    "첫 프로젝트",
    "둘째 프로젝트",
  ]);
});

it.each(["직장명 수정", "기간 추가", "학력 추가하기", "저장한 정보 보기"])(
  "stays on the current summary when date clearing failed before %s",
  async (action) => {
    const initial = createEmptyProfile();
    initial.careers = [
      {
        id: "barrier-career",
        sectionId: "career",
        values: {
          companyName: "합성회사",
          employmentStatus: "재직중",
          endDate: "2024-12-31",
        },
      },
    ];
    const { fail, repository } = await renderForm(initial);
    await click(screen.getByRole("button", { name: "합성회사 이어서 채우기" }));
    fail(true);
    await click(screen.getByRole("button", { name: "퇴사일 지우기" }));
    await screen.findByRole("alert");
    await click(screen.getByRole("button", { name: action }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "지금 자동 기입 사용하기" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("heading", { name: "경험까지 차곡차곡 준비됐어요" }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    expect((await repository.load()).careers[0].values.endDate).toBe(
      "2024-12-31",
    );
    fail(false);
    await click(screen.getByRole("button", { name: action }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((await repository.load()).careers[0].values.endDate ?? "").toBe("");
    expect(
      screen.queryByRole("heading", { name: "경험까지 차곡차곡 준비됐어요" }),
    ).toBeNull();
  },
);

it("does not revisit a completed direct edit when going back from its summary", async () => {
  await renderForm();
  await next();
  await next();
  await next();
  await click(screen.getByRole("button", { name: "이메일 수정" }));
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "history@example.test" },
  });
  await next();
  await screen.findByRole("heading", { name: "기본 정보가 준비됐어요" });
  await click(screen.getByRole("button", { name: "이전" }));
  expect(await screen.findByLabelText("전화번호")).toBeVisible();
  expect(screen.queryByLabelText("이메일")).toBeNull();
});
