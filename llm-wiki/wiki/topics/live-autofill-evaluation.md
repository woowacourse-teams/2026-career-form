# 실사이트 자동 입력 평가 워크플로우

> Topic: live-autofill-evaluation
> Status: Current
> Current: [CF-173 평가 계약 1.1과 설치본 근거](../../raw/issues/CF-173/documents/evaluation-contract-1.1.md)
> History: [CF-124 최초 공용 실행 계약](../../raw/issues/CF-124/documents/adr/124-ai-operated-live-autofill-evaluation.md); [CF-124 사전 판정 분모와 평가 보고서](../../raw/issues/CF-124/documents/reports/2026-09-28-live-autofill-evaluation.md); [CF-173 평가 계약 1.1](../../raw/issues/CF-173/documents/evaluation-contract-1.1.md)
> Updated: 2026-10-09

## 현재 상태

사용자가 외부 Chrome에 평가 탭을 열고 `평가 시작해줘`라고 요청하면 저장소 소유 스킬이 환경과 프로필을 점검하고 평가 에이전트 사전 판정, 비민감 입력, 실제 DOM 재검증과 비식별 보고를 수행한다. 평가 에이전트는 스킬을 실행하는 에이전트이며 제품이 API로 호출하는 AI가 아니다.

평가 에이전트는 확장 프로그램 UI를 열기 전에 페이지 전체 필드를 다섯 분류로 판정하고 `AUTOFILLABLE` 수를 고정한다. 매핑 정확도는 확장 프로그램 제안 수, 매핑 재현율과 정답 입력률은 `AUTOFILLABLE` 수를 분모로 계산한다. 대화 출력만으로 끝내지 않고 승인된 raw 보고서와 topic Wiki가 기록돼야 평가를 완료한다.

비민감 기존 값은 회원가입 기본값과 사용자 입력을 구분하지 않고 현재 평가 실행에서 덮어쓴다. 민감값과 입력 불가 항목은 `DEFERRED`로 남기며 저장, 이동, 미리보기와 제출은 실행하지 않는다.

Console의 `[CareerForm]` 로그는 수집, 분석, 리뷰, 기입과 검색 실패의 현장 진단에 사용한다. 값, 요청과 응답 원문, 스크린샷을 보관하지 않고 최종 결과는 실제 DOM으로 판정한다.

계약 `1.1`의 실사이트 보고서는 익명 후보 관측과 개수 요약을 함께 받으며 재계산한 개수가 다르면 거부한다. CLI와 동일한 FAILED/DEFERRED 원인 집계, 익명 근거 및 미발견 AUTOFILLABLE 개수를 출력한다.

평가 전 설치본의 background service worker 컨텍스트에서 `globalThis.__careerFormBuildInfo()`를 조회한다. 이는 지원서 값이나 DOM을 읽지 않는 빌드 메타데이터 조회다. 빌드 시 삽입된 불변 snapshot이므로 unpacked 파일이 재빌드로 덮어써져도 재로드 전에는 기존 설치본 revision을 반환한다. CLEAN·전체 SHA·canonical digest·설치본 확인 방법이 맞을 때만 VERIFIED이며 DIRTY/UNKNOWN 또는 조회 불가는 UNVERIFIED로 남긴다. 상세 판정은 [CF-173 ADR](../../raw/issues/CF-173/documents/adr/173-installed-build-revision-evidence.md)을 따른다.

## 과거 실행 근거

2026-09-28 최초 실행에서는 CF-115 `ground-truth-v1` 분모를 재사용해 `neowiz-lever`와 `lg-ai-research`의 `AUTOFILLABLE` 17개 중 올바른 매핑 7개, DOM 유지 6개를 확인했다. 매핑 정확도는 7/9, 77.8%, 매핑 재현율은 7/17, 41.2%, 정답 입력률은 6/17, 35.3%였다.

같은 날 `neowiz-lever`를 재실행해 확장 프로그램 UI를 열기 전에 평가 에이전트가 전체 30개 필드를 분류하고 `AUTOFILLABLE` 10개를 동결했다. 확장 프로그램은 5개를 제안하고 썼으며 올바른 매핑과 DOM 유지가 4개여서 매핑 정확도 80.0%, 매핑 재현율 40.0%, 정답 입력률 40.0%, 오입력률 20.0%였다. 이 실행으로 새 사전 판정 게이트를 한 사이트에서 E2E 검증했다. `lg-ai-research`는 이전 분모를 재사용한 결과로 남는다. 설치된 제품 revision은 `UNVERIFIED`이므로 저장소 변경에 따른 개선 또는 회귀는 판정하지 않는다.

## 변경 이유

기존 값 보호로 평가를 중단하면 회원가입 기본값이 있는 사이트의 자동 입력 결과를 측정할 수 없다. 값의 출처를 신뢰성 있게 판별할 수도 없으므로, 제출로 이어지지 않는 평가 탭과 현재 실행에 한정해 비민감 기존 값을 덮어쓰는 공통 계약을 선택했다.

확장 프로그램이 발견한 필드만 분모로 사용하면 미발견 필드를 제외해 실제 커버리지를 부풀린다. 제품 실행과 독립적인 사전 판정 분모를 먼저 동결하고 정확도와 재현율을 분리했다.

CF-173은 집계 요약과 후보 관측의 일치 검증, 원인별 집계 및 설치본 revision 근거를 추가했다. 기존 사용자 승인·입력·DOM 검증 경계는 바꾸지 않았으며 새 실사이트 자동 입력 결과를 측정한 작업은 아니다.
