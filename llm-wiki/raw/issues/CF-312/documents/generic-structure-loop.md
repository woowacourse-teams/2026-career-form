# 숨은 다른 단계 control의 학력 행 단계 검사 제외

## 승인한 지식

- 같은 행에 있지만 숨겨진 다른 학력 단계 control은 행을 차단하지 않는다. 범용 구조 반복 실행의 단계 검사(`frontend/src/autofill/generic/structure-loop.ts`의 `runGenericStructureLoop`)는 registry handle이 보이는 행 후보의 MATCH key만 모은다. 숨은 대학 분기 control이 `education.university.*` key로 매칭돼도 보이는 고등학교 행이 `STAGE_KEY_MISMATCH`가 되지 않는다.
- 묶음 후보의 가시성은 후보가 소유한 모든 native control로 판정한다(`frontend/src/autofill/dom/collect.ts`의 `isFieldCandidateHidden`). 소유 control이 모두 숨겨졌을 때만 숨김이며, native control이 없을 때만 custom element를 사용한다. 더 좁은 판정은 리뷰에서 발견된 fail-open이었다. 일부만 보이는 후보가 단계 충돌 검사에서 빠져 차단돼야 할 행이 차단되지 않았다. 판정은 별도 사본 대신 수집기의 숨김 판정을 재사용한다.
- 반복 행 섹션의 등급 판정 sibling도 숨은 후보를 제외한다(`frontend/src/autofill/generic/generic-analysis.ts`의 `convertSection`, `visibleRowMatches`). 제외하지 않으면 숨은 다른 단계 매칭이 보이는 칸의 등급에 계속 영향을 준다. 반복 행이 아닌 등급 근거, 예를 들어 숨은 영문 성 control은 이름 등급 판정에 계속 사용한다.

## 근거와 경계

CF-307에서 미확정 가설로 남긴 고등학교 행 전체 `STRUCTURE_BLOCKED` 관측을 정제한 NAVER 학력 단계 DOM fixture(`frontend/fixtures/dom-snapshots/naver-education-stage/`)로 재현했다. 회귀 테스트는 `structure-loop.stage-visibility.test.ts`, `generic-analysis.test.ts`, `dom-snapshot.naver-education-stage.test.ts`에 있다. 보이는 다른 단계 key가 있는 행은 계속 차단하고, 일부만 보이는 묶음 후보도 차단 검사에 포함한다.

실사이트 기입·저장·제출과 실제 공급자 재실행은 수행하지 않았다. CF-260의 범용 경로 전용 구조 반복 실행, 단계별 캐시·로컬 행 기록과 보류 격리 경계는 유지하며 구조 행동 ADR의 상태를 바꾸지 않는다. 실제 지원값, 계정, 세션과 페이지 식별 주소는 옮기지 않는다.
