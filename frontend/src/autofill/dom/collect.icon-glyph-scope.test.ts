import { usePolicyFixture } from "../../test/fixtures/execution-policy";
usePolicyFixture("sk");
import { beforeEach as useStaticHost } from "vitest";
useStaticHost(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/fixture",
  });
});
import { afterEach, expect, it } from "vitest";
import { collectPreparationSnapshot } from "./collect";

afterEach(() => document.body.replaceChildren());

it("keeps typeless icon-only buttons out of a static adapter's preparation actions", () => {
  document.body.innerHTML = `<div><label>학교명<input name="school"></label>
    <button class="icon"><svg viewBox="0 0 24 24"><path d="M5 12H19"></path><path d="M12 5V19"></path></svg></button>
    <button type="button">항목 추가</button></div>`;
  const collected = collectPreparationSnapshot(document);
  const names = JSON.stringify(collected.request);
  expect(names).toContain("항목 추가");
  expect(names).not.toContain('"displayName":"+"');
});
