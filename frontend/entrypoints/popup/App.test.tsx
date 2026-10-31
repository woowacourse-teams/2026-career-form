import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PROFILE_CATEGORIES } from "../../src/profile/field-definitions";
import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { App } from "./App";

const CATEGORY_COUNT = PROFILE_CATEGORIES.length;

function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "화면에 보이면 안 되는 값";
  profile.contact.email = "hidden@example.com";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

function completeRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  for (const category of PROFILE_CATEGORIES) {
    const section = category.sections[0];
    const field = section.fields.find(
      (candidate) => !["select", "date"].includes(candidate.inputType),
    );
    if (!field) throw new Error(`No text field in ${category.id}`);
    const values = { [field.id]: "비식별 값" };
    const categoryValues = profile[category.id];
    if (Array.isArray(categoryValues)) {
      categoryValues.push({
        id: `${category.id}-1`,
        sectionId: section.id,
        values,
      });
    } else {
      Object.assign(categoryValues, values);
    }
  }
  return { ...createRepository(), load: vi.fn(async () => profile) };
}

describe("popup App", () => {
  it("shows readiness without exposing profile values", async () => {
    render(
      <App
        repository={createRepository()}
        navigation={{ openOptions: vi.fn(), openInPageProfilePanel: vi.fn() }}
      />,
    );

    expect(
      await screen.findByText(`${CATEGORY_COUNT}개 범주 중 2개 준비됨`),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("화면에 보이면 안 되는 값"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("hidden@example.com")).not.toBeInTheDocument();
  });

  it("opens profile management and the in-page panel from explicit buttons", async () => {
    const navigation = {
      openOptions: vi.fn(async () => undefined),
      openInPageProfilePanel: vi.fn(async () => undefined),
    };
    const closePopup = vi.fn();
    render(
      <App
        repository={createRepository()}
        navigation={navigation}
        closePopup={closePopup}
      />,
    );
    await screen.findByText(`${CATEGORY_COUNT}개 범주 중 2개 준비됨`);

    fireEvent.click(screen.getByRole("button", { name: "지원서 패널 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));

    expect(navigation.openInPageProfilePanel).toHaveBeenCalledOnce();
    expect(navigation.openOptions).toHaveBeenCalledOnce();
    await waitFor(() => expect(closePopup).toHaveBeenCalledTimes(2));
  });

  it("does not present a load failure as an empty profile", async () => {
    const repository = createRepository();
    repository.load = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    render(
      <App
        repository={repository}
        navigation={{ openOptions: vi.fn(), openInPageProfilePanel: vi.fn() }}
      />,
    );

    expect(await screen.findByText("준비 상태 확인 실패")).toBeInTheDocument();
    expect(
      screen.queryByText(`${CATEGORY_COUNT}개 범주 중 0개 준비됨`),
    ).not.toBeInTheDocument();
  });

  it("fills the progress bar to the actual range when every category is ready", async () => {
    const { container } = render(
      <App
        repository={completeRepository()}
        navigation={{ openOptions: vi.fn(), openInPageProfilePanel: vi.fn() }}
      />,
    );

    expect(
      await screen.findByText(
        `${CATEGORY_COUNT}개 범주 중 ${CATEGORY_COUNT}개 준비됨`,
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden] > span[style]")).toHaveStyle({
      width: "100%",
    });
  });
});
