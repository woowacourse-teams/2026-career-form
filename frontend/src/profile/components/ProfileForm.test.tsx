import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PROFILE_CATEGORIES,
  getCategoryDefinition,
} from "../field-definitions";
import { createEmptyProfile } from "../model";
import { ProfileForm } from "./ProfileForm";
import styles from "./ProfileForm.module.css";

describe("ProfileForm conditional fields", () => {
  it.each([
    ["certifications", "certificate", "name", "자격증명"],
    ["education", "highSchool", "schoolName", "학교명"],
    ["education", "university", "schoolName", "학교명"],
    ["education", "graduateSchool", "schoolName", "학교명"],
  ] as const)(
    "offers searchable names without converting legacy %s/%s values",
    (categoryId, sectionId, fieldId, label) => {
      const profile = createEmptyProfile();
      profile[categoryId] = [
        {
          id: "legacy-1",
          sectionId,
          values: { [fieldId]: "기존 사용자 원문" },
        },
      ];
      const onUpdateEntry = vi.fn();

      render(
        <ProfileForm
          category={getCategoryDefinition(categoryId)}
          profile={profile}
          onAddEntry={vi.fn()}
          onRemoveEntry={vi.fn()}
          onUpdateEntry={onUpdateEntry}
          onUpdateSingle={vi.fn()}
          confirmDelete={() => true}
        />,
      );

      expect(screen.getByRole("combobox", { name: label })).toHaveValue(
        "기존 사용자 원문",
      );
      expect(onUpdateEntry).not.toHaveBeenCalled();
    },
  );

  it("stores phone numbers as digits only", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "contact",
    )!;
    const profile = createEmptyProfile();
    const onUpdateSingle = vi.fn();

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onUpdateSingle={onUpdateSingle}
        confirmDelete={() => true}
      />,
    );

    const phoneNumber = screen.getByLabelText("연락처");
    expect(phoneNumber).toHaveAttribute("inputmode", "numeric");
    expect(phoneNumber).toHaveAttribute("placeholder", "숫자만 입력해주세요");
    expect(screen.getByLabelText("비상연락처")).toHaveAttribute(
      "placeholder",
      "숫자만 입력해주세요",
    );
    fireEvent.change(phoneNumber, { target: { value: "010-1234 5678" } });

    expect(onUpdateSingle).toHaveBeenCalledWith(
      "contact",
      "phoneNumber",
      "01012345678",
    );

    // Native maxlength would truncate a pasted formatted number before normalization.
    expect(phoneNumber).not.toHaveAttribute("maxlength");
    fireEvent.change(screen.getByLabelText("비상연락처"), {
      target: { value: "010-1234-567890" },
    });
    expect(onUpdateSingle).toHaveBeenCalledWith(
      "contact",
      "emergencyPhoneNumber",
      "01012345678",
    );
  });

  it("uses the full row for long-form thesis details", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "publications",
    )!;
    const profile = createEmptyProfile();
    profile.publications = [
      {
        id: "publication-1",
        sectionId: "publicationPatent",
        values: {},
      },
    ];

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onUpdateSingle={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    expect(screen.getByLabelText("상세설명").closest("label")).toHaveClass(
      styles.fullWidth,
    );
  });

  it("shows major-name fields only when the corresponding major exists", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "education",
    )!;
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "university-1",
        sectionId: "university",
        values: { doubleMajorStatus: "있음", minorStatus: "없음" },
      },
    ];

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onUpdateSingle={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    expect(screen.getByLabelText("복수전공명")).toBeInTheDocument();
    expect(screen.queryByLabelText("부전공명")).not.toBeInTheDocument();
  });

  it("stores a language test name entered as text", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "languages",
    )!;
    const profile = createEmptyProfile();
    const onUpdateEntry = vi.fn();
    profile.languages = [
      {
        id: "language-test-1",
        sectionId: "languageTest",
        values: {},
      },
    ];

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onUpdateSingle={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    const testName = screen.getByLabelText("시험명");
    expect(testName).toHaveAttribute("type", "text");

    fireEvent.change(testName, { target: { value: "TOEIC" } });

    expect(onUpdateEntry).toHaveBeenCalledWith(
      "languages",
      "language-test-1",
      "testName",
      "TOEIC",
    );
  });

  it("stores a language entered as text", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "languages",
    )!;
    const profile = createEmptyProfile();
    const onUpdateEntry = vi.fn();
    profile.languages = [
      {
        id: "language-test-1",
        sectionId: "languageTest",
        values: {},
      },
    ];

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onUpdateSingle={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    const language = screen.getByLabelText("외국어");
    expect(language).toHaveAttribute("type", "text");

    fireEvent.change(language, { target: { value: "영어" } });
    expect(onUpdateEntry).toHaveBeenCalledWith(
      "languages",
      "language-test-1",
      "language",
      "영어",
    );
  });

  it("stores a language grade entered as text", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "languages",
    )!;
    const profile = createEmptyProfile();
    const onUpdateEntry = vi.fn();
    profile.languages = [
      {
        id: "language-test-1",
        sectionId: "languageTest",
        values: { testName: "OPIc" },
      },
    ];

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={onUpdateEntry}
        onUpdateSingle={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    const grade = screen.getByLabelText("등급·점수");
    expect(grade).toHaveAttribute("type", "text");

    fireEvent.change(grade, { target: { value: "AL" } });
    expect(onUpdateEntry).toHaveBeenCalledWith(
      "languages",
      "language-test-1",
      "grade",
      "AL",
    );
  });

  it("shows an existing language test name in a text input", () => {
    const category = PROFILE_CATEGORIES.find(
      (candidate) => candidate.id === "languages",
    )!;
    const profile = createEmptyProfile();
    profile.languages = [
      {
        id: "language-test-1",
        sectionId: "languageTest",
        values: { testName: "OPIc" },
      },
    ];

    render(
      <ProfileForm
        category={category}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onUpdateSingle={vi.fn()}
        confirmDelete={() => true}
      />,
    );

    expect(screen.getByLabelText("시험명")).toHaveValue("OPIc");
  });
});

