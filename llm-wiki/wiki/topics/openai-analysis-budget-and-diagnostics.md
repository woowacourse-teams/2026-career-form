# OpenAI 분석 예산과 안전 진단

> Topic: openai-analysis-budget-and-diagnostics
> Status: Current
> Current: [CF-102 OpenAI 분석 예산과 안전 진단](../../raw/issues/CF-102/documents/openai-analysis-budget-and-diagnostics.md)
> History: [근거 1](../../raw/issues/CF-102/documents/openai-analysis-budget-and-diagnostics.md)
> Updated: 2026-09-24

## 현재 상태

범용 준비·필드 분석은 기본 30초, 명시된 Spring AI timeout 우선, `0 < timeout < 60s` 범위로 구성한다. 검색 상호작용은 연결·chat 속성을 복사한 별도 SDK 모델로 실제 전송에 8초/재시도 0을 적용한다. Spring AI 2.0에서는 요청 옵션만으로 SDK 전송 설정을 바꿀 수 없다.

구조화된 `length` 종료는 파싱 전에 실패로 처리하고, cause chain·스키마·응답 형식 오류를 비식별 코드로 구분한다. 로그는 허용 목록의 종료 사유와 제공된 숫자 usage만 포함하며 원문은 제외한다. 과거 실제 필드 실패의 원인은 미확정이다. CF-102 Docker와 실제 공급자/CJ 검증은 환경 및 승인 부재로 미완료다.

## 변경 이유

기존 8초 강제 덮어쓰기가 준비·필드 분석에 적용됐고 실패 진단이 원인을 분리하지 못했다. 분석과 상호작용의 예산을 분리하면서 기존 부분 실패 및 개인정보 경계를 유지한다.
