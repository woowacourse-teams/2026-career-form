import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { expect, it, vi, type Mock } from "vitest";
import { CATALOG_VERSION } from "../catalog";
import { getCategoryDefinition } from "../field-definitions";
import { useProfileEditor } from "../hooks/use-profile-editor";
import {
  createEmptyProfile,
  type Profile,
  type ProfileIdentity,
} from "../model";
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

type SaveMock = Mock<ProfileRepository["save"]>;

function Editor({
  repository,
  saveDelay,
}: {
  repository: ProfileRepository;
  saveDelay?: number;
}) {
  const editor = useProfileEditor(repository, saveDelay);
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

async function setup(
  values: Record<string, string>,
  {
    identity,
    saveDelay,
  }: { identity?: ProfileIdentity; saveDelay?: number } = {},
) {
  const profile: Profile = {
    ...createEmptyProfile(),
    certifications: [
      {
        id: "certificate-1",
        sectionId: "certificate",
        values,
        ...(identity ? { identity } : {}),
      },
    ],
  };
  const save: SaveMock = vi.fn(async () => undefined);
  const repository: ProfileRepository = {
    load: async () => profile,
    save,
    loadLayout: async () => "a",
    saveLayout: async () => undefined,
  };
  // The options page renders the editor in StrictMode, where React calls each
  // state updater twice. Render the same way so an impure updater fails here.
  await act(async () => {
    render(
      <StrictMode>
        <Editor repository={repository} saveDelay={saveDelay} />
      </StrictMode>,
    );
  });
  return save;
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

/** Opens the results for the current name and clicks one without retyping. */
function chooseListedResult(name: RegExp) {
  const input = screen.getByRole("combobox", { name: "자격증명" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name }));
}

/** Checks the screen, the rendered profile and the last saved profile. */
async function expectCertificate(
  save: SaveMock,
  values: { name: string; issuer: string },
) {
  expect(screen.getByRole("combobox", { name: "자격증명" })).toHaveValue(
    values.name,
  );
  expect(screen.getByLabelText("발급기관")).toHaveValue(values.issuer);
  expect(exportedCertificate().values).toMatchObject(values);
  // In StrictMode React can keep one updater result and save the other.
  await waitFor(() =>
    expect(save.mock.lastCall?.[0].certifications[0].values).toMatchObject(
      values,
    ),
  );
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

it("replaces an issuer the user already entered with the canonical catalog issuer", async () => {
  await setup({ ...related, issuer: "사용자 기관" });

  chooseFirstResult("SQLD");

  expect(screen.getByLabelText("발급기관")).toHaveValue("한국데이터산업진흥원");
  expect(exportedCertificate()).toMatchObject({
    values: { ...related, name: "SQL 개발자", issuer: "한국데이터산업진흥원" },
    identity: { status: "selected", catalogId: "certificate:kdata:sqld" },
  });
});

it("locks the issuer to the catalog name with a hint while a certificate is selected", async () => {
  await setup({ ...related });
  expect(screen.getByLabelText("발급기관")).not.toHaveAttribute("readonly");
  expect(screen.queryByText("카탈로그")).not.toBeInTheDocument();

  chooseFirstResult("SQLD");
  const issuer = screen.getByLabelText("발급기관");
  fireEvent.change(issuer, { target: { value: "사용자 기관" } });

  expect(issuer).toHaveAttribute("readonly");
  expect(issuer).toHaveValue("한국데이터산업진흥원");
  expect(screen.getByText("카탈로그")).toBeInTheDocument();
  expect(exportedCertificate().values.issuer).toBe("한국데이터산업진흥원");
});

it("shows the canonical catalog issuer for a saved selection without rewriting the stored text", async () => {
  await setup(
    { name: "SQL 개발자", issuer: "(재)한국데이터산업진흥원" },
    {
      identity: {
        status: "selected",
        catalogId: "certificate:kdata:sqld",
        displayName: "SQL 개발자",
        originalText: "SQLD",
        catalogVersion: CATALOG_VERSION,
      },
    },
  );

  expect(screen.getByLabelText("발급기관")).toHaveValue("한국데이터산업진흥원");
  expect(screen.getByLabelText("발급기관")).toHaveAttribute("readonly");
  expect(exportedCertificate().values.issuer).toBe("(재)한국데이터산업진흥원");
});

it("unlocks the issuer and keeps its value when the name is edited", async () => {
  await setup({ ...related });
  const input = chooseFirstResult("SQLD");

  fireEvent.change(input, { target: { value: "SQL" } });
  const issuer = screen.getByLabelText("발급기관");

  expect(issuer).not.toHaveAttribute("readonly");
  expect(issuer).toHaveValue("한국데이터산업진흥원");
  expect(screen.queryByText("카탈로그")).not.toBeInTheDocument();
  fireEvent.change(issuer, { target: { value: "사용자 기관" } });
  expect(issuer).toHaveValue("사용자 기관");
});

it("unlocks the issuer and keeps its value when direct input is chosen", async () => {
  await setup({ ...related });
  const input = chooseFirstResult("SQLD");
  fireEvent.change(input, { target: { value: "SQL" } });
  fireEvent.click(screen.getByRole("option", { name: /직접 입력/ }));
  const issuer = screen.getByLabelText("발급기관");

  expect(issuer).not.toHaveAttribute("readonly");
  expect(issuer).toHaveValue("한국데이터산업진흥원");
  expect(exportedCertificate().identity).toMatchObject({ status: "manual" });
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

it("replaces the filled issuer each time another certificate is chosen", async () => {
  const save = await setup({ ...related }, { saveDelay: 0 });
  chooseFirstResult("SQLD");

  chooseFirstResult("정보처리기사");

  expect(screen.getByLabelText("발급기관")).toHaveValue("한국산업인력공단");
  expect(exportedCertificate()).toMatchObject({
    values: related,
    identity: {
      status: "selected",
      catalogId: "certificate:hrdk:e91f006b5973e103",
    },
  });

  chooseFirstResult("한국사");

  await expectCertificate(save, {
    name: "한국사능력검정시험",
    issuer: "국사편찬위원회",
  });
  expect(exportedCertificate().values).toMatchObject(related);
});

it("replaces the filled issuer after the name is cleared", async () => {
  const save = await setup({}, { saveDelay: 0 });
  const input = chooseFirstResult("SQLD");

  fireEvent.click(screen.getByRole("button", { name: "이름 지우기" }));
  expect(screen.getByLabelText("발급기관")).toHaveValue("한국데이터산업진흥원");
  fireEvent.change(input, { target: { value: "정보처리기사" } });
  fireEvent.click(screen.getByRole("option", { name: /^정보처리기사/ }));

  await expectCertificate(save, {
    name: "정보처리기사",
    issuer: "한국산업인력공단",
  });
});

it("replaces the filled issuer when another listed result is chosen without retyping", async () => {
  const save = await setup({}, { saveDelay: 0 });
  chooseFirstResult("감정사");
  expect(screen.getByLabelText("발급기관")).toHaveValue("한국산업인력공단");

  chooseListedResult(/^도로교통사고감정사/);

  await expectCertificate(save, {
    name: "도로교통사고감정사",
    issuer: "도로교통공단",
  });
});

it("replaces the filled issuer after the name is kept as direct input", async () => {
  const save = await setup({}, { saveDelay: 0 });
  const input = chooseFirstResult("SQLD");
  fireEvent.change(input, { target: { value: "SQL" } });
  fireEvent.click(screen.getByRole("option", { name: /직접 입력/ }));
  expect(screen.getByLabelText("발급기관")).toHaveValue("한국데이터산업진흥원");

  chooseFirstResult("정보처리기사");

  await expectCertificate(save, {
    name: "정보처리기사",
    issuer: "한국산업인력공단",
  });
});

it("replaces the filled issuer after another field is edited", async () => {
  const save = await setup({}, { saveDelay: 0 });
  chooseFirstResult("SQLD");
  fireEvent.change(screen.getByLabelText("등급"), {
    target: { value: "1급" },
  });

  chooseFirstResult("정보처리기사");

  await expectCertificate(save, {
    name: "정보처리기사",
    issuer: "한국산업인력공단",
  });
  expect(exportedCertificate().values).toMatchObject({ grade: "1급" });
});

it("replaces an issuer edited after the link was released when another certificate is chosen", async () => {
  const save = await setup({}, { saveDelay: 0 });
  const input = chooseFirstResult("SQLD");
  fireEvent.change(input, { target: { value: "SQL" } });
  fireEvent.change(screen.getByLabelText("발급기관"), {
    target: { value: "사용자 기관" },
  });

  chooseFirstResult("정보처리기사");

  await expectCertificate(save, {
    name: "정보처리기사",
    issuer: "한국산업인력공단",
  });
});

it("sets the canonical issuer on every selection even when a matching issuer was typed first", async () => {
  const save = await setup(
    { issuer: "한국데이터산업진흥원" },
    { saveDelay: 0 },
  );
  chooseFirstResult("SQLD");

  chooseFirstResult("정보처리기사");

  await expectCertificate(save, {
    name: "정보처리기사",
    issuer: "한국산업인력공단",
  });
});

it("replaces a saved issuer with the canonical one when another certificate is chosen", async () => {
  const save = await setup(
    { name: "SQL 개발자", issuer: "한국데이터산업진흥원" },
    {
      identity: {
        status: "selected",
        catalogId: "certificate:kdata:sqld",
        displayName: "SQL 개발자",
        originalText: "SQLD",
        catalogVersion: CATALOG_VERSION,
      },
      saveDelay: 0,
    },
  );
  expect(screen.getByText(/목록에서 선택됨/)).toBeInTheDocument();

  chooseFirstResult("정보처리기사");

  await expectCertificate(save, {
    name: "정보처리기사",
    issuer: "한국산업인력공단",
  });
});
