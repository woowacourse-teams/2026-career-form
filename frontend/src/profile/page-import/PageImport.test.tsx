import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import type { ImportCandidate } from "./reader";
import { PageImport } from "./PageImport";

const emailCandidate: ImportCandidate = {
  source: "basicInformation.email",
  profileFieldKey: "contact.contact.email",
  status: "available",
  reason: "direct",
  value: "new@example.test",
};
const schoolCandidate = (
  rowIndex: number,
  value = "예시대학교",
): ImportCandidate => ({
  source: `educationalBackground.universities.${rowIndex}.schoolName`,
  rowIndex,
  profileFieldKey: "education.university.schoolName",
  status: "review",
  reason: "catalog_unverified",
  value,
});

function setup(
  options: {
    failSave?: boolean;
    initial?: Profile;
    candidates?: ImportCandidate[];
  } = {},
) {
  let stored: Profile = options.initial ?? {
    ...createEmptyProfile(),
    contact: { email: "old@example.test", addressLine1: "보존할 주소" },
  };
  const repository: ProfileRepository = {
    load: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (profile) => {
      if (options.failSave) throw new Error("private detail");
      stored = structuredClone(profile);
    }),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const readCandidates = vi.fn(
    async () =>
      options.candidates ?? [
        {
          source: "basicInformation.name",
          status: "review" as const,
          reason: "name_unsplittable",
          value: "예시이름",
        },
        emailCandidate,
        schoolCandidate(0),
        {
          source:
            "educationalBackground.universities.0.enrollmentPeriod.startDate",
          rowIndex: 0,
          profileFieldKey: "education.university.startDate",
          status: "review" as const,
          reason: "month_precision",
          precision: "month" as const,
          value: "2020-03",
        },
      ],
  );
  render(
    <PageImport
      repository={repository}
      readCandidates={readCandidates}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return {
    repository,
    onSaved,
    onClose,
    stored: () => stored,
    changeStored: (p: Profile) => {
      stored = p;
    },
  };
}

const ready = () => screen.findByText("프로필에 가져올 정보");
const saveButton = () =>
  screen.getByRole("button", { name: /프로필에 저장하기/ });
const save = () => fireEvent.click(saveButton());
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const open = (category: RegExp) => click(category);
const nameCard = () =>
  screen.queryByRole("heading", { name: "국문 이름을 이렇게 나누면 될까요?" });

it("preselects only new values, keeps overwrites off and saves in one click", async () => {
  const state = setup();
  await ready();
  expect(saveButton()).toHaveTextContent("1");
  expect(state.repository.save).not.toHaveBeenCalled();
  save();
  await waitFor(() =>
    expect(state.onSaved).toHaveBeenCalledWith(expect.anything(), 1),
  );
  expect(state.stored().contact).toEqual({
    email: "old@example.test",
    addressLine1: "보존할 주소",
  });
  expect(state.stored().personal).toEqual({});
  expect(state.stored().education[0].values).toEqual({
    schoolName: "예시대학교",
  });
});

it("saves an overwrite only after the user turns it on", async () => {
  const state = setup();
  await ready();
  open(/연락처와 주소/);
  const email = screen.getByRole("checkbox", { name: "이메일 가져오기" });
  expect(email).not.toBeChecked();
  expect(screen.getByText("old@example.test")).toBeVisible();
  fireEvent.click(email);
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().contact).toEqual({
    email: "new@example.test",
    addressLine1: "보존할 주소",
  });
});

it("does not save when Enter is pressed in a review field", async () => {
  const state = setup();
  await ready();
  click("나중에 할게요");
  fireEvent.keyDown(screen.getByLabelText("대학교 1 입학일의 일"), {
    key: "Enter",
  });
  expect(screen.getByRole("alert")).toHaveTextContent("1부터 31 사이로");
  expect(state.repository.save).not.toHaveBeenCalled();
});

it("closes without persisting", async () => {
  const state = setup();
  await ready();
  click("맞아요");
  click("닫기");
  expect(state.onClose).toHaveBeenCalledOnce();
  expect(state.repository.save).not.toHaveBeenCalled();
});

