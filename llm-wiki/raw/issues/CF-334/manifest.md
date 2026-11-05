# CF-334 Knowledge Bundle

> Issue: CF-334
> Collected: 2026-10-25
> Approval-Digest: acc59bf96d7344d991b653eadd0a2176e178eb4f64ddbc6260622d7e2ee5adef
> Approval-Response: 승인
> Approval-Date: 2026-10-25
> Source-Revision: a36ea0edc18069159b8dd52d6d395e4792068d04

승인 digest는 사람이 위 응답으로 승인한 [후보 네 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. 두 payload는 후보 1·2(Greeting 어댑터)와 후보 1의 정정·3·4(실사이트 평가)를 담는다. 각 payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 실제 지원값·계정·세션·요청 본문·시크릿은 포함하지 않는다. 컬리 지원서는 공개 공고의 빈 양식이다.

## adapter-greeting

> Payload: [Greeting 지원서의 열린 Ark UI 팝오버가 양식 전체를 숨김으로 수집시키는 경로와 CF-334 수정](documents/greeting-open-popover-hides-form.md)
> Supersedes: [CF-310 v18 장애 정도 별칭 근거](../CF-310/documents/greeting-v18-disability-alias.md)

## live-autofill-evaluation

> Payload: [간헐 결함의 반복 관찰 루프와 서비스 워커 API 관찰, 컬리 0/81의 정정](documents/live-harness-service-worker-observation-and-repeat-loop.md)
> Supersedes: [CF-336 합성 프로필 학교 검색 한계와 reset의 버튼형 위젯 잔여](../CF-336/documents/live-harness-synthetic-identity-and-reset-widgets.md)
