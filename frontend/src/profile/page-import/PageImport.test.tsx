import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import { PageImport } from "./PageImport";

function setup(options: { failSave?: boolean; initial?: Profile } = {}) {
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
  const readCandidates = vi.fn(async () => [
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
      source: "educationalBackground.universities.0.enrollmentPeriod.startDate",
      rowIndex: 0,
      profileFieldKey: "education.university.startDate",
      status: "review" as const,
      reason: "month_precision",
      precision: "month" as const,
      value: "2020-03",
    },
  ]);
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

describe("지원서 가져오기 검토", () => {
  it("shows existing and proposed values, saves only selected fields, and reports success after persistence", async () => {
    const state = setup();
    const checkbox = await screen.findByRole("checkbox", {
      name: "이메일 가져오기",
    });
    expect(checkbox).not.toBeChecked();
    expect(
      screen.getByText("old@example.test", { exact: false }),
    ).toBeVisible();
    expect(state.repository.save).not.toHaveBeenCalled();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(state.stored().contact).toEqual({
      email: "new@example.test",
      addressLine1: "보존할 주소",
    });
    expect(state.stored().personal).toEqual({});
    expect(state.stored().education).toEqual([]);
  });
  it("cancels without writing", async () => {
    const state = setup();
    await screen.findByRole("checkbox", { name: "이메일 가져오기" });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 취소" }));
    expect(state.onClose).toHaveBeenCalledOnce();
    expect(state.repository.save).not.toHaveBeenCalled();
  });
  it("requires explicit new-school selection and leaves an incomplete date out", async () => {
    const state = setup();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
    );
    fireEvent.change(screen.getByLabelText("대학교 1 저장 대상"), {
      target: { value: "new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
    await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
    expect(state.stored().education).toEqual([
      expect.objectContaining({
        sectionId: "university",
        values: { schoolName: "예시대학교" },
        identity: { status: "manual", originalText: "예시대학교" },
      }),
    ]);
  });
  it("rejects changed profiles and reloads for explicit review", async () => {
    const state = setup();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "이메일 가져오기" }),
    );
    state.changeStored({
      ...state.stored(),
      contact: { email: "changed@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("프로필이 변경");
    expect(state.repository.save).not.toHaveBeenCalled();
    expect(state.onSaved).not.toHaveBeenCalled();
    expect(
      screen.getByRole("checkbox", { name: "이메일 가져오기" }),
    ).not.toBeChecked();
  });
  it("does not show success or expose error payloads after save failure", async () => {
    const state = setup({ failSave: true });
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "이메일 가져오기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못");
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    expect(state.onSaved).not.toHaveBeenCalled();
  });
});

it("updates an existing university whose ID is new instead of adding a row", async () => {
  const initial = createEmptyProfile();
  initial.education = [
    {
      id: "new",
      sectionId: "university",
      values: { schoolName: "기존대학교", major: "기존전공" },
    },
  ];
  const state = setup({ initial });
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  );
  const option = screen.getByRole("option", {
    name: /기존 1: 기존대학교/,
  }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("대학교 1 저장 대상"), {
    target: { value: option.value },
  });
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
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

it("keeps the full name as a reference and saves explicitly entered name components and full date", async () => {
  const state = setup();
  await screen.findByRole("checkbox", { name: "국문 성 가져오기" });
  expect(screen.getByLabelText("국문 성")).toHaveValue("");
  expect(screen.getByLabelText("국문 이름")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("국문 성"), {
    target: { value: "예시성" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "국문 성 가져오기" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "대학교 1 학교명 가져오기" }),
  );
  fireEvent.change(screen.getByLabelText("대학교 1 저장 대상"), {
    target: { value: "new" },
  });
  expect(screen.getByLabelText("대학교 1 입학일 확인")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("대학교 1 입학일 확인"), {
    target: { value: "2020-03-02" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "대학교 1 입학일 가져오기" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(state.stored().personal).toEqual({ koreanFamilyName: "예시성" });
  expect(state.stored().education[0].values).toEqual({
    schoolName: "예시대학교",
    startDate: "2020-03-02",
  });
});

it("holds a single save while persistence is pending", async () => {
  const state = setup();
  let finish!: () => void;
  const persist = state.repository.save;
  vi.mocked(state.repository.save).mockImplementationOnce(async (profile) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    // Keep a genuine stored profile after the deferred operation.
    state.changeStored(structuredClone(profile));
  });
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "이메일 가져오기" }),
  );
  const form = screen
    .getByRole("button", { name: "선택한 정보 저장" })
    .closest("form")!;
  fireEvent.submit(form);
  await waitFor(() => expect(state.repository.save).toHaveBeenCalledOnce());
  fireEvent.submit(form);
  expect(state.onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "가져오기 취소" })).toBeDisabled();
  finish();
  await waitFor(() => expect(state.onSaved).toHaveBeenCalledOnce());
  expect(persist).toHaveBeenCalledOnce();
  expect(state.stored().contact.email).toBe("new@example.test");
});

