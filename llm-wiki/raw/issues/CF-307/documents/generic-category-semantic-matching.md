# 취득 자격증 날짜의 결정적 의미 연결

## 승인된 현재 계약

프로필은 취득한 자격증만 저장하므로 CERTIFICATE 범주에서 대상 자체의 취득 날짜 문구가 확인된 날짜 칸은 `certifications.certificate.acquisitionDate`로 결정한다. `GenericProfileSemantics.certificateDateKey`는 INPUT/TEXT control이고 semantic inputType이 DATE이거나 TEXT와 maxlength 10의 전체 날짜 구조일 때만 적용한다. 대상 displayName·placeholder 또는 LABEL/ARIA_LABEL/ARIA_LABELLEDBY/PLACEHOLDER 출처에서 취득일·취득일자·취득/응시일 같은 문구를 정규화해 확인하며, 섹션 heading만으로 추정하지 않는다. 취득 문구 없는 응시일 전체를 포괄하는 규칙이 아니다.

`GenericFieldsService`는 공급자 호출 전에 이 key를 confidence 1.0의 결정적 매핑으로 넣고, 공급자 결과는 `putIfAbsent`로 합친다. 공급자의 기권·낮은 신뢰도·다른 key가 이 결정을 덮어쓸 수 없다. 이후 기존 `GenericFieldPolicy`와 공유 상호작용 정책으로 쓰기 가능 여부를 판단하므로 의미 결정과 실제 실행 승인은 별개다. 프론트엔드의 null 응답을 임의로 승격하거나 전역 임계값을 낮추는 방식이 아니다.

추가 행의 날짜 단위는 [같은 반복 그룹·동일 구조·같은 열 근거](generic-calendar-selection.md)로만 보완한다.

## 근거와 관측 한계

- `backend/src/main/java/com/careerform/formanalysis/generic/GenericProfileSemantics.java`: `certificateDateKey`.
- `backend/src/main/java/com/careerform/formanalysis/generic/GenericFieldsService.java`: 공급자 호출 전 매핑과 `putIfAbsent`.
- 로컬 `cert-fix-ed34db1/run-1`, `run-2`, `run-3`의 `diag.json`을 직접 대조했다. 세 실행 모두 자격증 날짜 세 칸이 acquisitionDate, 프로필 행 0/1/2, AUTO로 같았다. 이는 해당 세 칸의 분석·검토 결과 동일성이지 전체 매핑 동일성이나 실제 기입 성공이 아니다.
- 같은 실행들의 `measurement.json`은 전체 분류 개수가 변했음을 보여 준다. 설치 background revision은 조회되지 않았고 content script 동일성 근거와 구분한다.
- `acquired-certificate-contract`의 기존 근거는 공급자 기권·낮은 신뢰도 반례와 그룹 경계 합성 회귀를 포함한다. 이번 Wiki 수집에서 테스트와 실사이트 분석을 재실행하지 않았다.

CF-281의 범주 한정 의미 어휘 보완, 기존 등급·점수 계약과 기권 경계는 유지한다. 실제 지원값·회사 페이지 URL·계정·세션은 기록하지 않는다.
