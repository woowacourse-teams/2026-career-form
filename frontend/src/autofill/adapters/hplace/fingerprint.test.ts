import { describe, expect, it } from "vitest";

import publicDocuments from "./__fixtures__/public-documents.json";
import { isHplaceDocument } from "./fingerprint";

type PublicDocument = (typeof publicDocuments)[number];

function page(fixture: PublicDocument): Document {
  const source = document.implementation.createHTMLDocument();
  Object.defineProperty(source, "URL", {
    value: fixture.url,
    configurable: true,
  });
  for (const src of fixture.scripts) {
    const script = source.createElement("script");
    script.setAttribute("src", src);
    source.head.append(script);
  }
  for (const href of fixture.styles) {
    const link = source.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("href", href);
    source.head.append(link);
  }
  for (const id of fixture.ids) {
    const form = fixture.forms.find((form) => form.id === id);
    const element = source.createElement(form ? "form" : "div");
    element.id = id;
    source.body.append(element);
  }
  return new Proxy(source, {
    get(target, key) {
      if (key === "location") return new URL(target.URL);
      if (key === "baseURI")
        return target.querySelector("base")?.href ?? target.URL;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const builder = publicDocuments[0];
const jobda = publicDocuments.find((fixture) =>
  fixture.url.includes("recruiter.im"),
)!;
const v1 = publicDocuments.find((fixture) =>
  fixture.url.includes("/v1/applicant/"),
)!;
const notice = publicDocuments.find((fixture) =>
  fixture.url.includes("/app/jobnotice/view"),
)!;
const login = publicDocuments.find((fixture) =>
  fixture.url.includes("/app/applicant/myPage/login"),
)!;

describe("Hplace public document fingerprint", () => {
  it.each(publicDocuments)(
    "classifies $label from observed markup",
    (fixture) => {
      expect(isHplaceDocument(page(fixture))).toBe(fixture.expected);
    },
  );

  it.each([
    "recruiter.co.kr",
    "recruiter.im",
    "tenant.recruiter.co.kr.evil.test",
    "tenant.evilrecruiter.co.kr",
    "nested.tenant.recruiter.co.kr",
    "-tenant.recruiter.co.kr",
    "tenant-.recruiter.co.kr",
    "tenant_name.recruiter.co.kr",
  ])("rejects lookalike or non-tenant host %s", (host) => {
    expect(isHplaceDocument(page(rehost(builder, `https://${host}/`)))).toBe(
      false,
    );
  });

  it.each(["https://new-tenant9.recruiter.co.kr/", "http://a.recruiter.im/"])(
    "recognizes an unlisted tenant at %s without a company allowlist",
    (url) => {
      expect(isHplaceDocument(page(rehost(builder, url)))).toBe(true);
    },
  );

  it("rejects non-HTTP documents even with matching paths and host", () => {
    expect(
      isHplaceDocument(page(rehost(builder, "ftp://tenant.recruiter.co.kr/"))),
    ).toBe(false);
  });

  it.each([builder, jobda, v1, notice, login])(
    "rejects foreign assets for $label",
    (fixture) => {
      const foreign = rehost(fixture, "https://other.recruiter.co.kr/");
      expect(isHplaceDocument(page({ ...foreign, url: fixture.url }))).toBe(
        false,
      );
    },
  );

  it.each([
    [
      builder,
      [
        "loading-root",
        "modal-root",
        "slate-hovering-toolbar",
        "tooltip-root",
        "message-root",
        "popup-root",
      ],
    ],
    [
      jobda,
      [
        "loading-root",
        "modal-root",
        "slate-hovering-toolbar",
        "tooltip-root",
        "message-root",
        "popup-root",
      ],
    ],
    [v1, ["root", "tooltip-root", "overlay-root"]],
    [notice, ["appsiteSn", "systemKindCode", "jobnoticeSn", "mrs2"]],
    [login, ["frm"]],
  ] as const)("requires every owning DOM marker for %s", (fixture, ids) => {
    for (const id of ids) {
      expect(
        isHplaceDocument(
          page({ ...fixture, ids: fixture.ids.filter((item) => item !== id) }),
        ),
        id,
      ).toBe(false);
    }
  });

  it.each([
    [builder, "/page-"],
    [jobda, "/page-"],
    [v1, "/index-"],
    [notice, "/jquery.midasit.common.js"],
    [notice, "/rsaCommon.js"],
    [login, "/jquery.midasit.common.js"],
    [login, "/applicantCommon.js"],
  ] as const)(
    "requires each application script for %s (%s)",
    (fixture, token) => {
      expect(
        isHplaceDocument(
          page({
            ...fixture,
            scripts: fixture.scripts.filter(
              (script) => !script.includes(token),
            ),
          }),
        ),
      ).toBe(false);
    },
  );

  it.each([v1, login])(
    "requires the application stylesheet for $label",
    (fixture) => {
      expect(isHplaceDocument(page({ ...fixture, styles: [] }))).toBe(false);
    },
  );

  it.each([v1, login])(
    "rejects foreign or preload-only styles for $label",
    (fixture) => {
      const foreign = rehost(fixture, "https://assets.example/");
      expect(
        isHplaceDocument(page({ ...fixture, styles: foreign.styles })),
      ).toBe(false);
      const source = page(fixture);
      source.querySelectorAll("link").forEach((link) => {
        link.rel = "preload";
      });
      expect(isHplaceDocument(source)).toBe(false);
    },
  );

  it.each([builder, v1, notice, login])(
    "ignores template-only owning markers for $label",
    (fixture) => {
      const source = page(fixture);
      const template = source.createElement("template");
      template.content.append(...source.body.childNodes);
      source.body.append(template);
      expect(isHplaceDocument(source)).toBe(false);
    },
  );

  it("rejects a foreign base URL for relative scripts", () => {
    const source = page({
      ...builder,
      scripts: builder.scripts.map((src) => new URL(src).pathname),
    });
    const base = source.createElement("base");
    base.href = "https://assets.example/";
    source.head.prepend(base);
    expect(isHplaceDocument(source)).toBe(false);
  });

  it.each(["http://abl.recruiter.co.kr", "https://abl.recruiter.co.kr:8443"])(
    "requires matching resource origin including protocol and port: %s",
    (origin) => {
      const foreign = rehost(builder, origin);
      expect(
        isHplaceDocument(page({ ...builder, scripts: foreign.scripts })),
      ).toBe(false);
    },
  );

  it("rejects documents without a browsing location", () => {
    expect(isHplaceDocument(document.implementation.createHTMLDocument())).toBe(
      false,
    );
  });

  it("requires a real legacy form rather than a div with its id", () => {
    expect(isHplaceDocument(page({ ...login, forms: [] }))).toBe(false);
  });

  it.each(["preload", "prefetch", "modulepreload"])(
    "does not treat %s hints or ordinary links as loaded scripts",
    (rel) => {
      const source = page({ ...builder, scripts: [] });
      for (const src of builder.scripts) {
        const link = source.createElement("link");
        link.rel = rel;
        link.href = src;
        link.as = "script";
        const anchor = source.createElement("a");
        anchor.href = src;
        source.head.append(link);
        source.body.append(anchor);
      }
      expect(isHplaceDocument(source)).toBe(false);
    },
  );

  it.each([builder, v1, notice, login])(
    "ignores template-only markup for $label",
    (fixture) => {
      const source = page(fixture);
      const template = source.createElement("template");
      template.content.append(
        ...source.head.childNodes,
        ...source.body.childNodes,
      );
      source.body.append(template);
      expect(isHplaceDocument(source)).toBe(false);
    },
  );

  it("ignores generic bundles and jobflex layouts or error chunks", () => {
    const source = page({
      ...builder,
      scripts: builder.scripts.filter((src) => !src.includes("/page-")),
    });
    expect(isHplaceDocument(source)).toBe(false);
  });

  it("rejects jobflex pages outside its observed career subtree", () => {
    expect(
      isHplaceDocument(
        page({
          ...builder,
          scripts: builder.scripts.map((src) =>
            src.replace("/career/", "/other/"),
          ),
        }),
      ),
    ).toBe(false);
  });

  it("tolerates a new deployment hash, encoded paths, query and fragment", () => {
    const source = page({
      ...builder,
      scripts: builder.scripts.map(
        (src) =>
          src
            .replace(/page-[\w-]+\.js/, "page-New_release123.js")
            .replace("(main)", "%28main%29") + "?build=2#asset",
      ),
    });
    expect(isHplaceDocument(source)).toBe(true);
  });

  it("resolves relative resources against the document base URL", () => {
    const source = page({
      ...v1,
      scripts: v1.scripts.map((src) => new URL(src).pathname),
      styles: v1.styles.map((href) => new URL(href).pathname),
    });
    expect(isHplaceDocument(source)).toBe(true);
  });

  it("rejects malformed resource encoding without throwing", () => {
    expect(
      isHplaceDocument(
        page({
          ...builder,
          scripts: ["/_next/static/chunks/app/%E0%A4/page-broken.js"],
        }),
      ),
    ).toBe(false);
  });

  it("rechecks evidence after delayed rendering, removals and navigation", () => {
    const source = page({ ...builder, scripts: [] });
    expect(isHplaceDocument(source)).toBe(false);
    source.head.append(...page(builder).head.childNodes);
    expect(isHplaceDocument(source)).toBe(true);
    source.getElementById("popup-root")!.remove();
    expect(isHplaceDocument(source)).toBe(false);
    source.body.append(...page(builder).body.childNodes);
    expect(isHplaceDocument(source)).toBe(true);
    Object.defineProperty(source, "URL", {
      value: "https://other.example/",
      configurable: true,
    });
    expect(isHplaceDocument(source)).toBe(false);
  });
});

function rehost(fixture: PublicDocument, url: string): PublicDocument {
  const origin = new URL(fixture.url).origin;
  const target = new URL(url);
  return {
    ...fixture,
    url,
    scripts: fixture.scripts.map((src) => src.replace(origin, target.origin)),
    styles: fixture.styles.map((href) => href.replace(origin, target.origin)),
  };
}
