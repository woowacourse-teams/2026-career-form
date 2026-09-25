import {
  CJ_MAJOR_URL,
  validateCjMajorRequest,
  validateCjMajorSurface,
} from "./cj-major-contract";
import { parseCjMajorResponse } from "./cj-major-response";
import type { CjMajorCloseLease } from "./cj-major-close-bridge";
import { SearchFailure, type SearchSession } from "./search-session";
import type { SearchSurface } from "./search-surface";

const MAX_BYTES = 512_000;
const setter = (input: HTMLInputElement, value: string) => {
  const view = input.ownerDocument.defaultView;
  const native =
    view &&
    Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")
      ?.set;
  if (!native) throw new SearchFailure("surface_stale");
  native.call(input, value);
};

/** The only transmission is a literal two-field POST, never a native submit or page callback. */
export async function executeCjMajorSearch(
  surface: SearchSurface,
  session: SearchSession,
  lease: CjMajorCloseLease,
  expected: string,
  guard: (allowed: readonly string[]) => HTMLInputElement,
  assertOwned: () => void,
  onObserved: () => void,
): Promise<void> {
  const { num, query, code } = validateCjMajorSurface(surface, expected);
  const target = surface.target;
  const ownerDd = target.closest("dd");
  const ownerRow = target.closest("#sectionNormalUniversity0");
  const ownsTarget = () =>
    !!ownerDd &&
    !!ownerRow &&
    ownerDd.isConnected &&
    target.isConnected &&
    target.id === "mm_major_nm2_0" &&
    target.name === "mm_major_nm" &&
    target.type === "text" &&
    target.readOnly &&
    target.closest("dd") === ownerDd &&
    target.closest("#sectionNormalUniversity0") === ownerRow;
  const ownsCode = () =>
    ownerDd !== null &&
    ownsTarget() &&
    code.isConnected &&
    code.type === "hidden" &&
    code.name === "major" &&
    code.closest("dd") === ownerDd &&
    ownerDd.querySelectorAll('input[type="hidden"][name="major"]').length ===
      1 &&
    ownerDd.querySelector('input[type="hidden"][name="major"]') === code;
  const form = surface.document.querySelector("form");
  const hiddenNum = form?.querySelector('input[type="hidden"][name="num"]');
  const submit = form?.querySelector('input[type="submit"][value="검색"]');
  const body = validateCjMajorRequest(surface.document, expected, num);
  const requestIsCurrent = () => {
    if (
      surface.document.querySelector("form") !== form ||
      form?.querySelector('input[type="hidden"][name="num"]') !== hiddenNum ||
      form?.querySelector('input#dtl_nm[name="dtl_nm"]') !== query ||
      form?.querySelector('input[type="submit"][value="검색"]') !== submit ||
      (query.value !== "" && query.value !== expected) ||
      validateCjMajorRequest(surface.document, expected, num).toString() !==
        body.toString()
    )
      throw new SearchFailure("unverified_search_form");
  };
  const check = (allowed: readonly string[] = [""]) => {
    session.check();
    const live = guard(allowed);
    if (
      live !== target ||
      !ownsCode() ||
      !query.isConnected ||
      (allowed.includes("") && code.value !== "")
    )
      throw new SearchFailure("surface_stale");
    assertOwned();
    surface.revalidate();
    requestIsCurrent();
  };
  check();
  await lease.check(surface);
  check();
  if (
    body.toString() !==
    `dtl_nm=${encodeURIComponent(expected).replace(/%20/g, "+")}&num=2_0`
  )
    throw new SearchFailure("unverified_search_form");
  await session.prepareMutation();
  check();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  session.args.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), 7_000);
  try {
    // Content-script isolated-world fetch, never a function supplied by the site's iframe.
    const response = await session.race(
      globalThis.fetch(CJ_MAJOR_URL, {
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        signal: controller.signal,
      }),
      7_500,
    );
    check();
    if (
      !response.ok ||
      response.redirected ||
      response.url !== CJ_MAJOR_URL ||
      !/^text\/html(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      ) ||
      Number(response.headers.get("content-length") ?? 0) > MAX_BYTES ||
      !response.body
    )
      throw new SearchFailure("result_set_incomplete");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await session.race(reader.read(), 7_500);
      check();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new SearchFailure("result_set_incomplete");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const selected = parseCjMajorResponse(html, expected, num);
    await session.prepareMutation();
    check();
    if (!(await lease.check(surface)))
      throw new SearchFailure("result_activation_unsafe");
    check();
    setter(target, selected.label);
    try {
      check([selected.label]);
      if (code.value !== "") throw new SearchFailure("surface_stale");
      setter(code, selected.code);
      if (target.value !== selected.label || code.value !== selected.code)
        throw new SearchFailure("result_not_reflected");
      onObserved();
      await session.prepareMutation();
      check([selected.label]);
      if (code.value !== selected.code || !(await lease.close(surface)))
        throw new SearchFailure("popup_unresolved");
      const start = performance.now();
      await session.wait(
        () => {
          const reflected = guard([selected.label]);
          assertOwned();
          if (!ownsCode()) throw new SearchFailure("surface_stale");
          if (
            reflected !== target ||
            code.value !== selected.code ||
            !target.readOnly
          )
            throw new SearchFailure("result_not_reflected");
          return surface.closure() === "closed" &&
            performance.now() - start >= 500
            ? true
            : undefined;
        },
        "popup_unresolved",
        2_000,
      );
    } catch (error) {
      // Compare-and-swap only our own writes. Never overwrite a subsequent user change.
      const ownDisplay = ownsTarget() && target.value === selected.label;
      const ownCode = ownDisplay && ownsCode() && code.value === selected.code;
      if (ownDisplay) setter(target, "");
      if (ownCode) setter(code, "");
      throw error;
    }
  } catch (error) {
    if (error instanceof SearchFailure) throw error;
    throw new SearchFailure("result_set_incomplete");
  } finally {
    clearTimeout(timer);
    session.args.signal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
