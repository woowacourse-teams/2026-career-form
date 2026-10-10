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
