/**
 * Preservation (Property 2, task 3): `exact()` readiness and completeness
 * outside the local result readiness bug condition.
 *
 * For dialog, same-origin iframe and inline listbox surfaces, and for any
 * result area with an explicit result signal, `exact()` must return the same
 * result or failure reason as the pre-fix reference copy. Generation changes
 * keep failing with `result_stale`. Passes on the unfixed code.
 *
 * **Validates: Requirements 3.19, 3.20, 3.21, 3.22**
 *
 * Bug condition (Property 4, task 4.8): for a role-less same-document layer
 * without any explicit result signal, `exact()` follows the local readiness
 * decision table. Fails on the code before C12.
 *
 * **Validates: Requirements 2.17, 2.18, 2.19, 2.20**
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  referenceObserveResults,
  referenceResultBaseline,
} from "../workflow/test-utils/preservation-reference";
import {
  bool,
  forAllSeeded,
  int,
  pick,
} from "../workflow/test-utils/seeded-generators";
import { observeResults, resultBaseline } from "./search-results";
import { SearchSurface, type SearchSurfaceKind } from "./search-surface";
import { SearchSession } from "./search-session";

const VALUE = "<학교명>";

type Kind =
  | "same-document-dialog"
  | "same-origin-iframe"
  | "inline-listbox"
  | "same-document-layer";

interface ResultCase {
  readonly kind: Kind;
  readonly query: string | undefined;
  readonly tagged: boolean;
  readonly complete: "true" | "false" | undefined;
  readonly declaredCount: "exact" | "mismatch" | undefined;
  readonly setsize: "all" | "some" | undefined;
  readonly posinset: boolean;
  readonly busy: "none" | "true" | "cycle";
  readonly paging: string | undefined;
  readonly more: boolean;
  readonly others: number;
  readonly matches: number;
  readonly unsafeMatch: boolean;
  readonly bumpGeneration: boolean;
}

const PAGING = [
  'rel="next"',
  'aria-label="pagination"',
  'aria-label="페이지 이동"',
  'data-has-more="true"',
  'data-virtualized="true"',
  'data-search-complete="false"',
] as const;

function generate(rng: () => number): ResultCase {
  const kind = pick(rng, [
    "same-document-dialog",
    "same-origin-iframe",
    "inline-listbox",
    "same-document-layer",
  ] as const);
  const input: ResultCase = {
    kind,
    query: bool(rng, 0.85) ? VALUE : undefined,
    tagged: bool(rng, 0.85),
    complete: bool(rng, 0.6)
      ? "true"
      : pick(rng, ["false", undefined] as const),
    declaredCount: bool(rng, 0.5)
      ? undefined
      : pick(rng, ["exact", "exact", "mismatch"] as const),
    setsize: bool(rng, 0.6)
      ? undefined
      : pick(rng, ["all", "all", "some"] as const),
    posinset: bool(rng, 0.3),
    busy: bool(rng, 0.7) ? "none" : pick(rng, ["true", "cycle"] as const),
    paging: bool(rng, 0.1) ? pick(rng, PAGING) : undefined,
    more: bool(rng, 0.1),
    others: int(rng, 0, 3),
    matches: int(rng, 0, 2),
    unsafeMatch: bool(rng, 0.15),
    bumpGeneration: bool(rng, 0.15),
  };
  // A role-less layer is outside the bug condition only with an explicit
  // result signal (tagged query, completion, count, set size or busy state).
  if (
    kind === "same-document-layer" &&
    !input.tagged &&
    input.complete === undefined &&
    input.declaredCount === undefined &&
    input.setsize === undefined &&
    input.busy === "none"
  )
    return { ...input, complete: "true" };
  return input;
}

function itemsMarkup(input: ResultCase): string {
  const texts = [
    ...Array.from({ length: input.matches }, () => VALUE),
    ...Array.from({ length: input.others }, (_, index) => `<다른학교${index}>`),
  ];
  const total = texts.length;
  return texts
    .map((text, index) => {
      const setsize =
        input.setsize === "all" || (input.setsize === "some" && index === 0)
          ? ` aria-setsize="${total}"`
          : "";
      const posinset = input.posinset ? ` aria-posinset="${index + 1}"` : "";
      if (input.unsafeMatch && text === VALUE && index === 0)
        return `<li><a href="javascript:location.assign('/x')"${setsize}${posinset}>${text}</a></li>`;
      return `<li><button type="button"${setsize}${posinset}>${text}</button></li>`;
    })
    .join("");
}

function rootAttributes(input: ResultCase, count: number): string {
  return [
    input.kind === "same-document-layer" ? "" : "data-search-results",
    input.tagged ? `data-search-query="${VALUE}"` : "",
    input.complete ? `data-search-complete="${input.complete}"` : "",
    input.declaredCount === "exact"
      ? `data-result-count="${count}"`
      : input.declaredCount === "mismatch"
        ? `data-result-count="${count + 1}"`
        : "",
    input.busy === "none" ? "" : 'aria-busy="true"',
  ].join(" ");
}

function resultsMarkup(input: ResultCase): string {
  const count = input.matches + input.others;
  const paging = input.paging ? `<a href="#" ${input.paging}>2</a>` : "";
  const more = input.more ? '<button type="button">더 보기</button>' : "";
  const list = `<ul ${rootAttributes(input, count)}>${itemsMarkup(input)}</ul>`;
  return input.kind === "same-document-layer"
    ? `<h4>검색 결과</h4>${list}${paging}${more}`
    : `${list}${paging}${more}`;
}

interface Built {
  readonly surface: SearchSurface;
  readonly results: () => HTMLElement;
}

function build(input: ResultCase): Built {
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly><div id="container"></div>`;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const container = document.querySelector<HTMLElement>("#container")!;
  if (input.kind === "same-origin-iframe") {
    const frame = document.createElement("iframe");
    container.append(frame);
    const frameDocument = frame.contentDocument!;
    // Same setup as search-results.test.ts: an accessible srcdoc frame.
    Object.defineProperty(frameDocument, "URL", {
      configurable: true,
      value: "about:srcdoc",
    });
    frameDocument.body.innerHTML = resultsMarkup(input);
    return {
      surface: new SearchSurface(
        input.kind,
        container,
        frameDocument,
        opener,
        target,
        frame,
      ),
      results: () => frameDocument.querySelector<HTMLElement>("ul")!,
    };
  }
  if (input.kind === "inline-listbox") {
    // The listbox itself is the result root: move the list's signals onto it.
    container.innerHTML = resultsMarkup(input);
    const list = container.querySelector("ul")!;
    for (const attribute of Array.from(list.attributes))
      container.setAttribute(attribute.name, attribute.value);
    container.setAttribute("role", "listbox");
    list.replaceWith(...Array.from(list.childNodes));
    return {
      surface: new SearchSurface(
        input.kind,
        container,
        container,
        opener,
        target,
      ),
      results: () => container,
    };
  } else {
    if (input.kind === "same-document-dialog") {
      container.setAttribute("role", "dialog");
      container.setAttribute("aria-modal", "true");
    }
    container.innerHTML = resultsMarkup(input);
  }
  return {
    // "same-document-layer" is added by C9; the pre-fix class accepts any kind.
    surface: new SearchSurface(
      input.kind as SearchSurfaceKind,
      container,
      container,
      opener,
      target,
    ),
    results: () => container.querySelector<HTMLElement>("ul")!,
  };
}

type Outcome =
  | {
      readonly selected: Element | undefined;
      readonly signature: string | undefined;
    }
  | { readonly reason: string };

function outcome(
  run: () => { element: Element; signature: string } | undefined,
): Outcome {
  try {
    const result = run();
    return { selected: result?.element, signature: result?.signature };
  } catch (error) {
    return { reason: (error as { reason?: string }).reason ?? String(error) };
  }
}

function newSession(): SearchSession {
  return new SearchSession({
    document,
    registry: undefined as never,
    targetCandidateId: "field-1",
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: VALUE,
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("exact() readiness and completeness preservation (Property 2)", () => {
  it("matches the pre-fix exact() outside the local readiness bug condition", async () => {
    const cases: ResultCase[] = [];
    forAllSeeded(
      "explicit-signal result areas",
      { runs: 150 },
      generate,
      (input) => {
        cases.push(input);
      },
    );
    for (const [run, input] of cases.entries()) {
      const { surface, results } = build(input);
      const liveSession = newSession();
      const referenceSession = newSession();
      try {
        const live = observeResults(
          surface,
          liveSession,
          resultBaseline(surface),
          input.query,
        );
        const reference = referenceObserveResults(
          surface,
          referenceSession,
          referenceResultBaseline(surface),
          input.query,
        );
        const context = `run=${run}, input=${JSON.stringify(input)}`;
        const compare = () =>
          expect(
            outcome(() => live.exact([VALUE])),
            context,
          ).toEqual(outcome(() => reference.exact([VALUE])));
        compare();
        if (input.busy === "cycle") {
          const root = results();
          root.setAttribute("aria-busy", "false");
          root.insertAdjacentHTML("beforeend", "");
          root.append(root.ownerDocument.createComment("refresh"));
          // Let both observers record the busy transition.
          await Promise.resolve();
          compare();
        }
        if (input.bumpGeneration) {
          surface.queryGeneration++;
          expect(
            outcome(() => live.exact([VALUE])),
            context,
          ).toEqual({
            reason: "result_stale",
          });
          compare();
        }
      } finally {
        liveSession.stop();
        referenceSession.stop();
      }
    }
  }, 30_000);

  it("keeps the observed pre-fix reasons for representative explicit signals", () => {
    const decide = (input: Partial<ResultCase>) => {
      const full: ResultCase = {
        kind: "same-document-dialog",
        query: VALUE,
        tagged: true,
        complete: "true",
        declaredCount: undefined,
        setsize: undefined,
        posinset: false,
        busy: "none",
        paging: undefined,
        more: false,
        others: 1,
        matches: 1,
        unsafeMatch: false,
        bumpGeneration: false,
        ...input,
      };
      const { surface } = build(full);
      const session = newSession();
      try {
        const observed = observeResults(
          surface,
          session,
          resultBaseline(surface),
          full.query,
        );
        const result = outcome(() => observed.exact([VALUE]));
        return "reason" in result
          ? result.reason
          : result.selected
            ? "selected"
            : "pending";
      } finally {
        session.stop();
      }
    };
    expect(decide({})).toBe("selected");
    expect(decide({ kind: "same-document-layer" })).toBe("selected");
    expect(decide({ kind: "inline-listbox" })).toBe("selected");
    expect(decide({ kind: "same-origin-iframe" })).toBe("selected");
    expect(decide({ busy: "true" })).toBe("pending");
    expect(decide({ tagged: false, complete: undefined })).toBe("pending");
    expect(decide({ paging: 'data-has-more="true"' })).toBe(
      "result_set_incomplete",
    );
    expect(decide({ more: true })).toBe("result_set_incomplete");
    expect(decide({ declaredCount: "mismatch" })).toBe("result_set_incomplete");
    expect(decide({ matches: 2 })).toBe("multiple_matching_results");
    expect(decide({ matches: 0 })).toBe("search_results_not_found");
  });
});

type Plan = "replace" | "chunked" | "append" | "text-only" | "clear" | "none";

interface LocalCase {
  readonly prefill: number;
  readonly prior: number;
  readonly plan: Plan;
  readonly matches: number;
  readonly others: number;
  readonly chunkGaps: readonly number[];
  readonly elapsed: number;
  readonly notice: "none" | "shown" | "hidden";
  readonly paging: "none" | "next" | "more";
}

const STABLE_MS = 300;

function generateLocal(rng: () => number): LocalCase {
  const matches = int(rng, 0, 2);
  const others = int(rng, matches === 0 ? 1 : 0, 2);
  return {
    prefill: int(rng, 0, 3),
    prior: bool(rng, 0.2) ? int(rng, 1, 2) : 0,
    plan: pick(rng, [
      "replace",
      "replace",
      "chunked",
      "append",
      "text-only",
      "clear",
      "none",
    ] as const),
    matches,
    others,
    chunkGaps: Array.from({ length: int(rng, 1, 2) }, () =>
      pick(rng, [0, 50, 150, 299, 350]),
    ),
    elapsed: pick(rng, [0, 100, 299, 300, 450]),
    notice: pick(rng, ["none", "none", "shown", "hidden"] as const),
    paging: bool(rng, 0.85) ? "none" : pick(rng, ["next", "more"] as const),
  };
}

const item = (text: string) => {
  const li = document.createElement("li");
  li.innerHTML = `<button type="button">${text}</button>`;
  return li;
};

/** The decision table of Property 4. */
function expectedLocal(input: LocalCase): string {
  const existing = input.prior > 0 ? input.prior : input.prefill;
  const fresh = input.matches + input.others;
  const replaced =
    fresh > 0 &&
    (input.plan === "replace" ||
      input.plan === "chunked" ||
      (input.plan === "append" && existing === 0));
  if (!replaced) return "pending";
  const quiet = input.elapsed;
  if (quiet < STABLE_MS) return "pending";
  if (input.paging !== "none") return "result_set_incomplete";
  if (input.notice === "shown") return "result_set_incomplete";
  if (input.matches > 1) return "multiple_matching_results";
  if (input.matches === 0) return "search_results_not_found";
  return "selected";
}

