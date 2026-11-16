import { describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({ browser: {} }));

import { PROFILE_STORAGE_KEY } from "../storage/chrome-profile-storage";
import {
  attachmentLinkKey,
  EVIDENCE_INDEX_KEY,
  attachmentDataKey,
  attachmentMetaKey,
  ChromeAttachmentStorage,
  type AttachmentStorageArea,
} from "./attachment-storage";
import { AttachmentValidationError, MAX_ATTACHMENT_BYTES } from "./model";

function createStorage(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...initial };
  const keysOf = (keys: string | string[]) =>
    Array.isArray(keys) ? keys : [keys];
  const area = {
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
  } satisfies AttachmentStorageArea & { values: Record<string, unknown> };
  return area;
}

function pdf(name = "synthetic-resume.pdf", contents = "%PDF-1.4 synthetic") {
  return new File([contents], name, { type: "application/pdf" });
}

const NOW = () => new Date("2026-11-16T09:00:00.000Z");

describe("ChromeAttachmentStorage", () => {
  it("stores metadata and data under separate keys without touching the profile", async () => {
    const profileEnvelope = { schemaVersion: 1, profile: { personal: {} } };
    const storage = createStorage({ [PROFILE_STORAGE_KEY]: profileEnvelope });
    const store = new ChromeAttachmentStorage(storage, NOW);

    const meta = await store.save("resume", pdf());

    expect(meta).toEqual({
      name: "synthetic-resume.pdf",
      type: "application/pdf",
      size: 18,
      updatedAt: "2026-11-16T09:00:00.000Z",
    });
    expect(storage.values[attachmentMetaKey("resume")]).toEqual(meta);
    expect(typeof storage.values[attachmentDataKey("resume")]).toBe("string");
    expect(storage.values[PROFILE_STORAGE_KEY]).toBe(profileEnvelope);
  });

  it("lists only metadata keys and round-trips the stored file", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await store.save("portfolio", pdf("synthetic-portfolio.pdf", "%PDF-ABC"));

    await expect(store.list()).resolves.toEqual({
      portfolio: expect.objectContaining({ name: "synthetic-portfolio.pdf" }),
    });
    expect(storage.get).toHaveBeenLastCalledWith([
      attachmentMetaKey("resume"),
      attachmentMetaKey("portfolio"),
      attachmentMetaKey("photo"),
    ]);

    const file = await store.loadFile("portfolio");
    expect(file?.name).toBe("synthetic-portfolio.pdf");
    expect(file?.type).toBe("application/pdf");
    await expect(file?.text()).resolves.toBe("%PDF-ABC");
    await expect(store.loadFile("resume")).resolves.toBeUndefined();
  });

  it("replaces an existing file of the same kind", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await store.save("resume", pdf("first.pdf", "%PDF-1"));
    await store.save("resume", pdf("second.pdf", "%PDF-22"));

    const file = await store.loadFile("resume");
    expect(file?.name).toBe("second.pdf");
    await expect(file?.text()).resolves.toBe("%PDF-22");
  });

  it("removes both keys of one kind and keeps the other kind", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await store.save("resume", pdf());
    await store.save("portfolio", pdf("p.pdf"));

    await store.remove("resume");

    expect(storage.values).not.toHaveProperty(attachmentMetaKey("resume"));
    expect(storage.values).not.toHaveProperty(attachmentDataKey("resume"));
    await expect(store.list()).resolves.toEqual({
      portfolio: expect.objectContaining({ name: "p.pdf" }),
    });
  });

  it("accepts a .pdf name without a MIME type and stores it as PDF", async () => {
    const store = new ChromeAttachmentStorage(createStorage(), NOW);
    const meta = await store.save(
      "resume",
      new File(["%PDF"], "SYNTHETIC.PDF", { type: "" }),
    );
    expect(meta.type).toBe("application/pdf");
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
  ])("rejects an invalid file without writing", async (file, message) => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);

    const saving = store.save("resume", file);
    await expect(saving).rejects.toBeInstanceOf(AttachmentValidationError);
    await expect(saving).rejects.toThrow(message);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("rejects a file over the size limit before reading it", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    const file = pdf();
    Object.defineProperty(file, "size", { value: MAX_ATTACHMENT_BYTES + 1 });
    const read = vi.spyOn(file, "arrayBuffer");

    await expect(store.save("resume", file)).rejects.toThrow(
      "20MB 이하 파일만 등록할 수 있어요.",
    );
    expect(read).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("treats data whose size differs from metadata as missing", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await store.save("resume", pdf());
    storage.values[attachmentDataKey("resume")] = btoa("short");

    await expect(store.loadFile("resume")).resolves.toBeUndefined();
  });

  it("ignores malformed metadata", async () => {
    const storage = createStorage({
      [attachmentMetaKey("resume")]: { name: 3 },
      [attachmentDataKey("resume")]: "%%%",
    });
    const store = new ChromeAttachmentStorage(storage, NOW);

    await expect(store.list()).resolves.toEqual({});
    await expect(store.loadFile("resume")).resolves.toBeUndefined();
  });

  it.each([
    ["image/jpeg", "synthetic-photo.jpg"],
    ["", "SYNTHETIC.PNG"],
  ])("stores a JPG or PNG photo up to 5MB", async (type, name) => {
    const store = new ChromeAttachmentStorage(createStorage(), NOW);
    const meta = await store.save("photo", new File(["img"], name, { type }));
    expect(meta.type).toMatch(/^image\/(jpeg|png)$/);
  });

  it("rejects a PDF photo and a photo over 5MB", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await expect(store.save("photo", pdf())).rejects.toThrow(
      "JPG·PNG 파일만 등록할 수 있어요.",
    );
    const large = new File(["img"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(large, "size", { value: 5 * 1024 * 1024 + 1 });
    await expect(store.save("photo", large)).rejects.toThrow(
      "5MB 이하 파일만 등록할 수 있어요.",
    );
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("keeps evidence per profile entry, lists it by entry and prunes orphans", async () => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await store.save("evidence:lang-1", pdf("synthetic-score.pdf"));
    await store.save(
      "evidence:cert-1",
      new File(["img"], "synthetic-license.png", { type: "image/png" }),
    );

    expect(storage.values[EVIDENCE_INDEX_KEY]).toEqual(["lang-1", "cert-1"]);
    await expect(store.list(["lang-1", "cert-1"])).resolves.toEqual({
      "evidence:lang-1": expect.objectContaining({
        name: "synthetic-score.pdf",
      }),
      "evidence:cert-1": expect.objectContaining({ type: "image/png" }),
    });
    await expect(store.list()).resolves.toEqual({});

    await store.pruneEvidence(["cert-1"]);

    expect(storage.values).not.toHaveProperty(
      attachmentDataKey("evidence:lang-1"),
    );
    expect(storage.values[EVIDENCE_INDEX_KEY]).toEqual(["cert-1"]);
    await expect(store.loadFile("evidence:cert-1")).resolves.toBeInstanceOf(
      File,
    );

    await store.remove("evidence:cert-1");
    expect(storage.values[EVIDENCE_INDEX_KEY]).toEqual([]);
  });

  it("rejects an evidence file that is not PDF, JPG or PNG", async () => {
    const store = new ChromeAttachmentStorage(createStorage(), NOW);
    await expect(
      store.save(
        "evidence:x",
        new File(["z"], "a.zip", { type: "application/zip" }),
      ),
    ).rejects.toThrow("PDF·JPG·PNG 파일만 등록할 수 있어요.");
  });

  it("keeps resume and portfolio links apart from files and the profile", async () => {
    const storage = createStorage({ [PROFILE_STORAGE_KEY]: { kept: true } });
    const store = new ChromeAttachmentStorage(storage, NOW);

    await expect(
      store.saveLink("portfolio", "  https://portfolio.example.test/a  "),
    ).resolves.toBe("https://portfolio.example.test/a");
    expect(storage.values[attachmentLinkKey("portfolio")]).toBe(
      "https://portfolio.example.test/a",
    );
    await expect(store.loadLinks()).resolves.toEqual({
      portfolio: "https://portfolio.example.test/a",
    });
    await expect(store.list()).resolves.toEqual({});

    await store.removeLink("portfolio");
    await expect(store.loadLinks()).resolves.toEqual({});
    expect(storage.values[PROFILE_STORAGE_KEY]).toEqual({ kept: true });
  });

  it.each([
    "notion.example.test",
    "javascript:alert(1)",
    "",
    `https://a.test/${"x".repeat(500)}`,
  ])("rejects an invalid link %#", async (value) => {
    const storage = createStorage();
    const store = new ChromeAttachmentStorage(storage, NOW);
    await expect(store.saveLink("resume", value)).rejects.toBeInstanceOf(
      AttachmentValidationError,
    );
    expect(storage.set).not.toHaveBeenCalled();
  });
});
