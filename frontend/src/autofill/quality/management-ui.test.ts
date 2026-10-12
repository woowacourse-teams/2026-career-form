import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";

const root = "../../../../backend/src/main/resources/static/quality/";
const host = "fixture.career.greetinghr.com";
const first = `https://${host}/ko/o/238112/apply`;
const second = `https://${host}/ko/o/238113/apply`;
const link = (url: string) => ({
  url,
  firstSeen: "2030-01-01T00:00:00Z",
  lastSeen: "2030-01-02T00:00:00Z",
});
const row = (id: string, status: string) => ({
  id,
  site: host,
  structure: id,
  route: "GREETING",
  version: "fixture",
  status,
  identity: "TENANT",
  mine: false,
  firstSeen: "2030-01-01T00:00:00Z",
  lastSeen: "2030-01-02T00:00:00Z",
  history:
    status === "COMPLETED"
      ? [{ fieldCount: 3, confirmedAt: "2030-01-01T00:00:00Z" }]
      : [],
  links: [link(first)],
  linksOverflow: false,
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  vi.resetModules();
});
it("renders one site card with distinct posting links, scope history and no duplicate on more", async () => {
  document.documentElement.innerHTML = readFileSync(
    new URL(root + "index.html", import.meta.url),
    "utf8",
  );
  const site = {
    id: "site_fixture",
    company: "SYNTHETIC",
    site: host,
    homepage: `https://${host}/`,
    links: [link(first), link(second)],
    linksOverflow: false,
    candidates: [row("a", "WAITING"), row("b", "COMPLETED")],
  };
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    requests.push(input);
    if (input.endsWith("/notifications"))
      return new Response(JSON.stringify({ message: "fixture", entries: [] }));
    return new Response(
      JSON.stringify({
        items: [site],
        hasMore: !input.includes("offset=50"),
        nextOffset: 50,
      }),
    );
  });
  const access =
    await import("../../../../backend/src/main/resources/static/quality/access.js");
  access.setAccess("synthetic", "fixture");
  await import("../../../../backend/src/main/resources/static/quality/app.js");
  await waitFor(() =>
    expect(document.querySelectorAll("[data-site-id]")).toHaveLength(1),
  );
  expect(requests.some((value) => value.includes("/site-groups?"))).toBe(true);
  expect(document.body.textContent).toContain("회사 SYNTHETIC");
  expect(
    Array.from(document.querySelectorAll("a[data-application-link]")).map(
      (value) => value.getAttribute("href"),
    ),
  ).toEqual([first, second]);
  expect(document.querySelectorAll("[data-candidate-id]")).toHaveLength(2);
  expect(document.body.textContent).toContain("확인 이력");
  expect(document.body.textContent).toContain("담당하기");
  document.getElementById("more")!.click();
  await waitFor(() =>
    expect(requests.some((value) => value.includes("offset=50"))).toBe(true),
  );
  expect(document.querySelectorAll("[data-site-id]")).toHaveLength(1);
});

it("does not present a legacy homepage as an exact application link", async () => {
  const { siteCard } =
    await import("../../../../backend/src/main/resources/static/quality/site-card.js");
  const homepage = `https://${host}/`;
  const rendered = siteCard(
    {
      id: "legacy",
      site: host,
      homepage,
      links: [],
      linksOverflow: false,
      candidates: [
        { ...row("legacy", "WAITING"), publicLink: homepage, links: [] },
      ],
    },
    () => document.createElement("section"),
  );
  expect(rendered.textContent).toContain("작성 링크 미확보");
  expect(rendered.querySelectorAll("a")).toHaveLength(1);
  expect(rendered.querySelector("a")?.href).toBe(homepage);
});
