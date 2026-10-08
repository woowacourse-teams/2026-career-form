import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { getCategoryDefinition } from "../field-definitions";
import { useProfileEditor } from "../hooks/use-profile-editor";
import { createEmptyProfile, type Profile } from "../model";
import type { ProfileRepository } from "../profile-repository";
import {
  parseProfileImport,
  serializeProfileExport,
} from "../profile-transfer";
import { ProfileForm } from "./ProfileForm";

const selection = {
  status: "selected",
  catalogId: "languageTest:opic",
  displayName: "OPIc",
  originalText: "오픽",
  catalogVersion: "2026-10-07",
} as const;
const related = {
  language: "영어",
  grade: "IH",
  registrationNo: "DEMO-LANGUAGE-1",
  acquisitionDate: "2025-02-03",
};

function Editor({ repository }: { repository: ProfileRepository }) {
  const editor = useProfileEditor(repository);
  return (
    <>
      <ProfileForm
        category={getCategoryDefinition("languages")}
        profile={editor.profile}
        onAddEntry={editor.addEntry}
        onRemoveEntry={editor.removeEntry}
        onUpdateEntry={editor.updateEntry}
        onUpdateSingle={editor.updateSingle}
        confirmDelete={() => true}
      />
      <output data-testid="profile">
        {serializeProfileExport(editor.profile)}
      </output>
    </>
  );
}

async function setup(selected = false) {
  const profile: Profile = {
    ...createEmptyProfile(),
    languages: [
      {
        id: "language-1",
        sectionId: "languageTest",
        values: { ...related, testName: selected ? "OPIc" : "기존 시험명" },
        ...(selected ? { identity: selection } : {}),
      },
      {
        id: "language-2",
        sectionId: "languageTest",
        values: { testName: "TOEIC", grade: "900" },
      },
    ],
  };
  const repository: ProfileRepository = {
    load: async () => profile,
    save: async () => undefined,
    loadLayout: async () => "a",
    saveLayout: async () => undefined,
  };
  await act(async () => {
    render(<Editor repository={repository} />);
  });
  return profile;
}

function exportedProfile() {
  return parseProfileImport(screen.getByTestId("profile").textContent ?? "");
}

it("preserves legacy names and finds a language exam by its approved alias", async () => {
  const original = await setup();
  const input = screen.getAllByRole("combobox", { name: "시험명" })[0];
  expect(input).toHaveValue("기존 시험명");
  fireEvent.change(input, { target: { value: "오픽" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(input).toHaveValue("OPIc");
  expect(exportedProfile().languages).toEqual([
    {
      ...original.languages[0],
      values: { ...related, testName: "OPIc" },
      identity: selection,
    },
    original.languages[1],
  ]);
});

it("keeps an unknown language exam as manual text without changing other values", async () => {
  await setup();
  const input = screen.getAllByRole("combobox", { name: "시험명" })[0];
  fireEvent.change(input, { target: { value: "사내 어학 인증" } });
  fireEvent.click(screen.getByRole("option", { name: /직접 입력/ }));

  expect(exportedProfile().languages[0]).toMatchObject({
    values: { ...related, testName: "사내 어학 인증" },
    identity: { status: "manual", originalText: "사내 어학 인증" },
  });
});

it("removes the selected exam identity when its name is edited", async () => {
  await setup(true);
  fireEvent.change(screen.getAllByLabelText("시험명")[0], {
    target: { value: "별도 시험" },
  });

  expect(exportedProfile().languages[0]).toMatchObject({
    values: { ...related, testName: "별도 시험" },
    identity: { status: "manual", originalText: "별도 시험" },
  });
});

it("retains the selected exam identity when only its grade is edited", async () => {
  await setup(true);
  fireEvent.change(screen.getAllByLabelText("등급·점수")[0], {
    target: { value: "AL" },
  });

  expect(exportedProfile().languages[0]).toMatchObject({
    values: { ...related, testName: "OPIc", grade: "AL" },
    identity: selection,
  });
});
