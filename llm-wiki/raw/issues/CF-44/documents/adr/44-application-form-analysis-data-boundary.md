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

LLM 전달 범위에서는 전체 browser snapshot 전달과 field 하나씩 전달도 검토했다. 전자는 HTML·상태·action과 불필요한 문맥의 전달 위험이 있고, 후자는 section·반복 행·선택지 문맥이 사라진다. backend가 미지원 사이트의 입력 field와 필요한 section 문맥만 별도 payload로 만드는 대안을 유지한다.

반복 레코드 표현에서는 모든 field를 section에 평평하게 두고 `candidateId`만 구분하는 방식, DOM wrapper 이름을 API에 노출하는 방식, 논리적 `items[]`를 두는 방식을 검토했다. 평평한 배열은 서로 다른 자격·학력 레코드의 field를 교차 결합할 수 있고, DOM wrapper 이름은 회사별 구현에 결합된다. `items[]`는 사이트의 class 명칭과 무관하게 같은 반복 레코드에 속한 field 문맥을 보존한다.

하나의 추가 버튼으로 여러 반복 입력 행을 준비하는 경우에는 다음 대안을 검토했다.

- 클릭할 때마다 새 Snapshot A를 전송: 매 DOM 변경을 backend가 다시 검증하지만 동일 후보를 여러 번 왕복하고 사용자 승인을 반복해야 한다.
- 현재 행 수와 프로필의 목표 항목 수를 backend에 보내 정확한 실행 횟수를 반환: executor는 단순해지지만 프로필 유래 개수가 browser 경계를 벗어나고 backend가 사용자 로컬 입력 계획까지 책임지게 된다.
- backend가 고정 안전 상한을 반환하고 browser가 그 범위에서 실행: backend는 프로필 항목 수와 현재 DOM 상태를 모르므로 필요한 횟수와 무관한 임의 상한이 계약에 남는다.
- backend는 action 의미와 기대 효과만 반환하고 browser가 로컬 목표, 현재 DOM 행 수와 executor 안전 정책으로 실행 횟수를 결정: 프로필 데이터 경계를 유지하고 실행 시점 상태를 아는 주체가 횟수와 과다 실행 방지를 함께 책임진다.

## 결정

브라우저는 실제 입력값을 제외한 section 중심 DOM snapshot을 두 전용 API로 전송한다.

- `POST /api/v1/preparation/analyze`는 Snapshot A의 `actionCandidates`만 받고 `preparationPlans`만 반환한다.
- `POST /api/v1/fields/analyze`는 Snapshot B의 `fields`만 받고 field analysis와 제한된 write plan만 반환한다.

각 section은 자신에게 허용된 한 종류의 candidate만 포함한다. section에 직접 속한 candidate는 section의 `fields` 또는 `actionCandidates`에 두고, 하나의 자격·학력·경력처럼 반복되는 논리적 레코드에 속한 candidate는 `items[]` 아래에 둔다. 각 item은 snapshot 로컬 `itemId`를 가지며 candidate에 `sectionId`나 `itemId`를 중복하지 않는다. DOM class 이름, 반복 순번과 복제용 template은 item 식별자로 사용하지 않는다. 소속이 불분명한 candidate는 `section-root` section에 넣는다.

preparation plan을 사용자가 승인해 실행한 뒤 브라우저는 효과를 관측하고 기존 DOM handle을 폐기한다. 새 DOM에서도 준비가 더 필요하면 field와 action candidate를 한 요청에 섞지 않고, 새 Snapshot A로 preparation endpoint를 다시 호출한다.

반복 입력 행은 하나의 검증된 `ADD_REPEATABLE_GROUP` plan으로 준비할 수 있다. backend는 action candidate, `ADD_REPEATABLE_GROUP` 명령과 `GROUP_COUNT_INCREMENT` 기대 효과만 반환하고 실행 횟수를 반환하지 않는다. browser는 프로필 항목 수와 현재 DOM 반복 행 수를 로컬에서 비교해 `max(0, localItemCount - currentDomGroupCount)`로 필요한 추가 횟수를 계산하고, 그 횟수를 사용자 승인 대상으로 제시한다. 프로필 항목 수와 값은 API에 보내지 않는다.

browser는 executor의 로컬 안전 정책으로 과도한 실행을 제한한다. 각 실행 직후 `GROUP_COUNT_INCREMENT`를 확인하고 같은 action target을 로컬에서 안전하게 다시 찾은 경우에만 다음 실행을 진행한다. 효과가 없거나 재탐색할 수 없으면 즉시 중단하고 새 DOM의 Snapshot A로 돌아간다. 검증되지 않은 범용 후보는 임의 횟수로 반복하지 않고 한 번 실행하거나 차단·수동 처리한다. `REVEAL_SECTION`은 `TARGET_VISIBLE`, `targetSectionId` 조합을 사용하며 명령 의미상 한 번만 실행한다.

backend는 회사 어댑터와 결정 규칙을 먼저 적용한다. 어댑터 후보가 있는 요청은 fingerprint 불일치 시 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 generic 또는 LLM fallback으로 우회하지 않는다. 미지원 사이트의 입력 field와 필요한 비식별 section·`itemId` 문맥만 최소 LLM payload로 구성하며, action candidate와 프로필 값은 LLM에 전달하지 않는다. LLM structured output은 허용 프로필 field key 또는 `NO_MATCH`만 반환한다.

## 결과

preparation과 field mapping의 입력·출력·재시도·관측 책임이 API 경계에서 분리된다. OpenAPI는 cross-endpoint candidate와 plan을 unknown property로 거부하므로 preparation plan과 write plan을 같은 성공 응답에 넣을 수 없다. command별 plan schema는 section reveal의 반복 실행과 효과가 불명확한 반복 click을 거부한다.

동적 DOM은 클릭별 효과 검증과 재수집으로 안전하게 처리한다. 반복 행의 실제 실행 횟수와 안전 제한은 browser만 알며 backend와 LLM은 프로필 항목 개수도 받지 않는다. fields snapshot에서는 `itemId`가 같은 레코드의 field를 함께 유지하므로 여러 자격·학력 항목이 있어도 서로 다른 레코드의 field를 교차 결합하지 않는다. 로컬 안전 정책에 걸리거나 action 효과 확인·재탐색에 실패하면 소비자는 fields endpoint로 진행하지 않고 preparation endpoint에 새 Snapshot A를 보낸다.

실제 프로필 값 연결과 실행 승인은 계속 브라우저에 남는다. 후속 DOM collector, analyzer, LLM mapper, browser executor 구현은 이 문서의 계약을 소비하는 별도 Project draft 후보이며 현재 Issue 범위에는 포함하지 않는다.
