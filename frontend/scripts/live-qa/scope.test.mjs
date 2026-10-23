// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  describeTab,
  inScope,
  parsePick,
  pickScope,
  platformOf,
  postingStatus,
  renderScopeTable,
  scopeFromSpecs,
  tabStatus,
} from "./scope.mjs";

const APPLICATION = "writeResume|/Application/|applyWrite|/apply\\b";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("postingStatus", () => {
  it("reads fixed closing phrases, the control count and the path only", () => {
    document.body.innerHTML = `<h1>공고</h1><p>접수가 종료되었습니다.</p>
      <form><input name="name" value="실제이름"><select><option>a</option></select></form>`;
    const status = postingStatus({ applicationPattern: APPLICATION });
    expect(status).toEqual({ closed: true, controls: 2, application: false });
    expect(JSON.stringify(status)).not.toContain("실제이름");
  });

  it.each([
    "마감되었습니다",
    "지원 기간이 아닙니다",
    "모집이 종료된 공고입니다",
    "마감된 공고",
  ])("treats '%s' as closed", (phrase) => {
    document.body.innerHTML = `<p>${phrase}</p>`;
    expect(postingStatus({}).closed).toBe(true);
  });

  it("is open without such a phrase", () => {
    document.body.innerHTML = `<p>지원서 작성</p><input>`;
    expect(postingStatus({})).toEqual({
      closed: false,
      controls: 1,
      application: false,
    });
  });
});

describe("platformOf and tabStatus", () => {
  it("maps hosts to the static-mapping platforms and everything else to generic", () => {
    expect(platformOf("https://abl.recruiter.co.kr/mrs2/x")).toBe("hplace");
    expect(platformOf("https://www.skcareers.com/Application/Index/R1")).toBe(
      "sk",
    );
    expect(platformOf("https://talent.hyundai.com/apply/applyWrite.hc")).toBe(
      "hyundai",
    );
    expect(platformOf("https://recruit.kakaogames.com/ko/o/1/apply")).toBe(
      "greeting",
    );
    expect(platformOf("https://careers.example.test/apply")).toBe("generic");
    expect(platformOf("nope")).toBe("generic");
  });

  it("classifies a tab from its posting status", () => {
    expect(tabStatus(null)).toBe("unknown");
    expect(tabStatus({ closed: true, controls: 40, application: true })).toBe(
      "closed",
    );
    expect(tabStatus({ closed: false, controls: 3, application: false })).toBe(
      "list-page",
    );
    expect(tabStatus({ closed: false, controls: 40, application: true })).toBe(
      "open",
    );
    expect(tabStatus({ closed: false, controls: 0, application: true })).toBe(
      "unknown",
    );
  });

  it("describes a tab with its brief url only", () => {
    expect(
      describeTab("https://www.skcareers.com/Application/Index/R1?x=secret", {
        closed: false,
        controls: 9,
        application: true,
      }),
    ).toEqual({
      platform: "sk",
      tab: "https://www.skcareers.com/Application/Index/R1",
      status: "open",
    });
  });
});

describe("parsePick", () => {
  it("parses platform counts", () => {
    expect(parsePick("hplace=2,greeting=1,sk=1,hyundai=0")).toEqual({
      hplace: 2,
      greeting: 1,
      sk: 1,
      hyundai: 0,
    });
    expect(parsePick(" sk=1 ")).toEqual({ sk: 1 });
  });

  it.each(["generic=1", "hplace", "sk=-1", "sk=x", "", "hplace=1,hplace=2"])(
    "rejects %s",
    (text) => {
      expect(() => parsePick(text)).toThrow(
        expect.objectContaining({ code: "invalid-pick" }),
      );
    },
  );
});

describe("pickScope", () => {
  const tabs = [
    { platform: "hplace", tab: "https://a.recruiter.co.kr/w", status: "open" },
    {
      platform: "hplace",
      tab: "https://b.recruiter.co.kr/w",
      status: "closed",
    },
    { platform: "hplace", tab: "https://c.recruiter.co.kr/w", status: "open" },
    { platform: "hplace", tab: "https://d.recruiter.co.kr/w", status: "open" },
    {
      platform: "sk",
      tab: "https://www.skcareers.com/Application/Index/R1",
      status: "open",
    },
    {
      platform: "greeting",
      tab: "https://x.greetinghr.com/ko/o/1/apply",
      status: "list-page",
    },
    {
      platform: "generic",
      tab: "https://careers.example.test/apply",
      status: "open",
    },
  ];

  it("takes the first N open tabs of each platform in list order and lists closed ones", () => {
    const scope = pickScope(tabs, { hplace: 2, sk: 1, greeting: 1 });
    expect(scope.picked).toEqual([
      { platform: "hplace", tab: "https://a.recruiter.co.kr/w" },
      { platform: "hplace", tab: "https://c.recruiter.co.kr/w" },
      { platform: "sk", tab: "https://www.skcareers.com/Application/Index/R1" },
    ]);
    expect(scope.closed).toEqual([
      { platform: "hplace", tab: "https://b.recruiter.co.kr/w" },
    ]);
    expect(scope.short).toEqual({ greeting: { wanted: 1, open: 0 } });
  });

  it("never picks generic tabs", () => {
    expect(pickScope(tabs, { hplace: 0 }).picked).toEqual([]);
  });

  it("picks named tabs directly and keeps the given spec", () => {
    const scope = scopeFromSpecs(tabs, ["skcareers", "c.recruiter|문구"]);
    expect(scope.picked).toEqual([
      { platform: "sk", tab: "skcareers" },
      { platform: "hplace", tab: "c.recruiter|문구" },
    ]);
    expect(() => scopeFromSpecs(tabs, ["nowhere"])).toThrow(
      expect.objectContaining({ code: "tab-not-found" }),
    );
    expect(() => scopeFromSpecs(tabs, ["careers.example"])).toThrow(
      expect.objectContaining({ code: "platform-out-of-scope" }),
    );
  });

  it("renders a table and open counts without query strings", () => {
    const text = renderScopeTable(tabs);
    expect(text).toContain("hplace\thttps://a.recruiter.co.kr/w\topen");
    expect(text).toContain(
      "generic\thttps://careers.example.test/apply\topen\t범위 밖",
    );
    expect(text).toContain("open: hplace=3 greeting=0 sk=1 hyundai=0");
  });
});

describe("inScope", () => {
  const scope = {
    picked: [
      { platform: "sk", tab: "https://www.skcareers.com/Application/Index/R1" },
      { platform: "hplace", tab: "c.recruiter|문구" },
    ],
  };
  it("accepts a url that contains a picked url part and everything when there is no scope", () => {
    expect(
      inScope("https://www.skcareers.com/Application/Index/R1?k=1", scope),
    ).toBe(true);
    expect(inScope("https://c.recruiter.co.kr/mrs2/x", scope)).toBe(true);
    expect(inScope("https://b.recruiter.co.kr/mrs2/x", scope)).toBe(false);
    expect(inScope("https://b.recruiter.co.kr/mrs2/x", null)).toBe(true);
    expect(inScope("https://b.recruiter.co.kr/mrs2/x", { picked: [] })).toBe(
      false,
    );
  });
});
