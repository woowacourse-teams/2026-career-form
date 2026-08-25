# 지원서 분석 데이터 경계

## 상태

승인됨

## 날짜

2026-08-25

## 관련 Issue

- #44

## 배경

브라우저가 수집한 전체 DOM snapshot과 LLM이 의미 추론에 필요한 데이터를 같게 두면 불필요한 DOM 문맥과 action 정보가 외부 모델로 전달된다. 동적으로 생성되는 입력칸은 준비 전 DOM만으로 의미와 현재 입력 가능성을 함께 확정할 수도 없다.

준비 후보 판단과 field 매핑은 호출 목적, 허용 입력, 다음 브라우저 행동이 다르다. 하나의 endpoint와 하나의 section schema에 `fields`와 `actionCandidates`를 함께 허용하면, 어떤 요청이 preparation인지 field mapping인지 불명확해지고 preparation plan과 write plan의 배타성을 별도 규칙으로만 유지해야 한다.

프로필 값은 브라우저 로컬에 남아야 하며, 지원서 저장·이동·미리보기·제출은 이 흐름의 실행 대상이 아니다. 검증된 회사 어댑터가 있는 사이트는 구조가 달라졌을 때 범용 분석으로 조용히 우회하면 안전한 매핑을 보장할 수 없다.

## 검토한 대안

- 단일 분석 endpoint와 결합 section schema 유지: endpoint 수는 적지만 요청의 목적이 암묵적이고 mixed snapshot을 허용해 소비자마다 다른 해석이 가능하다.
- 단일 endpoint에 `snapshotKind` discriminator와 `oneOf`를 추가: schema 수준의 구분은 가능하지만 같은 URI에 두 수명주기와 재시도 정책을 섞고, endpoint가 표현하는 역할은 여전히 넓다.
- preparation과 field mapping 전용 endpoint 분리: endpoint가 하나 늘지만 각 요청·응답의 허용 candidate와 plan을 구조적으로 제한하고 browser 재수집 경계를 명시한다.

LLM 전달 범위에서는 전체 browser snapshot 전달과 field 하나씩 전달도 검토했다. 전자는 HTML·상태·action과 불필요한 문맥의 전달 위험이 있고, 후자는 section·반복 행·선택지 문맥이 사라진다. backend가 미해결 field와 필요한 section 문맥만 별도 payload로 만드는 대안을 유지한다.

## 결정

브라우저는 실제 입력값을 제외한 section 중심 DOM snapshot을 두 전용 API로 전송한다.

- `POST /api/v1/preparation/analyze`는 Snapshot A의 `actionCandidates`만 받고 `preparationPlans`만 반환한다.
- `POST /api/v1/fields/analyze`는 Snapshot B의 `fields`만 받고 field analysis와 제한된 write plan만 반환한다.

각 section은 자신에게 허용된 한 종류의 candidate만 포함한다. candidate는 section ID를 중복하지 않으며, 소속이 불분명한 candidate는 `section-root` section에 넣는다. preparation plan을 사용자가 승인해 실행한 뒤 브라우저는 효과를 관측하고 기존 DOM handle을 폐기한다. 새 DOM에서도 준비가 더 필요하면 field와 action candidate를 한 요청에 섞지 않고, 새 Snapshot A로 preparation endpoint를 다시 호출한다.

backend는 회사 어댑터와 결정 규칙을 먼저 적용한다. 어댑터 후보가 있는 요청은 fingerprint 불일치 시 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 generic 또는 LLM fallback으로 우회하지 않는다. 미지원 사이트에서 의미를 확정하지 못한 field와 필요한 비식별 section 문맥만 최소 LLM payload로 구성하며, action candidate와 프로필 값은 LLM에 전달하지 않는다. LLM structured output은 허용 프로필 field key 또는 `NO_MATCH`만 반환한다.

## 결과

preparation과 field mapping의 입력·출력·재시도·관측 책임이 API 경계에서 분리된다. OpenAPI는 cross-endpoint candidate와 plan을 unknown property로 거부하므로 preparation plan과 write plan을 같은 성공 응답에 넣을 수 없다. 동적 DOM은 재수집으로 안전하게 처리할 수 있지만, 소비자는 추가 준비 시 fields endpoint가 아니라 preparation endpoint로 돌아가야 한다.

실제 프로필 값 연결과 실행 승인은 계속 브라우저에 남는다. 후속 DOM collector, analyzer, LLM mapper, browser executor 구현은 이 문서의 계약을 소비하는 별도 Project draft 후보이며 현재 Issue 범위에는 포함하지 않는다.
