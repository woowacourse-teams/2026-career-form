# 품질 확인 사이트와 공개 지원서 링크

> Topic: quality-site-links
> Status: Current
> Current: [CF-190 사이트 표시와 공개 지원서 링크](../../raw/issues/CF-190/documents/adr/190-quality-site-links.md)
> History: [CF-190 사이트 표시와 공개 지원서 링크](../../raw/issues/CF-190/documents/adr/190-quality-site-links.md)
> Updated: 2026-10-12

## 현재 상태

품질 관리 목록은 환경과 사이트별로 묶은 뒤 페이지를 나눈다. 정책의 company 경계를 유지하고 후보 ID, 화면 구조, 담당 및 완료 이력과 집계는 개별 범위로 보존한다. 사이트 안의 후보가 모두 완료되어야 완료 목록에 표시한다.

Chrome sender와 분석 host가 일치하는 공개 Greeting 지원서 링크만 품질 전용 헤더로 관측하고 프런트엔드와 백엔드에서 검증한다. 중복 URL의 관측 시점을 갱신하며 최근 20개와 한도 초과 여부를 표시한다. 구형 문서는 별도 마이그레이션 없이 읽는다.

여러 공고나 기존 확인과 다른 링크에는 사람 분모를 자동 재사용하지 않는다. 전용 호스트와 구조의 명시적 승인 범위는 유지한다. Discord는 사이트를 한 번만 안내하며 기존 담당 화면 수를 그대로 차감해 하루 여력 5개를 보존한다.

## 변경 이유

같은 사이트의 반복 표시와 홈 링크 안내를 줄이고 확인 대상 지원서에 직접 접근할 수 있게 한다. 링크 허용 범위, 보관 한도와 분모의 경계는 Current 문서를 따른다.

## 관련 주제

- [자동 입력 품질 관측과 사람 확인 요청](autofill-quality-observation.md)
- [확장 품질 보고의 fetch 호출 문맥](extension-fetch-context.md)
