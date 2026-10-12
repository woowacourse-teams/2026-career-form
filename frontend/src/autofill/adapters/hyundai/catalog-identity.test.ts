import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHyundaiCatalogFixture,
  runHyundaiCatalogQa,
} from "./catalog-qa.test-fixtures";
import { retainedCatalogSelection } from "../../profile/catalog-receipt";
import { hyundaiWriteAdapter } from "./write";
import { CandidateRegistry } from "../../dom/candidate-registry";
import { settledGenericResult } from "../../write/native-executor";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(
    document.body,
  );
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("runs all five supported catalog controls through production modules", async () => {
  const reports = await runHyundaiCatalogQa(document);
  expect(reports).toHaveLength(5);
  expect(reports.every((report) => report.written)).toBe(true);
  expect(
    reports
      .slice(0, 4)
      .every((report) => report.code === "SITE-42" && report.clicks === 1),
  ).toBe(true);
});

describe.each([
  "highSchool",
  "university",
  "graduateSchool",
  "languageTest",
] as const)("%s catalog selection", (kind) => {
  it.each([
    "duplicate",
    "stale-identity",
    "wrong-kind",
    "protected",
    "wrong-code",
  ] as const)(
    "rejects %s and does not replace protected values",
    async (mode) => {
      const fixture = createHyundaiCatalogFixture(document, kind, mode);
      expect(await fixture.run()).toBe(false);
      if (mode !== "wrong-code") expect(fixture.clicks()).toBe(0);
      if (mode === "protected") {
        expect(fixture.display.value).toBe("User value");
        expect(fixture.hidden?.value).toBe("USER");
      }
    },
  );
  it("does not infer a receipt from an existing approved label and code", async () => {
    const fixture = createHyundaiCatalogFixture(document, kind);
    fixture.display.value = fixture.label;
    fixture.hidden!.value = "SITE-42";
    if (kind !== "languageTest")
      fixture.display.dataset.searchResult = fixture.label;
    expect(await fixture.run()).toBe(false);
    expect(fixture.clicks()).toBe(0);
  });
  it("rejects an edited approval instead of broadening catalog labels", async () => {
    const fixture = createHyundaiCatalogFixture(document, kind);
    fixture.item.catalogMatch = {
      ...fixture.item.catalogMatch!,
      labels: [...fixture.item.catalogMatch!.labels, "Unapproved"],
    };
    expect(await fixture.run()).toBe(false);
    expect(fixture.clicks()).toBe(0);
  });
  it("retains only the captured exact label, code, and field ownership", async () => {
    const fixture = createHyundaiCatalogFixture(document, kind);
    expect(await fixture.run()).toBe(true);
    expect(retainedCatalogSelection(fixture.item, fixture.display)).toBe(
      fixture.label,
    );
    expect(await fixture.run()).toBe(true);
    expect(fixture.clicks()).toBe(1);
    fixture.hidden!.value = "ANOTHER";
    expect(
      retainedCatalogSelection(fixture.item, fixture.display),
    ).toBeUndefined();
    expect(await fixture.run()).toBe(false);
    fixture.hidden!.value = "SITE-42";
    // Even a different approved spelling is not the exact captured selection.
    fixture.display.value = fixture.entry.name;
    expect(fixture.entry.name).not.toBe(fixture.label);
    if (kind !== "languageTest")
      fixture.display.dataset.searchResult = fixture.entry.name;
    expect(
      retainedCatalogSelection(fixture.item, fixture.display),
    ).toBeUndefined();
    fixture.display.dataset.searchResult = fixture.label;
    fixture.display.value = fixture.label + " changed";
    expect(
      retainedCatalogSelection(fixture.item, fixture.display),
    ).toBeUndefined();
    fixture.display.value = fixture.label;
    document.body.append(fixture.hidden!);
    expect(
      retainedCatalogSelection(fixture.item, fixture.display),
    ).toBeUndefined();
  });
});

