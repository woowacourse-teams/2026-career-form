import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { TrackEvent } from "../../../src/analytics/events";
import type { ProfileRepository } from "../../../src/profile/profile-repository";
import { OnboardingFlow } from "./OnboardingFlow";
import type { OnboardingStep } from "./steps";
import {
  createPushClient,
  createRepository,
  createStepMemory,
} from "./test-support";

function renderFlow(
  options: {
    repository?: ProfileRepository;
    step?: OnboardingStep;
    track?: TrackEvent;
  } = {},
) {
  const repository = options.repository ?? createRepository();
  const steps = createStepMemory(options.step);
  const track = options.track ?? vi.fn();
  const onOpenProfile = vi.fn();
  const onOpenPostings = vi.fn();
  const profileListeners: (() => void)[] = [];
  render(
    <OnboardingFlow
      repository={repository}
      pushClient={createPushClient()}
      track={track}
      stepStore={steps.store}
      watchProfile={(listener) => {
        profileListeners.push(listener);
        return () => {
          profileListeners.splice(profileListeners.indexOf(listener), 1);
        };
      }}
      onOpenProfile={onOpenProfile}
      onOpenPostings={onOpenPostings}
    />,
  );
  return {
    repository,
    steps,
    track,
    onOpenProfile,
    onOpenPostings,
    profileListeners,
  };
}
const rail = () => screen.getByRole("navigation", { name: "진행 상황" });
const current = () =>
  within(rail())
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-current") === "step");

it("선택 화면 없이 이름 입력으로 시작하고 여섯 단계를 진행 바에 보인다", async () => {
  renderFlow();
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "이름부터 알려 주세요",
    }),
  ).toBeVisible();
  expect(
    within(rail())
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    "1이름",
    "2이메일",
    "3직무 선택",
    "4알림 안내",
    "5Greeting",
    "6사용법",
  ]);
  expect(current()).toHaveTextContent("이름");
  expect(within(rail()).getByText("1 / 6")).toBeInTheDocument();
  expect(screen.queryByText("등록 묶음")).toBeNull();
  expect(screen.queryByText("설치 완료")).toBeNull();
});