it("resets selections and decisions after a concurrent profile change", async () => {
  const state = setup();
  await ready();
  click("맞아요");
  open(/연락처와 주소/);
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  state.changeStored({
    ...state.stored(),
    contact: { email: "changed@example.test" },
  });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "프로필이 바뀌었어요",
  );
  expect(state.repository.save).not.toHaveBeenCalled();
  await waitFor(() => expect(nameCard()).toBeVisible());
  expect(
    screen.getByRole("checkbox", { name: "이메일 가져오기" }),
  ).not.toBeChecked();
  expect(screen.getByText("changed@example.test")).toBeVisible();
});

it("keeps selection on a failed save without leaking failure details", async () => {
  const state = setup({ failSave: true });
  await ready();
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못");
  expect(screen.queryByText("private detail")).toBeNull();
  expect(state.onSaved).not.toHaveBeenCalled();
  expect(saveButton()).toBeEnabled();
  expect(saveButton()).toHaveTextContent("1");
});

it("allows explicit update of an entry whose ID is literally new and preserves its other values", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    {
      id: "new",
      sectionId: "university",
      values: { schoolName: "기존대학교", major: "기존전공" },
    },
  ];
  const state = setup({ initial });
  await ready();
  open(/학력/);
  click("예시대학교 저장 위치 바꾸기");
  click("나중에 할게요");
  expect(
    screen.getByRole("heading", {
      name: "예시대학교, 프로필에 있는 항목과 같은가요?",
    }),
  ).toBeVisible();
  click(/같은 항목이에요/);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  );
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().education).toEqual([
    {
      id: "new",
      sectionId: "university",
      values: { schoolName: "예시대학교", major: "기존전공" },
      identity: { status: "manual", originalText: "예시대학교" },
    },
  ]);
});

it("revokes name confirmation when a confirmed name is revised", async () => {
  const state = setup();
  await ready();
  click("맞아요");
  expect(nameCard()).toBeNull();
  click("국문 이름 수정");
  expect(nameCard()).toBeVisible();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().personal).toEqual({});
});

it("saves a confirmed name and a completed month date", async () => {
  const state = setup();
  await ready();
  click("맞아요");
  expect(
    screen.getByRole("heading", { name: "2020년 3월 며칠인가요?" }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("대학교 1 입학일의 일"), {
    target: { value: "2" },
  });
  click("입력했어요");
  expect(screen.getByText("확인할 정보를 모두 정리했어요")).toBeVisible();
  save();
  await waitFor(() =>
    expect(state.onSaved).toHaveBeenCalledWith(expect.anything(), 4),
  );
  expect(state.stored().personal).toEqual({
    koreanFamilyName: "예",
    koreanGivenName: "시이름",
  });
  expect(state.stored().education[0].values).toEqual({
    schoolName: "예시대학교",
    startDate: "2020-03-02",
  });
});

it("drops only the date the user cannot remember", async () => {
  const state = setup();
  await ready();
  click("나중에 할게요");
  click("기억이 안 나요");
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().education[0].values).toEqual({
    schoolName: "예시대학교",
  });
});

it("reuses complete dates without asking again", async () => {
  const state = setup({
    candidates: [
      {
        source: "basicInformation.birthDate",
        profileFieldKey: "personal.personal.birthDate",
        status: "available",
        reason: "direct",
        value: "1992-07-18",
        precision: "day",
      },
    ],
  });
  await ready();
  expect(screen.queryByRole("heading", { name: /며칠인가요/ })).toBeNull();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().personal).toEqual({ birthDate: "1992-07-18" });
});

it("keeps sensitive categories off until switched on", async () => {
  const state = setup({
    initial: createEmptyProfile(),
    candidates: [
      emailCandidate,
      {
        source: "military.status",
        profileFieldKey: "military.military.militaryStatus",
        status: "available",
        reason: "direct",
        value: "military-status:not-applicable",
      },
      {
        source: "custom.question",
        status: "unsupported",
        reason: "no_profile_mapping",
      },
    ],
  });
  await ready();
  const military = screen.getByRole("switch", { name: "병역 가져오기" });
  expect(military).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText("민감 정보는 직접 켜야 저장돼요")).toBeVisible();
  fireEvent.click(military);
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().military).toEqual({
    militaryStatus: "military-status:not-applicable",
  });
  expect(state.stored().contact.email).toBe("new@example.test");
});

it("prevents double saves and locks the review while persistence is pending", async () => {
  const state = setup();
  let finish!: () => void;
  vi.mocked(state.repository.save).mockImplementationOnce(async (profile) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    state.changeStored(structuredClone(profile));
  });
  await ready();
  save();
  await waitFor(() => expect(state.repository.save).toHaveBeenCalledOnce());
  save();
  expect(saveButton()).toBeDisabled();
  expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "학력 가져오기" })).toBeDisabled();
  expect(state.onSaved).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.repository.save).toHaveBeenCalledOnce();
});

