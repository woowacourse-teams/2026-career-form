// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyRequest, maskFields, savePayload } from "./requests.mjs";
import { IDENTITY_FIELD } from "./sites.mjs";

const api = { allowHosts: ["43.202.185.36"] };
const post = (url, extra = {}) => ({ method: "POST", url, ...extra });
const GREETING = "https://kurly.career.greetinghr.com/ko/o/1/apply";
const action = (postData) =>
  post(GREETING, { headers: { "Next-Action": "abc" }, postData });

describe("classifyRequest", () => {
  it("passes reads without logging them", () => {
    expect(
      classifyRequest({ method: "GET", url: "https://x.example/save" }, api),
    ).toEqual({ action: "pass", reason: "read", log: null });
  });

  it("passes the extension API host and extension pages", () => {
    expect(
      classifyRequest(post("http://43.202.185.36/api/v1/fields/analyze"), api)
        .action,
    ).toBe("pass");
    expect(classifyRequest(post("chrome-extension://abc/x"), api).action).toBe(
      "pass",
    );
  });

  it.each([
    "https://gsenc.recruiter.co.kr/com/code/retrieveCollegeList",
    "https://gsenc.recruiter.co.kr/com/code/retrieveCollegeMajorList",
    "https://careerhyundai.recruiter.co.kr/mrs2/applicant/resume/step2.json",
    "https://gsenc.recruiter.co.kr/app/noticePopup/getResumeStart",
    "https://www.skcareers.com/Application/SchoolList",
    "https://www.skcareers.com/Application/ForeignExamList",
  ])("allows the read-only lookup %s", (url) => {
    const result = classifyRequest(post(url, { postData: "q=x" }), api);
    expect(result.action).toBe("allow");
    expect(result.log).toMatch(/^allowed POST /);
  });

  it.each([
    [
      "a save path",
      "https://gsenc.recruiter.co.kr/mrs2/applicant/resume/saveStep1",
    ],
    [
      "the oath",
      "https://gsenc.recruiter.co.kr/app/applicant/saveResumeSubmitOath",
    ],
    ["a temp save", "https://www.skcareers.com/Application/TempSave"],
    ["a submit", "https://talent.hyundai.com/apply/applySubmit.hc"],
    ["an agreement", "https://talent.hyundai.com/apply/agreeTerms.hc"],
    ["an SMS request", "https://www.skcareers.com/Member/SendSms"],
    ["an unknown endpoint", "https://talent.hyundai.com/apply/nextStep.hc"],
    ["GraphQL", "https://api.example.test/graphql"],
    ["analytics", "https://www.google-analytics.com/g/collect"],
    ["a beacon", "https://ingest.greetinghr.com/v1/track"],
    [
      "a lookup on another host",
      "https://evil.example/com/code/retrieveCollegeList",
    ],
  ])("blocks %s", (_, url) => {
    const result = classifyRequest(post(url, { postData: "x=1" }), api);
    expect(result.action).toBe("block");
    expect(result.log).toMatch(/^BLOCKED POST /);
  });

  it.each(["PUT", "PATCH", "DELETE"])(
    "blocks %s even on a lookup path",
    (method) => {
      expect(
        classifyRequest(
          {
            method,
            url: "https://www.skcareers.com/Application/SchoolList",
          },
          api,
        ),
      ).toMatchObject({ action: "block", reason: "write-method" });
    },
  );

  it("blocks a lookup path whose query asks to save", () => {
    expect(
      classifyRequest(
        post(
          "https://gsenc.recruiter.co.kr/com/code/retrieveCollegeList?cmd=tempSave",
        ),
        api,
      ),
    ).toMatchObject({ action: "block", reason: "mutation-query" });
  });

  it("lets the harness's own no-save step navigation through", () => {
    const url =
      "https://gsenc.recruiter.co.kr/mrs2/applicant/resume/writeResume";
    expect(
      classifyRequest(
        post(url, { postData: "resumeSn=11&recruitNoticeSn=22&step=2" }),
        api,
      ),
    ).toEqual({
      action: "allow",
      reason: "hplace-step-navigation",
      log: "allowed POST gsenc.recruiter.co.kr/mrs2/applicant/resume/writeResume (no-save step navigation)",
    });
    for (const postData of [
      "resumeSn=11&recruitNoticeSn=22&step=2&name=x",
      "resumeSn=11&step=2",
      "resumeSn=11&recruitNoticeSn=22&step=5",
      null,
    ])
      expect(classifyRequest(post(url, { postData }), api).action).toBe(
        "block",
      );
  });

  it("logs the path only, never the query or body", () => {
    const result = classifyRequest(
      post("https://a.example/app/save?name=secret", { postData: "x=secret" }),
      api,
    );
    expect(result.log).toBe(
      "BLOCKED POST a.example/app/save (not-allowlisted)",
    );
    expect(result.log).not.toContain("secret");
  });

  it("allows a small Next.js server-action lookup on the apply page", () => {
    const result = classifyRequest(action('["대진고"]'), api);
    expect(result.action).toBe("allow");
    expect(result.reason).toBe("next-action-lookup");
    expect(result.log).toContain(`body ${Buffer.byteLength('["대진고"]')}B`);
    expect(
      classifyRequest(action('[{"keyword":"서울","page":1}]'), api).action,
    ).toBe("allow");
  });

  it.each([
    ["application content", '[{"basicInformation":{"name":"x"}}]'],
    ["a large body", `["${"a".repeat(250)}"]`],
    ["a draft marker", '["draft"]'],
    ["a boolean", "[true]"],
    ["nested objects", '[{"a":{"b":"c"}}]'],
    ["an empty body", ""],
    ["an unreadable body", null],
    ["a non-JSON body", "name=x"],
  ])("blocks a server action carrying %s", (_, postData) => {
    expect(classifyRequest(action(postData), api).action).toBe("block");
  });

  it("blocks a server action on any page other than the apply page", () => {
    expect(
      classifyRequest(
        post("https://kurly.career.greetinghr.com/ko/o/1/apply/confirm", {
          headers: { "next-action": "abc" },
          postData: '["x"]',
        }),
        api,
      ).action,
    ).toBe("block");
  });
});