describe.each(["highSchool", "university", "graduateSchool"] as const)(
  "%s detail/freshness",
  (kind) => {
    it.each(["no-detail", "stale-query", "cancel"] as const)(
      "rejects %s and restores owned blank values",
      async (mode) => {
        const fixture = createHyundaiCatalogFixture(document, kind, mode);
        expect(await fixture.run()).toBe(false);
        expect(fixture.display.value).toBe("");
        expect(fixture.hidden?.value).toBe("");
        expect(
          fixture.display.closest(".field")?.classList.contains("exist"),
        ).toBe(false);
      },
    );
    it("rejects short, hidden, duplicate-ID and shared descriptions", async () => {
      for (const mode of [
        "short",
        "hidden",
        "duplicate-id",
        "shared",
      ] as const) {
        const fixture = createHyundaiCatalogFixture(document, kind);
        fixture.display.addEventListener("keyup", () => {
          const detail = fixture.results!.querySelector<HTMLElement>("span")!;
          if (mode === "short")
            detail.textContent = fixture.entry.detail.slice(0, 1);
          if (mode === "hidden") detail.hidden = true;
          if (mode === "duplicate-id")
            fixture.results!.append(detail.cloneNode(true));
          if (mode === "shared") {
            const other = document.createElement("button");
            other.setAttribute("aria-describedby", detail.id);
            fixture.results!.append(other);
          }
        });
        expect(await fixture.run()).toBe(false);
        expect(fixture.clicks()).toBe(0);
      }
    });
    it("does not restore over a user mutation during failed selection", async () => {
      const fixture = createHyundaiCatalogFixture(document, kind);
      fixture.display.addEventListener("keyup", () => {
        fixture
          .results!.querySelector("button")!
          .addEventListener("click", () => {
            fixture.display.value = "User edit";
            fixture.hidden!.value = "USER";
          });
      });
      expect(await fixture.run()).toBe(false);
      expect(fixture.display.value).toBe("User edit");
      expect(fixture.hidden!.value).toBe("USER");
    });
  },
);

it("preserves policy optionMap authorization independently of exam catalog aliases", async () => {
  const fixture = createHyundaiCatalogFixture(document, "languageTest");
  const binding = fixture.item.analysis!.valueBinding;
  if (binding?.type !== "BUTTON_OPTION")
    throw new Error("Wrong fixture binding");
  binding.optionMap = {};
  expect(await fixture.run()).toBe(false);
  expect(fixture.clicks()).toBe(0);
});

it.each(["stale-identity", "wrong-kind", "protected"] as const)(
  "keeps plain-text certificate protection for %s",
  async (mode) => {
    const fixture = createHyundaiCatalogFixture(document, "certificate", mode);
    expect(await fixture.run()).toBe(false);
    if (mode === "protected") expect(fixture.display.value).toBe("User value");
  },
);

it("retains plain-text certificate values exactly and rejects later user changes", async () => {
  const fixture = createHyundaiCatalogFixture(document, "certificate");
  expect(await fixture.run()).toBe(true);
  const registry = new CandidateRegistry();
  registry.registerField(fixture.handle);
  expect(settledGenericResult(fixture.item, registry).status).toBe("written");
  fixture.display.value = "User edit";
  expect(settledGenericResult(fixture.item, registry).status).toBe("skipped");
  expect(await fixture.run()).toBe(false);
  expect(fixture.display.value).toBe("User edit");
});

it("does not invent certificate dropdown/search capabilities", async () => {
  const fixture = createHyundaiCatalogFixture(document, "certificate");
  fixture.display.parentElement!.classList.add("select-wrap");
  expect(await fixture.run()).toBe(false);
  expect(fixture.display.value).toBe("");
});

it.each(["hidden", "disabled", "visibility"] as const)(
  "does not select a %s exam option",
  async (mode) => {
    const fixture = createHyundaiCatalogFixture(document, "languageTest");
    fixture.display.addEventListener("click", () => {
      const choice =
        fixture.results!.querySelector<HTMLButtonElement>("button")!;
      if (mode === "hidden") choice.hidden = true;
      if (mode === "disabled") choice.disabled = true;
      if (mode === "visibility") choice.style.visibility = "hidden";
    });
    expect(await fixture.run()).toBe(false);
    expect(fixture.clicks()).toBe(0);
  },
);

it("does not normalize unrelated language or grade controls using exam identity", () => {
  const fixture = createHyundaiCatalogFixture(document, "languageTest");
  fixture.handle.candidate.domId = "foreLang_1";
  fixture.display.id = "foreLang_1";
  expect(hyundaiWriteAdapter.tryWrite(fixture.handle, fixture.item)).toEqual({
    handled: true,
    written: false,
  });
});
