import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Chrome gives chrome-extension pages their own body font, so inheriting from
// :root leaves extension screens in a system font.
it("sets the UI font on body itself", () => {
  const sheet = document.createElement("style");
  sheet.textContent = readFileSync("src/styles/global.css", "utf8").replace(
    /^@import.*$/gm,
    "",
  );
  document.head.append(sheet);
  try {
    const body = [...sheet.sheet!.cssRules].find(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText === "body",
    );
    expect(body?.style.getPropertyValue("font-family")).toBe("var(--font-ui)");
  } finally {
    sheet.remove();
  }
});
