import { afterEach, expect, it } from "vitest";
import {
  runSkCatalogQa,
  type SkCatalogQaMode,
} from "./catalog-qa.test-fixtures";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

it.each([
  "certificate",
  "exam",
  "school",
  "school-missing",
  "school-hidden",
  "school-shared",
  "school-mismatch",
  "duplicate",
  "stale",
  "wrongkind",
  "malformed",
  "protected",
  "cancelled",
  "code-changed",
  "code-changed-on-click",
  "row-changed",
] as SkCatalogQaMode[])(
  "runs the reusable browser fixture: %s",
  async (mode) => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/Application/Index/qa",
    });
    const result = await runSkCatalogQa(document, mode);
    cleanups.push(result.cleanup);
    const positive = [
      "certificate",
      "exam",
      "school",
      "code-changed",
      "row-changed",
    ].includes(mode);
    expect(result.selected).toBe(positive);
    if (positive) {
      expect(result.clicks).toBe(1);
      expect(result.retainedBefore).toBe(result.value);
      expect(result.retainedAfter).toBe(
        ["code-changed", "row-changed"].includes(mode)
          ? undefined
          : result.value,
      );
    } else if (mode === "code-changed-on-click") {
      expect(result.clicks).toBe(1);
      expect(result.retainedBefore).toBeUndefined();
    } else {
      expect(result.clicks).toBe(0);
      if (mode === "protected")
        expect(result.value).toBe("Existing user value");
    }
  },
);
