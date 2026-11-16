# CF-458 Knowledge Bundle

> Issue: CF-458
> Collected: 2026-11-16
> Approval-Digest: ea16894743540db9ef77644ebd4820e6b4fc14638c151f241aa10967d90036ff
> Source-Revision: aaffd610

승인 digest는 worktree 체크포인트가 계산한 [후보 다섯 개 스냅샷](documents/approved-candidates.md)의 후보 digest(후보 원문 배열 JSON, UTF-8, 비ASCII 문자 그대로, 구분자 `,`·`:`, 공백 없음의 SHA-256)이며 사람이 2026-11-16 "승인"으로 확정했다. payload 세 개의 후보 배치는 프로필 카탈로그가 후보 1·2·3, 프론트 브라우저 테스트가 후보 4, 로컬 검증 환경이 후보 5다. 실제 지원값, 계정, 세션, 브라우저 프로필 내용, 대화 전문은 포함하지 않는다. 확인에는 합성 값(`사용자 기관`, `DEMO-CERTIFICATE-1`)과 매번 지운 임시 브라우저 프로필만 썼다.

## profile-catalog-identity

> Payload: [자격증 재선택 때 채운 발급기관 교체와 세션 한정 채움 기억](documents/profile-catalog-issuer-reselection.md)
> Supersedes: [CF-368 카탈로그 자격증 발급기관 채움, TOEIC Speaking 추가, 한국폴리텍 대학 번호 표기 대조](../CF-368/documents/profile-catalog-issuer-toeic-speaking-and-numbering.md)

## frontend-browser-testing

> Payload: [프론트 단위 파일 실행 명령과 확장 옵션 페이지 수동 확인](documents/frontend-unit-run-and-extension-manual-check.md)
> Supersedes: [CF-417 20초 넘는 fixture 통합 테스트 38개 삭제 결정과 측정](../CF-417/documents/slow-fixture-test-removal.md)

## verification-environment

> Payload: [verify.py infra 테스트의 Docker 의존](documents/verify-docker-dependency.md)
> Supersedes: [CF-424 한글 worktree 경로의 compose 계약 테스트 실패](../CF-424/documents/verification-environment.md)
