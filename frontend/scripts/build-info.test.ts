// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateBuildInfo, serializeBuildInfo } from "./build-info";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

function repository() {
  const root = mkdtempSync(join(tmpdir(), "cf-build-info-"));
  directories.push(root);
  const frontend = join(root, "frontend");
  mkdirSync(join(frontend, "src"), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Synthetic Test");
  git("config", "user.email", "synthetic@example.invalid");
  writeFileSync(join(root, ".gitignore"), "frontend/node_modules/\n");
  writeFileSync(join(frontend, "src/input.ts"), "export const input = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  return { root, frontend, git };
}

describe("build identity", () => {
  it("serializes clean full SHA in canonical property order with newline", () => {
    const { frontend, git } = repository();
    const revision = git("rev-parse", "HEAD");
    expect(generateBuildInfo(frontend)).toEqual({
      schema_version: "1.0",
      revision,
      source_state: "CLEAN",
    });
    expect(serializeBuildInfo(generateBuildInfo(frontend))).toBe(
      '{"schema_version":"1.0","revision":"' +
        revision +
        '","source_state":"CLEAN"}\n',
    );
  });
  it.each(["tracked", "untracked"])("marks %s build source dirty", (kind) => {
    const { frontend } = repository();
    writeFileSync(
      join(frontend, kind === "tracked" ? "src/input.ts" : "src/new.ts"),
      "changed\n",
    );
    expect(generateBuildInfo(frontend).source_state).toBe("DIRTY");
  });
  it("ignores generated artifacts, ignored dependencies and unrelated domains", () => {
    const { root, frontend } = repository();
    for (const directory of [
      ".output",
      ".wxt",
      "coverage",
      "dist-site",
      "node_modules",
    ]) {
      mkdirSync(join(frontend, directory));
      writeFileSync(join(frontend, directory, "generated.js"), "generated\n");
    }
    writeFileSync(join(root, "backend-change.py"), "unrelated\n");
    expect(generateBuildInfo(frontend).source_state).toBe("CLEAN");
  });
  it("returns UNKNOWN without repository metadata or a working git executable", () => {
    const root = mkdtempSync(join(tmpdir(), "cf-no-git-"));
    directories.push(root);
    expect(generateBuildInfo(root)).toEqual({
      schema_version: "1.0",
      revision: null,
      source_state: "UNKNOWN",
    });
    expect(
      generateBuildInfo(repository().frontend, "missing-cf-git-executable"),
    ).toEqual({
      schema_version: "1.0",
      revision: null,
      source_state: "UNKNOWN",
    });
  });
  it("does not retain earlier revision or dirty state across dev/build/zip generation", () => {
    const { frontend, git } = repository();
    const first = generateBuildInfo(frontend);
    writeFileSync(join(frontend, "src/input.ts"), "export const input = 2;\n");
    expect(generateBuildInfo(frontend).source_state).toBe("DIRTY");
    git("add", ".");
    git("commit", "--quiet", "-m", "second");
    const second = generateBuildInfo(frontend);
    expect(second.revision).not.toBe(first.revision);
    expect(second.source_state).toBe("CLEAN");
  });
});
