import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PushStateView } from "../../../src/job-postings/push-messages";
import { RolesStep } from "./RolesStep";
import { createPushClient, registeredState } from "./test-support";

function renderStep(state: PushStateView = registeredState) {
  const client = createPushClient(state);
  const track = vi.fn();
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <RolesStep
      client={client}
      track={track}
      heading={createRef<HTMLHeadingElement>()}
      onBack={onBack}
      onNext={onNext}
    />,
  );
  return { client, track, onBack, onNext };
}
const option = (name: string | RegExp) => screen.getByRole("button", { name });
const all = () => option(/모든 직무의 공고 받기/);
const pick = () => option(/직무를 골라 받기/);
const summary = () => screen.getByTestId("role-summary");

it("기본은 모든 직무의 공고 받기이고 고르지 않으면 전체를 받는다고 알린다", async () => {
  const { client } = renderStep();
  expect(
    screen.getByRole("heading", { level: 1, name: "어떤 공고를 받을까요?" }),
  ).toBeVisible();
  await screen.findByText("알림 켜짐");
  expect(all()).toHaveAttribute("aria-pressed", "true");
  expect(pick()).toHaveAttribute("aria-pressed", "false");
  expect(all()).toHaveTextContent("직무를 고르지 않으면 모든 공고를 받아요.");
  expect(summary()).toHaveTextContent("지금 설정: 모든 공고를 받아요.");
  expect(client.categories).not.toHaveBeenCalled();
});

it("직무를 골라 받기를 누르면 분류를 불러와 고른 직무를 바로 저장한다", async () => {
  const { client, track } = renderStep();
  await screen.findByText("알림 켜짐");
  fireEvent.click(pick());
  const backend = await screen.findByRole("button", { name: "백엔드" });
  expect(client.categories).toHaveBeenCalledTimes(1);
  expect(summary()).toHaveTextContent(
    "고른 직무가 없어요. 이대로 두면 모든 공고를 받아요.",
  );
  fireEvent.click(backend);
  await waitFor(() =>
    expect(client.setRoles).toHaveBeenCalledWith(["IT.BACKEND"]),
  );
  await waitFor(() => expect(backend).toHaveAttribute("aria-pressed", "true"));
  expect(summary()).toHaveTextContent(
    "고른 1개 직무의 공고만 받아요. 모두 해제하면 모든 공고를 받아요.",
  );
  expect(track).toHaveBeenCalledWith("push_roles_saved", {
    surface: "extension_onboarding",
    role_count: 1,
  });
  fireEvent.click(backend);
  await waitFor(() => expect(client.setRoles).toHaveBeenLastCalledWith([]));
  await waitFor(() =>
    expect(summary()).toHaveTextContent(
      "고른 직무가 없어요. 이대로 두면 모든 공고를 받아요.",
    ),
  );
});

it("이미 직무를 골랐으면 골라 받기로 열리고 모든 직무를 누르면 선택을 비운다", async () => {
  const { client } = renderStep({ ...registeredState, roles: ["IT.BACKEND"] });
  const backend = await screen.findByRole("button", { name: "백엔드" });
  expect(pick()).toHaveAttribute("aria-pressed", "true");
  expect(backend).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(all());
  await waitFor(() => expect(client.setRoles).toHaveBeenCalledWith([]));
  await waitFor(() =>
    expect(summary()).toHaveTextContent("지금 설정: 모든 공고를 받아요."),
  );
  expect(screen.queryByRole("button", { name: "백엔드" })).toBeNull();
});

it("직무 분류를 불러오지 못하면 이유와 다시 시도를 보인다", async () => {
  const { client } = renderStep();
  client.categories.mockResolvedValue({ categories: null, error: "NETWORK" });
  await screen.findByText("알림 켜짐");
  fireEvent.click(pick());
  expect(
    await screen.findByText("직무 분류를 불러오지 못했어요"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(client.categories).toHaveBeenCalledTimes(2));
});

it("테스트 알림을 보내고 보였는지 응답을 기록한다", async () => {
  const { client, track } = renderStep();
  await screen.findByText("알림 켜짐");
  fireEvent.click(screen.getByRole("button", { name: "테스트 알림 보내기" }));
  await waitFor(() => expect(client.test).toHaveBeenCalledTimes(1));
  expect(track).toHaveBeenCalledWith("notification_test_sent", {
    surface: "extension_onboarding",
  });
  fireEvent.click(await screen.findByRole("button", { name: "보였어요" }));
  await waitFor(() =>
    expect(client.record).toHaveBeenCalledWith("seen", "test"),
  );
  expect(track).toHaveBeenCalledWith("notification_visibility_answered", {
    surface: "extension_onboarding",
    answer: "seen",
  });
  expect(await screen.findByText("알림 표시가 확인됐어요.")).toBeVisible();
});

it("알림이 안 보였다고 답하면 확인할 설정과 다시 테스트를 보인다", async () => {
  renderStep();
  await screen.findByText("알림 켜짐");
  fireEvent.click(screen.getByRole("button", { name: "테스트 알림 보내기" }));
  fireEvent.click(await screen.findByRole("button", { name: "안 보였어요" }));
  expect(await screen.findByText("알림이 보이지 않을 때")).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 테스트" })).toBeVisible();
});

it("알림을 끄고 다시 켤 수 있다", async () => {
  const { client, track } = renderStep();
  await screen.findByText("알림 켜짐");
  fireEvent.click(screen.getByRole("button", { name: "알림 끄기" }));
  await waitFor(() => expect(client.setEnabled).toHaveBeenCalledWith(false));
  expect(await screen.findByText("알림 꺼짐")).toBeVisible();
  expect(track).toHaveBeenCalledWith("push_subscription_disabled", {
    surface: "extension_onboarding",
  });
  expect(
    screen.queryByRole("button", { name: "테스트 알림 보내기" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "알림 켜기" }));
  await waitFor(() => expect(client.setEnabled).toHaveBeenLastCalledWith(true));
  expect(await screen.findByText("알림 켜짐")).toBeVisible();
  expect(track).toHaveBeenCalledWith("push_subscription_enabled", {
    surface: "extension_onboarding",
  });
});

it("알림이 설치 때 켜졌다고 알리고 테스트 알림이 어디에 뜨는지 안내한다", async () => {
  renderStep();
  expect(screen.getByText(/설치할 때 새 공고 알림이 켜졌어요/)).toBeVisible();
  expect(
    screen.getByText(
      "테스트 알림은 이 컴퓨터 화면 구석에 Chrome 알림으로 떠요.",
    ),
  ).toBeVisible();
});

it("Chrome 종료, 절전, 꺼진 알림에 대한 안내를 옆에 둔다", async () => {
  renderStep();
  expect(
    screen.getByText("Chrome이 완전히 꺼져 있으면 알림이 오지 않아요."),
  ).toBeVisible();
  expect(
    screen.getByText("절전이나 방해 금지 모드에서는 늦거나 막힐 수 있어요."),
  ).toBeVisible();
});

it("이전과 다음으로 단계를 옮긴다", async () => {
  const { onBack, onNext } = renderStep();
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onNext).toHaveBeenCalledTimes(1);
});
