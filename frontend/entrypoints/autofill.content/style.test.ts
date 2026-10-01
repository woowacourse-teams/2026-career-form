import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

describe("autofill content-script host styles", () => {
  it("leaves clicks outside the panel available despite the important shadow reset", () => {
    const host = document.createElement("career-form-profile-panel");
    const panel = document.createElement("div");
    panel.className = "career-form-in-page-panel";
    host.append(panel);
    const sheet = document.createElement("style");
    const styles = readFileSync(
      `${process.cwd()}/entrypoints/autofill.content/style.css`,
      "utf8",
    );
    // jsdom does not expand `all: initial`; spell out its pointer-event effect.
    // Map :host into light DOM because jsdom does not compute shadow CSS.
    sheet.textContent = `career-form-profile-panel { pointer-events: auto !important; }
      ${styles.replace(/^@import.*$/gm, "").replaceAll(":host", "career-form-profile-panel")}`;
    document.head.append(sheet);
    document.body.append(host);
    try {
      expect(getComputedStyle(host).pointerEvents).toBe("none");
      expect(getComputedStyle(panel).pointerEvents).toBe("auto");
    } finally {
      host.remove();
      sheet.remove();
    }
  });

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
