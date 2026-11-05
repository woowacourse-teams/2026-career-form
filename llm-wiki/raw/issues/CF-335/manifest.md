# CF-335 Knowledge Bundle

> Issue: CF-335
> Collected: 2026-10-24
> Approval-Digest: 3de73b5b4b19338686b279ee3ded763a4466714ccbd4414c4fda84d6d885eb39
> Approval-Response: 승인할게
> Approval-Date: 2026-10-24
> Source-Revision: c157a166062e13376e3ba7740a942be2abc8105e

승인 digest는 사람이 위 응답으로 승인한 [후보 세 개의 스냅샷](documents/approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 스냅샷은 승인을 요청한 메시지의 후보 목록을 그대로 옮겼고, 승인 응답과 후보만 기록하며 대화 전문은 수집하지 않는다. 두 payload는 후보 1·2·3(현대 어댑터)과 후보 3(필드 현황)을 담는다. 각 payload는 같은 topic의 앞선 근거를 대체하되, 바꾸지 않은 내용은 Supersedes가 가리키는 문서를 따른다. 실제 지원값·계정·세션·URL 쿼리·시크릿은 포함하지 않는다. 선택지 코드 표는 채용 사이트가 모든 지원자에게 보여 주는 공개 선택지라 개인정보가 아니다.

## adapter-hyundai

> Payload: [현대 버튼형 선택지 코드의 읽기 전용 수집, trigger 식별 규칙, 정책 v25 경력·자격 매핑](documents/hyundai-v25-button-codes-and-career-fields.md)
> Supersedes: [CF-333 작성 화면 재진입 불가·경력 칸 결함 근거](../CF-333/documents/hyundai-applywrite-reentry-and-career-fields.md)

## adapter-field-inventory

> Payload: [현대 v25 경력 날짜·종료사유·자격 등급 지원 현황](documents/hyundai-v25-field-inventory.md)
> Supersedes: [CF-177 후속 보완 묶음 근거](../CF-177/documents/live-followup-bundle.md)
