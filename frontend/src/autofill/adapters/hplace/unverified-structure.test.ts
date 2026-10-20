import { afterEach, expect, it } from "vitest";
import {
  input,
  mountRun1,
  profile,
} from "../../workflow/hplace-run1.test-fixtures";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { installExecutionPolicy } from "../../workflow/execution-policy";
import { collectFieldsSnapshot } from "../../dom/collect";
import { hplaceUnverifiedRows } from "./unverified-structure";

afterEach(() => {
  resetHplacePage();
  installExecutionPolicy(document);
});

function fullProfile() {
  const p = profile();
  p.personal.englishFamilyName = "HONG";
  p.personal.englishGivenName = "GILDONG";
  p.personal.birthDate = "1995-01-02";
  p.contact.addressLine2 = "합성 상세주소";
  return p;
}
/** A present but malformed birthday fails the whole legacy detail contract. */
const breakDetail = () =>
  input("birthday").setAttribute("data-dates", "birthday:YM");
const rows = (doc = document) =>
  hplaceUnverifiedRows(
    doc,
    collectFieldsSnapshot(document).request,
    fullProfile(),
  );
const labels = (doc = document) => rows(doc).map((row) => row.fieldLabel);

it("returns nothing for a detached document without a location", () => {
  mountRun1();
  breakDetail();
  const detached = document.implementation.createHTMLDocument("x");
  detached.body.innerHTML = document.body.innerHTML;
  expect(rows(detached)).toEqual([]);
});

it("returns nothing off the writeResume path", () => {
  mountRun1();
  breakDetail();
  window.history.replaceState({}, "", "/mrs2/applicant/other");
  expect(labels()).toEqual([]);
});

it("skips controls the page hides or disables", () => {
  mountRun1();
  breakDetail();
  input("englishName").style.display = "none";
  (input("genderFlag") as HTMLInputElement).disabled = true;
  const listed = labels();
  expect(listed).not.toContain("영문이름");
  expect(listed).not.toContain("성별");
  expect(listed).toContain("생년월일");
});

it("lists the detail address and carries the family-first English name to copy", () => {
  mountRun1();
  breakDetail();
  const listed = rows();
  expect(listed.map((row) => row.fieldLabel)).toContain("상세주소");
  const english = listed.find((row) => row.fieldLabel === "영문이름");
  expect(english?.previewValue).toBe("HONG GILDONG");
  expect(english?.status).toBe("unavailable");
  expect(listed.every((row) => row.currentValue === "")).toBe(true);
});

it("skips fields the snapshot already collected under an order suffix", () => {
  mountRun1();
  expect(rows()).toEqual([]);
});