describe("classifyRequest with saveHost (test-account reset)", () => {
  const reset = { ...api, saveHost: "gsenc.recruiter.co.kr" };

  it("allows the site's own save writes while a reset runs", () => {
    const r = classifyRequest(
      post("https://gsenc.recruiter.co.kr/mrs2/applicant/resume/saveStep1"),
      reset,
    );
    expect(r).toMatchObject({ action: "allow", reason: "reset-save" });
    expect(r.log).toBe(
      "allowed POST gsenc.recruiter.co.kr/mrs2/applicant/resume/saveStep1 (test-account reset save)",
    );
    expect(
      classifyRequest(
        post(
          "https://gsenc.recruiter.co.kr/mrs2/applicant/resume/tempSave?draft=1",
        ),
        reset,
      ).action,
    ).toBe("allow");
  });

  it.each([
    "https://gsenc.recruiter.co.kr/app/applicant/saveResumeSubmitOath",
    "https://gsenc.recruiter.co.kr/mrs2/applicant/resume/finalSubmit",
    "https://gsenc.recruiter.co.kr/mrs2/applicant/apply",
    "https://gsenc.recruiter.co.kr/mrs2/applicant/resume/save?agree=Y",
    "https://gsenc.recruiter.co.kr/auth/sms",
  ])("still blocks a submit-like write %s", (url) => {
    expect(classifyRequest(post(url), reset)).toMatchObject({
      action: "block",
      reason: "submit-like-during-reset",
    });
  });

  it("keeps other hosts on the normal rules", () => {
    expect(
      classifyRequest(
        post("https://abl.recruiter.co.kr/mrs2/applicant/resume/saveStep1"),
        reset,
      ).action,
    ).toBe("block");
    expect(
      classifyRequest(post("https://www.google-analytics.com/g/collect"), reset)
        .action,
    ).toBe("block");
  });
});

describe("savePayload (test-account save body recording)", () => {
  const tab = { tabHost: "www.skcareers.com" };
  const save = (extra) =>
    savePayload(
      {
        method: "POST",
        url: "https://www.skcareers.com/Application/ApplicationSave?x=1",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        ...extra,
      },
      tab,
    );

  it("parses a form-encoded body of a save request to the tab's host", () => {
    expect(
      save({ postData: "name=%EC%8B%A4%EC%A0%9C&school=가상대&school=둘" }),
    ).toEqual({
      path: "https://www.skcareers.com/Application/ApplicationSave",
      fields: { name: "실제", school: "가상대 | 둘" },
    });
  });

  it("parses one level of a JSON body", () => {
    expect(
      save({
        headers: { "content-type": "application/json" },
        postData:
          '{"email":"a@b.test","n":3,"ok":true,"nested":{"x":1},"none":null}',
      }).fields,
    ).toEqual({
      email: "a@b.test",
      n: "3",
      ok: "true",
      nested: "[nested]",
      none: "",
    });
    expect(save({ headers: {}, postData: "[1,2]" }).fields).toEqual({});
  });

  it("records only POST/PUT save-like paths on the tab's host", () => {
    expect(save({ method: "GET" })).toBeNull();
    expect(
      savePayload(
        {
          method: "POST",
          url: "https://www.skcareers.com/Application/SchoolList",
          postData: "q=x",
        },
        tab,
      ),
    ).toBeNull();
    expect(
      savePayload(
        {
          method: "PUT",
          url: "https://www.skcareers.com/api/draft",
          postData: "a=1",
        },
        tab,
      ),
    ).toMatchObject({ fields: { a: "1" } });
    expect(
      savePayload(
        {
          method: "POST",
          url: "https://www.skcareers.com/api/x?mode=tempStore",
          postData: "a=1",
        },
        tab,
      ),
    ).toMatchObject({ fields: { a: "1" } });
    expect(
      savePayload(
        {
          method: "POST",
          url: "https://other.example/Application/ApplicationSave",
          postData: "a=1",
        },
        tab,
      ),
    ).toBeNull();
    expect(save({ postData: null })).toEqual({
      path: "https://www.skcareers.com/Application/ApplicationSave",
      fields: {},
    });
  });

  it("truncates long values", () => {
    const long = "a".repeat(500);
    expect(save({ postData: `intro=${long}` }).fields.intro).toHaveLength(200);
  });
});

describe("maskFields", () => {
  it("replaces values of identity fields with [account]", () => {
    expect(
      maskFields(
        {
          prsEmail: "a@b.test",
          성명: "실제",
          schoolName: "가상대",
          intro: "x",
        },
        IDENTITY_FIELD,
      ),
    ).toEqual({
      prsEmail: "[account]",
      성명: "[account]",
      schoolName: "가상대",
      intro: "x",
    });
  });
});
