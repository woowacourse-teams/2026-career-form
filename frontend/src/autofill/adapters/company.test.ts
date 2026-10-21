import { afterEach, describe, expect, it } from "vitest";
import { resolveCompany, resolveDocumentCompany } from "./company";
import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  renderHplaceLogin,
  setHplacePage,
  resetHplacePage,
} from "../workflow/test-utils/hplace.fixture";
afterEach(() => {
  installExecutionPolicy(document);
  resetHplacePage();
});
describe("policy-based engine resolution", () => {
  it.each([
    "www.skcareers.com",
    "talent.hyundai.com",
    "careers.example.test",
    "kakaomobility.career.greetinghr.com",
    "career.hyundai-autoever.com",
    "a.career.greetinghr.com.evil.test",
  ])("does not infer an engine from host %s", (host) => {
    expect(resolveCompany(host)).toBe("generic");
  });
  it.each(["sk", "hyundai", "greeting"] as const)(
    "uses the installed %s policy",
    (site) => {
      installExecutionPolicy(document, fixturePolicy(site));
      expect(resolveDocumentCompany(document)).toBe(
        site === "greeting" ? "components" : "policy",
      );
      document.body.replaceChildren();
      expect(resolveDocumentCompany(document)).toBe(
        site === "greeting" ? "components" : "policy",
      );
      installExecutionPolicy(document);
      expect(resolveDocumentCompany(document)).toBe("generic");
    },
  );
  it("does not infer a component engine from lookalike DOM", () => {
    document.body.innerHTML =
      '<input name="basicInformation.name"><input name="basicInformation.phoneNumber.nationalNumber">';
    expect(resolveDocumentCompany(document)).toBe("generic");
  });
  it("invalidates an installed policy when the document navigates", () => {
    installExecutionPolicy(document, fixturePolicy("greeting"));
    const previous = document.URL;
    const runtime = (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom;
    try {
      runtime.reconfigure({
        url: new URL("/other-policy-test", previous).href,
      });
      expect(resolveDocumentCompany(document)).toBe("generic");
    } finally {
      runtime.reconfigure({ url: previous });
    }
  });
});

describe("Hplace document resolution", () => {
  it("requires document evidence and retains established identity through a rerender", () => {
    renderHplaceLogin();
    expect(resolveCompany("kakaobank.recruiter.co.kr")).toBe("generic");
    expect(resolveDocumentCompany(document)).toBe("hplace");
    document.getElementById("overlay-root")!.remove();
    expect(resolveDocumentCompany(document)).toBe("hplace");
  });

  it("rechecks delayed roots and navigation on the same document", () => {
    renderHplaceLogin();
    const overlay = document.getElementById("overlay-root")!;
    overlay.remove();
    expect(resolveDocumentCompany(document)).toBe("generic");
    document.body.append(overlay);
    expect(resolveDocumentCompany(document)).toBe("hplace");
    document.head.replaceChildren();
    setHplacePage("https://kakaobank.recruiter.co.kr/other");
    expect(resolveDocumentCompany(document)).toBe("generic");
    setHplacePage("https://careers.example.test/v1/applicant/my-page/login");
    expect(resolveDocumentCompany(document)).toBe("generic");
  });

  it.each(["sk", "hyundai", "greeting"] as const)(
    "prioritizes the installed %s policy over Hplace evidence",
    (site) => {
      renderHplaceLogin();
      installExecutionPolicy(document, fixturePolicy(site));
      expect(resolveDocumentCompany(document)).toBe(
        site === "greeting" ? "components" : "policy",
      );
      installExecutionPolicy(document);
      expect(resolveDocumentCompany(document)).toBe("hplace");
    },
  );
});
