import { act, fireEvent, waitFor, within } from "@testing-library/react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../src/profile/model";
import type { PreparationAnalyzeResponse } from "../../src/autofill/api/types";
import {
  OPEN_AUTOFILL_OVERLAY_MESSAGE,
  OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE,
} from "../../src/autofill-demo/messages";

const boundary = vi.hoisted(() => ({
  createUi: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  preparation: vi.fn(),
  fields: vi.fn(),
  load: vi.fn(),
}));
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      id: "test-extension",
      onMessage: {
        addListener: boundary.addListener,
        removeListener: boundary.removeListener,
      },
    },
  },
}));
vi.mock("wxt/utils/define-content-script", () => ({
  defineContentScript: (value: unknown) => value,
}));
vi.mock("wxt/utils/content-script-ui/shadow-root", () => ({
  createShadowRootUi: boundary.createUi,
}));
vi.mock("../../src/autofill/api/runtime-client", () => ({
  RuntimeAnalysisApiClient: class {
    analyzePreparation = boundary.preparation;
    analyzeFields = boundary.fields;
  },
}));
vi.mock("../../src/storage/chrome-profile-storage", () => ({
  ChromeProfileStorage: class {
    load = boundary.load;
    async save() {}
    async loadLayout() {
      return "a" as const;
    }
    async saveLayout() {}
  },
}));

import definition from "./index";

interface Shell {
  mounted: boolean;
  host: HTMLElement;
  container: HTMLDivElement;
  mount(): void;
  remove(): void;
}
const shells: Shell[] = [];
const queued: Array<() => void> = [];
const invalidators: Array<() => void> = [];
let receive: (message: unknown) => Promise<void> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  shells.length = queued.length = invalidators.length = 0;
  const profile = createEmptyProfile();
  profile.contact.email = "fixture@example.test";
  boundary.load.mockResolvedValue(profile);
  boundary.preparation.mockImplementation(() => new Promise(() => undefined));
  boundary.fields.mockResolvedValue({
    snapshotId: "fixture",
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: [],
  });
  boundary.createUi.mockImplementation(
    async (
      _ctx,
      options: {
        name: string;
        onMount(container: HTMLElement): Root;
        onRemove(root?: Root): void;
      },
    ) => {
      const host = document.createElement(options.name);
      const container = document.createElement("div");
      host.attachShadow({ mode: "open" }).append(container);
      let root: Root | undefined;
      const shell: Shell = {
        host,
        container,
        mounted: false,
        mount() {
          shell.mounted = true;
          document.documentElement.append(host);
          root = options.onMount(container);
        },
        remove() {
          if (!shell.mounted) return;
          shell.mounted = false;
          options.onRemove(root);
          host.remove();
        },
      };
      shells.push(shell);
      return shell;
    },
  );
});

afterEach(async () => {
  await act(async () => {
    for (const shell of shells) shell.remove();
    for (const invalidate of invalidators) invalidate();
  });
});

async function start() {
  const ctx = {
    setTimeout(callback: () => void) {
      queued.push(callback);
      return 1;
    },
    onInvalidated(callback: () => void) {
      invalidators.push(callback);
    },
  };
  await act(async () =>
    definition.main(
      ctx as unknown as NonNullable<Parameters<typeof definition.main>[0]>,
    ),
  );
  receive = boundary.addListener.mock.calls[0]![0];
}
async function send(message: unknown) {
  await act(async () => {
    await receive(message);
  });
}
function panel() {
  return within(shells[0]!.container);
}

