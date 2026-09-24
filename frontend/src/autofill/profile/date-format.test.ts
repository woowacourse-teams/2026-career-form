import { describe, expect, it } from "vitest";
import { formatProfileDate } from "./date-format";

describe("formatProfileDate", () => {
  it.each([
    ["2024-02-29", "YYYY-MM-DD", "2024-02-29"],
    ["0001-01-01", "YYYY-MM", "0001-01"],
    ["9999-12-31", "YYYY.MM", "9999.12"],
    ["2000-02-29", "YYYY.MM.DD", "2000.02.29"],
  ] as const)("formats valid source %s as %s", (source, format, value) => {
    expect(formatProfileDate(source, format)).toEqual({
      status: "resolved",
      value,
    });
  });

  it.each([
    "1900-02-29",
    "2023-02-29",
    "2024-04-31",
    "0000-01-01",
    "10000-01-01",
    "2024-00-01",
    "2024-13-01",
    "2024-01-00",
    "2024-01-32",
    "2024-2-01",
    "2024-02",
    " 2024-02-01",
    "2024-02-01 ",
    "2024-02-29\n",
    "2024-02-29\r",
    "2024-02-29\r\n",
    "2024/02/01",
    "2024-02-01suffix",
  ])("rejects invalid complete date %j for every output format", (source) => {
    for (const format of [
      "YYYY-MM-DD",
      "YYYY-MM",
      "YYYY.MM",
      "YYYY.MM.DD",
    ] as const) {
      expect(formatProfileDate(source, format).status).toBe("invalid");
    }
  });

  it("rejects an unsupported target format", () => {
    expect(formatProfileDate("2024-02-29", "YYYY" as never).status).toBe(
      "invalid",
    );
  });
});
