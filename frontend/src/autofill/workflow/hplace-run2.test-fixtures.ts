import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { mountAddress } from "../policy/__fixtures__/hplace-mrs2-address.synthetic";
import {
  liveApplicant,
  liveAddress,
} from "./test-utils/hplace-run2.live-derived";
import { setHplacePage } from "./test-utils/hplace.fixture";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
export function mountLive(dateInitialized = false) {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  const modal = mountAddress();
  document.head.innerHTML =
    '<style>.hidden { display: block; }</style><script src="/resources-2.0.3a/mrs2/release/js/applicant/writeResume/writeResume.js?v=261015173100"></script><script src="/resources-2.0.3a/mrs2/release/js/applicant/writeResume/writeResumeTemplate.js?v=261015173100"></script>';
  document.body.innerHTML = `<form id="frm"><div id="wrapResume"><section class="writeResume" data-code="11">${liveApplicant}</section><section class="writeResume" data-code="13"><div class="subject">${liveAddress}</div></section></div><button type="submit">제출</button><button type="button" class="btn-add" data-button="add">추가</button></form>`;
  // Reuse only the synthetic site modal handler; collected nodes remain verbatim live-derived.
  document
    .querySelector('button[data-type="currentAddress"]')!
    .addEventListener("click", () => modal.button.click());
  if (dateInitialized)
    document.getElementById("birthday")!.classList.add("date");
  const policy = structuredClone(seed.executionPolicy) as ExecutionPolicy;
  installExecutionPolicy(document, policy);
  return { modal, policy };
}
