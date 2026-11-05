import { describe, expect, it, vi } from "vitest";

import {
  PANEL_COMMANDS,
  PANEL_SHORTCUT_REQUEST,
  createPanelShortcutHandler,
  readPanelShortcut,
  requestPanelShortcut,
} from "./panel-shortcut";

const EXTENSION_ID = "career-form-test";

function commandsWith(commands: Array<{ name?: string; shortcut?: string }>) {
  return { getAll: vi.fn(async () => commands) };
}

describe("panel shortcut", () => {
  it("툴바 클릭과 같은 _execute_action에 Alt+Shift+C를 제안한다", () => {
    expect(PANEL_COMMANDS).toEqual({
      _execute_action: {
        suggested_key: { default: "Alt+Shift+C", mac: "Alt+Shift+C" },
      },
    });
    for (const key of Object.values(
      PANEL_COMMANDS._execute_action.suggested_key,
    )) {
      const parts = key.split("+");
      expect(parts.includes("Alt") || parts.includes("Ctrl")).toBe(true);
      expect(parts.includes("Alt") && parts.includes("Ctrl")).toBe(false);
    }
  });

  it("할당된 패널 단축키를 읽는다", async () => {
    const commands = commandsWith([
      { name: "wxt:reload-extension", shortcut: "Alt+R" },
      { name: "_execute_action", shortcut: "⌥⇧C" },
    ]);

    await expect(readPanelShortcut(commands)).resolves.toBe("⌥⇧C");
  });

  it("단축키가 없으면 빈 문자열을 돌려준다", async () => {
    await expect(
      readPanelShortcut(
        commandsWith([{ name: "_execute_action", shortcut: "" }]),
      ),
    ).resolves.toBe("");
    await expect(
      readPanelShortcut(commandsWith([{ name: "_execute_action" }])),
    ).resolves.toBe("");
    await expect(readPanelShortcut(commandsWith([]))).resolves.toBe("");
  });

  it("확장 안에서 보낸 패널 단축키 요청에만 응답한다", async () => {
    const commands = commandsWith([
      { name: "_execute_action", shortcut: "Alt+Shift+C" },
    ]);
    const handle = createPanelShortcutHandler(commands, EXTENSION_ID);

    expect(handle({ type: "other" }, { id: EXTENSION_ID })).toBeUndefined();
    expect(handle(undefined, { id: EXTENSION_ID })).toBeUndefined();
    await expect(
      handle(PANEL_SHORTCUT_REQUEST, { id: EXTENSION_ID }),
    ).resolves.toBe("Alt+Shift+C");
    await expect(
      handle(PANEL_SHORTCUT_REQUEST, { id: "another-extension" }),
    ).resolves.toBeNull();
    expect(commands.getAll).toHaveBeenCalledOnce();
  });

  it("백그라운드 응답이 문자열이 아니거나 실패하면 알 수 없음으로 둔다", async () => {
    const runtime = (response: () => Promise<unknown>) => ({
      sendMessage: vi.fn(response),
    });
    const assigned = runtime(async () => "Alt+Shift+C");

    await expect(requestPanelShortcut(assigned)).resolves.toBe("Alt+Shift+C");
    expect(assigned.sendMessage).toHaveBeenCalledWith(PANEL_SHORTCUT_REQUEST);
    await expect(requestPanelShortcut(runtime(async () => ""))).resolves.toBe(
      "",
    );
    await expect(
      requestPanelShortcut(runtime(async () => 42)),
    ).resolves.toBeUndefined();
    await expect(
      requestPanelShortcut(runtime(async () => undefined)),
    ).resolves.toBeUndefined();
    await expect(
      requestPanelShortcut(
        runtime(async () => {
          throw new Error("receiving end does not exist");
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
