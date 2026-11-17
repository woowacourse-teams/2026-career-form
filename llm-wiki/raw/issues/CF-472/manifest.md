# CF-472 Knowledge Bundle

> Issue: CF-472
> Collected: 2026-11-17
> Approval-Digest: e9f2d655d212b195599e50e1d814da78a9c8eb9e98efeb602478f48816ec6f67
> Source-Revision: a8a59f31

승인 digest는 worktree 체크포인트가 계산한 [후보 세 개 스냅샷](documents/approved-candidates.md)의 후보 digest이며 사람이 2026-11-17 "후보 승인, 추천대로 진행"으로 확정했다. payload는 둘이다. 범용 수집이 페이지 이름을 섹션 제목에서 빼는 규칙과 코드로 확인한 사실(후보 1, 2)은 새 topic으로, 서버 섹션 결과 캐시의 실측 보고와 CF-467 ADR 기대의 정정(후보 3)은 범용 섹션 분석 캐시 topic의 새 현재 문서로 정리했다. ADR은 만들지 않았다. 수집 휴리스틱 한 곳의 변경이라 되돌리기 쉽고, 규칙과 버린 대안은 payload에 있다. 실제 지원값, 계정, 세션, 키 값, 대화 전문, 공고 식별자와 주소는 포함하지 않는다.

## generic-page-title-exclusion

> Payload: [범용 수집의 페이지 이름 제외](documents/generic-page-title-exclusion.md)
> Supersedes: None

## generic-section-analysis-cache

> Payload: [범용 섹션 분석 캐시: 실측과 공고 제목 문제](documents/generic-section-answer-cache.md)
> Supersedes: [CF-467 범용 섹션 분석 캐시: 확장 쪽과 서버 쪽](../CF-467/documents/generic-section-answer-cache.md)
