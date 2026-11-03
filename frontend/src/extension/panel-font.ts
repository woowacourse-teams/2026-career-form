import { browser } from "wxt/browser";

import { PANEL_FONT_PATH } from "./panel-font-path";

let loading: Promise<void> | undefined;

async function addPanelFont() {
  const response = await fetch(
    `chrome-extension://${browser.runtime.id}/${PANEL_FONT_PATH}`,
  );
  if (!response.ok) throw new Error("panel font unavailable");
  // @font-face does not apply inside a shadow root, and a byte source is not
  // subject to the host page's font-src CSP.
  const face = new FontFace(
    "Pretendard Variable",
    await response.arrayBuffer(),
    { weight: "45 920", style: "normal" },
  );
  await face.load();
  document.fonts.add(face);
}

export function loadPanelFont(): Promise<void> {
  loading ??= addPanelFont().catch(() => {
    console.warn("Career Form: panel font not loaded; using the system font.");
  });
  return loading;
}
