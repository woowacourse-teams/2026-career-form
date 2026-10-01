import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  referenceObserveResults,
  referenceResultBaseline,
} from "../workflow/test-utils/preservation-reference";
import { LOCAL_RESULT_STABLE_MS } from "./local-result-readiness";
import { observeResults, resultBaseline } from "./search-results";
import { SearchSurface, type SearchSurfaceKind } from "./search-surface";
import { SearchSession } from "./search-session";

const VALUE = "<학교명>";
const flush = () => Promise.resolve();
const sessions: SearchSession[] = [];

const item = (text: string, attributes = "") => {
  const li = document.createElement("li");
  li.innerHTML = `<button type="button"${attributes}>${text}</button>`;
  return li;
};

function setup({
  kind = "same-document-layer" as SearchSurfaceKind,
  prefill = 0,
  listAttributes = "",
  extra = "",
  lists = 1,
} = {}) {
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly><div id="container"><h4>학교명 조회</h4><div><input type="text"><button type="button">검색</button></div>${`<h5>검색 결과</h5><ul ${listAttributes}></ul>`.repeat(lists)}${extra}</div>`;
  const container = document.querySelector<HTMLElement>("#container")!;
  const list = container.querySelector("ul")!;
  list.append(...Array.from({ length: prefill }, (_, i) => item(`<이전${i}>`)));
  const surface = new SearchSurface(
    kind,
    container,
    container,
    document.querySelector<HTMLElement>("#opener")!,
    document.querySelector<HTMLInputElement>("#target")!,
  );
  const baseline = resultBaseline(surface);
  const referenceBaseline = referenceResultBaseline(surface);
  const session = new SearchSession({
    document,
    registry: undefined as never,
    targetCandidateId: "field-1",
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: VALUE,
  });
  sessions.push(session);
  surface.queryGeneration++;
  const observed = observeResults(surface, session, baseline, VALUE);
  const reference = referenceObserveResults(
    surface,
    session,
    referenceBaseline,
    VALUE,
  );
  const outcome = (exact: typeof observed.exact) => {
    try {
      const result = exact([VALUE]);
      return result ? "selected" : "pending";
    } catch (error) {
      return (error as { reason: string }).reason;
    }
  };
  const decide = () => outcome(observed.exact);
  const decideBeforeFix = () => outcome(reference.exact);
  return { surface, list, container, decide, decideBeforeFix };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
});
afterEach(() => {
  for (const session of sessions.splice(0)) session.stop();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("local result stability (C12)", () => {
  it("waits the stable time after a synchronous replacement", async () => {
    const { list, decide } = setup({ prefill: 1 });
    list.replaceChildren(item(VALUE), item("<다른학교>"));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS - 1);
    expect(decide()).toBe("pending");
    vi.advanceTimersByTime(1);
    expect(decide()).toBe("selected");
  });

  it("restarts the stable time on every chunk", async () => {
    const { list, decide } = setup();
    list.append(item("<다른학교>"));
    await flush();
    vi.advanceTimersByTime(200);
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(200);
    expect(decide()).toBe("pending");
    vi.advanceTimersByTime(100);
    expect(decide()).toBe("selected");
  });
});

describe("list replacement (C12)", () => {
  it("does not treat an append to a prefilled list as a replacement", async () => {
    const { list, decide } = setup({ prefill: 1 });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("pending");
  });

  it("accepts the first append to an empty list", async () => {
    const { list, decide } = setup();
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("selected");
  });

  it("accepts a refill with the same text as a replacement", async () => {
    const { list, decide } = setup({ prefill: 1 });
    list.replaceChildren(item(list.textContent ?? ""));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("search_results_not_found");
  });

  it("ignores text-only changes", async () => {
    const { list, decide } = setup({ prefill: 1 });
    list.querySelector("button")!.firstChild!.textContent = VALUE;
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("pending");
  });

  it("ignores mutations from before this generation and reports stale generations", async () => {
    const { list, surface, decide } = setup();
    // Mutations before observeResults are not recorded; none happen after.
    expect(decide()).toBe("pending");
    list.append(item(VALUE));
    await flush();
    surface.queryGeneration++;
    expect(decide()).toBe("result_stale");
  });
});

describe("explicit signals keep the existing decision (C12)", () => {
  it.each([
    'aria-busy="false"',
    'data-search-complete="false"',
    `data-search-query="${VALUE}" data-search-complete="false"`,
    `data-search-query="${VALUE}" data-search-complete="true" data-result-count="3"`,
    `data-search-query="${VALUE}" data-search-complete="true" aria-setsize="3"`,
    'data-result-count="1"',
  ])("%s on the result root", async (attributes) => {
    const { list, decide, decideBeforeFix } = setup({
      listAttributes: attributes,
    });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe(decideBeforeFix());
    expect(decide()).not.toBe("selected");
  });

  it("keeps data-search-complete=false incomplete once the query is tagged", async () => {
    const { list, decide } = setup({
      listAttributes: `data-search-query="${VALUE}" data-search-complete="true"`,
      extra: '<div data-search-complete="false"></div>',
    });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("result_set_incomplete");
  });

  it("aria-posinset on an item", async () => {
    const { list, decide, decideBeforeFix } = setup();
    list.append(item(VALUE, ' aria-posinset="1"'));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe(decideBeforeFix());
    expect(decide()).not.toBe("selected");
  });

  it("a same-document dialog with the same DOM", async () => {
    const { list, decide, decideBeforeFix } = setup({
      kind: "same-document-dialog",
    });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe(decideBeforeFix());
    expect(decide()).toBe("pending");
  });
});

describe("zero-result notices (C12)", () => {
  it("rejects results next to a visible zero notice", async () => {
    const { list, decide } = setup({ extra: "<p>검색 결과가 없습니다.</p>" });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("result_set_incomplete");
  });

  it("rejects an empty list whose notice stays hidden", async () => {
    const { list, decide } = setup({
      prefill: 1,
      extra: "<p hidden>검색 결과가 없습니다.</p>",
    });
    list.replaceChildren(item("<안내>"));
    list.firstElementChild!.replaceChildren();
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("result_set_incomplete");
  });

  it("waits for an empty list without a notice", async () => {
    const { list, decide } = setup({ prefill: 1 });
    list.replaceChildren(document.createElement("li"));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("pending");
  });

  it("stays pending when a zero-result response leaves no mutation", async () => {
    const { list, decide } = setup({ extra: "<p>검색 결과가 없습니다.</p>" });
    list.innerHTML = "";
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("pending");
  });
});

describe("incomplete and ambiguous result sets (C12)", () => {
  it.each([
    '<a href="#" rel="next">2</a>',
    '<button type="button">더 보기</button>',
    '<button type="button">다음 페이지</button>',
    '<div data-has-more="true"></div>',
    '<div data-virtualized="true"></div>',
  ])("blocks %s", async (extra) => {
    const { list, decide } = setup({ extra });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("result_set_incomplete");
  });

  it("reports two result roots as ambiguous", async () => {
    const { list, decide } = setup({ lists: 2 });
    list.append(item(VALUE));
    await flush();
    vi.advanceTimersByTime(LOCAL_RESULT_STABLE_MS);
    expect(decide()).toBe("surface_ambiguous");
  });
});
