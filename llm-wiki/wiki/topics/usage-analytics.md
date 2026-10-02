# 선택적 이용 계측

> Topic: usage-analytics
> Status: Current
> Current: [CF-147 선택적 이용 계측과 개인정보 경계](../../raw/issues/CF-147/documents/usage-analytics.md)
> History: [CF-147 선택적 이용 계측과 개인정보 경계](../../raw/issues/CF-147/documents/usage-analytics.md)
> Updated: 2026-10-02

## 현재 상태

PostHog는 명시 이벤트, 화면 구분과 로컬 익명 식별자를 사용한다. 지원서 안 패널에만
호스트명을 포함하고 프로필 값, 지원서 입력값과 전체 URL은 제외한다. 키 없는 빌드는
전송과 식별자 생성을 하지 않는다.

확장은 runtime 메시지 경계를 거쳐 백그라운드에서 허용 속성만 전송한다. SDK와 계측용
host permission은 추가하지 않는다. 개인정보 고지는 초안이며 운영 수집 설정과 접속
정보 처리, 보유 기간, 국외 이전은 사람이 검토한 뒤 확정한다.

## 변경 이유

사용 흐름을 파악하되 프로필 및 지원서 내용이 계측으로 유출되지 않도록 수집 범위를
제한하고 설정되지 않은 빌드는 계측하지 않는다.
