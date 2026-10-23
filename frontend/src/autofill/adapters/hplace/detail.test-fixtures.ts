import {
  resetHplacePage,
  setHplacePage,
} from "../../workflow/test-utils/hplace.fixture";
import type {
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
export function mountDetail(emergency = false): void {
  resetHplacePage();
  setHplacePage("https://hi.recruiter.co.kr/mrs2/applicant/resume/writeResume");
  document.head.innerHTML = `<script src="/resources-2.0.3a/mrs2/release/js/applicant/writeResume/writeResume.js"></script><script src="/resources-2.0.3a/mrs2/release/js/applicant/writeResume/writeResumeTemplate.js"></script>`;
  document.body.innerHTML = `<form id="frm"><section class="writeResume" data-code="11"><div class="subject"><label for="englishName">영문이름</label><input type="text" id="englishName" name="englishName" maxlength="64"><label for="birthday">생년월일</label><input type="text" class="text date" id="birthday" name="birthday" data-dates="birthday:YMD"></div></section><section class="writeResume" data-code="13"><div class="subject"><div data-row="address"><button type="button" data-type="currentAddress">우편번호</button><span class="postCode" data-type="currentAddress" data-span="postcode"></span><input type="text" class="hidden" name="currentAddress.zipCode"><input type="text" name="currentAddress.address" readonly maxlength="128"><input type="text" name="currentAddress.detailAddress" maxlength="128"></div></div>${emergency ? '<div class="subject"><div class="row"><input type="text" name="emergencyContact.contact" maxlength="64" data-validType="PHONE"><input name="emergencyContact.comment"></div></div>' : ""}</section><input type="password"><button type="submit">저장</button></form>`;
}
// Synthetic explicitly approved ordering tests only; production English mapping remains NO_MATCH.
export function detailAnalysis(
  request: FieldsAnalyzeRequest,
): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((f) => ({
        candidateId: f.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy:
          f.domName === "hplace.detail.emergencyPhone"
            ? "CONDITIONAL"
            : "ALLOWED",
        writePlan: { command: "SET_TEXT" },
        valueBinding:
          f.domName === "hplace.detail.englishName.familyFirst"
            ? { type: "DERIVED", recipe: "ENGLISH_FULL_NAME_FAMILY_FIRST" }
            : f.domName?.startsWith("hplace.detail.englishName")
              ? { type: "DERIVED", recipe: "ENGLISH_FULL_NAME_GIVEN_FIRST" }
              : {
                  type: "DIRECT",
                  profileFieldKey:
                    f.domName === "hplace.detail.birthday"
                      ? "personal.personal.birthDate"
                      : f.domName === "hplace.detail.detailAddress"
                        ? "contact.contact.addressLine2"
                        : "contact.contact.emergencyPhoneNumber",
                },
      })),
  };
}