it("offers another read for an unsupported page without saving", async () => {
  const repository: ProfileRepository = {
    load: async () => createEmptyProfile(),
    save: vi.fn(),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  render(
    <PageImport
      repository={repository}
      readCandidates={async () => [
        {
          source: "document",
          status: "unsupported",
          reason: "unrecognized_document",
        },
      ]}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByText(/가져올 정보가 없습니다/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "선택한 정보 저장" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 읽기" })).toBeEnabled();
  expect(repository.save).not.toHaveBeenCalled();
});

it("recovers from a read failure without displaying its payload", async () => {
  const repository: ProfileRepository = {
    load: async () => createEmptyProfile(),
    save: vi.fn(),
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  let attempts = 0;
  const readCandidates = async () => {
    if (++attempts === 1) throw new Error("private detail");
    return [] as const;
  };
  render(
    <PageImport
      repository={repository}
      readCandidates={readCandidates}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(await screen.findByText(/가져올 정보가 없습니다/)).toBeVisible();
});

it("selects recognized fields across categories, keeps row destinations separate and skips custom questions", async () => {
  let stored = createEmptyProfile();
  stored.contact.addressLine1 = "보존할 주소";
  const repository: ProfileRepository = {
    load: async () => structuredClone(stored),
    save: async (profile) => {
      stored = structuredClone(profile);
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const onSaved = vi.fn();
  render(
    <PageImport
      repository={repository}
      onSaved={onSaved}
      onClose={() => {}}
      readCandidates={async () => [
        {
          source: "basicInformation.gender",
          profileFieldKey: "personal.personal.gender",
          status: "available",
          reason: "direct",
          value: "남성",
        },
        {
          source: "workHistory.workExperiences.0.companyName",
          rowIndex: 0,
          profileFieldKey: "careers.career.companyName",
          status: "review",
          reason: "catalog_unverified",
          value: "합성회사",
        },
        {
          source: "workHistory.workExperiences.0.dutiesResponsibility",
          rowIndex: 0,
          profileFieldKey: "careers.career.responsibilities",
          status: "available",
          reason: "direct",
          value: "합성 업무",
        },
        {
          source:
            "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials",
          rowIndex: 0,
          profileFieldKey: "certifications.certificate.name",
          status: "review",
          reason: "catalog_unverified",
          value: "합성자격",
        },
        {
          source: "question.custom",
          status: "unsupported",
          reason: "no_profile_mapping",
        },
      ]}
    />,
  );
  await screen.findByRole("checkbox", { name: "직장경력 1 직장명 가져오기" });
  expect(screen.getByText(/대응하는 프로필 항목이 없/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
  fireEvent.change(screen.getByLabelText("직장경력 1 저장 대상"), {
    target: { value: "new" },
  });
  fireEvent.change(screen.getByLabelText("자격증·면허증 1 저장 대상"), {
    target: { value: "new" },
  });
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(stored.personal).toEqual({ gender: "남성" });
  expect(stored.careers[0]).toMatchObject({
    sectionId: "career",
    values: { companyName: "합성회사", responsibilities: "합성 업무" },
  });
  expect(stored.certifications[0]).toMatchObject({
    sectionId: "certificate",
    values: { name: "합성자격" },
  });
  expect(stored.contact.addressLine1).toBe("보존할 주소");
});

it("requires explicit English name components and leaves sensitive fields unselected until requested", async () => {
  let stored = createEmptyProfile();
  const repository: ProfileRepository = {
    load: async () => structuredClone(stored),
    save: async (p) => {
      stored = p;
    },
    loadLayout: async () => "a",
    saveLayout: async () => {},
  };
  const onSaved = vi.fn();
  render(
    <PageImport
      repository={repository}
      onSaved={onSaved}
      onClose={() => {}}
      readCandidates={async () => [
        {
          source: "basicInformation.englishName",
          status: "review",
          reason: "name_unsplittable",
          value: "Synthetic Applicant",
        },
        {
          source: "military.status",
          profileFieldKey: "military.military.militaryStatus",
          status: "available",
          reason: "direct",
          value: "not_applicable",
        },
      ]}
    />,
  );
  expect(await screen.findByLabelText("영문 성")).toHaveValue("");
  expect(
    screen.getByRole("checkbox", { name: "병역 상태 가져오기" }),
  ).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("영문 성"), {
    target: { value: "Applicant" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "영문 성 가져오기" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 정보 저장" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(stored.personal).toEqual({ englishFamilyName: "Applicant" });
  expect(stored.military).toEqual({});
});
