// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IDENTITY_FIELD,
  isTestAccount,
  readTestAccounts,
  siteFor,
} from "./sites.mjs";

describe("siteFor", () => {
  it.each([
    [
      "https://gsenc.recruiter.co.kr/mrs2/applicant/resume/writeResume",
      "hplace",
    ],
    ["https://www.skcareers.com/Application/Index/R1", "sk"],
    ["https://talent.hyundai.com/apply/applyWrite.hc", "hyundai"],
    ["https://kurly.career.greetinghr.com/ko/o/1/apply", "greeting"],
    ["https://recruit.kakaogames.com/ko/o/1/apply", "greeting"],
  ])("maps %s to %s", (url, id) => {
    expect(siteFor(url)?.id).toBe(id);
  });

  it("returns null for unknown or malformed urls", () => {
    expect(siteFor("https://example.test/apply")).toBeNull();
    expect(siteFor("not a url")).toBeNull();
  });

  it("gives Greeting no temp-save control and the others one", () => {
    expect(
      siteFor("https://recruit.kakaogames.com/ko/o/1/apply").tempSave,
    ).toBeNull();
    for (const url of [
      "https://abl.recruiter.co.kr/mrs2/applicant/resume/writeResume",
      "https://www.skcareers.com/Application/Index/R1",
      "https://talent.hyundai.com/apply/applyWrite.hc",
    ])
      expect(siteFor(url).tempSave).toMatchObject({
        selector: expect.any(String),
        caption: "^임시\\s*저장$",
      });
  });
});

describe("isTestAccount", () => {
  const hosts = ["www.skcareers.com", "*.recruiter.co.kr"];

  it("matches exact hosts and wildcard domains only", () => {
    expect(isTestAccount("https://www.skcareers.com/x", hosts)).toBe(true);
    expect(isTestAccount("https://gsenc.recruiter.co.kr/x", hosts)).toBe(true);
    expect(isTestAccount("https://recruiter.co.kr/x", hosts)).toBe(true);
    expect(isTestAccount("https://skcareers.com/x", hosts)).toBe(false);
    expect(isTestAccount("https://evilrecruiter.co.kr/x", hosts)).toBe(false);
    expect(isTestAccount("https://talent.hyundai.com/x", hosts)).toBe(false);
    expect(isTestAccount("nope", hosts)).toBe(false);
  });

  it("reads the allowlist file and treats a missing or malformed one as empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "live-qa-"));
    expect(await readTestAccounts(dir)).toEqual([]);
    await writeFile(
      join(dir, "test-accounts.json"),
      '{"hosts": ["a.test", 3]}',
    );
    expect(await readTestAccounts(dir)).toEqual(["a.test"]);
    await writeFile(join(dir, "test-accounts.json"), "{broken");
    expect(await readTestAccounts(dir)).toEqual([]);
  });
});

describe("IDENTITY_FIELD", () => {
  it("covers the login identity fields and nothing structural", () => {
    for (const n of [
      "prsEmail",
      "prsPhone",
      "koreanName",
      "birthday",
      "성명",
      "휴대전화",
      "name 이름",
    ])
      expect(IDENTITY_FIELD.test(n)).toBe(true);
    for (const n of [
      "eduEducationName 학교명",
      "schoolName",
      "companyName",
      "carCorpName",
      "cerCertName",
      "eduMajor",
      "appDesiredSalary",
      "prsZipCode",
      "학교",
    ])
      expect(IDENTITY_FIELD.test(n)).toBe(false);
  });
});
