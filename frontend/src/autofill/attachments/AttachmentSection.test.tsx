import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttachmentStore } from "../../attachments/model";
import { createEmptyProfile, type Profile } from "../../profile/model";
import { AttachmentSection } from "./AttachmentSection";

afterEach(() => document.body.replaceChildren());

const RESUME = {
  name: "synthetic-resume.pdf",
  type: "application/pdf",
  size: 2048,
  updatedAt: "2026-11-16T09:00:00.000Z",
};

function createStore(
  overrides: Partial<AttachmentStore> = {},
): AttachmentStore {
  return {
    list: vi.fn(async () => ({ resume: RESUME })),
    save: vi.fn(),
    remove: vi.fn(),
    pruneEvidence: vi.fn(),
    loadLinks: vi.fn(async () => ({})),
    saveLink: vi.fn(),
    removeLink: vi.fn(),
    loadFile: vi.fn(
      async () => new File(["%PDF"], RESUME.name, { type: "application/pdf" }),
    ),
    ...overrides,
  };
}

function renderSection(
  store: AttachmentStore,
  attach: Parameters<typeof AttachmentSection>[0]["attach"] = vi.fn(),
  profile?: Profile,
) {
  const host = document.createElement("div");
  document.body.append(host);
  render(
    <AttachmentSection
      pageDocument={document}
      store={store}
      attach={attach}
      profile={profile}
    />,
    {
      container: host,
    },
  );
  return attach;
}

