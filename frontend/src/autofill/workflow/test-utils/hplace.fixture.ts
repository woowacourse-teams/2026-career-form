import { configure } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Hosted CI runners are several times slower than a dev machine and run one
 * worker per shard, so every Hplace workflow file gets the 120 s limit CF-304
 * gave the other site-fixture tests.
 */
vi.setConfig({ testTimeout: 120_000 });
// The result screen waits for live-budget site timers (1.5 s per linked
// control); the global 3 s findBy* limit is too short on a hosted runner.
configure({ asyncUtilTimeout: 30_000 });

export function setHplacePage(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

// Public v1 login assets and roots observed on kakaobank.recruiter.co.kr.
// The editable field is a synthetic lookalike, not an application fixture.
export function renderHplaceLogin(): void {
  setHplacePage("https://kakaobank.recruiter.co.kr/v1/applicant/my-page/login");
  document.head.innerHTML = `
    <script src="/v1/applicant/index-C42z6v3P.js"></script>
    <link rel="stylesheet" href="/v1/applicant/index-ChVeoDCk.css">`;
  document.body.innerHTML = `
    <div id="root"><form><label>이메일<input name="email"></label></form></div>
    <div id="tooltip-root"></div><div id="overlay-root"></div>`;
}
import { resolveDocumentCompany } from "../../adapters/company";

export function resetHplacePage(): void {
  document.head.replaceChildren();
  document.body.replaceChildren();
  setHplacePage("http://localhost:3000");
  // jsdom reconfigure retains the Document; observe navigation before reuse.
  resolveDocumentCompany(document);
}
