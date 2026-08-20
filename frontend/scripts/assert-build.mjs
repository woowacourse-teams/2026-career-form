import { readFile, readdir } from "node:fs/promises";
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

const autofillContentScript = manifest.content_scripts?.find((contentScript) =>
  contentScript.js?.includes("content-scripts/autofill.js"),
);
if (
  !autofillContentScript ||
  !autofillContentScript.matches?.includes("http://*/*") ||
  !autofillContentScript.matches?.includes("https://*/*")
) {
  throw new Error(
    "HTTP(S) 지원서 페이지용 autofill content script가 필요합니다.",
  );
}

const permissions = new Set(manifest.permissions);
if (!permissions.has("storage") || !permissions.has("sidePanel")) {
  throw new Error("프로필 저장과 side panel 권한이 필요합니다.");
}

await Promise.all(
  [
    "popup.html",
    "options.html",
    "sidepanel.html",
    "content-scripts/autofill.js",
    "content-scripts/autofill.css",
  ].map((fileName) => readFile(resolve(outputDirectory, fileName))),
);

const assetNames = await readdir(resolve(outputDirectory, "assets"));
const fontAssets = assetNames.filter((fileName) => fileName.endsWith(".woff2"));

if (fontAssets.length === 0) {
  throw new Error("Pretendard 로컬 WOFF2 폰트가 빌드에 포함되어야 합니다.");
}

const styleSheets = await Promise.all(
  assetNames
    .filter((fileName) => fileName.endsWith(".css"))
    .map((fileName) =>
      readFile(resolve(outputDirectory, "assets", fileName), "utf8"),
    ),
);

if (
  !styleSheets.some((styleSheet) => styleSheet.includes("Pretendard Variable"))
) {
  throw new Error("확장 프로그램의 기본 서체가 Pretendard여야 합니다.");
}
