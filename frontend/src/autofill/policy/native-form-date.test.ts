import { afterEach, describe, expect, it } from "vitest";
import { getWriteAdapter } from "../adapters/write";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { nativeTestItem } from "./__fixtures__/native-test-item";
afterEach(() => installExecutionPolicy(document));
describe("nativeForm dates", () => {
  it.each([
    ["YM", "2024.02"],
    ["YMD", "2024.02.29"],
  ])("formats a complete leap date for %s", (precision, expected) => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    document
      .querySelector('[name="career[0].entranceDate"]')!
      .setAttribute(
        "data-dates",
        `career[0].careerDate:${precision} forbiddenAfterToday`,
      );
    const { handle, item } = nativeTestItem("entranceDate", "2024-02-29");
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: true,
    });
    expect(handle.elements[0].value).toBe(expected);
  });
  it.each(["2023-02-29", "2024-13-01", "9999-01-01"])(
    "rejects invalid or future date %s",
    (value) => {
      mountSyntheticNative();
      installExecutionPolicy(document, syntheticNativePolicy());
      const { handle, item } = nativeTestItem("entranceDate", value);
      expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
        handled: true,
        written: false,
      });
    },
  );
  it("rejects unknown date precision and reversed period", () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem("leavingDate", "2023-02-01");
    (
      document.querySelector(
        '[name="career[0].entranceDate"]',
      ) as HTMLInputElement
    ).value = "2024.01";
    expect(getWriteAdapter(document).tryWrite(handle, item)).toEqual({
      handled: true,
      written: false,
    });
  });
});