it("넘어가는 버튼은 하나이고 칸이 비면 건너뛰기, 값을 넣으면 다음으로 보인다", async () => {
  renderFlow();
  const family = await screen.findByLabelText("성");
  expect(family).toHaveAttribute("placeholder", "예: 홍");
  expect(screen.getByLabelText("이름")).toHaveAttribute(
    "placeholder",
    "예: 길동",
  );
  expect(screen.getByRole("button", { name: "건너뛰기" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
  fireEvent.change(family, { target: { value: "김" } });
  expect(screen.getByRole("button", { name: "다음" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
  fireEvent.change(family, { target: { value: "" } });
  expect(screen.getByRole("button", { name: "건너뛰기" })).toBeVisible();
});

it("이름과 이메일을 기존 프로필 저장 형식으로 저장하고 직무 선택으로 넘어간다", async () => {
  const { repository, steps } = renderFlow();
  fireEvent.change(await screen.findByLabelText("성"), {
    target: { value: "김" },
  });
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "하늘" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  const email = await screen.findByLabelText("이메일");
  expect(current()).toHaveTextContent("이메일");
  expect(screen.getByRole("button", { name: "건너뛰기" })).toBeVisible();
  fireEvent.change(email, { target: { value: "haneul@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await waitFor(() => expect(current()).toHaveTextContent("직무 선택"));
  const saved = await repository.load();
  expect(saved.personal.koreanFamilyName).toBe("김");
  expect(saved.personal.koreanGivenName).toBe("하늘");
  expect(saved.contact.email).toBe("haneul@example.com");
  expect(steps.written).toEqual(["email", "roles"]);
});

it("이전 버튼으로 앞 단계로 돌아간다", async () => {
  renderFlow({ step: "email" });
  await screen.findByLabelText("이메일");
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(await screen.findByLabelText("성")).toBeVisible();
  expect(screen.queryByRole("button", { name: "이전" })).toBeNull();
});

it("저장해 둔 단계에서 다시 시작한다", async () => {
  renderFlow({ step: "alerts" });
  await waitFor(() => expect(current()).toHaveTextContent("알림 안내"));
  expect(screen.queryByLabelText("성")).toBeNull();
  expect(within(rail()).getByText("4 / 6")).toBeInTheDocument();
});

it("단계에 들어갈 때마다 단계 이름을 기록한다", async () => {
  const track = vi.fn();
  renderFlow({ track });
  await screen.findByLabelText("성");
  expect(track).toHaveBeenCalledWith("onboarding_step_viewed", {
    surface: "extension_onboarding",
    step: "name",
  });
  fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
  await screen.findByLabelText("이메일");
  expect(track).toHaveBeenCalledWith("onboarding_step_viewed", {
    surface: "extension_onboarding",
    step: "email",
  });
});

it("머리글의 전체 프로필 편집은 관리 페이지를 연다", async () => {
  const { onOpenProfile } = renderFlow();
  await screen.findByLabelText("성");
  fireEvent.click(screen.getByRole("button", { name: "전체 프로필 편집" }));
  await waitFor(() => expect(onOpenProfile).toHaveBeenCalledTimes(1));
});

it("프로필을 불러오지 못하면 알리고 입력 칸을 보이지 않는다", async () => {
  const repository = createRepository();
  repository.load = async () => {
    throw new Error("storage");
  };
  renderFlow({ repository });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "프로필을 불러오지 못했어요",
  );
  expect(screen.queryByLabelText("성")).toBeNull();
});

it("이메일 다음은 직무 선택, 그다음은 알림 안내로 이어진다", async () => {
  renderFlow({ step: "email" });
  await screen.findByLabelText("이메일");
  fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "어떤 공고를 받을까요?",
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "새 공고가 뜨면 알려드려요",
    }),
  ).toBeVisible();
  expect(current()).toHaveTextContent("알림 안내");
});

it("Greeting 단계에서만 프로필 변경을 지켜보다가 가져오기가 저장되면 이어서 진행한다", async () => {
  const { profileListeners, steps, track } = renderFlow({ step: "alerts" });
  await screen.findByRole("heading", { level: 1 });
  expect(profileListeners).toHaveLength(0);
  for (let i = 0; i < 3; i += 1)
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Greeting 지원서를 쓴 적이 있나요?",
    }),
  ).toBeVisible();
  expect(profileListeners).toHaveLength(1);
  expect(screen.getByRole("button", { name: "건너뛰기" })).toBeVisible();
  await act(async () => profileListeners[0]());
  expect(
    await screen.findByText("가져왔어요. 프로필에 저장했어요."),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "이제 지원서에서 써 보세요",
    }),
  ).toBeVisible();
  expect(profileListeners).toHaveLength(0);
  expect(steps.written).toEqual(["greeting", "usage"]);
  expect(track).toHaveBeenCalledWith("onboarding_completed", {
    surface: "extension_onboarding",
  });
});

it("사용법 단계의 버튼이 전체 프로필 편집과 새 공고 탭을 연다", async () => {
  const { onOpenProfile, onOpenPostings } = renderFlow({ step: "usage" });
  await screen.findByRole("heading", {
    level: 1,
    name: "이제 지원서에서 써 보세요",
  });
  fireEvent.click(screen.getByRole("button", { name: "새 공고 보기" }));
  expect(onOpenPostings).toHaveBeenCalledTimes(1);
  fireEvent.click(
    within(screen.getByRole("main")).getByRole("button", {
      name: "전체 프로필 편집",
    }),
  );
  await waitFor(() => expect(onOpenProfile).toHaveBeenCalledTimes(1));
});