describe("AttachmentSection", () => {
  it("renders nothing when the page has no file field", () => {
    document.body.innerHTML = `<label>이름<input></label>`;
    const store = createStore();
    renderSection(store);

    expect(screen.queryByRole("region", { name: "첨부 파일" })).toBeNull();
    expect(store.list).not.toHaveBeenCalled();
  });

  it("attaches confirmed fields silently and lists only fields that need the user", async () => {
    document.body.innerHTML = `
      <label for="r">이력서 첨부</label><input id="r" type="file">
      <label for="p">포트폴리오</label><input id="p" type="file">
      <label for="x">기타 첨부</label><input id="x" type="file">`;
    const attach = vi.fn((_input: HTMLInputElement, _file: File) => ({
      status: "attached" as const,
    }));
    const store = createStore();
    renderSection(store, attach);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    expect(attach.mock.calls[0]?.[0]).toBe(document.getElementById("r"));
    expect(store.loadFile).toHaveBeenCalledWith("resume");
    const section = await screen.findByRole("region", { name: "첨부 파일" });
    expect(
      within(section).getByText(
        "입력 불가: 첨부할 파일 종류를 확인할 수 없어요.",
      ),
    ).toBeVisible();
    expect(within(section).queryByText(/첨부했어요/)).toBeNull();
    expect(within(section).queryByText(/이력서 첨부/)).toBeNull();
    expect(within(section).queryByText(/포트폴리오/)).toBeNull();
  });

  it("shows nothing when every field was attached", async () => {
    document.body.innerHTML = `<label for="r">이력서</label><input id="r" type="file">`;
    const attach = vi.fn((_input: HTMLInputElement, _file: File) => ({
      status: "attached" as const,
    }));
    renderSection(createStore(), attach);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "첨부 파일" })).toBeNull();
  });

  it("shows the reason when the field changed before attaching", async () => {
    document.body.innerHTML = `<label for="r">이력서</label><input id="r" type="file">`;
    renderSection(
      createStore(),
      vi.fn(() => ({
        status: "blocked" as const,
        reason: "이미 파일이 첨부된 칸이에요.",
      })),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "이력서에 이력서·경력기술서 첨부",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미 파일이 첨부된 칸이에요.",
    );
  });

  it("does not attach when the stored file cannot be read", async () => {
    document.body.innerHTML = `<label for="r">이력서</label><input id="r" type="file">`;
    const attach = renderSection(
      createStore({ loadFile: vi.fn(async () => undefined) }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "이력서에 이력서·경력기술서 첨부",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "프로필 파일을 읽지 못했어요.",
    );
    expect(attach).not.toHaveBeenCalled();
  });

  it("blocks a field whose accept does not take the stored file type", async () => {
    document.body.innerHTML = `<label for="ph">증명사진</label><input id="ph" type="file" accept=".jpg">`;
    const photo = {
      name: "synthetic-photo.png",
      type: "image/png",
      size: 900,
      updatedAt: RESUME.updatedAt,
    };
    renderSection(createStore({ list: vi.fn(async () => ({ photo })) }));

    expect(
      await screen.findByText("입력 불가: PNG 파일을 받지 않는 칸이에요."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "증명사진에 증명사진 첨부" }),
    ).toBeDisabled();
  });

  it("attaches the evidence entry named near the field automatically", async () => {
    document.body.innerHTML = `<div><span>자격증</span><span>정보처리기사</span>
      <label for="ev">증빙 첨부</label><input id="ev" type="file"></div>`;
    const profile = createEmptyProfile();
    profile.certifications = [
      {
        id: "cert-1",
        sectionId: "certificate",
        values: { name: "정보처리기사" },
      },
      {
        id: "cert-2",
        sectionId: "certificate",
        values: { name: "컴퓨터활용능력" },
      },
    ];
    profile.languages = [
      {
        id: "lang-1",
        sectionId: "languageTest",
        values: { testName: "TOEIC", grade: "900" },
      },
    ];
    const meta = (name: string) => ({
      name,
      type: "application/pdf",
      size: 100,
      updatedAt: RESUME.updatedAt,
    });
    const list = vi.fn(async () => ({
      "evidence:cert-1": meta("synthetic-cert.pdf"),
      "evidence:lang-1": meta("synthetic-score.pdf"),
    }));
    const store = createStore({ list });
    const attach = vi.fn((_input: HTMLInputElement, _file: File) => ({
      status: "attached" as const,
    }));
    renderSection(store, attach, profile);

    await waitFor(() =>
      expect(store.loadFile).toHaveBeenCalledWith("evidence:cert-1"),
    );
    expect(list).toHaveBeenCalledWith(["lang-1", "cert-1", "cert-2"]);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "첨부 파일" })).toBeNull();
  });

  it("waits for a choice when no evidence is named near the field", async () => {
    document.body.innerHTML = `<label for="ev">어학 성적 증빙</label><input id="ev" type="file">`;
    const profile = createEmptyProfile();
    profile.languages = [
      {
        id: "lang-1",
        sectionId: "languageTest",
        values: { testName: "TOEIC" },
      },
    ];
    const store = createStore({
      list: vi.fn(async () => ({
        "evidence:lang-1": { ...RESUME, name: "synthetic-score.pdf" },
      })),
    });
    const attach = vi.fn((_input: HTMLInputElement, _file: File) => ({
      status: "attached" as const,
    }));
    renderSection(store, attach, profile);

    expect(await screen.findByText("첨부할 증빙을 골라 주세요.")).toBeVisible();
    const button = screen.getByRole("button", {
      name: "어학 성적 증빙에 증빙 서류 첨부",
    });
    expect(button).toBeDisabled();
    expect(attach).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox", { name: "첨부할 증빙" }), {
      target: { value: "lang-1" },
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(store.loadFile).toHaveBeenCalledWith("evidence:lang-1"),
    );
    expect(attach).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "첨부 파일" })).toBeNull(),
    );
  });

  describe("links", () => {
    const item = `<ul><li><div>포트폴리오</div>
      <div><label for="f">첨부파일추가</label><input id="f" type="file" accept="application/pdf"></div>
      <div><input id="u" placeholder="https://example.test" type="text"><button type="button">URL추가</button></div>
    </li></ul>`;
    const link = "https://portfolio.example.test";

    it("attaches the file and leaves the URL box empty when a file exists", async () => {
      document.body.innerHTML = item;
      const attach = vi.fn((_input: HTMLInputElement, _file: File) => ({
        status: "attached" as const,
      }));
      const fill = vi.fn();
      const portfolio = { ...RESUME, name: "synthetic-portfolio.pdf" };
      const host = document.createElement("div");
      document.body.append(host);
      render(
        <AttachmentSection
          pageDocument={document}
          store={createStore({
            list: vi.fn(async () => ({ portfolio })),
            loadLinks: vi.fn(async () => ({ portfolio: link })),
          })}
          attach={attach}
          fill={fill}
        />,
        { container: host },
      );

      await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
      expect(fill).not.toHaveBeenCalled();
    });

    it("types the link when no file is stored and tells the user to press URL 추가", async () => {
      document.body.innerHTML = item;
      const attach = vi.fn();
      const fill = vi.fn((_input: HTMLInputElement, _url: string) => ({
        status: "filled" as const,
      }));
      const host = document.createElement("div");
      document.body.append(host);
      render(
        <AttachmentSection
          pageDocument={document}
          store={createStore({
            list: vi.fn(async () => ({})),
            loadLinks: vi.fn(async () => ({ portfolio: link })),
          })}
          attach={attach}
          fill={fill}
        />,
        { container: host },
      );

      expect(await screen.findByRole("status")).toHaveTextContent(
        "등록한 파일이 없어 링크를 입력했어요.",
      );
      expect(fill).toHaveBeenCalledWith(document.getElementById("u"), link);
      expect(attach).not.toHaveBeenCalled();
    });

    it("uses the link when the field does not take the stored file type", async () => {
      document.body.innerHTML = item.replace("application/pdf", ".docx");
      const fill = vi.fn((_input: HTMLInputElement, _url: string) => ({
        status: "filled" as const,
      }));
      const host = document.createElement("div");
      document.body.append(host);
      render(
        <AttachmentSection
          pageDocument={document}
          store={createStore({
            list: vi.fn(async () => ({ portfolio: RESUME })),
            loadLinks: vi.fn(async () => ({ portfolio: link })),
          })}
          attach={vi.fn()}
          fill={fill}
        />,
        { container: host },
      );

      await waitFor(() => expect(fill).toHaveBeenCalledTimes(1));
    });
  });

  it("follows a field the site re-rendered before attaching", async () => {
    document.body.innerHTML = `<div id="area"><label for="r">이력서</label><input id="r" type="file"></div>`;
    const attach = vi.fn((_input: HTMLInputElement, _file: File) => ({
      status: "attached" as const,
    }));
    const store = createStore({
      loadFile: vi.fn(async () => {
        document.getElementById("area")!.innerHTML =
          `<label for="r2">이력서</label><input id="r2" type="file">`;
        return new File(["%PDF"], RESUME.name, { type: "application/pdf" });
      }),
    });
    renderSection(store, attach);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    expect(attach.mock.calls[0]?.[0]).toBe(document.getElementById("r2"));
  });
});
