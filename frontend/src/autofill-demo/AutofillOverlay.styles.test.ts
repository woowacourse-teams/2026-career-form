import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/autofill-demo/AutofillOverlay.module.css"),
  "utf8",
);

function declarationsOf(selector: string): string | undefined {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return undefined;
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

it("draws no focus outline on the programmatically focused, non-interactive panel", () => {
  expect(declarationsOf('.panel[tabindex="-1"]:focus')).toMatch(
    /outline:\s*none/,
  );
});

it("leaves the focus styles of interactive controls alone", () => {
  const suppressed = [
    ...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g),
  ]
    .filter(([, , body]) => /outline:\s*none/.test(body!))
    .map(([, selector]) => selector!.trim());
  expect(suppressed).toEqual(['.panel[tabindex="-1"]:focus']);
});
