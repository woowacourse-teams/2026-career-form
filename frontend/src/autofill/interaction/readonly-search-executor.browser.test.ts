import { afterEach, expect, it } from "vitest";
import { createSearchFixture } from "../../../tests/browser/search-fixture";

const fixtures: ReturnType<typeof createSearchFixture>[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

function setup(existing = "") {
  const fixture = createSearchFixture(existing);
  fixtures.push(fixture);
  return fixture;
}

it("follows native iframe GET navigation and selects its exact result once", async () => {
  const fixture = setup();
  const initialDocument = await fixture.load();
  const navigated = fixture.nextLoad();

  const execution = fixture.run();
  const [responseDocument, result] = await Promise.all([navigated, execution]);

  expect(responseDocument).not.toBe(initialDocument);
  expect(responseDocument.readyState).toBe("complete");
  const url = new URL(responseDocument.URL);
  expect(url.origin).toBe(location.origin);
  expect(url.pathname).toBe("/__cf178/search/results");
  expect([...url.searchParams]).toEqual([
    ["route", "major"],
    ["keyword", "가상값"],
  ]);
  expect(result).toMatchObject({
    status: "selected",
    effect: "value-observed",
  });
  expect(fixture.target.value).toBe("가상값");
  expect(fixture.target.readOnly).toBe(true);
  expect(fixture.actions).toEqual({
    opener: 1,
    search: 1,
    result: 1,
    actionChanged: 0,
  });
  expect(fixture.surface.isConnected).toBe(false);
});

it("blocks native submission when query input changes the bound form action", async () => {
  const fixture = setup();
  const initialDocument = await fixture.load("/__cf178/search/action-form");

  const result = await fixture.run();

  expect(result).toMatchObject({
    status: "failed",
    reason: "surface_stale",
    effect: "interaction-started",
  });
  expect(fixture.actions).toEqual({
    opener: 1,
    search: 0,
    result: 0,
    actionChanged: 1,
  });
  expect(fixture.target.value).toBe("");
  expect(fixture.frame.contentDocument).toBe(initialDocument);
  expect(new URL(initialDocument.URL).pathname).toBe(
    "/__cf178/search/action-form",
  );
});

it("preserves a conflicting existing value without opening the search surface", async () => {
  const fixture = setup("기존 값");
  await fixture.load();

  const result = await fixture.run();

  expect(result).toMatchObject({
    status: "unsupported",
    reason: "existing_value_conflict",
    effect: "none",
  });
  expect(fixture.target.value).toBe("기존 값");
  expect(fixture.surface.hidden).toBe(true);
  expect(fixture.actions).toEqual({
    opener: 0,
    search: 0,
    result: 0,
    actionChanged: 0,
  });
});
