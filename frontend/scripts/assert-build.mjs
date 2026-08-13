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

await readFile(resolve(outputDirectory, manifest.action.default_popup));