// Catches splitting the workflow into a second Shadow DOM, remounts on messages,
// and an old deferred close removing a newly reopened panel.
describe("content script panel lifecycle", () => {
  it("keeps the panel open while the page accepts clicks, focus, and manual edits", async () => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "지원서 직접 입력");
    document.body.append(input);
    const originalOverflow = document.body.style.overflow;
    try {
      await start();
      await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
      const region = panel().getByRole("region", { name: "지원서 자동 기입" });
      expect(region).not.toHaveAttribute("aria-modal", "true");
      fireEvent.click(input);
      input.focus();
      fireEvent.input(input, { target: { value: "합성 직접 입력" } });
      expect(input).toHaveFocus();
      expect(input).toHaveValue("합성 직접 입력");
      expect(shells[0]!.mounted).toBe(true);
      expect(region).toBeVisible();
      expect(document.body.style.overflow).toBe(originalOverflow);
      expect(input.closest("[inert]")).toBeNull();
      fireEvent.click(panel().getByRole("button", { name: "닫기" }));
      await act(async () => {
        await Promise.resolve();
        for (const callback of queued.splice(0)) callback();
      });
      expect(shells[0]!.mounted).toBe(false);
      expect(input).toHaveValue("합성 직접 입력");
    } finally {
      input.remove();
    }
  });

  it("starts autofill inside the existing profile panel without another UI root", async () => {
    await start();
    await send(OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE);
    await panel().findByText("fixture@example.test");
    fireEvent.click(panel().getByRole("button", { name: "자동 기입" }));
    await waitFor(() => expect(boundary.preparation).toHaveBeenCalledOnce());
    expect(shells).toHaveLength(1);
    expect(
      panel().getByRole("region", { name: "지원서 자동 기입" }),
    ).toBeVisible();
    expect(panel().queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("routes repeated native requests and profile-open messages to the active workflow", async () => {
    await start();
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    await send(OPEN_IN_PAGE_PROFILE_PANEL_MESSAGE);
    expect(shells).toHaveLength(1);
    expect(boundary.preparation).toHaveBeenCalledOnce();
    expect(
      panel().getByRole("button", { name: "목록으로 돌아가기" }),
    ).toBeVisible();
    expect(receive({ type: "unknown" })).toBeUndefined();
  });

  it("returns to the same list only for Escape inside the workflow", async () => {
    await start();
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(
      panel().getByRole("region", { name: "지원서 자동 기입" }),
    ).toBeVisible();
    fireEvent.keyDown(
      panel().getByRole("button", { name: "목록으로 돌아가기" }),
      { key: "Escape" },
    );
    await waitFor(() =>
      expect(shells[0]!.host.shadowRoot!.activeElement).toBe(
        panel().getByRole("button", { name: "자동 기입" }),
      ),
    );
    expect(shells[0]!.mounted).toBe(true);
    fireEvent.click(panel().getByRole("button", { name: "자동 기입" }));
    await waitFor(() => expect(boundary.preparation).toHaveBeenCalledTimes(2));
  });

  it("does not let an old queued close remove a newly reopened workflow", async () => {
    await start();
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    fireEvent.click(panel().getByRole("button", { name: "닫기" }));
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    await act(async () => {
      for (const callback of queued.splice(0)) callback();
    });
    expect(shells).toHaveLength(1);
    expect(shells[0]!.mounted).toBe(true);
    expect(
      panel().getByRole("region", { name: "지원서 자동 기입" }),
    ).toBeVisible();
    expect(boundary.preparation).toHaveBeenCalledTimes(2);
  });

  it("ignores a closed run's late analysis response after reopening", async () => {
    let resolveFirst!: (value: PreparationAnalyzeResponse) => void;
    boundary.preparation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    await start();
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    fireEvent.click(panel().getByRole("button", { name: "목록으로 돌아가기" }));
    await send(OPEN_AUTOFILL_OVERLAY_MESSAGE);
    await act(async () =>
      resolveFirst({
        snapshotId: "old",
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
    );
    expect(boundary.fields).not.toHaveBeenCalled();
    expect(boundary.preparation).toHaveBeenCalledTimes(2);
    expect(
      panel().getByRole("region", { name: "지원서 자동 기입" }),
    ).toBeVisible();
  });
});
