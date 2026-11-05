import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : [];
  });
}

// The public site renders shared components, so any stylesheet it can reach
// (everything under site/ and src/, plus the side panel module the demo
// previews) must not pull in the extension-only token override.
it("keeps extension-theme.css out of everything the public site can reach", () => {
  const reachable = [
    ...sourceFiles("site"),
    ...sourceFiles("src"),
    "entrypoints/sidepanel/App.module.css",
  ].filter((path) => !path.endsWith("extension-theme.css"));

  const importers = reachable.filter((path) =>
    /@import[^;]*extension-theme|from\s+["'][^"']*extension-theme|import\s+["'][^"']*extension-theme/.test(
      readFileSync(path, "utf8"),
    ),
  );

  expect(importers).toEqual([]);
});
