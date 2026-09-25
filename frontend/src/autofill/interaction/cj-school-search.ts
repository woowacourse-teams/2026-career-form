import { SearchFailure, type SearchSession } from "./search-session";
import type { SearchSurface } from "./search-surface";
import type { CjMajorCloseLease } from "./cj-major-close-bridge";
import {
  CJ_SCHOOL_URL, validateCjSchoolRequest, validateCjSchoolRow,
  writeCjSchoolBundle,
} from "./cj-school-contract";
import { parseCjSchoolResponse } from "./cj-school-response";

const MAX_BYTES = 512_000;
/** An attributed POST, inert response and synchronous school/country four-effect transaction. */
export async function executeCjSchoolSearch(
  surface: SearchSurface, session: SearchSession, lease: CjMajorCloseLease,
  expected: string, guard: (allowed: readonly string[]) => HTMLInputElement,
  assertOwned: () => void, onObserved: () => void,
): Promise<"selected" | "unchanged"> {
  if (surface.kind !== "same-origin-iframe" || !surface.frame ||
    surface.document.location.origin !== "https://recruit.cj.net" ||
    surface.document.location.pathname !== "/recruit/ko/resume/search/search_university.fo" ||
    surface.document.location.search !== "?num=2_0")
    throw new SearchFailure("unverified_search_form");
  const target = surface.target;
  const existing = target.value === expected;
  const bundle = validateCjSchoolRow(target, existing ? expected : undefined);
  const form = surface.document.querySelector("form");
  const query = form?.querySelector<HTMLInputElement>('input#school_name[name="school_name"]');
  const hidden = form?.querySelector('input[type="hidden"][name="num"]');
  const submit = form?.querySelector('input[type="submit"][value="검색"]');
  const body = validateCjSchoolRequest(surface.document, expected, "2_0");
  if (!form || !query || query.value !== "" || !hidden || !submit ||
    body.toString() !== `school_name=${encodeURIComponent(expected).replace(/%20/g, "+")}&num=2_0`)
    throw new SearchFailure("unverified_search_form");
  // Observe unapproved input values in memory only, never send or log them.
  const untouched = [...target.ownerDocument.querySelectorAll<HTMLInputElement>("input")]
    .filter(node => ![bundle.school, bundle.schoolCode, bundle.country].includes(node))
    .map(node => [node, node.value] as const);
  const siblingsCurrent = () => untouched.every(([node, value]) => node.isConnected && node.value === value);
  const requestCurrent = () =>
    surface.document.querySelector("form") === form &&
    form.querySelector('input#school_name[name="school_name"]') === query &&
    form.querySelector('input[type="hidden"][name="num"]') === hidden &&
    form.querySelector('input[type="submit"][value="검색"]') === submit &&
    query.value === "" &&
    validateCjSchoolRequest(surface.document, expected, "2_0").toString() === body.toString();
  const check = () => {
    session.check();
    if (guard([existing ? expected : ""]) !== target || !siblingsCurrent()) throw new SearchFailure("surface_stale");
    assertOwned(); surface.revalidate();
    const live = validateCjSchoolRow(target, existing ? expected : undefined);
    if (live.row !== bundle.row || live.schoolCode !== bundle.schoolCode ||
      live.country !== bundle.country || live.regionOpener !== bundle.regionOpener ||
      live.existingCountry !== bundle.existingCountry || live.existingUrl !== bundle.existingUrl ||
      !requestCurrent()) throw new SearchFailure("surface_stale");
  };
  check();
  await lease.check(surface); check();
  await session.prepareMutation(); check();
  const controller = new AbortController();
  const abort = () => controller.abort();
  session.args.signal?.addEventListener("abort", abort, {once: true});
  const timer = setTimeout(abort, 7_000);
  try {
    const response = await session.race(globalThis.fetch(CJ_SCHOOL_URL, {
      method: "POST", credentials: "same-origin", redirect: "error",
      headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
      body, signal: controller.signal,
    }), 7_500);
    check();
    if (!response.ok || response.redirected || response.url !== CJ_SCHOOL_URL ||
      !/^text\/html(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
      Number(response.headers.get("content-length") ?? 0) > MAX_BYTES || !response.body)
      throw new SearchFailure("result_set_incomplete");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await session.race(reader.read(), 7_500); check();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) {await reader.cancel(); throw new SearchFailure("result_set_incomplete");}
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    const selected = parseCjSchoolResponse(new TextDecoder("utf-8", {fatal: true}).decode(bytes), expected, "2_0");
    await session.prepareMutation(); check();
    if (!(await lease.check(surface))) throw new SearchFailure("result_activation_unsafe");
    check();
    if (existing) {
      // Verify the complete row against a unique, exact result. Never treat a
      // matching display string or locally populated code as proof by itself.
      if (bundle.schoolCode.value !== selected.code ||
        bundle.country.value !== selected.country ||
        bundle.existingUrl !==
          `https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0&country_cd=${encodeURIComponent(selected.country)}`)
        throw new SearchFailure("existing_value_conflict");
      check();
      const stableExisting = () => {
        session.check();
        if (guard([expected]) !== target || !siblingsCurrent() ||
          !bundle.row.isConnected ||
          bundle.school.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.schoolCode.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.country.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.regionOpener.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.schoolCode.value !== selected.code || bundle.country.value !== selected.country ||
          bundle.regionOpener.getAttribute("data-iframe-url") !== bundle.existingUrl)
          throw new SearchFailure("result_not_reflected");
      };
      await session.prepareMutation(); stableExisting();
      if (!(await lease.close(surface))) throw new SearchFailure("popup_unresolved");
      const closedAt = performance.now();
      await session.wait(() => {
        stableExisting();
        return surface.closure() === "closed" && performance.now() - closedAt >= 500
          ? true : undefined;
      }, "popup_unresolved", 2_000);
      return "unchanged";
    }
    const restore = writeCjSchoolBundle(bundle, selected, onObserved);
    try {
      const stable = () => {
        session.check();
        if (guard([selected.label]) !== target || !siblingsCurrent() ||
          !bundle.row.isConnected || !bundle.schoolCode.isConnected ||
          !bundle.country.isConnected || !bundle.regionOpener.isConnected ||
          bundle.regionOpener.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.school.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.schoolCode.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.country.closest("#sectionNormalUniversity0") !== bundle.row ||
          bundle.schoolCode.value !== selected.code ||
          bundle.country.value !== selected.country ||
          bundle.regionOpener.getAttribute("data-iframe-url") !==
            `https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0&country_cd=${encodeURIComponent(selected.country)}`)
          throw new SearchFailure("result_not_reflected");
      };
      stable();
      await session.prepareMutation(); stable();
      if (!(await lease.close(surface))) throw new SearchFailure("popup_unresolved");
      const closedAt = performance.now();
      await session.wait(() => {
        stable();
        return surface.closure() === "closed" && performance.now() - closedAt >= 500
          ? true : undefined;
      }, "popup_unresolved", 2_000);
      return "selected";
    } catch (error) {
      restore();
      throw error;
    }
  } catch (error) {
    if (error instanceof SearchFailure) throw error;
    throw new SearchFailure("result_set_incomplete");
  } finally {
    clearTimeout(timer);
    session.args.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
