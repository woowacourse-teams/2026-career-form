import { browser } from "wxt/browser";

import {
  allowedAttachmentType,
  attachmentLinkError,
  LINK_KINDS,
  type AttachmentLinks,
  type LinkKind,
  AttachmentValidationError,
  attachmentFileError,
  evidenceSlot,
  isAttachmentMeta,
  SINGLE_ATTACHMENT_KINDS,
  slotKind,
  type AttachmentList,
  type AttachmentMeta,
  type AttachmentSlot,
  type AttachmentStore,
} from "./model";

export interface AttachmentStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Entry ids that currently own an evidence file, so orphans can be pruned. */
export const EVIDENCE_INDEX_KEY = "careerForm.attachment.evidence.index";

function slotKey(slot: AttachmentSlot): string {
  return slot.startsWith("evidence:")
    ? `evidence.${slot.slice("evidence:".length)}`
    : slot;
}

export function attachmentMetaKey(slot: AttachmentSlot): string {
  return `careerForm.attachment.${slotKey(slot)}.meta`;
}

export function attachmentDataKey(slot: AttachmentSlot): string {
  return `careerForm.attachment.${slotKey(slot)}.data`;
}

export function attachmentLinkKey(kind: LinkKind): string {
  return `careerForm.attachment.${kind}.link`;
}

function evidenceEntryId(slot: AttachmentSlot): string | undefined {
  return slot.startsWith("evidence:")
    ? slot.slice("evidence:".length)
    : undefined;
}

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Keeps each attachment in its own `browser.storage.local` keys so a large
 * file never shares a write with the profile envelope. Metadata and data are
 * split so listing does not read the file bytes.
 */
export class ChromeAttachmentStorage implements AttachmentStore {
  constructor(
    private readonly injectedStorage?: AttachmentStorageArea,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get storage(): AttachmentStorageArea {
    return this.injectedStorage ?? browser.storage.local;
  }

  async list(
    evidenceEntryIds: readonly string[] = [],
  ): Promise<AttachmentList> {
    const slots: AttachmentSlot[] = [
      ...SINGLE_ATTACHMENT_KINDS,
      ...evidenceEntryIds.map(evidenceSlot),
    ];
    const values = await this.storage.get(slots.map(attachmentMetaKey));
    const list: AttachmentList = {};
    for (const slot of slots) {
      const meta = values[attachmentMetaKey(slot)];
      if (isAttachmentMeta(meta)) list[slot] = meta;
    }
    return list;
  }

  async save(slot: AttachmentSlot, file: File): Promise<AttachmentMeta> {
    const kind = slotKind(slot);
    const error = attachmentFileError(file, kind);
    if (error) throw new AttachmentValidationError(error);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size)
      throw new AttachmentValidationError("파일을 읽지 못했어요.");
    const meta: AttachmentMeta = {
      name: file.name,
      type: allowedAttachmentType(file, kind)!,
      size: bytes.length,
      updatedAt: this.now().toISOString(),
    };
    const items: Record<string, unknown> = {
      [attachmentDataKey(slot)]: toBase64(bytes),
      [attachmentMetaKey(slot)]: meta,
    };
    const entryId = evidenceEntryId(slot);
    if (entryId) {
      const index = stringList(
        (await this.storage.get(EVIDENCE_INDEX_KEY))[EVIDENCE_INDEX_KEY],
      );
      if (!index.includes(entryId))
        items[EVIDENCE_INDEX_KEY] = [...index, entryId];
    }
    await this.storage.set(items);
    return meta;
  }

  async remove(slot: AttachmentSlot): Promise<void> {
    await this.storage.remove([
      attachmentMetaKey(slot),
      attachmentDataKey(slot),
    ]);
    const entryId = evidenceEntryId(slot);
    if (!entryId) return;
    const index = stringList(
      (await this.storage.get(EVIDENCE_INDEX_KEY))[EVIDENCE_INDEX_KEY],
    );
    if (index.includes(entryId))
      await this.storage.set({
        [EVIDENCE_INDEX_KEY]: index.filter((id) => id !== entryId),
      });
  }

  async pruneEvidence(keepEntryIds: readonly string[]): Promise<void> {
    const index = stringList(
      (await this.storage.get(EVIDENCE_INDEX_KEY))[EVIDENCE_INDEX_KEY],
    );
    const keep = new Set(keepEntryIds);
    const orphans = index.filter((id) => !keep.has(id));
    if (orphans.length === 0) return;
    await this.storage.remove(
      orphans.flatMap((id) => [
        attachmentMetaKey(evidenceSlot(id)),
        attachmentDataKey(evidenceSlot(id)),
      ]),
    );
    await this.storage.set({
      [EVIDENCE_INDEX_KEY]: index.filter((id) => keep.has(id)),
    });
  }

  async loadFile(slot: AttachmentSlot): Promise<File | undefined> {
    const values = await this.storage.get([
      attachmentMetaKey(slot),
      attachmentDataKey(slot),
    ]);
    const meta = values[attachmentMetaKey(slot)];
    const data = values[attachmentDataKey(slot)];
    if (!isAttachmentMeta(meta) || typeof data !== "string") return undefined;
    const bytes = fromBase64(data);
    if (!bytes || bytes.length !== meta.size) return undefined;
    return new File([bytes], meta.name, {
      type: meta.type,
      lastModified: Date.parse(meta.updatedAt) || Date.now(),
    });
  }

  async loadLinks(): Promise<AttachmentLinks> {
    const values = await this.storage.get(LINK_KINDS.map(attachmentLinkKey));
    const links: AttachmentLinks = {};
    for (const kind of LINK_KINDS) {
      const value = values[attachmentLinkKey(kind)];
      if (typeof value === "string" && !attachmentLinkError(value))
        links[kind] = value;
    }
    return links;
  }

  async saveLink(kind: LinkKind, url: string): Promise<string> {
    const error = attachmentLinkError(url);
    if (error) throw new AttachmentValidationError(error);
    const value = url.trim();
    await this.storage.set({ [attachmentLinkKey(kind)]: value });
    return value;
  }

  async removeLink(kind: LinkKind): Promise<void> {
    await this.storage.remove(attachmentLinkKey(kind));
  }
}
