import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(".output/chrome-mv3");
const manifest = JSON.parse(
  await readFile(resolve(outputDirectory, "manifest.json"), "utf8"),
);

if (manifest.manifest_version !== 3) {
  throw new Error("Chrome Manifest V3 산출물이 필요합니다.");
}

if (manifest.action?.default_popup !== "popup.html") {
  throw new Error("action.default_popup이 popup.html이어야 합니다.");
}

if (
  manifest.options_ui?.page !== "options.html" ||
  manifest.options_ui?.open_in_tab !== true
) {
  throw new Error("options_ui가 새 탭의 options.html을 가리켜야 합니다.");
}

if (manifest.side_panel?.default_path !== "sidepanel.html") {
  throw new Error("side_panel.default_path가 sidepanel.html이어야 합니다.");
}

const permissions = new Set(manifest.permissions);
if (!permissions.has("storage") || !permissions.has("sidePanel")) {
  throw new Error("프로필 저장과 side panel 권한이 필요합니다.");
}

await Promise.all(
  ["popup.html", "options.html", "sidepanel.html"].map((fileName) =>
    readFile(resolve(outputDirectory, fileName)),
  ),
);
