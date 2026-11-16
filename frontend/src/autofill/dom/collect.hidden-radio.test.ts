import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "./collect";

afterEach(() => document.body.replaceChildren());

function radios(question: string, id: string, options: string[], labelStyle = "") {
  return `<div><p>${question}</p><div>${options
    .map(
      (option, index) =>
        `<input type="radio" id="${id}${index}" style="display:none"><label for="${id}${index}" style="${labelStyle}">${option}</label>`,
    )
    .join("")}</div></div>`;
}

function collected() {
  return collectFieldsSnapshot(document)
    .request.sections.flatMap((section) => section.fields)
    .map(
      (field) =>
        `${field.displayName}:${(field.options ?? []).map((option) => option.displayName).join("/")}`,
    );
}

it("groups unnamed radios hidden behind visible labels into one question", () => {
  document.body.innerHTML = `<form><section><h3>기본정보</h3>${radios("성별", "g", ["남", "여"])}</section>
    <section><h3>보훈</h3>${radios("보훈여부", "v", ["대상", "비대상"])}</section></form>`;
  expect(collected()).toEqual(["성별:남/여", "보훈여부:대상/비대상"]);
});

it("does not group a hidden radio whose label is hidden too", () => {
  document.body.innerHTML = `<form><section><h3>보훈</h3>${radios("보훈여부", "v", ["대상", "비대상"], "display:none")}</section></form>`;
  expect(collected().some((field) => field.endsWith("대상/비대상"))).toBe(false);
});

it("groups a titleless radio pair that sits in a row with other inputs", () => {
  document.body.innerHTML = `<form><section><h3>인적사항</h3>
    <div><div><label for="en1">이름(영문)</label><input id="en1" type="text"></div>
    <div><input id="en2" type="text"></div>
    <div><input id="n0" type="radio" style="opacity:0;position:absolute"><label for="n0"> 내국인 </label>
      <input id="n1" type="radio" style="opacity:0;position:absolute"><label for="n1"> 외국인 </label></div></div>
  </section></form>`;
  expect(collected().filter((field) => field.includes("내국인"))).toEqual([
    expect.stringMatching(/:내국인\/외국인$/),
  ]);
});
