import { afterEach, expect, it } from "vitest";
import { runNativeCatalogQa } from "./catalog-qa.test-fixtures";

afterEach(() => {
  document.body.onmousedown = null;
  document.body.replaceChildren();
});

it.each(["certificate", "languageTest", "university"] as const)(
  "writes native %s using approved catalog evidence",
  async (kind) => {
    const result = await runNativeCatalogQa(document, "select", kind);
    expect(result.status, JSON.stringify(result.results)).toBe("written");
    expect(result.code).toBe("site-0");
    expect(result.protectedValue).toBe("기존 합성값");
    expect(result.profileUnchanged).toBe(true);
  },
);

it.each(["certificate", "languageTest", "university"] as const)(
  "writes dropdown %s using approved catalog evidence",
  async (kind) => {
    const result = await runNativeCatalogQa(document, "dropdown", kind);
    expect(result.status).toBe("written");
    expect(result.code).toBe("site-0");
    expect(result.clicks).toBe(1);
    expect(result.protectedValue).toBe("기존 합성값");
    expect(result.profileUnchanged).toBe(true);
  },
);

it.each(["ambiguous", "invalid"] as const)(
  "does not select native school with %s evidence",
  async (mode) => {
    const result = await runNativeCatalogQa(document, mode, "university");
    expect(result.status).toBe("skipped");
    expect(result.code).toBe("");
    expect(result.protectedValue).toBe("기존 합성값");
  },
);

it("preserves manual exact matching", async () => {
  const result = await runNativeCatalogQa(document, "legacy");
  expect(result.status).toBe("written");
  expect(result.code).toBe("site-0");
});

it("keeps a post-selection user code change instead of repairing it", async () => {
  const result = await runNativeCatalogQa(document, "post-edit");
  expect(result.edited).toBe(true);
  expect(result.status).toBe("skipped");
  expect(result.code).toBe("user-changed-code");
});
