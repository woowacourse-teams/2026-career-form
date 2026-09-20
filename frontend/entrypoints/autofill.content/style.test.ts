import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

describe("autofill content-script host styles", () => {
  it("keeps the shadow host as a viewport-level layer on hostile pages", () => {
    const styles = readFileSync(
      `${process.cwd()}/entrypoints/autofill.content/style.css`,
      "utf8",
    );
    const hostStyles = styles.match(/:host\s*\{([\s\S]*?)\}/)?.[1];

    expect(hostStyles).toContain("position: fixed");
    expect(hostStyles).toContain("inset: 0");
    expect(hostStyles).toMatch(/z-index:\s*2147483647\s*!important/);
    expect(hostStyles).toMatch(/display:\s*block\s*!important/);
    expect(hostStyles).toMatch(/width:\s*100vw\s*!important/);
    expect(hostStyles).toMatch(/height:\s*100vh\s*!important/);
  });
});
