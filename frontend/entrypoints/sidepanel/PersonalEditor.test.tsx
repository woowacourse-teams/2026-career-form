import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../../src/profile/model";
import { App } from "./App";

function setup() {
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성 이름";
  const repository = {
    load: vi.fn(async () => structuredClone(profile)),
    save: vi.fn(async (_profile: Profile): Promise<void> => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
  const copyText = vi.fn();
  render(<App repository={repository} copyText={copyText} />);
  return { profile, repository, copyText };
}

it("edits personal fields inline, preserving fresh unrelated data and updating copied values", async () => {
  const { profile, repository, copyText } = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "기본 인적사항 수정" }),
  );
  expect(screen.getByLabelText("국문 성")).toHaveFocus();
  expect(screen.getByRole("button", { name: "자동 기입" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: " 새 이름 " },
  });
  profile.contact.email = "fresh@example.test";
  profile.personal.nationality = "새 국적";
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(repository.save).toHaveBeenCalled());
  expect(repository.save.mock.calls[0][0]).toMatchObject({
    personal: { koreanGivenName: "새 이름", nationality: "새 국적" },
    contact: { email: "fresh@example.test" },
  });
  await screen.findByText("새 이름");
  fireEvent.click(screen.getByRole("button", { name: "국문 이름 복사" }));
  expect(copyText).toHaveBeenCalledWith("새 이름");
  expect(screen.getByRole("button", { name: "자동 기입" })).toBeEnabled();
});

it("cancels drafts without writing and retains failed edits for retry", async () => {
  const { repository } = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "기본 인적사항 수정" }),
  );
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "취소할 이름" },
  });
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(repository.save).not.toHaveBeenCalled();
  expect(screen.getByText("합성 이름")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "기본 인적사항 수정" }));
  repository.save.mockRejectedValueOnce(new Error("PRIVATE_ERROR"));
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "재시도 이름" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "PRIVATE_ERROR",
  );
  expect(screen.getByLabelText("국문 이름")).toHaveValue("재시도 이름");
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByText("재시도 이름");
});

it("allows clearing personal values and prevents duplicate writes while saving", async () => {
  const { repository } = setup();
  let finish!: () => void;
  repository.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "기본 인적사항 수정" }),
  );
  fireEvent.change(screen.getByLabelText("국문 이름"), {
    target: { value: "" },
  });
  const form = screen.getByRole("form", { name: "기본 인적사항 수정" });
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
  expect(repository.save.mock.calls[0][0].personal).not.toHaveProperty(
    "koreanGivenName",
  );
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  finish();
  await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
});
