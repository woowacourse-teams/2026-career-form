// Kept free of `wxt/browser` so wxt.config.ts can import the manifest commands.

/**
 * `_execute_action` fires the same `action.onClicked` as a toolbar click
 * (there is no popup), so the shortcut reuses the in-page panel opening path.
 * Alt+Shift+C avoids DevTools (Ctrl/Cmd+Shift+C) and Chrome's Alt+Shift keys.
 */
export const PANEL_COMMANDS = {
  _execute_action: {
    suggested_key: { default: "Alt+Shift+C", mac: "Alt+Shift+C" },
  },
} as const;

const PANEL_COMMAND_NAME = "_execute_action";

export const PANEL_SHORTCUT_REQUEST = {
  type: "career-form:read-panel-shortcut",
} as const;

interface CommandsApi {
  getAll(): Promise<Array<{ name?: string; shortcut?: string }>>;
}

interface ContentRuntimeApi {
  sendMessage(message: unknown): Promise<unknown>;
}

export function isPanelShortcutRequest(
  message: unknown,
): message is typeof PANEL_SHORTCUT_REQUEST {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === PANEL_SHORTCUT_REQUEST.type
  );
}

/** The key Chrome currently assigns to open the panel; "" when none is assigned. */
export async function readPanelShortcut(
  commands: CommandsApi,
): Promise<string> {
  const command = (await commands.getAll()).find(
    ({ name }) => name === PANEL_COMMAND_NAME,
  );
  return command?.shortcut ?? "";
}

/** Background side: answers only this extension's shortcut requests (null for others). */
export function createPanelShortcutHandler(
  commands: CommandsApi,
  extensionId: string,
) {
  return (
    message: unknown,
    sender: { id?: string },
  ): Promise<string | null> | undefined => {
    if (!isPanelShortcutRequest(message)) return undefined;
    if (sender.id !== extensionId) return Promise.resolve(null);
    return readPanelShortcut(commands);
  };
}

/** Content side: `chrome.commands` is unavailable there, so ask the background. */
export async function requestPanelShortcut(
  runtime: ContentRuntimeApi,
): Promise<string | undefined> {
  try {
    const response = await runtime.sendMessage(PANEL_SHORTCUT_REQUEST);
    return typeof response === "string" ? response : undefined;
  } catch {
    return undefined;
  }
}
