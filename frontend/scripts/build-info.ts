import { execFileSync } from "node:child_process";

export interface BuildInfo {
  schema_version: "1.0";
  revision: string | null;
  source_state: "CLEAN" | "DIRTY" | "UNKNOWN";
}

// Build inputs live under the frontend root. Other product domains do not
// affect this artifact; generated output is excluded even without .gitignore.
export function generateBuildInfo(
  frontendRoot: string,
  git = "git",
): BuildInfo {
  try {
    const run = (...args: string[]) =>
      execFileSync(git, args, {
        cwd: frontendRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    const revision = run("rev-parse", "HEAD").trim();
    if (!/^[0-9a-f]{40}$/.test(revision))
      throw new Error("Invalid Git revision");
    const changes = run(
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ".",
      ...[".output", ".wxt", "coverage", "dist-site", "node_modules"].map(
        (path) => `:(exclude)${path}/**`,
      ),
    );
    return {
      schema_version: "1.0",
      revision,
      source_state: changes ? "DIRTY" : "CLEAN",
    };
  } catch {
    // Git is optional for source distributions; never infer a revision.
    return { schema_version: "1.0", revision: null, source_state: "UNKNOWN" };
  }
}

export function serializeBuildInfo(info: BuildInfo): string {
  return (
    JSON.stringify({
      schema_version: info.schema_version,
      revision: info.revision,
      source_state: info.source_state,
    }) + "\n"
  );
}

// Prepended to background.js AFTER bundling/minification. The snapshot is
// loaded with extension code, never fetched from an overwritten unpacked file.
export function installedBuildScript(info: BuildInfo): string {
  return `/* career-form installed build */\n(() => { const snapshot = Object.freeze(JSON.parse(${JSON.stringify(serializeBuildInfo(info))})); Object.defineProperty(globalThis, "__careerFormBuildInfo", { value: () => snapshot }); })();\n`;
}
