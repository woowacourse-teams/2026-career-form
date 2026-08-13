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

if (!entryNames.has("manifest.json") || !entryNames.has("popup.html")) {
  throw new Error("ZIP에 manifest.json과 popup.html이 포함되어야 합니다.");
}
