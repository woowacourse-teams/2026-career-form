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
