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

const related = {
  grade: "1급",
  registrationNo: "DEMO-CERTIFICATE-1",
  acquisitionDate: "2025-02-03",
};

function Editor({ repository }: { repository: ProfileRepository }) {
  const editor = useProfileEditor(repository);
  return (
    <>
      <ProfileForm
        category={getCategoryDefinition("certifications")}
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

async function setup(values: Record<string, string>) {
  const profile: Profile = {
    ...createEmptyProfile(),
    certifications: [{ id: "certificate-1", sectionId: "certificate", values }],
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
}

function exportedCertificate() {
  return parseProfileImport(screen.getByTestId("profile").textContent ?? "")
    .certifications[0];
}

function chooseFirstResult(query: string) {
  const input = screen.getByRole("combobox", { name: "자격증명" });
  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  return input;
}

it("fills the blank issuer when a certificate is chosen from the catalog", async () => {
  await setup({ ...related });

  const input = chooseFirstResult("SQLD");

  expect(input).toHaveValue("SQL 개발자");
  expect(screen.getByLabelText("발급기관")).toHaveValue("한국데이터산업진흥원");
  expect(exportedCertificate()).toMatchObject({
    values: { ...related, name: "SQL 개발자", issuer: "한국데이터산업진흥원" },
    identity: { status: "selected", catalogId: "certificate:kdata:sqld" },
  });
});

it("does not overwrite an issuer the user already entered", async () => {
  await setup({ ...related, issuer: "사용자 기관" });

  chooseFirstResult("SQLD");

  expect(screen.getByLabelText("발급기관")).toHaveValue("사용자 기관");
  expect(exportedCertificate()).toMatchObject({
    values: { ...related, name: "SQL 개발자", issuer: "사용자 기관" },
    identity: { status: "selected", catalogId: "certificate:kdata:sqld" },
  });
});

it("does not fill the issuer for direct input", async () => {
  await setup({});
  const input = screen.getByRole("combobox", { name: "자격증명" });
  fireEvent.change(input, { target: { value: "사내 인증" } });
  fireEvent.click(screen.getByRole("option", { name: /직접 입력/ }));

  expect(screen.getByLabelText("발급기관")).toHaveValue("");
  expect(exportedCertificate()).toMatchObject({
    values: { name: "사내 인증" },
    identity: { status: "manual", originalText: "사내 인증" },
  });
  expect(exportedCertificate().values).not.toHaveProperty("issuer");
});
