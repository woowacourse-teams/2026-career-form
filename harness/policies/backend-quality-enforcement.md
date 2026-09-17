# 백엔드 코드 품질 강제 운영 정책

## 정본과 소유권

기술 규칙의 정본은 `llm-wiki/wiki/topics/backend-code-quality.md`다. 해석 사례는
`llm-wiki/wiki/topics/backend-code-quality-examples.md`에 두며 정본을 덮어쓰지 않는다.
`AGENTS.md`와 구현·리뷰 Skill은 이 경로를 가리킬 뿐 규칙 전문을 복제하지 않는다.

## 담당 경계

- 결정론적 구조 판정: `backend/src/test/java/com/careerform/architecture/`
- 기존 위반: `backend/config/quality/architecture-baseline.json`
- 승인 예외: `backend/config/quality/architecture-exceptions.json`
- 실행 게이트: `backend`의 Gradle `check`와 `.github/workflows/backend-ci.yml`
- 의미, 가독성, 책임 분리: BQ 규칙 ID를 사용하는 Standards 리뷰
- 제품 요구 충족: Standards와 분리된 Spec 리뷰

ArchUnit은 계층 의존, DTO 경계, 공급자 타입 누출과 순환처럼 타입 관계로 판정할 수
있는 규칙만 검사한다. 오류 의미, 트랜잭션 범위, 주석 필요성, 가독성은 점수나 정규식으로
차단하지 않는다. Javadoc 개수와 주석 개수도 검사하지 않는다.

## 검사 상태

- `PASS`: 대상이 있고 검사를 실행했으며 위반이 없다.
- `VIOLATION`: 승인되지 않은 신규 위반이 있다.
- `NOT_APPLICABLE`: 명시된 이유로 해당 대상이 없다. PASS로 집계하지 않는다.
- `NOT_RUN`: 필요한 검사를 실행하지 못했다. 완료를 막는다.
- `ERROR`: import, 설정, registry 또는 검사기 오류다. 완료를 막는다.
- `BASELINE`: 고정된 코드 SHA에서 이미 존재하던 정확한 관계다.
- `ACCEPTED_EXCEPTION`: 팀이 의도적으로 승인한 정확한 관계다. PASS와 구분한다.

production 전체가 비었거나 필수 규칙의 대상이 0건이면 오류다. 선택적인 Domain처럼
비적용이 가능한 규칙은 검사기 안에 이유를 명시하고 `NOT_APPLICABLE`로 보고한다.
예외를 삼키거나 미실행을 무위반으로 바꾸지 않는다.

## 기존 위반 기준선

기준선은 고정된 source commit, ArchUnit 버전, 규칙 ID와 정규화된 개별 위반 관계를
기록한다. 줄 번호만 위치 이동으로 보아 정규화하며 타입과 의존 대상은 정확히 유지한다.
현재 관계가 사라지면 같은 변경에서 항목을 제거한다. 일반 기능 Issue는 기준선을 늘려
신규 위반을 숨길 수 없다. 기준선 변경은 `harness-change` Issue와 작성자 외 백엔드
검토를 거친다.

기준선 갱신은 기본적으로 닫혀 있다. 정책에 기록된 명시적 Gradle 속성을 사용한 경우에만
현재 전체 production 결과로 다시 만들 수 있고, 결과 diff를 관계별로 검토한다.

## 승인 예외

승인 예외는 기존 기술 부채 기준선과 별도 파일에서 관리한다. 각 예외는 ID, 규칙 ID,
정확한 위반과 대상, 이유, 검토한 대안, 보완 테스트, 연결 Issue, 해소 조건, 작성자,
작성자와 다른 백엔드 검토자를 가진다. wildcard나 패키지 전체 제외는 허용하지 않는다.

고정된 30일 만료는 두지 않는다. 대신 대상 코드, 관련 규칙, 보완 테스트 또는 해소 조건이
바뀌면 다시 검토한다. 더 이상 실제 위반과 일치하지 않는 예외는 stale 상태로 검사에 실패하며
제거해야 한다. 제품 안전과 개인정보 규칙은 이 예외로 면제할 수 없다.

## 변경과 장애 처리

품질 정본, 검사기, 기준선, 예외, AI Skill과 이 정책의 변경에는 `harness-change` 라벨과
연결 Issue가 필요하다. 이 파일들이 바뀌면 backend CI를 실행한다. 검사기 오탐이 정상
개발을 막으면 전체 gate를 끄지 않고 문제 규칙 하나만 영향 범위와 재활성 조건을 기록해
조정한다.

AI 행동 eval, 수동 AI smoke test와 모델별 비교는 이 정책의 검증 대상이 아니다.
