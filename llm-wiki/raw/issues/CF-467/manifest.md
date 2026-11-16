# CF-467 Knowledge Bundle

> Issue: CF-467
> Collected: 2026-11-17
> Approval-Digest: a7717c1500566292916e09452820d384d28846d331414b2b0f719012e50a8362
> Source-Revision: 9114a7ef

승인 digest는 worktree 체크포인트가 계산한 [후보 네 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-17 "승인"으로 확정했다. payload는 하나다. 확장 쪽 캐시와 서버 쪽 캐시의 현재 상태, 구현 중 확인한 사실, 테스트 주의(후보 2, 3, 4)를 범용 섹션 분석 캐시 문서로 정리했다. 결정의 전문(후보 1)은 Issue #467 본문의 ADR 제안을 구현 결과로 고쳐 상태 '승인됨'으로 [ADR](documents/adr/467-generic-section-answer-cache.md)에 기록했다. 실제 지원값, 계정, 세션, 키 값, 대화 전문은 포함하지 않는다.

## generic-section-analysis-cache

> Payload: [범용 섹션 분석 캐시: 확장 쪽과 서버 쪽](documents/generic-section-answer-cache.md)
> Supersedes: [CF-244 범용 섹션 분석 캐시의 키와 수명](../CF-244/documents/generic-section-analysis-cache.md)
