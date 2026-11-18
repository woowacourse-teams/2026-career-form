import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({ browser: {} }));

import { ChromeAttachmentStorage } from "../../src/attachments/attachment-storage";
import { createEmptyProfile } from "../../src/profile/model";
import type { ProfileRepository } from "../../src/profile/profile-repository";
import { PROFILE_STORAGE_KEY } from "../../src/storage/chrome-profile-storage";
import {
  attachmentDataKey,
  EVIDENCE_INDEX_KEY,
} from "../../src/attachments/attachment-storage";
import { App } from "./App";
import { AttachmentManager } from "./AttachmentManager";

function memoryArea(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...initial };
  const keysOf = (keys: string | string[]) =>
    Array.isArray(keys) ? keys : [keys];
  return {
    values,
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        keysOf(keys)
          .filter((key) => key in values)
          .map((key) => [key, values[key]]),
      ),
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of keysOf(keys)) delete values[key];
    }),
  };
}

const NOW = () => new Date("2026-11-16T03:00:00.000Z");

function choose(label: string, file: File) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

function pdf(name: string, contents = "%PDF-1.4 synthetic") {
  return new File([contents], name, { type: "application/pdf" });
}

function createRepository(): ProfileRepository {
  return {
    load: vi.fn(async () => createEmptyProfile()),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("AttachmentManager", () => {
  it("registers, replaces and deletes each kind and keeps it across reopen", async () => {
    const profileEnvelope = { schemaVersion: 1, profile: {} };
    const area = memoryArea({ [PROFILE_STORAGE_KEY]: profileEnvelope });
    const confirmDelete = vi.fn(() => true);
    const view = render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={confirmDelete}
      />,
    );

    expect(await screen.findAllByText("등록된 파일이 없어요.")).toHaveLength(3);
    choose("이력서·경력기술서 파일", pdf("synthetic-resume.pdf"));
    expect(await screen.findByText("synthetic-resume.pdf")).toBeVisible();
    expect(screen.getByText(/18B · 2026\. 11\. 16\. 등록/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "이력서·경력기술서 파일을 등록했어요.",
    );

    choose("포트폴리오 파일", pdf("synthetic-portfolio.pdf"));
    expect(await screen.findByText("synthetic-portfolio.pdf")).toBeVisible();

    choose("이력서·경력기술서 파일", pdf("synthetic-resume-v2.pdf"));
    expect(await screen.findByText("synthetic-resume-v2.pdf")).toBeVisible();
    expect(screen.queryByText("synthetic-resume.pdf")).toBeNull();
    expect(area.values[PROFILE_STORAGE_KEY]).toBe(profileEnvelope);

    view.unmount();
    render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={confirmDelete}
      />,
    );
    expect(await screen.findByText("synthetic-resume-v2.pdf")).toBeVisible();
    expect(screen.getByText("synthetic-portfolio.pdf")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "이력서·경력기술서 삭제" }),
    );
    expect(confirmDelete).toHaveBeenCalledWith(
      "등록한 이력서·경력기술서 파일을 삭제할까요?",
    );
    expect(
      await screen.findByText("이력서·경력기술서 파일을 삭제했어요."),
    ).toBeVisible();
    expect(screen.queryByText("synthetic-resume-v2.pdf")).toBeNull();
    expect(screen.getByText("synthetic-portfolio.pdf")).toBeVisible();
    expect(area.values[PROFILE_STORAGE_KEY]).toBe(profileEnvelope);
  });

  it("keeps the file when deletion is not confirmed", async () => {
    const area = memoryArea();
    const store = new ChromeAttachmentStorage(area, NOW);
    await store.save("resume", pdf("synthetic-resume.pdf"));
    render(<AttachmentManager store={store} confirmDelete={() => false} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "이력서·경력기술서 삭제" }),
    );

    expect(screen.getByText("synthetic-resume.pdf")).toBeVisible();
    expect(area.remove).not.toHaveBeenCalled();
  });

  it.each([
    [
      new File(["text"], "notes.txt", { type: "text/plain" }),
      "PDF 파일만 등록할 수 있어요.",
    ],
    [
      new File([], "empty.pdf", { type: "application/pdf" }),
      "빈 파일은 등록할 수 없어요.",
    ],
  ])("shows why an invalid file was not registered", async (file, reason) => {
    const area = memoryArea();
    render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={() => true}
      />,
    );
    await screen.findAllByText("등록된 파일이 없어요.");

    choose("이력서·경력기술서 파일", file);

    expect(await screen.findByRole("alert")).toHaveTextContent(reason);
    expect(area.set).not.toHaveBeenCalled();
  });

  it("shows the size limit reason", async () => {
    const area = memoryArea();
    render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={() => true}
      />,
    );
    await screen.findAllByText("등록된 파일이 없어요.");
    const large = pdf("large.pdf");
    Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });

    choose("포트폴리오 파일", large);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "20MB 이하 파일만 등록할 수 있어요.",
    );
    expect(area.set).not.toHaveBeenCalled();
  });

  it("reports a storage failure without changing the list", async () => {
    const area = memoryArea();
    area.set.mockRejectedValueOnce(new Error("QUOTA_BYTES"));
    render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={() => true}
      />,
    );
    await screen.findAllByText("등록된 파일이 없어요.");

    choose("이력서·경력기술서 파일", pdf("synthetic-resume.pdf"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "파일을 저장하지 못했어요.",
    );
    expect(screen.getAllByText("등록된 파일이 없어요.")).toHaveLength(3);
  });
});