it("offers another read for unsupported pages and does not offer saving", async () => {
  const state = setup({
    candidates: [
      {
        source: "document",
        status: "unsupported",
        reason: "unrecognized_document",
      },
    ],
  });
  expect(await screen.findByText(/가져올 정보가 없어요/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /프로필에 저장하기/ }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "다시 읽기" })).toBeEnabled();
  expect(state.repository.save).not.toHaveBeenCalled();
});

it("recovers from read failure without displaying error payloads", async () => {
  let attempts = 0;
  const repository: ProfileRepository = {
    load: async () => createEmptyProfile(),
    save: vi.fn(),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  render(
    <PageImport
      repository={repository}
      readCandidates={async () => {
        if (++attempts === 1) throw new Error("private detail");
        return [];
      }}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못");
  expect(screen.queryByText("private detail")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));
  expect(await screen.findByText(/가져올 정보가 없어요/)).toBeVisible();
});

it("requires an explicit choice for the same school instead of silently adding or linking", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    {
      id: "kept",
      sectionId: "university",
      values: { schoolName: "예시대학교", major: "보존전공" },
    },
  ];
  const state = setup({ initial });
  await ready();
  open(/학력/);
  expect(
    screen.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  ).toBeDisabled();
  click("나중에 할게요");
  click(/같은 항목이에요/);
  expect(
    screen.getByRole("button", { name: "변경 없는 1개 보기" }),
  ).toBeVisible();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().education).toEqual(initial.education);
  expect(state.stored().contact.email).toBe("new@example.test");
});

it("excludes duplicate new rows, explains them and saves the rest", async () => {
  const state = setup({
    candidates: [
      emailCandidate,
      schoolCandidate(0, "서울대학교"),
      schoolCandidate(1, "서울대학교"),
    ],
  });
  await ready();
  open(/연락처와 주소/);
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "같은 정보가 두 번 들어 있어 1개 항목은 저장하지 않아요",
  );
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().education).toHaveLength(1);
  expect(state.stored().education[0].values).toEqual({
    schoolName: "서울대학교",
  });
  expect(state.stored().contact.email).toBe("new@example.test");
});

it("keeps only the first of two rows updating the same existing entry", async () => {
  const initial = createEmptyProfile();
  initial.careers = [
    {
      id: "existing-career",
      sectionId: "career",
      values: { companyName: "예시전자", responsibilities: "보존" },
    },
  ];
  const state = setup({
    initial,
    candidates: [0, 1].flatMap((rowIndex): ImportCandidate[] => [
      {
        source: `workHistory.workExperiences.${rowIndex}.companyName`,
        rowIndex,
        profileFieldKey: "careers.career.companyName",
        status: "review",
        reason: "catalog_unverified",
        value: "예시전자",
      },
      {
        source: `workHistory.workExperiences.${rowIndex}.responsibilities`,
        rowIndex,
        profileFieldKey: "careers.career.responsibilities",
        status: "available",
        reason: "direct",
        value: `업무${rowIndex + 1}`,
      },
    ]),
  });
  await ready();
  click(/같은 항목이에요/);
  click(/같은 항목이에요/);
  open(/직장경력/);
  for (const entrySwitch of screen.getAllByRole("switch", {
    name: "예시전자 가져오기",
  }))
    fireEvent.click(entrySwitch);
  expect(screen.getByRole("status")).toHaveTextContent("1개 항목은 저장하지");
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().careers).toEqual([
    {
      id: "existing-career",
      sectionId: "career",
      values: { companyName: "예시전자", responsibilities: "업무1" },
    },
  ]);
});

it("lists what cannot be imported with reasons", async () => {
  setup({
    candidates: [
      emailCandidate,
      {
        source: "custom.question",
        status: "unsupported",
        reason: "no_profile_mapping",
      },
    ],
  });
  await ready();
  const skipped = screen
    .getByText("가져올 수 없는 1개 보기")
    .closest("details")!;
  expect(
    within(skipped).getByText(/대응하는 프로필 항목이 없어/),
  ).toBeInTheDocument();
});

it("never shows a middle dot", async () => {
  setup();
  await ready();
  expect(document.body.textContent).not.toContain("·");
});
