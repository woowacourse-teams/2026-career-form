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
  await screen.findByLabelText("이메일");
  return { ...memory, track, open, ...view };
}

describe("QuickStart", () => {
  it("offers four optional fields and skips empty registration without claiming a save", async () => {
    const { track } = await renderForm();
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    for (const field of screen.getAllByRole("textbox"))
      expect(field).not.toBeRequired();
    expect(screen.queryByText(/13개 범주/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "나중에 입력하기" }));
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
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    expect(
      screen.queryByRole("button", { name: "나중에 입력하기" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "저장하고 사용 방법 보기" }),
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
    fireEvent.change(screen.getByLabelText("전화번호"), {
      target: { value: "01012345678" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "저장하고 사용 방법 보기" }),
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
      screen.getByRole("button", { name: "저장하고 사용 방법 보기" }),
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
    fireEvent.change(await screen.findByLabelText("이메일"), {
      target: { value: "learner@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "저장하고 사용 방법 보기" }),
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
    fireEvent.change(await screen.findByLabelText("이메일"), {
      target: { value: "old@example.test" },
    });
    await waitFor(() => expect(finishFirst).toBeDefined());
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "latest@example.test" },
    });
    await act(async () => finishFirst?.());
    fireEvent.click(
      screen.getByRole("button", { name: "저장하고 사용 방법 보기" }),
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
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "new@example.test" },
  });
  await act(async () => finishes[0]());
  expect(events).not.toContain("profile_first_saved");
  await waitFor(() => expect(finishes).toHaveLength(2));
  expect(events).not.toContain("profile_first_saved");
  await act(async () => finishes[1]());
  expect((await memory.repository.load()).contact.email).toBe(
    "new@example.test",
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
    const email = await screen.findByLabelText("이메일");
    if (hasInput)
      fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: hasInput ? "저장하고 사용 방법 보기" : "나중에 입력하기",
      }),
    );
    await screen.findByRole("heading", {
      name: "지원서에서 자동 기입을 시작하세요",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
