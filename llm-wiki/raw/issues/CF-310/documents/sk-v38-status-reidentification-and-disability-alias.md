# SK v38: 재학 상태 select 기준 고교 행 재식별과 장애구분 별칭

> Issue: CF-310
> Collected: 2026-10-22
> Approval-Digest: 9fd9bbce11f926e2cc6027742160d7265ecdcdc034a816df189c47238a86477c
> Source-Revision: c5d703f411b7220829268ddf260a289e6cf48814

이 문서는 2026-10-22 결함 수정에서 승인된 CF-310 후보 2와 후보 1의 SK 부분을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates-3.md) 전체 UTF-8 바이트의 SHA-256이다. SK 정책 v38의 계약 변경이며, 바꾸지 않은 내용은 Supersedes가 가리키는 [R262309 고교 행 근거](sk-highschool-row-reidentification.md)를 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

- SK 고교 행 추가 규칙의 재식별 기준은 학교명 입력이 아니라 재학 상태 select다(v38).
- SK 장애구분의 프로필 문구 별칭은 서버 fieldRule의 optionMap이 담당하고, 브라우저 정책 normalization은 이 칸에 적용되지 않는다.

## 근거

### 고교 행 재식별

- 정책 v38(`startup-policy-seed-v1.json`의 `sk-policy-v38`, 자원 `sk-browser-v1.json` 동기화)은 `btnAddEducationHigh` 규칙의 `requiredSelector`를 `input[name='eduhgEducationName']`에서 `select[name='eduhgEducationStatus']`로 바꾼다. 프론트 수집(`frontend/src/autofill/policy/collection.ts`)의 "행 안에 정확히 하나" 조건은 그대로다.
- 2026-10-22 실행 후 수집에서 재학 상태 select는 R262303·R262305·R262309의 고교 행에 각각 하나씩 있었고, 학교명 입력과 지역 select는 R262309에 없었다. 그래서 세 변형 모두에서 같은 기준으로 행을 식별한다.
- 재측정(2026-10-22 10:02, 새 시드를 넣은 빈 DB의 로컬 백엔드와 수정 빌드): R262309는 예외 없이 끝났고 패널 입력 완료 54·확인 필요 5였다. 고교 1행, 대학 2행, 대학원 1행이 만들어져 채워졌다(수정 전에는 고교 1행만 만들고 예외로 멈춰 정답 1칸). R262303은 72·5로 수정 전(71·6)과 같은 수준이다.
- 테스트: `education-repeat-preparation.test.ts`에 학교명 입력이 없는 고교 행(R262309형) 회귀 테스트를 더했고, `collection.test.ts`·`AutofillWorkflow.sk-education.test.tsx`의 고교 행 fixture에 재학 상태 select를 넣었다. "불완전한 행" 테스트는 재학 상태 select가 없는 행을 거부하는 것으로 바꿨다. FE 정책 fixture(`active-execution-policies.json`)는 v38 내용으로 갱신했다.

### 장애구분 별칭

- `prsDisabledType`은 서버 fieldRule의 `LookupBinding`이고 optionMap이 프로필 값을 사이트 선택지로 바꾼다(v37: `중증`→`중증(기존1급~3급)`, `경증`→`경증(기존4급~6급)`). 프로필 문구 `심하지 않은 장애인`은 여기 없어 2026-10-22 QA의 SK 4곳 모두 비어 있었다.
- 브라우저 정책 `normalizations`에 같은 키(`disability.disability.disabilityGrade`)의 값 변환을 넣고 재측정했을 때는 그대로 비어 있었다. 이 칸의 값 결정은 서버 optionMap에서 끝나므로 normalization이 닿지 않는다.
- v38 optionMap에 `심한 장애인`→`중증(기존1급~3급)`, `심하지 않은 장애인`→`경증(기존4급~6급)`을 더한 뒤 재측정에서 R262303·R262309 모두 `경증(기존4급~6급)`이 채워졌다. 효과 없던 normalization은 제거했다.

## 쓰임

- 시드 적용 절차는 `backend/src/main/resources/policies/STARTUP-SEED.md`의 "스냅샷에 추가된 버전"을 따른다. 빈 DB에서는 v38이 활성이고, dev·운영처럼 이미 정책이 있는 DB의 활성 버전 전환은 사람이 한다.
- 프로필 문구를 사이트 선택지에 잇는 별칭은 회사별 서버 fieldRule optionMap에 둔다.
