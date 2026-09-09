import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROFILE_CATEGORIES } from "../field-definitions";
import { createEmptyProfile } from "../model";
import { ProfileForm } from "./ProfileForm";

describe("ProfileForm conditional fields", () => {
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

  it("selects a standard language test from the dropdown", () => {
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

    fireEvent.change(testName, { target: { value: "OPIc" } });

    expect(onUpdateEntry).toHaveBeenCalledWith(
      "languages",
      "language-test-1",
      "testName",
      "OPIc",
    );
  });
});
