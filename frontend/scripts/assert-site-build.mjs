import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../dist-site/", import.meta.url));
const pages = [
  "index.html",
  "onboarding/index.html",
  "privacy/index.html",
  "terms/index.html",
  "demo/index.html",
];
for (const page of pages) {
  const html = readFileSync(resolve(output, page), "utf8");
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
    assert(
      existsSync(resolve(output, asset.slice(1))),
      `Missing asset: ${asset}`,
    );
  }
}
for (const path of readdirSync(output, { recursive: true })) {
  if (!/\.(html|css|js)$/.test(path)) continue;
  const content = readFileSync(resolve(output, path), "utf8");
  assert(
    !/\/(Users|private\/var|home)\//.test(content),
    `Local filesystem path in ${path}`,
  );
  for (const [, asset] of content.matchAll(/url\(["']?(\/assets\/[^)"']+)/g)) {
    assert(
      existsSync(resolve(output, asset.slice(1))),
      `Missing CSS asset: ${asset}`,
    );
  }
}
console.log("Website routes, assets and filesystem independence verified.");