async function runLocal(input: LocalCase): Promise<string> {
  const flush = () => Promise.resolve();
  const notice =
    input.notice === "none"
      ? ""
      : `<p${input.notice === "hidden" ? " hidden" : ""}>검색 결과가 없습니다.</p>`;
  const paging =
    input.paging === "next"
      ? '<a href="#" rel="next">2</a>'
      : input.paging === "more"
        ? '<button type="button">더 보기</button>'
        : "";
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly><div id="container"><h4>학교명 조회</h4><div><input type="text"><button type="button">검색</button></div><h5>검색 결과</h5><ul></ul>${notice}${paging}</div>`;
  const container = document.querySelector<HTMLElement>("#container")!;
  const list = container.querySelector("ul")!;
  list.append(
    ...Array.from({ length: input.prefill }, (_, i) => item(`<이전학교${i}>`)),
  );
  const surface = new SearchSurface(
    "same-document-layer",
    container,
    container,
    document.querySelector<HTMLElement>("#opener")!,
    document.querySelector<HTMLInputElement>("#target")!,
  );
  const baseline = resultBaseline(surface);
  if (input.prior > 0)
    list.replaceChildren(
      ...Array.from({ length: input.prior }, (_, i) => item(`<직전학교${i}>`)),
    );
  await flush();
  const session = newSession();
  try {
    surface.queryGeneration++;
    const observed = observeResults(surface, session, baseline, VALUE);
    const fresh = [
      ...Array.from({ length: input.matches }, () => item(VALUE)),
      ...Array.from({ length: input.others }, (_, i) => item(`<다른학교${i}>`)),
    ];
    if (input.plan === "replace") list.replaceChildren(...fresh);
    if (input.plan === "append") list.append(...fresh);
    if (input.plan === "clear") list.replaceChildren();
    if (input.plan === "text-only")
      for (const button of Array.from(list.querySelectorAll("button")))
        (button.firstChild as Text).data = VALUE;
    if (input.plan === "chunked") {
      // One item per chunk, so every chunk leaves a mutation record.
      const gaps = input.chunkGaps.slice(0, fresh.length - 1);
      list.replaceChildren(...fresh.slice(0, fresh.length - gaps.length));
      for (const [index, gap] of gaps.entries()) {
        await flush();
        vi.advanceTimersByTime(gap);
        list.append(fresh[fresh.length - gaps.length + index]!);
      }
    }
    await flush();
    vi.advanceTimersByTime(input.elapsed);
    const result = outcome(() => observed.exact([VALUE]));
    return "reason" in result
      ? result.reason
      : result.selected
        ? "selected"
        : "pending";
  } finally {
    session.stop();
  }
}

describe("local result readiness without explicit signals (Property 4)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the local readiness decision table", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const cases: LocalCase[] = [];
    forAllSeeded(
      "local layer results",
      { runs: 150 },
      generateLocal,
      (input) => {
        cases.push(input);
      },
    );
    for (const [run, input] of cases.entries())
      expect(
        await runLocal(input),
        `run=${run}, input=${JSON.stringify(input)}`,
      ).toBe(expectedLocal(input));
  }, 30_000);
});
