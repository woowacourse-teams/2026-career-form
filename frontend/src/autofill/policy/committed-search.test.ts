import { afterEach, beforeEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { getWorkflowAdapter } from "../adapters/workflow";
import { getWriteAdapter } from "../adapters/write";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { customFieldValue } from "../dom/custom-field-value";
import { nativeOwnership } from "./native-form-collection";
import type { ReviewPlanItem } from "../review/review-plan";
import { runDomPlan, validDomPlan } from "./action-plan";
import {
  onSiteEnter,
  takeSiteEnters,
  mountSearch,
  searchItem,
  showResults,
  widget,
} from "./__fixtures__/hplace-mrs2-search.synthetic";

beforeEach(() => void takeSiteEnters());
afterEach(() => installExecutionPolicy(document));
it("dispatches exactly one cancellable legacy Enter keypress without submitting", () => {
  document.body.innerHTML = '<form><input type="search"></form>';
  const input = document.querySelector("input")!;
  const events: string[] = [];
  const keys: unknown[] = [];
  for (const type of ["keydown", "keypress", "keyup", "submit"])
    document.addEventListener(
      type,
      (e) => {
        events.push(type);
        if (e instanceof KeyboardEvent) {
          keys.push([
            e.key,
            e.keyCode,
            e.which,
            e.cancelable,
            Object.hasOwn(e, "keyCode"),
            Object.hasOwn(e, "which"),
          ]);
          e.preventDefault();
        }
      },
      { once: true },
    );
  const plan = [
    {
      op: "KEY",
      target: "query",
      event: "keypress",
      key: "Enter",
      code: "Enter",
      legacyEnter: true,
    },
  ] as const;
  expect(validDomPlan(plan)).toBe(true);
  expect(runDomPlan([...plan], { query: input }, {}, () => true)).toBe(true);
  expect(events).toEqual(["keypress"]);
  expect(keys).toEqual([["Enter", 13, 13, true, false, false]]);
  expect(validDomPlan([{ ...plan[0], key: "Escape" }])).toBe(false);
  expect(validDomPlan([{ ...plan[0], event: "keydown" }])).toBe(false);
});
it.each(["highschool", "college", "major", "license"])(
  "commits %s only through its own exact result and tuple",
  async (kind) => {
    mountSearch(kind);
    const { handle, item } = searchItem("가상학교");
    const query = handle.elements[0];
    let clicked = 0;
    query.addEventListener(
      "keypress",
      onSiteEnter(() =>
        showResults(query, ["부분가상학교", "가상학교"], () => clicked++),
      ),
    );
    const adapter = getWorkflowAdapter(document),
      signal = new AbortController().signal;
    expect(
      await adapter.executeStateDriver?.(document, handle, item, signal),
    ).toBe(true);
    expect(
      await adapter.settleStateDriver?.(document, handle, undefined, {
        item,
        signal,
      }),
    ).toBe(true);
    expect(clicked).toBe(1);
    expect(customFieldValue(handle)).toBe("가상학교");
    query.value = ""; // The site's committed label, not query retention, proves success.
    expect(getWriteAdapter(document).verifyRetained?.(handle, item)).toBe(true);
    const fresh = searchItem("가상학교");
    expect(
      getWriteAdapter(document).verifyRetained?.(fresh.handle, fresh.item),
    ).toBe(true);
  },
);
it.each(
  [
    [],
    ["가상학교", "가상학교"],
    ["가상학교 부속"],
    ["가상학교(2년이상 직접등록)"],
  ].map((titles) => ({ titles })),
)("rejects absent, duplicate and partial results %j", async ({ titles }) => {
  mountSearch();
  const { handle, item } = searchItem("가상학교");
  handle.elements[0].addEventListener(
    "keypress",
    onSiteEnter(() => showResults(handle.elements[0], titles)),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(takeSiteEnters()).toBe(1);
  expect(widget().name.value).toBe("");
  expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
    handled: true,
    written: false,
  });
});
it.each(["name", "code", "display"])(
  "protects an existing %s even with an empty query",
  async (part) => {
    mountSearch();
    const nodes = widget();
    if (part === "display") nodes.display.textContent = "기존학교";
    else nodes[part as "name" | "code"].value = "existing";
    const { handle, item } = searchItem("가상학교");
    let keys = 0;
    handle.elements[0].addEventListener("keypress", () => keys++);
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(keys).toBe(0);
  },
);
it.each(["code0", "tuple", "user", "profile", "stale", "other-row"])(
  "fails closed for %s before selecting or verifying",
  async (mode) => {
    mountSearch();
    const { handle, item } = searchItem("가상학교");
    const q = handle.elements[0];
    let current = true;
    q.addEventListener(
      "keypress",
      onSiteEnter(() => {
        if (mode === "other-row") {
          const other = document.createElement("div");
          other.innerHTML =
            '<div class="searchResult"><ul class="searchResultList"><li><button type="button" class="ellipsis" data-code="1" title="가상학교">가상학교</button></li></ul></div>';
          document.body.append(other);
          return;
        }
        if (mode === "stale") return;
        showResults(
          q,
          ["가상학교"],
          () => {
            if (mode === "tuple") widget().code.value = "wrong";
          },
          mode === "code0" ? "0" : "123",
        );
        if (mode === "user") q.value = "사용자 수정";
        if (mode === "profile") current = false;
      }),
    );
    if (mode === "stale") showResults(q, ["가상학교"]);
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
        undefined,
        async () => current,
      ),
    ).toBe(false);
    expect(takeSiteEnters()).toBe(1);
  },
);
it("invalidates captured tuple nodes and never collects a search as a plain text writer", () => {
  mountSearch();
  const { handle, item } = searchItem("가상학교");
  const n = widget().name;
  n.replaceWith(n.cloneNode(true));
  expect(handle.isCurrentContext?.()).toBe(false);
  expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
    handled: true,
    written: false,
  });
});
it("does not weaken selected catalog detail requirements", async () => {
  mountSearch();
  const { handle, item } = searchItem("가상학교");
  item.searchIdentity = {
    status: "selected",
    catalogId: "university:invalid",
    catalogVersion: "invalid",
    displayName: "가상학교",
  } as never;
  item.catalogMatch = {
    kind: "university",
    query: "가상학교",
    labels: ["가상학교"],
    requiredDetail: "서울 · 본교",
  };
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
});
it("does not click after the approved local item changes during search", async () => {
  mountSearch();
  const { handle, item } = searchItem("가상학교");
  let clicks = 0;
  handle.elements[0].addEventListener(
    "keypress",
    onSiteEnter(() => {
      showResults(handle.elements[0], ["가상학교"], () => clicks++);
      item.profileValue = "다른학교";
    }),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(takeSiteEnters()).toBe(1);
  expect(clicks).toBe(0);
});
it("does not reuse a receipt after the document policy changes", async () => {
  const policy = mountSearch();
  const { handle, item } = searchItem("가상학교");
  handle.elements[0].addEventListener(
    "keypress",
    onSiteEnter(() => showResults(handle.elements[0], ["가상학교"])),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  policy.browserPolicy.nativeForm.maxFieldsRequests = 6;
  installExecutionPolicy(document, policy);
  const fresh = searchItem("가상학교");
  expect(
    getWriteAdapter(document).verifyRetained?.(fresh.handle, fresh.item),
  ).toBe(false);
});

it.each(["zero", "duplicate", "timeout"])(
  "restores only its query after %s failure and allows retry",
  async (mode) => {
    mountSearch();
    const { handle, item } = searchItem("가상학교");
    const query = handle.elements[0];
    let attempts = 0,
      registrations = 0;
    query.addEventListener(
      "keypress",
      onSiteEnter(() => {
        attempts++;
        if (attempts > 1) return showResults(query, ["가상학교"]);
        if (mode === "timeout") return;
        showResults(
          query,
          mode === "duplicate" ? ["가상학교", "가상학교"] : [],
        );
        const result = query
          .closest(".search")!
          .querySelector(".searchResult")!;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.button = "registKeyword";
        button.textContent = "등록하기";
        button.addEventListener("click", () => registrations++);
        result.append(button);
      }),
    );
    const adapter = getWorkflowAdapter(document);
    expect(
      await adapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(query.value).toBe("");
    expect(widget().name.value).toBe("");
    expect(widget().code.value).toBe("");
    expect(
      await adapter.executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(true);
    expect(registrations).toBe(0);
  },
);
it("never restores a query subsequently edited by the user", async () => {
  mountSearch();
  const { handle, item } = searchItem("가상학교");
  const query = handle.elements[0];
  query.addEventListener("keypress", () => {
    query.value = "사용자 검색어";
  });
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(query.value).toBe("사용자 검색어");
});
it("does not clear a staged tuple or query after the selected result fails verification", async () => {
  mountSearch();
  const { handle, item } = searchItem("가상학교");
  const query = handle.elements[0];
  query.addEventListener(
    "keypress",
    onSiteEnter(() =>
      showResults(query, ["가상학교"], () => {
        widget().code.value = "wrong";
      }),
    ),
  );
  expect(
    await getWorkflowAdapter(document).executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(takeSiteEnters()).toBe(1);
  expect(widget().name.value).toBe("가상학교");
  expect(widget().code.value).toBe("wrong");
});
