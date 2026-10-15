import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import type { ImportCandidate } from "./reader";
import { PageImport } from "./PageImport";

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
        {
          source: "basicInformation.email",
          profileFieldKey: "contact.contact.email",
          status: "available" as const,
          reason: "direct",
          value: "new@example.test",
        },
        {
          source: "educationalBackground.universities.0.schoolName",
          rowIndex: 0,
          profileFieldKey: "education.university.schoolName",
          status: "review" as const,
          reason: "catalog_unverified",
          value: "예시대학교",
        },
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

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
const skip = () =>
  fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
const take = () =>
  fireEvent.click(screen.getByRole("button", { name: "이 단계 가져오기" }));
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
async function selectEmail() {
  await screen.findByLabelText("국문 성");
  skip();
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  next();
  skip();
}

it("shows existing/proposed values and stores only explicit selection at final review", async () => {
  const state = setup();
  await screen.findByLabelText("국문 성");
  skip();
  expect(screen.getByText(/old@example.test/)).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "이메일 가져오기" }),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  // Pressing Enter in a review field must not commit the profile.
  fireEvent.submit(
    screen.getByRole("button", { name: "다음" }).closest("form")!,
  );
  expect(state.repository.save).not.toHaveBeenCalled();
  next();
  skip();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().contact).toEqual({
    email: "new@example.test",
    addressLine1: "보존할 주소",
  });
  expect(state.stored().personal).toEqual({});
  expect(state.stored().education).toEqual([]);
});

it("cancels mid-review without persisting", async () => {
  const state = setup();
  await screen.findByLabelText("국문 성");
  fireEvent.click(screen.getByRole("button", { name: "이름 확인 완료" }));
  fireEvent.click(screen.getByRole("button", { name: "가져오기 취소" }));
  expect(state.onClose).toHaveBeenCalledOnce();
  expect(state.repository.save).not.toHaveBeenCalled();
});

it("resets selections and name confirmation after a concurrent profile change", async () => {
  const state = setup();
  await selectEmail();
  state.changeStored({
    ...state.stored(),
    contact: { email: "changed@example.test" },
  });
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("프로필이 변경");
  expect(state.repository.save).not.toHaveBeenCalled();
  expect(
    screen.getByRole("checkbox", { name: "국문 성 가져오기" }),
  ).toBeDisabled();
  next();
  expect(
    screen.getByRole("checkbox", { name: "이메일 가져오기" }),
  ).not.toBeChecked();
  expect(screen.getByText(/changed@example.test/)).toBeVisible();
});

it("keeps selection on a failed save without leaking failure details", async () => {
  const state = setup({ failSave: true });
  await selectEmail();
  save();
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못");
  expect(screen.queryByText("private detail")).toBeNull();
  expect(state.onSaved).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "선택한 정보 저장" }),
  ).toBeEnabled();
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
  await screen.findByLabelText("국문 성");
  skip();
  skip();
  expect(screen.getByRole("radio", { name: /새 정보로 추가/ })).toBeChecked();
  fireEvent.click(
    screen.getByRole("radio", { name: /기존 정보 업데이트: 기존대학교/ }),
  );
  take();
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

it("revokes name confirmation and selection when a confirmed name is edited after returning", async () => {
  const state = setup();
  await screen.findByLabelText("국문 성");
  fireEvent.click(screen.getByRole("button", { name: "이름 확인 완료" }));
  next();
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(
    screen.getByRole("checkbox", { name: "국문 성 가져오기" }),
  ).toBeChecked();
  fireEvent.change(screen.getByLabelText("국문 성"), {
    target: { value: "남궁" },
  });
  expect(
    screen.getByRole("checkbox", { name: "국문 성 가져오기" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "국문 성 가져오기" }),
  ).not.toBeChecked();
  next();
  take();
  skip();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().personal).toEqual({});
});

it("enables a month date only after a complete valid day and removes selection when cleared", async () => {
  const state = setup();
  await screen.findByLabelText("국문 성");
  skip();
  skip();
  const date = screen.getByLabelText("대학교 1 입학일 확인");
  const check = screen.getByRole("checkbox", {
    name: "대학교 1 입학일 가져오기",
  });
  expect(check).toBeDisabled();
  fireEvent.change(date, { target: { value: "2020-03-02" } });
  expect(check).toBeEnabled();
  fireEvent.click(check);
  expect(
    screen.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  ).toBeChecked();
  fireEvent.change(date, { target: { value: "" } });
  expect(check).not.toBeChecked();
  expect(check).toBeDisabled();
  fireEvent.change(date, { target: { value: "2020-03-02" } });
  fireEvent.click(check);
  next();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().education[0].values).toEqual({
    schoolName: "예시대학교",
    startDate: "2020-03-02",
  });
});

it("prefills complete dates and lets explicit take-step save them without a redundant confirmation", async () => {
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
  expect(await screen.findByLabelText("생년월일 확인")).toHaveValue(
    "1992-07-18",
  );
  expect(
    screen.getByRole("checkbox", { name: "생년월일 가져오기" }),
  ).toBeEnabled();
  take();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().personal).toEqual({ birthDate: "1992-07-18" });
});

