import { expect, it, vi } from "vitest";
import { observeQuality } from "./safe-observation";

it("품질 계측 실패와 비동기 보고 실패가 기존 입력 흐름으로 전파되지 않는다", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  expect(() =>
    observeQuality(() => {
      throw new Error("synthetic-private-value");
    }),
  ).not.toThrow();
  observeQuality(async () => {
    throw new Error("synthetic-private-value");
  });
  await Promise.resolve();
  expect(warning).toHaveBeenCalledWith("QUALITY_LOCAL_OBSERVATION_UNAVAILABLE");
  expect(JSON.stringify(warning.mock.calls)).not.toContain(
    "synthetic-private-value",
  );
  warning.mockRestore();
});
