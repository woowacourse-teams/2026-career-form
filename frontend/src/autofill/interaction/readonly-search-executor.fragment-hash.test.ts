/**
 * Bug condition exploration (Property 1, task 2): URL guard after a fragment
 * result link click.
 *
 * A same-document dialog with explicit result signals is used so the flow
 * reaches result selection on the unfixed code. Expected behavior: clicking
 * the owned exact `<a href="#n" onclick>` once selects the value, and the URL
 * changing only to that link's own fragment (in a later task, T1-5) is not
 * `surface_navigation_unsafe`. The assertions are made after the executor has
 * crossed that task and finished its polling and 500ms hold.
 *
 * On the unfixed code the flow is expected to stop earlier at the fragment
 * link (`safeActivation` rejects its on* attribute), so the hash guard itself
 * is only reachable once C10's activation branch exists. The guard is an
 * internal closure of `executeReadonlySearch`, so it is observed through the
 * executor result rather than as a unit.
 *
 * **Validates: Requirements 2.13, 2.14, 2.15**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectFieldsSnapshot } from "../dom/collect";
import { createFragmentDialogFixture } from "../workflow/test-utils/fragment-dialog.fixture";
import { executeReadonlySearch } from "./readonly-search-executor";

const PAGE_URL = "https://careers.example.test/apply?step=1";
const VALUE = "<고등학교명>";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

async function runSearch(target: HTMLInputElement) {
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" && lookup.handle.elements[0] === target
      );
    });
  if (!candidate) throw new Error("readonly target was not collected");
  const pending = executeReadonlySearch({
    document,
    registry: snapshot.registry,
    targetCandidateId: candidate.candidateId,
    canonicalFieldKey: "education.highSchool.schoolName",
    expectedValue: VALUE,
    expectedCurrentValue: "",
  });
  await vi.runAllTimersAsync();
  return pending;
}

describe("fragment result link URL guard (bug condition, 2.15)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPageUrl(PAGE_URL);
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    setPageUrl(PAGE_URL);
  });

  it("allows the URL to change only to the clicked link's own fragment", async () => {
    const fixture = createFragmentDialogFixture({ value: VALUE, href: "#n" });
    const result = await runSearch(fixture.target);

    expect("reason" in result ? result.reason : undefined).not.toBe(
      "surface_navigation_unsafe",
    );
    expect(result.status).toBe("selected");
    expect(fixture.clicks.result).toBe(1);
    expect(fixture.target.value).toBe(VALUE);
    // The asynchronous fragment navigation has landed by now.
    expect(document.URL).toBe(`${PAGE_URL}#n`);
  });

  it("also selects when the handler prevents the fragment navigation", async () => {
    const fixture = createFragmentDialogFixture({
      value: VALUE,
      href: "#n",
      preventDefault: true,
    });
    const result = await runSearch(fixture.target);

    expect(result.status).toBe("selected");
    expect(fixture.clicks.result).toBe(1);
    expect(document.URL).toBe(PAGE_URL);
  });

  it.each([
    ["another fragment", "#other"],
    ["another path", "/elsewhere?step=1#n"],
    ["another query", "?step=2#n"],
  ])("rejects %s after the result click", async (_name, url) => {
    const fixture = createFragmentDialogFixture({
      value: VALUE,
      href: "#n",
      preventDefault: true,
      onSelect: () => history.replaceState(null, "", url),
    });
    const result = await runSearch(fixture.target);

    expect(result.status).toBe("failed");
    expect("reason" in result ? result.reason : undefined).toBe(
      "surface_navigation_unsafe",
    );
    expect(fixture.clicks.result).toBe(1);
  });

  it("rejects a fragment change before the result click", async () => {
    const fixture = createFragmentDialogFixture({ value: VALUE, href: "#n" });
    const moveHash = (event: Event) => {
      if ((event.target as Element).id === "submit")
        history.replaceState(null, "", "#n");
    };
    document.addEventListener("click", moveHash);
    const result = await runSearch(fixture.target).finally(() =>
      document.removeEventListener("click", moveHash),
    );

    expect("reason" in result ? result.reason : undefined).toBe(
      "surface_navigation_unsafe",
    );
    expect(fixture.clicks.result).toBe(0);
  });
});
