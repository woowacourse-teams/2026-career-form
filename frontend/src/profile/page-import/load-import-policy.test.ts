import { afterEach, expect, it, vi } from "vitest";
import {
  executionPolicy,
  installExecutionPolicy,
} from "../../autofill/workflow/execution-policy";
import { greetingImportFixture } from "../../research/greeting-import-probe.test-fixtures";
import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { prepareImportPolicy } from "./load-import-policy";
import { readGreetingImport } from "./reader";

afterEach(() => {
  installExecutionPolicy(document);
  document.body.replaceChildren();
});

it("loads and installs the site policy once before reading", async () => {
  document.body.innerHTML = greetingImportFixture();
  const load = vi.fn(async () => fixturePolicy("greeting"));
  await prepareImportPolicy(document, load);
  await prepareImportPolicy(document, load);
  expect(load).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledWith({
    host: location.host,
    pathPattern: location.pathname,
  });
  expect(executionPolicy(document)).toBeDefined();
  expect(readGreetingImport(document)).toContainEqual(
    expect.objectContaining({ source: "basicInformation.email" }),
  );
});

it("sends only the page host and path, never form values", async () => {
  document.body.innerHTML = greetingImportFixture();
  const load = vi.fn(async () => fixturePolicy("greeting"));
  await prepareImportPolicy(document, load);
  expect(JSON.stringify(load.mock.calls)).not.toContain(
    "fixture@example.invalid",
  );
});

it("leaves the page unrecognized when the site has no policy", async () => {
  document.body.innerHTML = greetingImportFixture();
  await prepareImportPolicy(document, async () => undefined);
  expect(executionPolicy(document)).toBeUndefined();
  expect(readGreetingImport(document)).toEqual([
    expect.objectContaining({ reason: "unrecognized_document" }),
  ]);
});

it("leaves the page unrecognized when no policy loader is available", async () => {
  document.body.innerHTML = greetingImportFixture();
  await prepareImportPolicy(document, undefined);
  expect(readGreetingImport(document)).toEqual([
    expect.objectContaining({ reason: "unrecognized_document" }),
  ]);
});

it("propagates a load failure so the panel can offer another read", async () => {
  await expect(
    prepareImportPolicy(document, async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(executionPolicy(document)).toBeUndefined();
});
