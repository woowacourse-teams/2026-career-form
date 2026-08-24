# 지원서 분석 데이터 경계

## 상태

승인됨

## 날짜

2026-08-24

## 관련 Issue

- #44

## 배경

브라우저가 수집한 전체 DOM snapshot과 LLM이 의미 추론에 필요한 데이터를 같게 두면 불필요한 DOM 문맥과 action 정보가 외부 모델로 전달된다. 동적으로 생성되는 입력칸은 준비 전 DOM만으로 의미와 현재 입력 가능성을 함께 확정할 수도 없다.

프로필 값은 브라우저 로컬에 남아야 하며, 지원서 저장·이동·미리보기·제출은 이 흐름의 실행 대상이 아니다. 검증된 회사 어댑터가 있는 사이트는 구조가 달라졌을 때 범용 분석으로 조용히 우회하면 안전한 매핑을 보장할 수 없다.

## 검토한 대안

- 전체 browser snapshot을 LLM에 전달: 구현은 단순하지만 HTML, 상태, action과 불필요한 문맥이 전달될 수 있어 데이터 최소화와 adapter 우선 원칙을 지키기 어렵다.
- field를 하나씩 LLM에 전달: 전송량은 작지만 section, 반복 행과 선택지 문맥이 사라져 오탐 가능성이 커진다.
- backend가 규칙으로 미해결인 field와 필요한 section 문맥만 별도 payload로 구성: 경계 변환이 필요하지만 개인정보 최소화와 의미 추론 문맥을 함께 보존한다.

## 결정

브라우저는 실제 입력값을 제외한 section 중심 DOM snapshot만 단일 분석 API로 전송한다. field와 실행 전 후보인 `actionCandidates`는 `sections[]` 안에만 포함하며 candidate는 section ID를 중복하지 않는다. 소속이 불분명한 candidate는 `section-root` section에 포함한다.

Snapshot A의 응답은 제한된 `preparationPlans`만 반환한다. 브라우저는 사용자 승인 후 해당 plan을 실행하고 DOM을 다시 수집해 Snapshot B를 전송한다. Snapshot B에 추가 준비가 없으면 `actionCandidates`를 생략하며, 응답은 `candidateId`로 참조하는 평평한 field analysis와 write plan만 반환한다. 하나의 응답에 preparation plan과 write plan을 함께 반환하지 않는다.

backend는 회사 어댑터와 결정 규칙을 먼저 적용한다. 어댑터 후보가 있는 요청은 fingerprint 불일치 시 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 generic 또는 LLM fallback으로 우회하지 않는다. 미지원 사이트에서 의미를 확정하지 못한 field와 필요한 비식별 section 문맥만 최소 LLM payload로 구성하며, action candidate와 프로필 값은 LLM에 전달하지 않는다. LLM structured output은 허용 프로필 field key 또는 `NO_MATCH`만 반환한다.

## 결과

브라우저·backend·LLM 사이의 개인정보 경계와 책임이 분리되고, 동적 DOM은 재수집으로 안전하게 처리할 수 있다. 대신 section·candidate ID 관계, Snapshot A/B 상태 전이, 최소 payload 변환을 각 구현이 검증해야 한다. 실제 프로필 값 연결과 실행 승인은 계속 브라우저에 남는다.

후속 DOM collector, analyzer, LLM mapper, browser executor 구현은 이 문서의 계약을 소비하는 별도 Project draft 후보이며 현재 Issue 범위에는 포함하지 않는다.
