// @vitest-environment node
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { installedBuildScript } from "../../scripts/build-info";
import type { BuildInfo } from "../../scripts/build-info";

describe("installed build snapshot", () => {
  it("keeps A immutable until a new installed context loads B", () => {
    const a = {
      schema_version: "1.0" as const,
      revision: "a".repeat(40),
      source_state: "CLEAN" as const,
    };
    const b = { ...a, revision: "b".repeat(40) };
    const installedA = {};
    runInNewContext(installedBuildScript(a), installedA);
    const query = (installedA as { __careerFormBuildInfo: () => typeof a })
      .__careerFormBuildInfo;
    a.revision = b.revision;
    expect(query().revision).toBe("a".repeat(40));
    expect(Object.isFrozen(query())).toBe(true);
    const installedB = {};
    runInNewContext(installedBuildScript(b), installedB);
    expect(
      (
        installedB as { __careerFormBuildInfo: () => typeof b }
      ).__careerFormBuildInfo(),
    ).toEqual(b);
  });
  it.each(["DIRTY", "UNKNOWN"] as const)(
    "exposes %s without promoting it",
    (source_state) => {
      const context = {};
      const info: BuildInfo = {
        schema_version: "1.0",
        revision: source_state === "UNKNOWN" ? null : "a".repeat(40),
        source_state,
      };
      runInNewContext(installedBuildScript(info), context);
      expect(
        (
          context as { __careerFormBuildInfo: () => BuildInfo }
        ).__careerFormBuildInfo(),
      ).toEqual(info);
      expect(() =>
        runInNewContext(
          "globalThis.__careerFormBuildInfo = () => null",
          context,
        ),
      ).not.toThrow();
      expect(
        (
          context as { __careerFormBuildInfo: () => BuildInfo }
        ).__careerFormBuildInfo(),
      ).toEqual(info);
    },
  );
});
