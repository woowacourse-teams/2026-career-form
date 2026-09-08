import { describe, expect, it } from "vitest";

import { resolveCompany } from "./company";

describe("company resolution", () => {
  it.each([
    ["www.skcareers.com", "sk"],
    ["talent.hyundai.com", "hyundai"],
    ["careers.example.test", "generic"],
    ["WWW.SKCAREERS.COM", "sk"],
    ["TALENT.HYUNDAI.COM", "hyundai"],
    ["talent.hyundai.com:443", "generic"],
  ] as const)("resolves the exact host %s as %s", (host, expected) => {
    expect(resolveCompany(host)).toBe(expected);
  });
});
