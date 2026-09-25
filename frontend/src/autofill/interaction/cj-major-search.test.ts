import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import template from "./cj-major-public-template.fixture.html?raw";
import { executeCjMajorSearch } from "./cj-major-search";
import { SearchFailure, SearchSession } from "./search-session";
import { SearchSurface } from "./search-surface";
import type { ExecuteReadonlySearchArgs } from "./readonly-search";
import type { CjMajorCloseLease } from "./cj-major-close-bridge";

const url = "https://recruit.cj.net/recruit/ko/resume/search/search_major.fo";
const result = (
  rows = `<li><a href="javascript:;" title="선택 시 본창에 값이 들어가며 레이어창 닫힘" onclick="setMajorData('22WD', '합성전공', '')">합성전공</a></li>`,
) =>
  template
    .replace(
      'id="dtl_nm" name="dtl_nm" value=""',
      'id="dtl_nm" name="dtl_nm" value="합성전공"',
    )
    .replace(
      '<p class="msg msg_noSch hide">검색 단어를 입력해주세요</p>',
      `<ul class="sch_list">${rows}</ul>`,
    );
const http = (
  html = result(),
  opts: {
    status?: number;
    mime?: string;
    redirected?: boolean;
    url?: string;
    length?: string;
  } = {},
) =>
  ({
    ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
    redirected: opts.redirected ?? false,
    url: opts.url ?? url,
    headers: new Headers({
      "content-type": opts.mime ?? "text/html;charset=UTF-8",
      ...(opts.length ? { "content-length": opts.length } : {}),
    }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    }),
  }) as Response;
