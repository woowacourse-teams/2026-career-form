import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("combined collector provenance", () => {
  it("preserves collector and declaration hashes and rejects differing collector revisions", () => {
    const directory = mkdtempSync(join(tmpdir(), "cf292-combine-"));
    try {
      const driverFiles = Object.fromEntries(
        ["collector.mjs", "collector.d.mts"].map((name) => [
          `frontend/fixtures/generic-baseline/${name}`,
          createHash("sha256")
            .update(
              readFileSync(
                join(process.cwd(), "fixtures/generic-baseline", name),
              ),
            )
            .digest("hex"),
        ]),
      );
      const first = join(directory, "first.json");
      const second = join(directory, "second.json");
      const meta = join(directory, "meta.json");
      const out = join(directory, "combined.json");
      const script = join(
        process.cwd(),
        "fixtures/generic-baseline/combine-timing.mjs",
      );
      writeFileSync(meta, "{}");
      writeFileSync(
        first,
        JSON.stringify({
          config: { provider: "jev" },
          driver_files: driverFiles,
        }),
      );
      writeFileSync(
        second,
        JSON.stringify({
          config: { provider: "openai" },
          driver_files: driverFiles,
        }),
      );
      execFileSync(process.execPath, [
        script,
        "--meta",
        meta,
        "--out",
        out,
        first,
        second,
      ]);
      expect(JSON.parse(readFileSync(out, "utf8")).meta.driver_files).toEqual(
        driverFiles,
      );
      writeFileSync(
        second,
        JSON.stringify({
          config: { provider: "openai" },
          driver_files: {
            ...driverFiles,
            "frontend/fixtures/generic-baseline/collector.mjs": "different",
          },
        }),
      );
      expect(() =>
        execFileSync(
          process.execPath,
          [script, "--meta", meta, "--out", out, first, second],
          { stdio: "pipe" },
        ),
      ).toThrow("Provider timing files differ in driver_files");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