it("keeps sensitive fields unselected and untouched when their step is skipped", async () => {
  const state = setup({
    candidates: [
      {
        source: "basicInformation.email",
        profileFieldKey: "contact.contact.email",
        status: "available",
        reason: "direct",
        value: "new@example.test",
      },
      {
        source: "military.status",
        profileFieldKey: "military.military.militaryStatus",
        status: "available",
        reason: "direct",
        value: "not_applicable",
      },
      {
        source: "custom.question",
        status: "unsupported",
        reason: "no_profile_mapping",
      },
    ],
  });
  await screen.findByRole("checkbox", { name: "이메일 가져오기" });
  take();
  expect(
    screen.getByRole("checkbox", { name: "병역 상태 가져오기" }),
  ).not.toBeChecked();
  skip();
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().military).toEqual({});
  expect(state.stored().contact.email).toBe("new@example.test");
});

it("prevents double saves and navigation while persistence is pending", async () => {
  const state = setup();
  let finish!: () => void;
  vi.mocked(state.repository.save).mockImplementationOnce(async (profile) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    state.changeStored(structuredClone(profile));
  });
  await selectEmail();
  const form = screen
    .getByRole("button", { name: "선택한 정보 저장" })
    .closest("form")!;
  fireEvent.submit(form);
  await waitFor(() => expect(state.repository.save).toHaveBeenCalledOnce());
  fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "가져오기 취소" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
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
  expect(await screen.findByText(/가져올 정보가 없습니다/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "선택한 정보 저장" })).toBeNull();
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
  expect(await screen.findByText(/가져올 정보가 없습니다/)).toBeVisible();
});

describe("단계별 가져오기", () => {
  it("gates suggested names until confirmed, keeps steps isolated and saves only at the summary", async () => {
    const state = setup();
    expect(await screen.findByLabelText("국문 성")).toHaveValue("예");
    expect(screen.getByLabelText("국문 이름")).toHaveValue("시이름");
    expect(
      screen.getByRole("checkbox", { name: "국문 성 가져오기" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("checkbox", { name: "이메일 가져오기" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "선택한 정보 저장" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이름 확인 완료" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "이 단계 가져오기" }));
    expect(
      screen.getByRole("checkbox", { name: "대학교 1 입학일 가져오기" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("대학교 1 입학일 확인")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "이 단계 가져오기" }));
    expect(state.repository.save).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "저장 전 확인" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(state.stored().personal).toEqual({
      koreanFamilyName: "예",
      koreanGivenName: "시이름",
    });
    expect(state.stored().education[0].values).toEqual({
      schoolName: "예시대학교",
    });
    expect(state.stored().contact.email).toBe("new@example.test");
  });
  it("requires a readable explicit choice for the same school instead of silently adding or linking", async () => {
    const initial = createEmptyProfile();
    initial.education = [
      {
        id: "kept",
        sectionId: "university",
        values: { schoolName: "예시대학교", major: "보존전공" },
      },
    ];
    const state = setup({ initial });
    await screen.findByLabelText("국문 성");
    fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
    fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
    expect(
      screen.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("radio", { name: /기존 정보 업데이트: 예시대학교/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "이 단계 가져오기" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(state.stored().education).toEqual(initial.education);
  });
});

it("detects duplicate new rows before persistence and lets other selected information save", async () => {
  const candidates: ImportCandidate[] = [
    {
      source: "basicInformation.email",
      profileFieldKey: "contact.contact.email",
      status: "available",
      reason: "direct",
      value: "new@example.test",
    },
    ...[0, 1].map((rowIndex): ImportCandidate => ({
      source: `educationalBackground.universities.${rowIndex}.schoolName`,
      rowIndex,
      profileFieldKey: "education.university.schoolName",
      status: "review",
      reason: "catalog_unverified",
      value: "서울대학교",
    })),
  ];
  const state = setup({ candidates });
  await screen.findByRole("checkbox", { name: "이메일 가져오기" });
  take();
  take();
  take();
  expect(
    screen.getByRole("button", { name: "선택한 정보 저장" }),
  ).toBeDisabled();
  expect(state.repository.save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "문제 항목 제외하고 계속" }),
  );
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().education).toHaveLength(1);
  expect(state.stored().contact.email).toBe("new@example.test");
});

it("catches two source rows updating the same existing entry before any writes", async () => {
  const initial = createEmptyProfile();
  initial.careers = [
    {
      id: "existing-career",
      sectionId: "career",
      values: { companyName: "삼성전자", responsibilities: "보존" },
    },
  ];
  const state = setup({
    initial,
    candidates: [0, 1].map((rowIndex): ImportCandidate => ({
      source: `workHistory.workExperiences.${rowIndex}.companyName`,
      rowIndex,
      profileFieldKey: "careers.career.companyName",
      status: "review",
      reason: "catalog_unverified",
      value: "삼성전자",
    })),
  });
  await screen.findByRole("radio", { name: /기존 정보 업데이트/ });
  fireEvent.click(screen.getByRole("radio", { name: /기존 정보 업데이트/ }));
  take();
  fireEvent.click(screen.getByRole("radio", { name: /기존 정보 업데이트/ }));
  take();
  expect(
    screen.getByRole("button", { name: "선택한 정보 저장" }),
  ).toBeDisabled();
  expect(state.repository.save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "문제 항목 제외하고 계속" }),
  );
  save();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().careers).toEqual(initial.careers);
});
