import { afterEach, describe, expect, it } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
import { nativeTestItem } from "./__fixtures__/native-test-item";
afterEach(() => installExecutionPolicy(document));
describe("nativeForm drivers", () => {
  it.each([50, 200])(
    "settles a select after %sms and re-reads replaced dependent nodes",
    async (delay) => {
      mountSyntheticNative();
      installExecutionPolicy(document, syntheticNativePolicy());
      const company = document.querySelector<HTMLInputElement>(
        '[name="career[0].company"]',
      )!;
      company.disabled = true;
      const { handle, item } = nativeTestItem(
        "careerCriteriaCodeSn",
        "정규직",
        "SELECT_OPTION",
      );
      handle.elements[0].addEventListener("change", () =>
        setTimeout(() => {
          const replacement = company.cloneNode(true) as HTMLInputElement;
          replacement.disabled = false;
          company.replaceWith(replacement);
        }, delay),
      );
      const adapter = getWorkflowAdapter(document);
      expect(adapter.stateDriverStage?.(item, handle)).toBe(1);
      expect(
        await adapter.executeStateDriver?.(
          document,
          handle,
          item,
          new AbortController().signal,
        ),
      ).toBe(true);
      expect(
        await adapter.settleStateDriver?.(document, handle, undefined, {
          item,
          signal: new AbortController().signal,
        }),
      ).toBe(true);
    },
  );
  it("checks current profile authorization before writing", async () => {
    mountSyntheticNative();
    installExecutionPolicy(document, syntheticNativePolicy());
    const { handle, item } = nativeTestItem(
      "careerCriteriaCodeSn",
      "정규직",
      "SELECT_OPTION",
    );
    expect(
      await getWorkflowAdapter(document).executeStateDriver?.(
        document,
        handle,
        item,
        new AbortController().signal,
        undefined,
        async () => false,
      ),
    ).toBe(false);
    expect(handle.elements[0].value).toBe("");
  });
});

it("skips an absent optional dependency but does not accept removal of an existing one", async () => {
  mountSyntheticNative();
  const policy = syntheticNativePolicy();
  if (policy.browserPolicy?.schemaVersion !== 2) throw new Error();
  const driver = policy.browserPolicy.nativeForm.sections[1].fields[0].driver!;
  driver.dependencies.push("hplace.mrs2.career.entranceDate");
  driver.settled.push({
    field: "hplace.mrs2.career.entranceDate",
    state: "enabled",
  });
  document.querySelector('[name="career[0].entranceDate"]')!.remove();
  installExecutionPolicy(document, policy);
  const { handle, item } = nativeTestItem(
    "careerCriteriaCodeSn",
    "정규직",
    "SELECT_OPTION",
  );
  const adapter = getWorkflowAdapter(document),
    signal = new AbortController().signal;
  expect(
    await adapter.executeStateDriver?.(document, handle, item, signal),
  ).toBe(true);
  expect(
    await adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal,
    }),
  ).toBe(true);
  document.querySelector('[name="career[0].company"]')!.remove();
  expect(
    await adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal,
    }),
  ).toBe(false);
});

it("rejects a profile change while the driver settles", async () => {
  mountSyntheticNative();
  installExecutionPolicy(document, syntheticNativePolicy());
  const company = document.querySelector<HTMLInputElement>(
    '[name="career[0].company"]',
  )!;
  company.disabled = true;
  const { handle, item } = nativeTestItem(
    "careerCriteriaCodeSn",
    "정규직",
    "SELECT_OPTION",
  );
  const adapter = getWorkflowAdapter(document),
    signal = new AbortController().signal;
  let current = true;
  handle.elements[0].addEventListener("change", () =>
    setTimeout(() => {
      current = false;
      company.disabled = false;
    }, 50),
  );
  expect(
    await adapter.executeStateDriver?.(
      document,
      handle,
      item,
      signal,
      undefined,
      async () => current,
    ),
  ).toBe(true);
  expect(
    await adapter.settleStateDriver?.(document, handle, undefined, {
      item,
      signal,
      beforeMutation: async () => current,
    }),
  ).toBe(false);
});