describe("options App attachments", () => {
  it("shows the attachment section and says exports exclude attachments", async () => {
    const download = vi.fn();
    render(
      <App
        repository={createRepository()}
        attachmentStore={new ChromeAttachmentStorage(memoryArea(), NOW)}
        downloadProfile={download}
      />,
    );

    await screen.findByRole("heading", { name: "프로필 관리" });
    expect(screen.queryByText("이력서·경력기술서 등록")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "첨부 파일" }));
    const section = await screen.findByRole("region", { name: "첨부 파일" });
    expect(
      within(section).getByRole("button", { name: "이력서·경력기술서 등록" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));

    expect(download).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(download.mock.calls[0])).not.toMatch(
      /attachment|pdf/i,
    );
    expect(
      screen.getByText(/첨부 파일은 내보내기에 포함되지 않습니다/),
    ).toBeVisible();
  });

  it("keeps the memo and adds an evidence file under each certificate entry", async () => {
    const profile = createEmptyProfile();
    profile.certifications = [
      {
        id: "cert-1",
        sectionId: "certificate",
        values: { name: "합성 자격증", evidenceDocumentPath: "합성 메모" },
      },
    ];
    const repository = createRepository();
    repository.load = vi.fn(async () => profile);
    repository.loadLayout = vi.fn(async () => "b" as const);
    const area = memoryArea();
    render(
      <App
        repository={repository}
        attachmentStore={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={() => true}
      />,
    );

    expect(await screen.findByDisplayValue("합성 메모")).toBeInTheDocument();
    await screen.findByRole("button", { name: "증빙 등록" });
    choose(
      "증빙 파일",
      new File(["img"], "synthetic-license.png", { type: "image/png" }),
    );
    expect(
      await screen.findByText("synthetic-license.png"),
    ).toBeInTheDocument();
    expect(area.values[EVIDENCE_INDEX_KEY]).toEqual(["cert-1"]);
    expect(repository.save).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "자격증·면허증 1 삭제" }),
    );

    await waitFor(() =>
      expect(area.values).not.toHaveProperty(
        attachmentDataKey("evidence:cert-1"),
      ),
    );
    expect(area.values[EVIDENCE_INDEX_KEY]).toEqual([]);
  });
});

describe("photo attachment", () => {
  it("registers a JPG photo and rejects a PDF photo", async () => {
    render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(memoryArea(), NOW)}
        confirmDelete={() => true}
      />,
    );
    await screen.findAllByText("등록된 파일이 없어요.");

    choose("증명사진 파일", pdf("not-a-photo.pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JPG·PNG 파일만 등록할 수 있어요.",
    );

    choose(
      "증명사진 파일",
      new File(["img"], "synthetic-photo.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByText("synthetic-photo.jpg")).toBeVisible();
    expect(screen.getByLabelText("증명사진 파일")).toHaveAttribute(
      "accept",
      ".jpg,.jpeg,.png,image/jpeg,image/png",
    );
  });

  it("reaches attachments from the last category and in the overview layout", async () => {
    const repository = createRepository();
    const view = render(
      <App
        repository={repository}
        attachmentStore={new ChromeAttachmentStorage(memoryArea(), NOW)}
      />,
    );
    await screen.findByRole("heading", { name: "프로필 관리" });
    fireEvent.click(screen.getByRole("button", { name: "건강" }));
    fireEvent.click(screen.getByRole("button", { name: "다음: 첨부 파일" }));
    expect(
      await screen.findByRole("button", { name: "증명사진 등록" }),
    ).toBeInTheDocument();
    view.unmount();

    repository.loadLayout = vi.fn(async () => "b" as const);
    render(
      <App
        repository={repository}
        attachmentStore={new ChromeAttachmentStorage(memoryArea(), NOW)}
      />,
    );
    const group = await screen.findByRole("group", { name: "첨부 파일" });
    expect(
      await within(group).findByRole("button", { name: "포트폴리오 등록" }),
    ).toBeInTheDocument();
  });
});

describe("attachment links", () => {
  it("saves and deletes a portfolio link and rejects a non-http address", async () => {
    const area = memoryArea();
    render(
      <AttachmentManager
        store={new ChromeAttachmentStorage(area, NOW)}
        confirmDelete={() => true}
      />,
    );
    const input = await screen.findByLabelText("포트폴리오 링크");
    expect(screen.queryByLabelText("증명사진 링크")).toBeNull();
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: "notion.example.test" } });
    fireEvent.click(
      screen.getByRole("button", { name: "포트폴리오 링크 저장" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "http:// 또는 https://로 시작하는 주소를 입력해 주세요.",
    );

    fireEvent.change(input, {
      target: { value: "https://portfolio.example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "포트폴리오 링크 저장" }),
    );
    expect(
      await screen.findByText("포트폴리오 링크를 저장했어요."),
    ).toBeInTheDocument();
    expect(area.values["careerForm.attachment.portfolio.link"]).toBe(
      "https://portfolio.example.test",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "포트폴리오 링크 삭제" }),
    );
    expect(
      await screen.findByText("포트폴리오 링크를 삭제했어요."),
    ).toBeInTheDocument();
    expect(area.values).not.toHaveProperty(
      "careerForm.attachment.portfolio.link",
    );
  });
});
