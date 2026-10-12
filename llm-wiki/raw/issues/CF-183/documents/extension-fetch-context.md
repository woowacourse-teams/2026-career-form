# 확장 품질 보고의 fetch 호출 문맥

> Issue: [CF-183](https://github.com/woowacourse-teams/2026-career-form/issues/183)
> Collected: 2026-10-12
> Approval-Digest: a0023aa706b1b4fd3c776de453075b9a7718c3ff09d069f63780963d8836fc13
> Source-Revision: f2e0634ff9f81c216211aa47fe1280ecaea613a1

## 승인한 지식 후보

확장 Service Worker의 브라우저 fetch를 클래스 속성에 보관한 뒤 this.fetcher(...)로 호출하면 수신자가 클래스 인스턴스가 되어 품질 보고가 전송 전에 실패할 수 있다. 보고 경계에서 fetcher.call(globalThis, ...)로 브라우저 전역 문맥을 명시하고, 해당 문맥을 요구하는 fetch 경계 테스트로 POST 보고 204와 요청 계약을 확인한다. 근거: CF-183의 수정 전 실패·수정 후 통과 회귀 테스트 및 스테이징 Console 보정 후 204 확인. 실제 확장 재로드 후 검증은 사람 담당으로 남는다.