function fixture() {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><section id="sectionNormalUniversity0"><dd><input id="mm_major_nm2_0" name="mm_major_nm" readonly><input type="hidden" name="major"><button type="button" name="bt_mm_major_nm" data-iframe-url="${url}?num=2_0">전공 검색</button></dd></section><section id="sectionNormalUniversity1"><dd><input readonly name="mm_major_nm" value="다른전공"><input type="hidden" name="major" value="OTHER"><input type="checkbox" checked></dd></section><iframe src="${url}?num=2_0"></iframe></body></html>`,
    { url: "https://recruit.cj.net/recruit/ko/resume/apply.fo" },
  );
  const doc = dom.window.document;
  const target = doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!;
  const code = doc.querySelector<HTMLInputElement>('input[name="major"]')!;
  const opener = doc.querySelector<HTMLButtonElement>(
    'button[name="bt_mm_major_nm"]',
  )!;
  const frame = doc.querySelector<HTMLIFrameElement>("iframe")!;
  const inner = frame.contentDocument!;
  inner.open();
  inner.write(template);
  inner.close();
  const surface = new SearchSurface(
    "same-origin-iframe",
    frame,
    inner,
    opener,
    target,
    frame,
  );
  let approved = true;
  const controller = new AbortController();
  const session = new SearchSession({
    signal: controller.signal,
    assertCurrent: () => approved,
    beforeMutation: async () => approved,
  } as ExecuteReadonlySearchArgs);
  const guard = (allowed: readonly string[]) => {
    if (
      !approved ||
      !target.isConnected ||
      target.closest("#sectionNormalUniversity0") !==
        doc.querySelector("#sectionNormalUniversity0") ||
      !allowed.includes(target.value)
    )
      throw new SearchFailure("stale_target");
    return target;
  };
  const close: CjMajorCloseLease = {
    check: async () => frame.isConnected,
    close: async () => {
      frame.remove();
      return true;
    },
  };
  const setFetch = (fetcher: typeof fetch) => vi.stubGlobal("fetch", fetcher);
  return {
    dom,
    doc,
    target,
    code,
    frame,
    inner,
    surface,
    session,
    guard,
    close,
    controller,
    setFetch,
    revoke: () => {
      approved = false;
    },
  };
}
async function run(
  f: ReturnType<typeof fixture>,
  lease = f.close,
  onObserved = () => {},
  assertOwned = () => {},
) {
  return executeCjMajorSearch(
    f.surface,
    f.session,
    lease,
    "합성전공",
    f.guard,
    assertOwned,
    onObserved,
  );
}
describe("CJ major search transaction", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("posts only the reviewed fields and retains display/code for 500 ms after close", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let observed = 0;
    f.setFetch(
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        expect(init?.credentials).toBe("same-origin");
        expect(init?.redirect).toBe("error");
        expect(String(init?.body)).toBe(
          "dtl_nm=%ED%95%A9%EC%84%B1%EC%A0%84%EA%B3%B5&num=2_0",
        );
        return http();
      }) as typeof fetch,
    );
    const pending = run(f, f.close, () => observed++);
    await vi.advanceTimersByTimeAsync(700);
    await expect(pending).resolves.toBeUndefined();
    expect(f.target.value).toBe("합성전공");
    expect(f.code.value).toBe("22WD");
    expect(f.frame.isConnected).toBe(false);
    expect(observed).toBe(1);
    expect(
      f.doc.querySelector<HTMLInputElement>(
        '#sectionNormalUniversity1 input[name="mm_major_nm"]',
      )!.value,
    ).toBe("다른전공");
    expect(
      f.doc.querySelector<HTMLInputElement>(
        '#sectionNormalUniversity1 input[name="major"]',
      )!.value,
    ).toBe("OTHER");
    expect(
      f.doc.querySelector<HTMLInputElement>(
        '#sectionNormalUniversity1 input[type="checkbox"]',
      )!.checked,
    ).toBe(true);
    f.session.stop();
    f.dom.window.close();
  });
  it("uses isolated-world fetch rather than a page-overridden fetch", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pageFetch = vi.fn(async () => {
      throw new Error("page fetch invoked");
    });
    Object.defineProperty(f.inner.defaultView!, "fetch", {
      configurable: true,
      value: pageFetch,
    });
    f.setFetch(vi.fn(async () => http()) as typeof fetch);
    const pending = run(f);
    await vi.advanceTimersByTimeAsync(700);
    await expect(pending).resolves.toBeUndefined();
    expect(pageFetch).not.toHaveBeenCalled();
    expect(f.code.value).toBe("22WD");
    f.session.stop();
    f.dom.window.close();
  });
  it("aborts during fetch without writing either field", async () => {
    const f = fixture();
    f.setFetch(vi.fn(() => new Promise<Response>(() => {})) as typeof fetch);
    const pending = run(f);
    await Promise.resolve();
    f.controller.abort();
    await expect(pending).rejects.toThrow();
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("");
    f.session.stop();
    f.dom.window.close();
  });
  it.each([
    ["HTTP", () => http(result(), { status: 500 })],
    ["redirect", () => http(result(), { redirected: true })],
    ["MIME", () => http(result(), { mime: "application/json" })],
    ["oversize", () => http(result(), { length: "512001" })],
    [
      "duplicate",
      () =>
        http(
          result().replace(
            "</ul>",
            `<li><a href="javascript:;" title="선택 시 본창에 값이 들어가며 레이어창 닫힘" onclick="setMajorData('22WE', '합성전공', '')">합성전공</a></li></ul>`,
          ),
        ),
    ],
    [
      "script",
      () =>
        http(
          result().replace(
            "parent.needpopHide();",
            "parent.needpopHide(); alert(1);",
          ),
        ),
    ],
    [
      "extra result control",
      () =>
        http(
          result().replace("</body>", "<button>다음 페이지</button></body>"),
        ),
    ],
  ] as const)("rejects %s before any target write", async (_name, make) => {
    const f = fixture();
    f.setFetch(vi.fn(async () => make()) as typeof fetch);
    await expect(run(f)).rejects.toThrow();
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("");
    f.session.stop();
    f.dom.window.close();
  });
  it("rejects stale repeated row after response without writing the detached target", async () => {
    const f = fixture();
    f.setFetch(
      vi.fn(async () => {
        f.doc
          .querySelector("#sectionNormalUniversity0")!
          .replaceWith(f.doc.createElement("section"));
        return http();
      }) as typeof fetch,
    );
    await expect(run(f)).rejects.toThrow("stale_target");
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("");
    f.session.stop();
    f.dom.window.close();
  });
  it("rejects hidden code changed after response without overwriting it", async () => {
    const f = fixture();
    f.setFetch(
      vi.fn(async () => {
        f.code.value = "OTHER";
        return http();
      }) as typeof fetch,
    );
    await expect(run(f)).rejects.toThrow("surface_stale");
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("OTHER");
    f.session.stop();
    f.dom.window.close();
  });
  it("bounds a pending fetch and leaves both fields unchanged", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.setFetch(vi.fn(() => new Promise<Response>(() => {})) as typeof fetch);
    const pending = expect(run(f)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(8_000);
    await pending;
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("");
    f.session.stop();
    f.dom.window.close();
  });
  it("rejects revoked approval or changed hidden code after response without overwriting it", async () => {
    const f = fixture();
    f.setFetch(
      vi.fn(async () => {
        f.code.value = "OTHER";
        f.revoke();
        return http();
      }) as typeof fetch,
    );
    await expect(run(f)).rejects.toThrow();
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("OTHER");
    f.session.stop();
    f.dom.window.close();
  });
  it.each([
    [
      "action",
      (f: ReturnType<typeof fixture>): void =>
        f.inner
          .querySelector("form")!
          .setAttribute("action", "https://example.invalid/collect"),
    ],
    [
      "handler",
      (f: ReturnType<typeof fixture>): void =>
        f.inner
          .querySelector("form")!
          .setAttribute("onsubmit", "return other();"),
    ],
    [
      "num",
      (f: ReturnType<typeof fixture>): void => {
        f.inner.querySelector<HTMLInputElement>('input[name="num"]')!.value =
          "2_1";
      },
    ],
    [
      "query control",
      (f: ReturnType<typeof fixture>): void =>
        f.inner
          .querySelector("#dtl_nm")!
          .replaceWith(f.inner.querySelector("#dtl_nm")!.cloneNode(true)),
    ],
    [
      "query value",
      (f: ReturnType<typeof fixture>): void => {
        f.inner.querySelector<HTMLInputElement>("#dtl_nm")!.value = "다른전공";
      },
    ],
    [
      "submit control",
      (f: ReturnType<typeof fixture>): void =>
        f.inner
          .querySelector('input[type="submit"]')!
          .replaceWith(
            f.inner.querySelector('input[type="submit"]')!.cloneNode(true),
          ),
    ],
  ] as const)(
    "rejects %s mutated by asynchronous approval before POST",
    async (_name, mutate) => {
      const f = fixture();
      f.session.args.beforeMutation = async () => {
        mutate(f);
        return true;
      };
      const fetcher = vi.fn(async () => http());
      f.setFetch(fetcher as typeof fetch);
      await expect(run(f)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
      expect(f.target.value).toBe("");
      expect(f.code.value).toBe("");
      f.session.stop();
      f.dom.window.close();
    },
  );
  it("rejects a hidden code moved to another connected row after close without modifying the foreign row", async () => {
    const f = fixture();
    f.setFetch(vi.fn(async () => http()) as typeof fetch);
    const foreignCode = f.doc.querySelector<HTMLInputElement>(
      '#sectionNormalUniversity1 input[name="major"]',
    )!;
    const lease: CjMajorCloseLease = {
      check: f.close.check,
      close: async () => {
        f.frame.remove();
        setTimeout(() => foreignCode.parentElement!.append(f.code), 20);
        return true;
      },
    };
    await expect(run(f, lease)).rejects.toThrow("surface_stale");
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("22WD");
    expect(foreignCode.value).toBe("OTHER");
    f.session.stop();
    f.dom.window.close();
  });
  it.each([
    [
      "name",
      (code: HTMLInputElement) => {
        code.name = "foreign";
      },
    ],
    [
      "type",
      (code: HTMLInputElement) => {
        code.type = "text";
      },
    ],
  ] as const)(
    "rejects hidden code %s change during retention without rewriting that control",
    async (_name, mutate) => {
      const f = fixture();
      f.setFetch(vi.fn(async () => http()) as typeof fetch);
      const lease: CjMajorCloseLease = {
        check: f.close.check,
        close: async () => {
          f.frame.remove();
          setTimeout(() => mutate(f.code), 20);
          return true;
        },
      };
      await expect(run(f, lease)).rejects.toThrow("surface_stale");
      expect(f.target.value).toBe("");
      expect(f.code.value).toBe("22WD");
      f.session.stop();
      f.dom.window.close();
    },
  );
  it("rejects a newly competing popup during retention instead of reporting selection", async () => {
    const f = fixture();
    f.setFetch(vi.fn(async () => http()) as typeof fetch);
    const lease: CjMajorCloseLease = {
      check: f.close.check,
      close: async () => {
        f.frame.remove();
        f.doc.body.insertAdjacentHTML(
          "beforeend",
          '<div id="competing" role="dialog">다른 팝업</div>',
        );
        return true;
      },
    };
    await expect(
      run(
        f,
        lease,
        () => {},
        () => {
          if (f.doc.querySelector("#competing"))
            throw new SearchFailure("surface_ambiguous");
        },
      ),
    ).rejects.toThrow("surface_ambiguous");
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("");
    f.session.stop();
    f.dom.window.close();
  });
  it("rolls back only owned writes when close fails", async () => {
    const f = fixture();
    f.setFetch(vi.fn(async () => http()) as typeof fetch);
    await expect(
      run(f, { check: f.close.check, close: async () => false }),
    ).rejects.toThrow();
    expect(f.target.value).toBe("");
    expect(f.code.value).toBe("");
    f.session.stop();
    f.dom.window.close();
  });
  it("preserves a concurrent user change after its own value is observed", async () => {
    const f = fixture();
    f.setFetch(vi.fn(async () => http()) as typeof fetch);
    await expect(
      run(f, {
        check: f.close.check,
        close: async () => {
          f.target.value = "USER";
          return false;
        },
      }),
    ).rejects.toThrow();
    expect(f.target.value).toBe("USER");
    expect(f.code.value).toBe("22WD");
    f.session.stop();
    f.dom.window.close();
  });
});
