import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import AdmZip from "adm-zip";

const outputDirectory = resolve(".output");
const archive = (await readdir(outputDirectory)).find((fileName) =>
  fileName.endsWith("-chrome.zip"),
);

if (!archive) {
  throw new Error("Chrome Web Store 제출용 ZIP 산출물이 필요합니다.");
}

const entryNames = new Set(
  new AdmZip(resolve(outputDirectory, archive))
    .getEntries()
    .map((entry) => entry.entryName),
);

for (const requiredEntry of [
  "manifest.json",
  "popup.html",
  "options.html",
  "sidepanel.html",
  "content-scripts/autofill.js",
  "content-scripts/autofill.css",
]) {
  if (!entryNames.has(requiredEntry)) {
    throw new Error(`ZIP에 ${requiredEntry}이(가) 포함되어야 합니다.`);
  }
}

if (![...entryNames].some((entryName) => entryName.endsWith(".woff2"))) {
  throw new Error("ZIP에 Pretendard 로컬 WOFF2 폰트가 포함되어야 합니다.");
}

const zip = new AdmZip(resolve(outputDirectory, archive));
const manifest = JSON.parse(zip.readAsText("manifest.json"));
if (
  manifest.options_ui?.page !== "options.html" ||
  manifest.side_panel?.default_path !== "sidepanel.html"
) {
  throw new Error("ZIP Manifest가 options와 side panel을 가리켜야 합니다.");
}

const autofillContentScript = manifest.content_scripts?.find((contentScript) =>
  contentScript.js?.includes("content-scripts/autofill.js"),
);
if (
  !autofillContentScript ||
  !autofillContentScript.matches?.includes("http://*/*") ||
  !autofillContentScript.matches?.includes("https://*/*")
) {
  throw new Error("ZIP Manifest에 autofill content script가 필요합니다.");
}

const hostPermissions = manifest.host_permissions ?? [];
if (
  hostPermissions.some((permission) =>
    ["<all_urls>", "http://*/*", "https://*/*"].includes(permission),
  )
) {
  throw new Error(
    "ZIP에는 넓은 자동 기입 API host permission을 포함할 수 없습니다.",
  );
}

if (manifest.background?.service_worker !== "background.js") {
  throw new Error(
    "ZIP에는 자동 기입 API 중계를 위한 background service worker가 필요합니다.",
  );
}

if (
  zip
    .readAsText("content-scripts/autofill.js")
    .includes("필드 탐지와 프로필 연결을 비식별 목업으로 확인합니다.")
) {
  throw new Error("ZIP 자동 기입 산출물에 목업 화면이 포함되어서는 안 됩니다.");
}
