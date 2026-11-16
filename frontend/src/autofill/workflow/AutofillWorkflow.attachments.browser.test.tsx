import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, expect, it } from "vitest";

import type { AttachmentStore } from "../../attachments/model";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

const client: AnalysisApiClient = {
  analyzePreparation: async (request) => ({
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    preparationPlans: [],
  }),
  analyzeFields: async (request) => ({
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((section) => section.fields)
      .map((field) => ({
        candidateId: field.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "personal.personal.koreanGivenName",
        },
        writePlan: { command: "SET_TEXT" },
      })),
  }),
};

function memoryStore(): AttachmentStore & { loaded: string[] } {
  const loaded: string[] = [];
  return {
    loaded,
    list: async () => ({
      resume: {
        name: "synthetic-resume.pdf",
        type: "application/pdf",
        size: 9,
        updatedAt: "2026-11-16T09:00:00.000Z",
      },
    }),
    save: async () => {
      throw new Error("unused");
    },
    remove: async () => undefined,
    pruneEvidence: async () => undefined,
    loadLinks: async () => ({}),
    saveLink: async (_kind, url) => url,
    removeLink: async () => undefined,
    loadFile: async (kind) => {
      loaded.push(kind);
      return kind === "resume"
        ? new File(["%PDF-test"], "synthetic-resume.pdf", {
            type: "application/pdf",
          })
        : undefined;
    },
  };
}

async function waitFor<T>(read: () => T | null | undefined): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value) return value;
    await act(() => new Promise((resolve) => setTimeout(resolve, 25)));
  }
  throw new Error("timed out");
}

it("attaches the profile resume automatically on a synthetic application form", async () => {
  document.body.innerHTML = `<form id="application">
      <label>이름<input name="name"></label>
      <div class="upload"><label for="resume">이력서 (PDF)</label>
        <input id="resume" type="file" accept=".pdf" style="display:none"></div>
      <label for="portfolio">포트폴리오</label><input id="portfolio" type="file">
      <label for="photo">증명사진</label><input id="photo" type="file" accept="image/*">
    </form><div id="panel"></div>`;
  const changes: string[] = [];
  document
    .getElementById("application")!
    .addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.type === "file") changes.push(target.id);
    });
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "합성";
  const store = memoryStore();
  const panel = document.getElementById("panel")!;

  root = createRoot(panel);
  act(() =>
    root!.render(
      createElement(AutofillWorkflow, {
        repository: { load: async () => profile },
        attachmentStore: store,
        apiClient: client,
        pageDocument: document,
        onExit: () => undefined,
      }),
    ),
  );

  const resumeInput = document.querySelector<HTMLInputElement>("#resume")!;
  await waitFor(() => (resumeInput.files?.length ?? 0) > 0);
  // Attached fields and fields without a stored file need nothing from the
  // user, so the result screen shows no attachment list here.
  expect(panel.querySelector("section[aria-label='첨부 파일']")).toBeNull();
  expect(resumeInput.files?.[0]?.name).toBe("synthetic-resume.pdf");
  expect(changes).toEqual(["resume"]);
  expect(store.loaded).toEqual(["resume"]);
  expect(
    document.querySelector<HTMLInputElement>("#portfolio")!.files,
  ).toHaveLength(0);
  expect(
    document.querySelector<HTMLInputElement>("#photo")!.files,
  ).toHaveLength(0);
});
