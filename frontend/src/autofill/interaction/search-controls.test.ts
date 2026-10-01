import { afterEach, describe, expect, it } from "vitest";
import {
  queryControls,
  queryOnly,
  resolveRoles,
  searchDestination,
  submitControls,
} from "./search-controls";
import { SearchSurface } from "./search-surface";
import { SearchSession } from "./search-session";

function surfaceFixture(markup: string) {
  document.body.innerHTML = `<button id="opener" type="button">검색</button><input id="target" readonly>${markup}`;
  const container = document.querySelector<HTMLElement>("[role='dialog']")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const surface = new SearchSurface(
    "same-document-dialog",
    container,
    container,
    opener,
    target,
  );
  return { surface, container };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("generic search controls", () => {
  it("collects only visible editable semantic query inputs", () => {
    const { surface } = surfaceFixture(`
      <div role="dialog" aria-modal="true">
        <input type="text" aria-label="학교 검색어">
        <input type="search" aria-label="major search">
        <input type="text" aria-label="이름">
        <input type="text" aria-label="학교" readonly>
      </div>`);
    const inputs = queryControls(surface);
    expect(inputs.map((input) => input.getAttribute("aria-label"))).toEqual([
      "학교 검색어",
      "major search",
    ]);
  });

  it("filters submit controls by risk and activation safety", () => {
    const { surface } = surfaceFixture(`
      <div role="dialog" aria-modal="true">
        <button type="button" aria-label="검색">검색</button>
        <button type="button" aria-label="저장">저장</button>
        <button type="submit" aria-label="검색">검색</button>
      </div>`);
    expect(submitControls(surface)).toHaveLength(1);
    expect(submitControls(surface)[0]?.textContent).toBe("검색");
  });

  it("recognizes an unlabelled input submit by its value without bypassing risk filters", () => {
    const { surface, container } = surfaceFixture(
      '<div role="dialog" aria-modal="true"><iframe></iframe></div>',
    );
    const frame = container.querySelector("iframe")!;
    const popup = frame.contentDocument!;
    popup.body.innerHTML = `
      <input type="submit" value="검색">
      <input type="button" value="검색 저장">
      <input type="text" value="검색">`;
    const framedSurface = new SearchSurface(
      "same-origin-iframe",
      container,
      popup,
      surface.opener,
      surface.target,
      frame,
    );
    expect(submitControls(framedSurface)).toEqual([
      popup.querySelector("input[type='submit']"),
    ]);
  });

  it("recognizes a result root explicitly linked by the query", () => {
    const { surface, container } = surfaceFixture(`
      <div role="dialog" aria-modal="true">
        <input id="query" type="text" aria-label="검색어">
        <ul id="results" role="listbox"></ul>
      </div>`);
    const query = container.querySelector<HTMLInputElement>("#query")!;
    const results = container.querySelector<HTMLElement>("#results")!;
    query.setAttribute("aria-controls", "results");
    expect(queryOnly(surface, query)).toBe(true);
    expect(results).toBeTruthy();
  });

  it("accepts an isolated button search without a native destination", () => {
    const { surface, container } = surfaceFixture(`
      <div role="dialog" aria-modal="true">
        <input id="query" type="text" aria-label="검색어">
        <button id="submit" type="button" aria-label="검색">검색</button>
      </div>`);
    const query = container.querySelector<HTMLInputElement>("#query")!;
    const submit = container.querySelector<HTMLButtonElement>("#submit")!;
    expect(searchDestination(surface, query, submit)).toBeUndefined();
  });

  it("binds a same-origin iframe POST form with stable hidden routing values", () => {
    const { surface, container } = surfaceFixture(
      '<div role="dialog" aria-modal="true"><iframe></iframe></div>',
    );
    const frame = container.querySelector("iframe")!;
    const popup = frame.contentDocument!;
    popup.body.innerHTML = `
      <form method="post" action="/lookup/credentials" target="_self">
        <input id="query" name="keyword" type="text" aria-label="자격 검색어">
        <input id="route" type="hidden" name="route" value="certificate">
        <button id="submit" type="submit" aria-label="검색">검색</button>
      </form>`;
    const framedSurface = new SearchSurface(
      "same-origin-iframe",
      container,
      popup,
      surface.opener,
      surface.target,
      frame,
    );
    const query = popup.querySelector<HTMLInputElement>("#query")!;
    const submit = popup.querySelector<HTMLButtonElement>("#submit")!;
    const binding = searchDestination(framedSurface, query, submit);

    expect(binding).toMatchObject({ method: "post", queryName: "keyword" });
    expect(binding?.current()).toBe(true);
    const route = popup.querySelector<HTMLInputElement>("#route")!;
    route.value = "other";
    expect(binding?.current()).toBe(false);
    route.value = "certificate";
    const injected = popup.createElement("input");
    injected.type = "hidden";
    injected.name = "page";
    injected.value = "2";
    route.form!.append(injected);
    expect(binding?.current()).toBe(false);
  });

  it.each(["disabled", "handler", "outside-form"] as const)(
    "invalidates a native binding when a bound hidden control becomes %s",
    (mutation) => {
      const { surface, container } = surfaceFixture(
        '<div role="dialog" aria-modal="true"><iframe></iframe></div>',
      );
      const frame = container.querySelector("iframe")!;
      const popup = frame.contentDocument!;
      popup.body.innerHTML = `
        <form id="lookup" method="post" action="/lookup/credentials" target="_self">
          <input id="query" name="keyword" type="text" aria-label="자격 검색어">
          <input id="route" type="hidden" name="route" value="certificate">
          <button id="submit" type="submit" aria-label="검색">검색</button>
        </form>`;
      const framedSurface = new SearchSurface(
        "same-origin-iframe",
        container,
        popup,
        surface.opener,
        surface.target,
        frame,
      );
      const query = popup.querySelector<HTMLInputElement>("#query")!;
      const submit = popup.querySelector<HTMLButtonElement>("#submit")!;
      const route = popup.querySelector<HTMLInputElement>("#route")!;
      const binding = searchDestination(framedSurface, query, submit)!;

      if (mutation === "disabled") route.disabled = true;
      if (mutation === "handler") route.oninput = () => undefined;
      if (mutation === "outside-form") {
        route.remove();
        route.setAttribute("form", "lookup");
        popup.body.append(route);
      }

      expect(binding.current()).toBe(false);
    },
  );

  it("invalidates a native binding when its submit control stops being the approved submit", () => {
    const { surface, container } = surfaceFixture(
      '<div role="dialog" aria-modal="true"><iframe></iframe></div>',
    );
    const frame = container.querySelector("iframe")!;
    const popup = frame.contentDocument!;
    popup.body.innerHTML = `
      <form method="get" action="/search/credentials" target="_self">
        <input id="query" name="keyword" type="text" aria-label="자격 검색어">
        <button id="submit" type="submit" aria-label="검색">검색</button>
      </form>`;
    const framedSurface = new SearchSurface(
      "same-origin-iframe",
      container,
      popup,
      surface.opener,
      surface.target,
      frame,
    );
    const query = popup.querySelector<HTMLInputElement>("#query")!;
    const submit = popup.querySelector<HTMLButtonElement>("#submit")!;
    const binding = searchDestination(framedSurface, query, submit)!;

    submit.type = "button";

    expect(binding.current()).toBe(false);
  });

  it("fails closed for mismatched controls, unsafe forms, and high-risk actions", () => {
    const { surface, container } = surfaceFixture(`
      <div role="dialog" aria-modal="true">
        <form action="/search">
          <input id="query" type="text" aria-label="검색어">
          <button id="submit" type="button" aria-label="검색">검색</button>
          <input type="hidden" name="secret" value="x">
        </form>
      </div>`);
    const query = container.querySelector<HTMLInputElement>("#query")!;
    const submit = container.querySelector<HTMLButtonElement>("#submit")!;
    expect(() => searchDestination(surface, query, submit)).toThrowError(
      expect.objectContaining({ reason: "unverified_search_form" }),
    );
    query.readOnly = true;
    expect(() => searchDestination(surface, query, submit)).toThrowError(
      expect.objectContaining({ reason: "unverified_search_form" }),
    );
  });
});

describe("search layer inside an application form", () => {
  function layerInForm(layerMarkup: string, outside = "") {
    document.body.innerHTML = `
      <form id="app" method="post" action="/apply/save" onsubmit="return true;">
        <input type="hidden" name="token">
        <textarea name="intro"></textarea>
        <div class="school-search">
          <input id="target" readonly>
          <button id="opener" type="button">검색</button>
          <div id="layer">${layerMarkup}</div>
        </div>
        ${outside}
        <button type="submit">제출</button>
      </form>`;
    const layer = document.querySelector<HTMLElement>("#layer")!;
    const surface = new SearchSurface(
      "same-document-layer",
      layer,
      layer,
      document.querySelector<HTMLButtonElement>("#opener")!,
      document.querySelector<HTMLInputElement>("#target")!,
    );
    return {
      surface,
      query: document.querySelector<HTMLInputElement>("#query")!,
      submit: document.querySelector<HTMLButtonElement>("#submit")!,
    };
  }

  it("accepts a layer query and type=button search even inside the application form", () => {
    const { surface, query, submit } = layerInForm(`
      <input id="query" type="text" onkeydown="return true;">
      <button id="submit" type="button" onclick="return true;">검색</button>`);
    expect(query.form).toBe(submit.form);
    expect(query.form).not.toBeNull();
    expect(searchDestination(surface, query, submit)).toBeUndefined();
  });

  it.each([
    [
      "type=submit",
      `<input id="query" type="text"><button id="submit" type="submit">검색</button>`,
      "",
    ],
    [
      "formaction",
      `<input id="query" type="text"><button id="submit" type="button" formaction="/apply/save">검색</button>`,
      "",
    ],
    [
      "button outside the layer",
      `<input id="query" type="text">`,
      `<button id="submit" type="button">검색</button>`,
    ],
    [
      "readOnly query",
      `<input id="query" type="text" readonly><button id="submit" type="button">검색</button>`,
      "",
    ],
  ])("keeps blocking %s", (_name, layerMarkup, outside) => {
    const { surface, query, submit } = layerInForm(layerMarkup, outside);
    expect(() => searchDestination(surface, query, submit)).toThrowError(
      expect.objectContaining({ reason: "unverified_search_form" }),
    );
  });

  it("keeps blocking a query and button owned by different forms", () => {
    const { surface, query, submit } = layerInForm(`
      <input id="query" type="text">
      <button id="submit" type="button" form="other">검색</button>`);
    document.body.append(
      Object.assign(document.createElement("form"), { id: "other" }),
    );
    expect(() => searchDestination(surface, query, submit)).toThrowError(
      expect.objectContaining({ reason: "unverified_search_form" }),
    );
  });
});

describe("interaction role resolution", () => {
  function createSession(decisionProvider?: (request: any) => Promise<any>) {
    return new SearchSession({
      document,
      registry: undefined as never,
      targetCandidateId: "field-1",
      canonicalFieldKey: "education.university.schoolName",
      expectedValue: "가상값",
      decisionProvider,
    });
  }
  it("fails closed for empty, oversized, and indistinguishable candidate sets", async () => {
    await expect(
      resolveRoles(createSession(), [
        { role: "SEARCH_SUBMIT", collect: () => [], scope: document.body },
      ]),
    ).rejects.toMatchObject({ reason: "decision_abstained" });
    const many = Array.from({ length: 9 }, (_, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = `검색${index}`;
      document.body.append(item);
      return item;
    });
    await expect(
      resolveRoles(createSession(), [
        { role: "SEARCH_SUBMIT", collect: () => many, scope: document.body },
      ]),
    ).rejects.toMatchObject({ reason: "decision_budget_exhausted" });
    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.textContent = "검색";
    const duplicate2 = duplicate.cloneNode(true) as HTMLButtonElement;
    document.body.append(duplicate, duplicate2);
    await expect(
      resolveRoles(createSession(), [
        {
          role: "SEARCH_SUBMIT",
          collect: () => [duplicate, duplicate2],
          scope: document.body,
        },
      ]),
    ).rejects.toMatchObject({ reason: "decision_abstained" });
  });
  it("selects a provider-approved candidate and detects stale live controls", async () => {
    const first = document.createElement("button");
    first.type = "button";
    first.textContent = "검색 1";
    first.setAttribute("aria-label", "검색 1");
    const second = document.createElement("input");
    second.type = "submit";
    second.textContent = "검색 2";
    second.setAttribute("aria-label", "검색 2");
    document.body.append(first, second);
    const provider = async (request: any) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: [
        {
          decisionId: request.decisions[0].decisionId,
          role: request.decisions[0].role,
          selection: "SELECTED",
          candidateId: request.decisions[0].candidates[1].candidateId,
        },
      ],
    });
    const [selection] = await resolveRoles(createSession(provider), [
      {
        role: "SEARCH_SUBMIT",
        collect: () => [first, second],
        scope: document.body,
      },
    ]);
    expect(selection?.binding.element).toBe(second);
    second.textContent = "changed";
    expect(selection?.current()).toBe(false);
  });
});
