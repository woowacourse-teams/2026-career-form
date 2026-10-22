# Greeting v18: 장애 정도 optionMap 별칭

> Issue: CF-310
> Collected: 2026-10-22
> Approval-Digest: 9fd9bbce11f926e2cc6027742160d7265ecdcdc034a816df189c47238a86477c
> Source-Revision: c5d703f411b7220829268ddf260a289e6cf48814

이 문서는 2026-10-22 결함 수정에서 승인된 CF-310 후보 1의 Greeting 부분을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates-3.md) 전체 UTF-8 바이트의 SHA-256이다. Greeting 정책 v18의 optionMap 변경이며, 바꾸지 않은 내용은 Supersedes가 가리키는 [검색 서버 액션 근거](greeting-search-server-action.md)를 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

Greeting 장애 정도의 프로필 문구 별칭은 서버 fieldRule의 optionMap이 담당하고, 브라우저 정책 normalization은 이 칸에 적용되지 않는다.

## 근거

- 장애 정도(`...disability.degreeOfDisability`)는 서버 fieldRule의 `LookupBinding`이다. v17 optionMap은 `중증`→`중증(심한장애)`, `경증`→`경증(심하지 않은 장애)`와 사이트 문구 자체의 항등 매핑만 담았다. 프로필 문구 `심하지 않은 장애인`은 여기 없어 2026-10-22 QA의 Greeting 4곳 모두 이 칸이 비었고 패널은 "자동으로 입력하지 못했어요"를 띄웠다.
- 브라우저 정책 자원(`greeting-browser-v1.json`)에는 이 칸의 optionMap이 없다. 값 변환은 시드의 fieldRule에서만 일어난다.
- v18(`greeting-policy-v18`)은 optionMap에 `심한 장애인`→`중증(심한장애)`, `심하지 않은 장애인`→`경증(심하지 않은 장애)`만 더한다.
- 재측정(2026-10-22 10:02, 새 시드를 넣은 빈 DB의 로컬 백엔드와 수정 빌드): 카카오게임즈 지원서에서 장애 정도가 `경증(심하지 않은 장애)`으로 채워졌고 패널은 입력 완료 96·확인 필요 12였다(수정 전 95·13).

## 쓰임

- 시드 적용 절차는 `backend/src/main/resources/policies/STARTUP-SEED.md`를 따른다. 빈 DB에서는 v18이 활성이고, 기존 DB의 활성 버전 전환은 사람이 한다.
- 같은 프로필 문구가 다른 회사에서도 비어 있으면 그 회사 fieldRule의 optionMap에 별칭을 둔다(SK는 [v38 근거](sk-v38-status-reidentification-and-disability-alias.md)).
