import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { AttachmentStore } from "../../attachments/model";
import { AttachmentSection, type AttachedFile } from "./AttachmentSection";

afterEach(() => document.body.replaceChildren());

const RESUME = {
  name: "synthetic-resume.pdf",
  type: "application/pdf",
  size: 2048,
  updatedAt: "2026-11-16T09:00:00.000Z",
};

function createStore(): AttachmentStore {
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
  };
}

it("reports only successfully attached files with their field label and element", async () => {
  document.body.innerHTML = `
    <label for="r">이력서 첨부</label><input id="r" type="file">
    <label for="x">기타 첨부</label><input id="x" type="file">`;
  const onAttachedChange = vi.fn<(files: readonly AttachedFile[]) => void>();
  render(
    <AttachmentSection
      pageDocument={document}
      store={createStore()}
      attach={vi.fn(() => ({ status: "attached" as const }))}
      onAttachedChange={onAttachedChange}
    />,
  );

  await waitFor(() => {
    const last = onAttachedChange.mock.calls.at(-1)?.[0];
    expect(last).toHaveLength(1);
  });
  const files = onAttachedChange.mock.calls.at(-1)![0];
  expect(files[0]?.fileName).toBe("synthetic-resume.pdf");
  expect(files[0]?.fieldLabel).toContain("이력서");
  expect(files[0]?.element).toBe(document.getElementById("r"));
  // Not re-notified when nothing changed: empty -> one attached file only.
  expect(onAttachedChange.mock.calls.length).toBeLessThanOrEqual(2);
});
