import { afterEach, describe, expect, it } from "vitest";
import { SearchSurface } from "./search-surface";
import { safeActivation } from "./search-surface-dom";
import {
  completeRegionList,
  regionListSelection,
} from "./queryless-region-list";

const labels = [
  "강원특별자치도",
  "경기도",
  "경상남도",
  "경상북도",
  "광주광역시",
  "대구광역시",
  "대전광역시",
  "부산광역시",
  "서울특별시",
  "세종특별자치시",
  "울산광역시",
  "인천광역시",
  "전라남도",
  "전북특별자치도",
  "제주특별자치도",
  "충청남도",
  "충청북도",
];
function setup() {
  document.body.innerHTML = `<div><input readonly><button type="button">지역 검색</button></div><iframe></iframe>`;
  const target = document.querySelector<HTMLInputElement>("input")!;
  const opener = document.querySelector<HTMLButtonElement>("button")!;
  const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
  const popup = frame.contentDocument!;
  popup.body.innerHTML = `<h1>지역 선택</h1><select><option value="KOR" selected>한국</option></select><ul>${labels.map((label) => `<li><a href="javascript:setSchoolPlaceData('ST||${label}||KOR');">${label}</a></li>`).join("")}</ul>`;
  return {
    surface: new SearchSurface(
      "same-origin-iframe",
      frame,
      popup,
      opener,
      target,
      frame,
    ),
    popup,
  };
}
afterEach(() => {
  document.body.innerHTML = "";
});

describe("complete queryless school-region list", () => {
  it("accepts all domestic regions and selects the unique official alias", () => {
    const { surface } = setup();
    expect(
      completeRegionList(surface, "education.highSchool.schoolRegion"),
    ).toBeDefined();
    const match = regionListSelection(
      surface,
      "education.highSchool.schoolRegion",
      ["서울", "서울특별시"],
    );
    expect(match?.element.textContent).toBe("서울특별시");
    expect(safeActivation(match!.element, ["서울", "서울특별시"])).toBe(true);
  });
  it("rejects wrong field, foreign country, missing and duplicate regions, and unsafe links", () => {
    const { surface, popup } = setup();
    const key = "education.highSchool.schoolRegion";
    expect(
      completeRegionList(surface, "education.university.majorName"),
    ).toBeUndefined();
    const country = popup.querySelector("select")!;
    country.insertAdjacentHTML(
      "beforeend",
      '<option value="USA">미국</option>',
    );
    country.value = "USA";
    expect(completeRegionList(surface, key)).toBeUndefined();
    country.value = "KOR";
    const first = popup.querySelector("li")!;
    const copy = first.cloneNode(true);
    first.parentElement!.removeChild(first);
    expect(completeRegionList(surface, key)).toBeUndefined();
    popup.querySelector("ul")!.prepend(first);
    popup.querySelector("ul")!.append(copy);
    expect(completeRegionList(surface, key)).toBeUndefined();
    copy.parentElement!.removeChild(copy);
    popup
      .querySelector("a")!
      .setAttribute("onclick", "selectResult('강원특별자치도')");
    expect(completeRegionList(surface, key)).toBeUndefined();
  });
});

describe("bounded original JavaScript result clicks", () => {
  it("allows one literal carrying the exact label, but never evaluates the href", () => {
    document.body.innerHTML = `<a href="javascript:selectResult('id||서울특별시');">서울특별시</a>`;
    const link = document.querySelector("a")!;
    expect(safeActivation(link, ["서울", "서울특별시"])).toBe(true);
    expect(safeActivation(link, ["경기도"])).toBe(false);
  });
  it.each([
    "javascript:submitApplication('서울특별시')",
    "javascript:selectResult('서울특별시');submitApplication()",
    "javascript:window.selectResult('서울특별시')",
    "javascript:selectResult('서울특별시\\' );evil()')",
    "javascript:selectResult('다른지역')",
  ])("rejects unsafe or mismatched URL %s", (href) => {
    document.body.innerHTML = `<a>서울특별시</a>`;
    const link = document.querySelector("a")!;
    link.setAttribute("href", href);
    expect(safeActivation(link, ["서울특별시"])).toBe(false);
  });
});