it("renders a legacy military status as a preserved select option", () => {
  const category = PROFILE_CATEGORIES.find(
    (candidate) => candidate.id === "military",
  )!;
  const profile = createEmptyProfile();
  profile.military = { militaryStatus: "legacy-status" };

  render(
    <ProfileForm
      category={category}
      profile={profile}
      onAddEntry={vi.fn()}
      onRemoveEntry={vi.fn()}
      onUpdateEntry={vi.fn()}
      onUpdateSingle={vi.fn()}
      confirmDelete={() => true}
    />,
  );

  const status = screen.getByLabelText("병역 상태");
  expect(status.tagName).toBe("SELECT");
  expect(status).toHaveValue("legacy-status");
  expect(
    screen.getByRole("option", { name: "기존 값: legacy-status" }),
  ).toBeInTheDocument();
});

describe("ProfileForm name table", () => {
  const NAME_FIELDS = [
    ["국문 성", "koreanFamilyName"],
    ["국문 이름", "koreanGivenName"],
    ["영문 성", "englishFamilyName"],
    ["영문 이름", "englishGivenName"],
    ["한자 성", "hanjaFamilyName"],
    ["한자 이름", "hanjaGivenName"],
  ] as const;

  function renderPersonal(personal: Record<string, string> = {}) {
    const profile = createEmptyProfile();
    profile.personal = personal;
    const onUpdateSingle = vi.fn();
    render(
      <ProfileForm
        category={getCategoryDefinition("personal")}
        profile={profile}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onUpdateEntry={vi.fn()}
        onUpdateSingle={onUpdateSingle}
        confirmDelete={() => true}
      />,
    );
    return onUpdateSingle;
  }

  it("renders the three name pairs as one table with column and row heads", () => {
    renderPersonal();
    const table = screen.getByRole("table", { name: "이름" });

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((head) => head.textContent),
    ).toEqual(["성", "이름"]);
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((head) => head.textContent),
    ).toEqual(["국문", "영문", "한자"]);
    for (const [label] of NAME_FIELDS) {
      expect(within(table).getByRole("textbox", { name: label })).toBeVisible();
    }
  });

  it("keeps keyboard order across each row and no positive tabindex", () => {
    renderPersonal();
    const inputs = within(
      screen.getByRole("table", { name: "이름" }),
    ).getAllByRole("textbox");

    expect(inputs.map((input) => input.getAttribute("aria-label"))).toEqual(
      NAME_FIELDS.map(([label]) => label),
    );
    for (const input of inputs) {
      expect(input).not.toHaveAttribute("tabindex");
    }
  });

  it("shows and saves each name cell through its existing stored field", () => {
    const stored = Object.fromEntries(
      NAME_FIELDS.map(([, fieldId]) => [fieldId, `저장-${fieldId}`]),
    );
    const onUpdateSingle = renderPersonal(stored);

    for (const [label, fieldId] of NAME_FIELDS) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveValue(`저장-${fieldId}`);
      fireEvent.change(input, { target: { value: `새-${fieldId}` } });
      expect(onUpdateSingle).toHaveBeenLastCalledWith(
        "personal",
        fieldId,
        `새-${fieldId}`,
      );
    }
  });

  it("keeps birth date, gender and nationality in one group outside the table", () => {
    renderPersonal();
    const table = screen.getByRole("table", { name: "이름" });
    const details = screen.getByRole("group", { name: "기본 정보" });

    for (const label of ["생년월일", "성별", "국적"]) {
      expect(within(details).getByLabelText(label)).toBeInTheDocument();
      expect(within(table).queryByLabelText(label)).toBeNull();
    }
  });

  it("shows 선택 for an empty gender without a stored-value option", () => {
    renderPersonal();
    const gender = screen.getByLabelText("성별");

    expect(gender).toHaveValue("");
    expect(gender).toHaveDisplayValue("선택");
    expect(
      within(gender).queryByRole("option", { name: /기존 값/ }),
    ).toBeNull();
  });

  it("keeps an unknown stored gender as a preserved option", () => {
    const onUpdateSingle = renderPersonal({ gender: "미지정" });
    const gender = screen.getByLabelText("성별");

    expect(gender).toHaveValue("미지정");
    expect(gender).toHaveDisplayValue("기존 값: 미지정");
    expect(onUpdateSingle).not.toHaveBeenCalled();
  });
});
