# CF-336 Knowledge Bundle

> Issue: CF-336
> Collected: 2026-10-25
> Approval-Digest: 8f1781e209bbaec70946dac4806881f408aad04f7710e76f7df5de24a586fdee
> Approval-Response: 승인
> Approval-Date: 2026-10-25
> Source-Revision: 0df5dc2b8c2887a401ef1551c55a6af835f8cae4

승인 digest는 사람이 위 응답으로 승인한 [후보 네 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. 두 payload는 후보 1·2·3(현대 어댑터)과 후보 3·4(실사이트 평가)를 담는다. 각 payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 실제 지원값·계정·세션·URL 쿼리·시크릿은 포함하지 않는다. 사이트 스크립트 인용은 공개 정적 자원의 동작 서술이다.

## adapter-hyundai

> Payload: [현대 검색 결과 창의 바깥 클릭 핸들러와 학교명 소실, 결과 패널 판정, 카탈로그 신원 없는 검색](documents/hyundai-search-view-blanking.md)
> Supersedes: [CF-335 버튼형 선택지 코드 수집·trigger 식별·정책 v25 경력·자격 매핑](../CF-335/documents/hyundai-v25-button-codes-and-career-fields.md)

## live-autofill-evaluation

> Payload: [합성 프로필 측정에서 고교 학교명이 확인 필요로 남는 이유와 reset의 버튼형 위젯 잔여](documents/live-harness-synthetic-identity-and-reset-widgets.md)
> Supersedes: [CF-333 테스트 계정 모드·설치본 잠금·채점 재사용 근거](../CF-333/documents/live-harness-test-account-mode.md)
