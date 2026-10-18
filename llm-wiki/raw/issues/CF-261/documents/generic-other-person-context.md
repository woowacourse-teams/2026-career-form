# 범용 등급의 다른 사람 대상 칸 차단

## 승인한 지식 후보

범용 등급에 OTHER_PERSON_CONTEXT(BLOCKED) 이유를 더했다. 칸의 이름·라벨·title·placeholder에 지원자 아닌 사람의 역할 어휘가 있고 매칭 키가 지원자 본인의 이름·이메일·전화·주소 계열 키이면 신뢰도와 무관하게 BLOCKED다. 역할 어휘는 추천인, 추천자, 보증인, 보호자, 법정대리인, 비상·긴급 연락, referee, referrer, referral, guarantor, guardian, next of kin, emergency contact다. 판정 위치는 MIXED_EDUCATION_RECORD 뒤, FORMAT_KEY_MISMATCH 앞이며 기존 이유와 경계값은 바뀌지 않는다.

대상 키는 personal.personal의 국문·한자·영문 성과 이름 6종과 contact.contact의 email, secondaryEmail, phoneNumber, residenceCountry, postalCode, addressLine1, addressLine2로 한정한다. 프로필에 실제로 있는 비상연락처 키(emergencyPhoneNumber)는 정당한 매칭이라 대상에서 제외한다. 이유 코드의 화면 문구는 범용 검토 화면 3단계 표시(Task 12, #259)의 변환 표에 위임한다.

어휘 근거는 서로 무관한 AhnLab과 Kakao fixture의 추천인 칸과 합성 변이다. SK careers fixture의 추천인 칸은 범용 수집에서 칸으로 수집되지 않아 근거로 쓰지 못했고, LG fixture는 본인 칸의 등급이 바뀌지 않음을 확인하는 데만 쓴다.

## 적용과 검증

`frontend/src/autofill/generic/field-grading.ts`의 순수 함수 `hasOtherPersonContext`가 칸의 displayName, labels, title, placeholder를 역할 어휘 정규식으로 검사한다. 입력은 `generic-analysis.ts`가 이미 전달하던 값이라 수집 파일, BE 프롬프트, 회사별 분기는 바뀌지 않는다.

검증 근거는 다음 테스트다.

- `generic/field-grading.test.ts`: 한국어·영어 역할 어휘와 네 입력원, 판정 순서(NO_PROFILE_VALUE 우선), 대상 아닌 키, 지원자 본인 칸 불변 확인, Kakao·LG fixture 단언.
- `workflow/dom-snapshot.ahnlab.test.ts`: 활성화한 추천인 연락처 칸에 전화·이메일 키가 매칭되면 BLOCKED이고 검토 항목은 선택되지 않고 비활성이며 쓰이지 않음.

고정 API 응답과 메모리상 변이는 코드 등급·검토·쓰기 소비의 근거다. 실제 JEV 매칭, 설치 확장 실행이나 실사이트 성공률은 입증하지 않는다.
