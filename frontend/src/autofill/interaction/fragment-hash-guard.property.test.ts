/**
 * Bug condition exploration (Property 1, task 2): for any fragment result
 * link, a URL change to exactly that link's own fragment is allowed.
 *
 * `forAllSeeded` is synchronous, so it only generates the cases here; each
 * case is then run through the async executor and failures report the seed
 * and run index. Expected to FAIL on the unfixed code (see
 * `readonly-search-executor.fragment-hash.test.ts` for reachability).
 *
 * The preservation property (Property 2, task 3) keeps every other URL change
 * after a result click (origin, path, query, a different hash) failing with
 * `surface_navigation_unsafe`; it passes on the unfixed code.
 *
 * **Validates: Requirements 2.13, 2.15, 3.11**
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { collectFieldsSnapshot } from "../dom/collect";
import { createFragmentDialogFixture } from "../workflow/test-utils/fragment-dialog.fixture";
import {
  bool,
  DEFAULT_SEEDS,
  forAllSeeded,
  pick,
  string,
} from "../workflow/test-utils/seeded-generators";
import { executeReadonlySearch } from "./readonly-search-executor";

const PAGE_URL = "https://careers.example.test/apply?step=1";

interface HashCase {
  readonly fragment: string;
  readonly value: string;
  readonly preventDefault: boolean;
}

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

beforeEach(() => {
  vi.useFakeTimers();
  setPageUrl(PAGE_URL);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  setPageUrl(PAGE_URL);
});

async function searchWithFixture(
  options: Parameters<typeof createFragmentDialogFixture>[0],
  expectedValue: string,
) {
  const fixture = createFragmentDialogFixture(options);
  const snapshot = collectFieldsSnapshot(document);
  const candidate = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items?.flatMap((item) => item.fields) ?? []),
    ])
    .find((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      return (
        lookup.status === "blocked" &&
        lookup.handle.elements[0] === fixture.target
      );
    });
  if (!candidate) throw new Error("readonly target was not collected");
  const pending = executeReadonlySearch({
    document,
    registry: snapshot.registry,
    targetCandidateId: candidate.candidateId,
    canonicalFieldKey: "education.highSchool.schoolName",
    expectedValue,
    expectedCurrentValue: "",
  });
  await vi.runAllTimersAsync();
  return { fixture, result: await pending };
}

type Navigation = "origin" | "path" | "query" | "other-hash";

function navigate(kind: Navigation, token: string): void {
  switch (kind) {
    case "origin":
      setPageUrl(`https://other.example.test/apply?step=1`);
      return;
    case "path":
      history.replaceState(null, "", `/${token}?step=1`);
      return;
    case "query":
      history.replaceState(null, "", `/apply?step=${token}`);
      return;
    case "other-hash":
      history.replaceState(null, "", `/apply?step=1#other-${token}`);
      return;
  }
}

it("preservation: any other URL change after the result click is surface_navigation_unsafe", async () => {
  const seeds = [DEFAULT_SEEDS[0]!];
  const cases: {
    navigation: Navigation;
    href: string;
    token: string;
    value: string;
  }[] = [];
  forAllSeeded(
    "generate unsafe navigation cases",
    { seeds, runs: 8 },
    (rng) => ({
      navigation: pick(rng, ["origin", "path", "query", "other-hash"] as const),
      // Links outside the fragment bug condition; "#n" links are rejected
      // before the click on the unfixed code (result_activation_unsafe).
      href: pick(rng, ["#", ""] as const),
      token: string(rng, "abcdefghijklmnopqrstuvwxyz", 2, 6),
      value: `<${string(rng, "가나다라마바사아자차카타파하", 1, 5)}고등학교>`,
    }),
    (input) => {
      cases.push(input);
    },
  );

  for (const [run, input] of cases.entries()) {
    setPageUrl(PAGE_URL);
    const { fixture, result } = await searchWithFixture(
      {
        value: input.value,
        href: input.href,
        onSelect: () => navigate(input.navigation, input.token),
      },
      input.value,
    );
    const context = `seed=0x${seeds[0]!.toString(16)}, run=${run}, input=${JSON.stringify(input)}`;
    expect(result.status, context).toBe("failed");
    expect("reason" in result ? result.reason : undefined, context).toBe(
      "surface_navigation_unsafe",
    );
    expect(fixture.clicks.result, context).toBe(1);
    document.body.replaceChildren();
  }
});

it("property: the clicked link's own fragment never trips the URL guard", async () => {
  const seeds = [DEFAULT_SEEDS[0]!];
  const runs = 6;
  const cases: HashCase[] = [];
  forAllSeeded(
    "generate fragment hash cases",
    { seeds, runs },
    (rng) => ({
      fragment: `#${string(rng, "abcdefghijklmnopqrstuvwxyz0123456789", 1, 6)}`,
      value: `<${string(rng, "가나다라마바사아자차카타파하", 1, 5)}고등학교>`,
      preventDefault: bool(rng, 0.25),
    }),
    (input) => {
      cases.push(input);
    },
  );

  for (const [run, input] of cases.entries()) {
    setPageUrl(PAGE_URL);
    const fixture = createFragmentDialogFixture({
      value: input.value,
      href: input.fragment,
      preventDefault: input.preventDefault,
    });
    const snapshot = collectFieldsSnapshot(document);
    const candidate = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items?.flatMap((item) => item.fields) ?? []),
      ])
      .find((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return (
          lookup.status === "blocked" &&
          lookup.handle.elements[0] === fixture.target
        );
      });
    if (!candidate) throw new Error("readonly target was not collected");
    const pending = executeReadonlySearch({
      document,
      registry: snapshot.registry,
      targetCandidateId: candidate.candidateId,
      canonicalFieldKey: "education.highSchool.schoolName",
      expectedValue: input.value,
      expectedCurrentValue: "",
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    const context = `seed=0x${seeds[0]!.toString(16)}, run=${run}, input=${JSON.stringify(input)}`;
    expect("reason" in result ? result.reason : undefined, context).not.toBe(
      "surface_navigation_unsafe",
    );
    expect(result.status, context).toBe("selected");
    expect(fixture.clicks.result, context).toBe(1);
    expect(document.URL, context).toBe(
      input.preventDefault ? PAGE_URL : `${PAGE_URL}${input.fragment}`,
    );
  }
});
