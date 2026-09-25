import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import template from "./cj-school-public-response.fixture.html?raw";
import { executeCjSchoolSearch } from "./cj-school-search";
import { SearchFailure, SearchSession } from "./search-session";
import { SearchSurface } from "./search-surface";
import type { ExecuteReadonlySearchArgs } from "./readonly-search";

const url = "https://recruit.cj.net/recruit/ko/resume/search/search_university.fo";
const emptyForm = template
  .replace('id="school_name" name="school_name" value="합성대학교"', 'id="school_name" name="school_name" value=""')
  .replace(/<ul class="sch_list">[\s\S]*?<\/ul>/, '<p class="msg msg_noSch hide">검색 단어를 입력해주세요</p>');
function response() {
  return { ok: true, redirected: false, url, headers: new Headers({"content-type": "text/html;charset=UTF-8"}),
    body: new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(new TextEncoder().encode(template)); controller.close();}}) } as Response;
}
function fixture(region = "", existing = false) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="sectionNormalUniversity0"><dd><input type="text" readonly id="zz_school_nm2_0" name="zz_school_nm"><input type="hidden" name="school_code"><button type="button" name="bt_zz_school_nm" data-popup-show="" data-iframe-url="${url}?num=2_0">검색</button></dd><dd><input type="text" readonly id="zz_state_nm5_0" name="zz_state_nm" value="${region}"><input type="hidden" name="zz_state"><input type="hidden" name="reg_region" value="KOR"><input type="hidden" name="new_country" value="KOR"><button type="button" name="bt_zz_state_nm" data-iframe-url="https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0">검색</button></dd><dd><input type="text" id="mm_major_nm2_0" value="기존전공"></dd></div><div id="sectionNormalUniversity1"><input value="다른행"></div><iframe src="${url}?num=2_0"></iframe></body></html>`, {url: "https://recruit.cj.net/recruit/ko/resume/apply.fo"});
  const doc = dom.window.document;
  const target = doc.querySelector<HTMLInputElement>("#zz_school_nm2_0")!;
  if (existing) {
    target.value = "합성대학교";
    doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value = "SYN001";
    doc.querySelector<HTMLButtonElement>('[name="bt_zz_state_nm"]')!.setAttribute("data-iframe-url", "https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0&country_cd=KOR");
  }
  const frame = doc.querySelector<HTMLIFrameElement>("iframe")!;
  const inner = frame.contentDocument!;
  inner.open(); inner.write(emptyForm); inner.close();
  const surface = new SearchSurface("same-origin-iframe", frame, inner, doc.querySelector<HTMLButtonElement>('[name="bt_zz_school_nm"]')!, target, frame);
  const session = new SearchSession({} as ExecuteReadonlySearchArgs);
  const lease = {check: async () => true, close: async () => { frame.remove(); return true; }};
  const guard = (allowed: readonly string[]) => { if (!allowed.includes(target.value)) throw new SearchFailure("stale_target"); return target; };
  return {dom, doc, target, frame, surface, session, lease, guard};
}
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
it("classifies a verified complete existing school/code/country bundle as unchanged only after exact response", async () => {
  vi.useFakeTimers();
  const f = fixture("", true);
  const fetcher = vi.fn(async () => response()); vi.stubGlobal("fetch", fetcher);
  let observed = 0;
  const pending = executeCjSchoolSearch(f.surface, f.session, f.lease, "합성대학교", f.guard, () => {}, () => observed++);
  const assertion = expect(pending).resolves.toBe("unchanged");
  await vi.advanceTimersByTimeAsync(700);
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(observed).toBe(0);
  expect(f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value).toBe("SYN001");
  f.session.stop(); f.dom.window.close();
});

it("refuses same display with an unverified code rather than returning unchanged", async () => {
  const f = fixture("", true);
  f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value = "OTHER";
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  await expect(executeCjSchoolSearch(f.surface, f.session, f.lease, "합성대학교", f.guard, () => {}, () => {})).rejects.toThrow();
  expect(f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value).toBe("OTHER");
  f.session.stop(); f.dom.window.close();
});

it("posts only school_name and num, retains country bundle and preserves unrelated fields", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(init?.body)).toBe("school_name=%ED%95%A9%EC%84%B1%EB%8C%80%ED%95%99%EA%B5%90&num=2_0");
    expect(init?.redirect).toBe("error");
    return response();
  });
  vi.stubGlobal("fetch", request);
  const pending = executeCjSchoolSearch(f.surface, f.session, f.lease, "합성대학교", f.guard, () => {}, () => {});
  await vi.advanceTimersByTimeAsync(700);
  await expect(pending).resolves.toBe("selected");
  expect(f.target.value).toBe("합성대학교");
  expect(f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value).toBe("SYN001");
  expect(f.doc.querySelector<HTMLInputElement>('[name="reg_region"]')!.value).toBe("KOR");
  expect(f.doc.querySelector<HTMLButtonElement>('[name="bt_zz_state_nm"]')!.getAttribute("data-iframe-url")).toContain("country_cd=KOR");
  expect(f.doc.querySelector<HTMLInputElement>('[name="new_country"]')!.value).toBe("KOR");
  expect(f.doc.querySelector<HTMLInputElement>("#mm_major_nm2_0")!.value).toBe("기존전공");
  expect(f.doc.querySelector<HTMLInputElement>("#sectionNormalUniversity1 input")!.value).toBe("다른행");
  f.session.stop(); f.dom.window.close();
});
it("restores only its own bundle after close failure and leaves subsequent user code change", async () => {
  const f = fixture();
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  const code = f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!;
  const country = f.doc.querySelector<HTMLInputElement>('[name="reg_region"]')!;
  const opener = f.doc.querySelector<HTMLButtonElement>('[name="bt_zz_state_nm"]')!;
  const original = opener.getAttribute("data-iframe-url");
  const lease = {check: async () => true, close: async () => {code.value = "USER_UPDATED"; return false;}};
  await expect(executeCjSchoolSearch(f.surface, f.session, lease, "합성대학교", f.guard, () => {}, () => {})).rejects.toThrow();
  expect(f.target.value).toBe("");
  expect(code.value).toBe("USER_UPDATED");
  expect(country.value).toBe("KOR");
  expect(opener.getAttribute("data-iframe-url")).toBe(original);
  f.session.stop(); f.dom.window.close();
});

it("rejects region opener moved to another row during close and never restores its new owner", async () => {
  const f = fixture();
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  const opener = f.doc.querySelector<HTMLButtonElement>('[name="bt_zz_state_nm"]')!;
  const destination = f.doc.querySelector("#sectionNormalUniversity1")!;
  const lease = {check: async () => true, close: async () => {destination.append(opener);f.frame.remove();return true;}};
  const selectedUrl = "https://recruit.cj.net/recruit/ko/resume/search/search_school_place.fo?num=5_0&country_cd=KOR";
  await expect(executeCjSchoolSearch(f.surface, f.session, lease, "합성대학교", f.guard, () => {}, () => {})).rejects.toThrow();
  expect(f.target.value).toBe("");
  expect(f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value).toBe("");
  expect(opener.parentElement).toBe(destination);
  expect(opener.getAttribute("data-iframe-url")).toBe(selectedUrl);
  f.session.stop(); f.dom.window.close();
});

it("rejects a no-match response before changing any school or country field", async () => {
  const f = fixture();
  const noMatch = template.replace("setUniversityData('SYN001', '합성대학교', 'KOR')", "setUniversityData('SYN001', '다른대학교', 'KOR')")
    .replace('>합성대학교</a>', '>다른대학교</a>');
  vi.stubGlobal("fetch", vi.fn(async () => ({...response(), body: new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(new TextEncoder().encode(noMatch));controller.close();}})})));
  await expect(executeCjSchoolSearch(f.surface, f.session, f.lease, "합성대학교", f.guard, () => {}, () => {})).rejects.toThrow();
  expect(f.target.value).toBe("");
  expect(f.doc.querySelector<HTMLInputElement>('[name="school_code"]')!.value).toBe("");
  expect(f.doc.querySelector<HTMLInputElement>('[name="reg_region"]')!.value).toBe("KOR");
  f.session.stop(); f.dom.window.close();
});

it("rejects existing region before POST or write", async () => {
  const f = fixture("기존지역");
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await expect(executeCjSchoolSearch(f.surface, f.session, f.lease, "합성대학교", f.guard, () => {}, () => {})).rejects.toThrow();
  expect(request).not.toHaveBeenCalled(); expect(f.target.value).toBe("");
  f.session.stop(); f.dom.window.close();
});
