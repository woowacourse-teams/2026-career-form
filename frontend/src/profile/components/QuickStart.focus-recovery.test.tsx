import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { QuickStart } from "./QuickStart";

type SaveMode = "ok" | "fail" | "hold";

function controlledRepository() {
  let stored = createEmptyProfile();
  stored.contact.email = "before@example.test";
  let mode: SaveMode = "ok";
  let saves = 0;
  const rejectHeld = vi.fn<(reason: Error) => void>();
  const held = new Promise<void>((_, reject) => {
    rejectHeld.mockImplementation(reject);
  });
  const repository: ProfileRepository = {
    load: async () => structuredClone(stored),
    save: async (profile) => {
      saves += 1;
      if (mode === "fail") throw new Error("synthetic storage failure");
      if (mode === "hold") await held;
      stored = structuredClone(profile);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  return {
    repository,
    setMode: (next: SaveMode) => {
      mode = next;
    },
    saves: () => saves,
    failHeld: () => rejectHeld(new Error("synthetic held failure")),
  };
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

async function renderOverview(repository: ProfileRepository) {
  await act(async () => {
    render(
      <QuickStart
        repository={repository}
        track={() => undefined}
        onOpenProfile={() => {}}
        onDone={() => {}}
      />,
    );
  });
}

async function openEmailEditor(repository: ProfileRepository) {
  await renderOverview(repository);
  await click(screen.getByRole("button", { name: "이메일 수정" }));
  const email = screen.getByLabelText("이메일");
  expect(email).toHaveFocus();
  return email;
}

it("returns focus to the retry control after a held user retry fails", async () => {
  const memory = controlledRepository();
  const email = await openEmailEditor(memory.repository);
  fireEvent.change(email, { target: { value: "after@example.test" } });
  memory.setMode("fail");
  await click(screen.getByRole("button", { name: "확인하고 돌아가기" }));
  expect(screen.getByRole("alert")).toBeVisible();
  const retry = screen.getByRole("button", { name: "다시 저장하기" });
  retry.focus();
  memory.setMode("hold");
  await click(retry);
  expect(
    screen.queryByRole("button", { name: "다시 저장하기" }),
  ).not.toBeInTheDocument();
  await act(async () => {
    memory.failHeld();
  });
  expect(screen.getByRole("button", { name: "다시 저장하기" })).toHaveFocus();
  expect(email).toHaveValue("after@example.test");
  expect(memory.saves()).toBe(2);
});

it("keeps typing focus when an autosave fails", async () => {
  const memory = controlledRepository();
  const email = await openEmailEditor(memory.repository);
  vi.useFakeTimers();
  try {
    memory.setMode("fail");
    fireEvent.change(email, { target: { value: "after@example.test" } });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(email).toHaveFocus();
    expect(email).toHaveValue("after@example.test");
  } finally {
    vi.useRealTimers();
  }
});

it("focuses the company name after choosing a new career entry", async () => {
  const memory = controlledRepository();
  await renderOverview(memory.repository);
  await click(screen.getByRole("button", { name: "경력·활동 추가하기" }));
  await click(screen.getByRole("button", { name: "직장경력" }));
  const company = screen.getByLabelText("직장명");
  expect(company).toHaveFocus();
  expect(company).toBeDefined();
});
