import { describe, expect, it } from "vitest";
import { createAnalysisMessageHandler } from "./background-handler";

const host = "fixture.career.greetinghr.com";
const url = `https://${host}/ko/o/238112/apply`;
const source = {
  id: "extension",
  tab: { id: 1 },
  frameId: 0,
  documentId: "doc",
  url,
};
const payload = {
  schemaVersion: 2,
  snapshotId: "snapshot",
  site: { host, pathPattern: "/ko/o/*/apply" },
  sections: [{ sectionId: "root", fields: [] }],
};
async function sent(input = source) {
  let options: RequestInit | undefined;
  const handler = createAnalysisMessageHandler({
    baseUrl: "https://api.example.test",
    extensionId: "extension",
    fetcher: async (_url, init) => {
      options = init;
      return new Response("{}", { status: 200 });
    },
  });
  await handler(
    { type: "AUTOFILL_ANALYZE_FIELDS", qualityRun: "a".repeat(32), payload },
    input,
  );
  return options;
}
describe("public posting link quality transport", () => {
  it("keeps the exact trusted posting URL outside the analysis body", async () => {
    const options = await sent();
    expect(options?.headers).toHaveProperty(
      "X-Career-Form-Public-Application",
      url,
    );
    expect(JSON.parse(String(options?.body))).toEqual(payload);
    expect(String(options?.body)).not.toContain("238112");
  });
  it.each([
    `${url}?token=synthetic`,
    `${url}\n`,
    `${url}#session`,
    `https://user@${host}/ko/o/238112/apply`,
    "https://foreign.career.greetinghr.com/ko/o/238112/apply",
    `https://${host}/user/synthetic/apply`,
    `http://${host}/ko/o/238112/apply`,
    `${url}/`,
    `https://${host}/ko/o/%32/apply`,
  ])("ignores unsupported or sensitive URL %s", async (value) => {
    const options = await sent({ ...source, url: value });
    expect(options?.headers).not.toHaveProperty(
      "X-Career-Form-Public-Application",
    );
    expect(JSON.parse(String(options?.body))).toEqual(payload);
  });
  it("does not trust a different extension sender", async () => {
    expect(
      (await sent({ ...source, id: "other" }))?.headers,
    ).not.toHaveProperty("X-Career-Form-Public-Application");
  });
});
