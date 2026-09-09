import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROFILE_CATEGORIES } from "../field-definitions";
import { createEmptyProfile } from "../model";
import { ProfileForm } from "./ProfileForm";

describe("ProfileForm conditional fields", () => {
  it("stores phone numbers as digits only", () => {
    const category = PROFILE_CATEGORIES.find((candidate) => candidate.id === "contact")!;
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
    fireEvent.change(phoneNumber, { target: { value: "010-1234 5678" } });

    expect(onUpdateSingle).toHaveBeenCalledWith(
      "contact",
      "phoneNumber",
      "01012345678",
    );
  });

  it("shows major-name fields only when the corresponding major exists", () => {
    const category = PROFILE_CATEGORIES.find((candidate) => candidate.id === "education")!;
    const profile = createEmptyProfile();
    profile.education = [{
      id: "university-1",
      sectionId: "university",
      values: { doubleMajorStatus: "있음", minorStatus: "없음" },
    }];

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

  it("stores standard language test and grade IDs selected from dropdowns", () => {
    const category = PROFILE_CATEGORIES.find((candidate) => candidate.id === "languages")!;
    const profile = createEmptyProfile();
    const onUpdateEntry = vi.fn();
    profile.languages = [{
      id: "language-test-1",
      sectionId: "languageTest",
      values: {},
    }];

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
    expect(testName.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "OPIc" })).toBeInTheDocument();

    fireEvent.change(testName, { target: { value: "opic" } });

    expect(onUpdateEntry).toHaveBeenCalledWith(
      "languages",
      "language-test-1",
      "testName",
      "opic",
    );
    expect(screen.queryByRole("option", { name: "Advanced Low" })).not.toBeInTheDocument();
  });

  it("offers OPIc levels after an OPIc profile value is selected", () => {
    const category = PROFILE_CATEGORIES.find((candidate) => candidate.id === "languages")!;
    const profile = createEmptyProfile();
    const onUpdateEntry = vi.fn();
    profile.languages = [{
      id: "language-test-1",
      sectionId: "languageTest",
      values: { testName: "opic" },
    }];

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
    expect(grade.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Advanced Low" })).toHaveValue("opic:al");

    fireEvent.change(grade, { target: { value: "opic:al" } });
    expect(onUpdateEntry).toHaveBeenCalledWith(
      "languages",
      "language-test-1",
      "grade",
      "opic:al",
    );
  });

  it("keeps a legacy select value visible until the user changes it", () => {
    const category = PROFILE_CATEGORIES.find((candidate) => candidate.id === "languages")!;
    const profile = createEmptyProfile();
    profile.languages = [{
      id: "language-test-1",
      sectionId: "languageTest",
      values: { testName: "OPIc" },
    }];

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

    expect(screen.getByRole("option", { name: "기존 값: OPIc" })).toHaveValue("OPIc");
  });
});
