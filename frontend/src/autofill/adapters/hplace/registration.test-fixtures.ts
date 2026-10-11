import {
  resetHplacePage,
  setHplacePage,
} from "../../workflow/test-utils/hplace.fixture";
import type {
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";

// Empty structure observed in Aside on 2026-10-11; no applicant values.
export function mountHplaceRegistration(): void {
  resetHplacePage();
  setHplacePage(
    "https://ahnlab.recruiter.co.kr/app/applicant/registResume?jobnoticeSn=267900&systemKindCode=MRS2",
  );
  document.head.innerHTML = `
    <script src="/resources-2.0.3a/mrs2/release/js/applicant/applicantCommon.js"></script>
    <script src="/resources-2.0.3a/mrs2/release/js/applicant/login/registResume.js"></script>
    <link rel="stylesheet" href="/resources-2.0.3a/mrs2/css/applicant/applicant.css">`;
  document.body.innerHTML = `<form id="frm" method="post" action="writeResume">
    <section id="loginForm" class="writeResume">
      <div class="subject"><label class="h2">성명</label><div class="row in-span no-margin"><div class="span per40"><input id="name" name="name" type="text"></div></div><div id="nameRegMsg"></div></div>
      <div class="subject"><label class="h2">휴대전화</label><div class="row in-span no-margin"><div><div class="span per10 mobile"><input id="mobile1" maxlength="3"></div><div class="span per10 mobile"><input id="mobile2" maxlength="4"></div><div class="span per10 mobile"><input id="mobile3" maxlength="4"></div></div></div><input type="hidden" id="mobileCombined" name="mobile"></div>
      <div class="subject"><label class="h2">이메일</label><div class="row in-span no-margin collapsed"><div class="span per60"><input id="email" name="email" type="email"></div></div><div class="row in-span no-margin collapsed"><div class="span per60"><input id="emailConfirm" type="email" data-type="email"></div></div><div id="emailRegMsg"></div><div id="emailValidaterMsg"></div></div>
      <div class="subject"><label class="h2">비밀번호</label><input id="password" name="password" type="password"><input id="passwordConfirm" type="password"></div>
      <button type="button" data-button="agreement">내용확인</button><button type="button">이메일 인증</button><button type="submit">지원서 작성</button>
    </section></form>`;
}

export function registrationAnalysis(
  request: FieldsAnalyzeRequest,
): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((field) => ({
        candidateId: field.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        valueBinding:
          field.domName === "hplace.registration.name"
            ? { type: "DERIVED", recipe: "KOREAN_FULL_NAME" }
            : {
                type: "DIRECT",
                profileFieldKey:
                  field.domName === "hplace.registration.mobile"
                    ? "contact.contact.phoneNumber"
                    : "contact.contact.email",
              },
        writePlan: { command: "SET_TEXT" },
      })),
  };
}

// Mirrors the observed public entry's polling and blur/input effects, not auth.
export function installRegistrationValidation(): {
  dispose(): void;
  inputEvents(): number;
  clicks(): number;
} {
  let timer: ReturnType<typeof setInterval> | undefined;
  let events = 0,
    clicks = 0;
  const phone = ["mobile1", "mobile2", "mobile3"].map(
    (id) => document.getElementById(id) as HTMLInputElement,
  );
  const name = document.getElementById("name") as HTMLInputElement;
  const email = document.getElementById("email") as HTMLInputElement;
  const confirm = document.getElementById("emailConfirm") as HTMLInputElement;
  const poll = (input: HTMLInputElement, id: string, valid: () => boolean) => {
    input.onfocus = () => {
      timer = setInterval(
        () => document.getElementById(id)!.classList.toggle("ok", valid()),
        100,
      );
    };
    input.onblur = () => {
      clearInterval(timer);
    };
  };
  poll(name, "nameRegMsg", () => /^[가-힣a-zA-Z]+$/.test(name.value));
  poll(email, "emailRegMsg", () =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value),
  );
  poll(
    confirm,
    "emailValidaterMsg",
    () => confirm.value !== "" && confirm.value === email.value,
  );
  const blur = email.onblur;
  email.onblur = (e) => {
    blur?.call(email, e);
    if (email.value !== confirm.value) confirm.value = "";
  };
  phone.forEach((input) =>
    input.addEventListener("input", () => {
      (document.getElementById("mobileCombined") as HTMLInputElement).value =
        phone.every((p) => p.value) ? phone.map((p) => p.value).join("-") : "";
    }),
  );
  document.querySelectorAll("input").forEach((input) =>
    input.addEventListener("input", () => {
      events += 1;
    }),
  );
  document.querySelectorAll("button").forEach((button) =>
    button.addEventListener("click", () => {
      clicks += 1;
    }),
  );
  return {
    dispose: () => clearInterval(timer),
    inputEvents: () => events,
    clicks: () => clicks,
  };
}
