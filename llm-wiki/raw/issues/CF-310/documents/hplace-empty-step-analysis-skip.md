# 수락 필드 0건인 화면의 분석 호출 생략

> Issue: CF-310
> Collected: 2026-10-22
> Approval-Digest: 9fd9bbce11f926e2cc6027742160d7265ecdcdc034a816df189c47238a86477c
> Source-Revision: c5d703f411b7220829268ddf260a289e6cf48814

이 문서는 2026-10-22 결함 수정에서 승인된 CF-310 후보 3을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates-3.md) 전체 UTF-8 바이트의 SHA-256이다. 확장 워크플로의 동작 변경이며, 바꾸지 않은 내용은 Supersedes가 가리키는 [4단계 분석·패널 근거](hplace-step4-analyze-and-panel.md)를 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

에이치닷 4단계처럼 수락 필드가 0건인 화면은 분석 API를 부르지 않고 빈 결과로 끝낸다.

## 근거

- `frontend/src/autofill/workflow/workflow-analysis.ts`는 수집 요청의 필드 수(섹션 필드와 항목 필드의 합)가 0이고 범용 분석 결과가 없으면 `AUTOFILL_ANALYZE_FIELDS`를 부르지 않는다. 대신 `mode: ADAPTER`, `analysisStatus: COMPLETE`, `fields: []`인 분석으로 진행해 결과 화면("기입 결과")으로 끝난다. 구조 진단에는 `fields-analysis / section-missing / no-analyzable-field` skip 한 줄을 남긴다.
- 합성한 분석에는 설치된 `executionPolicy`를 그대로 넣어야 한다. 네이티브 정책이 설치된 문서는 분석 응답의 정책 digest를 설치본과 대조하므로, 정책이 빠지면 "페이지 실행 정책이 변경되었습니다" 예외로 끝난다(jsdom 탐색에서 확인).
- 테스트: `AutofillWorkflow.hplace-empty-step.test.tsx`는 MRS2 셸(form#frm, #wrapResume, 자산 경로)에 자기소개서 textarea만 있는 단계를 만들고, 빈 요청에 400을 던지는 분석 mock으로 "기입 결과"에 도달하면서 분석이 한 번도 호출되지 않음을 확인한다.
- 재측정(2026-10-22 10:02, 수정 빌드): GS건설 4단계는 예외 없이 패널 입력 완료 0·확인 필요 0으로 끝났다. 수정 전 같은 날 다섯 테넌트 모두 `BAD_REQUEST` 예외였다.

## 쓰임

- 입력할 칸이 없는 단계는 예외가 아니라 빈 결과다. 안내 문구를 따로 두는 것은 후속 결정이다.
- 분석 응답을 합성하는 다른 경로도 정책 digest 대조를 지나려면 설치된 정책을 돌려줘야 한다.
