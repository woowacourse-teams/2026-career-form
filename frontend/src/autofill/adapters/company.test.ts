import { describe, expect, it } from "vitest";

import { resolveCompany, resolveDocumentCompany } from "./company";

describe("company resolution", () => {
  it.each([
    ["www.skcareers.com", "sk"],
    ["talent.hyundai.com", "hyundai"],
    ["careers.example.test", "generic"],
    ["kakaomobility.career.greetinghr.com", "greeting"],
    ["daangnservice.career.greetinghr.com", "greeting"],
    ["mediquitous.career.greetinghr.com", "greeting"],
    ["career.hyundai-autoever.com", "generic"],
    ["www.musinsacareers.com", "generic"],
    ["recruit.kakaogames.com", "generic"],
    ["recruit.kakaogames.com.evil.test", "generic"],
    ["career.greetinghr.com", "generic"],
    ["evilcareer.greetinghr.com", "generic"],
    ["a.career.greetinghr.com.evil.test", "generic"],
    ["a.career.greetinghr.com:443", "generic"],
    ["WWW.SKCAREERS.COM", "sk"],
    ["TALENT.HYUNDAI.COM", "hyundai"],
    ["talent.hyundai.com:443", "generic"],
  ] as const)("resolves the exact host %s as %s", (host, expected) => {
    expect(resolveCompany(host)).toBe(expected);
  });
});

describe("Greeting document resolution", () => {
  function page(host: string, body: string): Document {
    const source = document.implementation.createHTMLDocument();
    source.body.innerHTML = body;
    return new Proxy(source, {
      get(target, key) {
        if (key === "location") return { host };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  const fields = `<form>
    <div data-scope="field" data-part="root"><label>이름<input name="basicInformation.name"></label></div>
    <div data-scope="field" data-part="root"><label>연락처<input type="tel" name="basicInformation.phoneNumber.nationalNumber"></label></div>
  </form>`;
  it("selects Greeting on an arbitrary custom domain from its owned common controls", () => {
    expect(
      resolveDocumentCompany(page("jobs.unregistered.example", fields)),
    ).toBe("greeting");
  });
  it("keeps an established custom-domain adapter through rerenders but resets on navigation", () => {
    const document = page("jobs.unregistered.example", fields);
    expect(resolveDocumentCompany(document)).toBe("greeting");
    document.body.replaceChildren();
    expect(resolveDocumentCompany(document)).toBe("greeting");
    Object.defineProperty(document, "URL", {
      value: "https://jobs.unregistered.example/other",
    });
    expect(resolveDocumentCompany(document)).toBe("generic");
  });
  it.each([
    "<footer>made with Greeting</footer><label>이름<input></label><label>연락처<input></label>",
    '<input name="basicInformation.name"><input name="basicInformation.phoneNumber.nationalNumber">',
    fields + '<input name="basicInformation.name">',
    fields + '<input name="basicInformation.phoneNumber.nationalNumber">',
    fields.replace('type="tel"', 'type="hidden"'),
  ])("keeps incomplete or ambiguous lookalikes generic", (body) => {
    expect(
      resolveDocumentCompany(page("jobs.unregistered.example", body)),
    ).toBe("generic");
  });
  it.each([
    ["www.skcareers.com", "sk"],
    ["talent.hyundai.com", "hyundai"],
  ])("preserves registered company priority on %s", (host, expected) => {
    expect(resolveDocumentCompany(page(host, fields))).toBe(expected);
  });
});
