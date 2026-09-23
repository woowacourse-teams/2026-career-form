# CF-98 분석 공급자와 실행 인계

2026-09-22 구현 인계 당시에는 빌드와 실행 검증을 수행하지 않았다.
2026-09-23 후속 작업에서 로컬 OpenAI 구성의 실제 설치 확장으로 세 검색 표면의 입력과
동일값 재실행을 확인했다. 결과와 미검증 범위는
[실제 확장 실행 확인](analysis-provider-verification.md)에 기록했다.
Jev 및 실제 채용 사이트의 최신 빌드 검증은 남아 있으며, Issue 전체 인수 완료 기록은 아니다.

## 공급자 선택

서버 시작 시 세 포트 `FieldMappingResolver`, `ActionResolver`,
`InteractionDecisionProvider`를 동일한 공급자로 구성한다.
정적 회사 정책 라우팅은 기존 계약을 따른다. 호출 실패 시 공급자를 자동 전환하지 않는다.

| 설정 | 기본값 | 의미 |
| --- | --- | --- |
| `CAREER_FORM_ANALYSIS_ENABLED` | 미지정 | 새 공통 enable 설정 |
| `CAREER_FORM_ANALYSIS_PROVIDER` | `openai` | `openai` 또는 `jev` |
| `CAREER_FORM_LLM_ENABLED` | 미지정 | 기존 enable 설정 호환 |
| `OPENAI_API_KEY` | 없음 | OpenAI 선택 시 사람이 준비 |
| `CAREER_FORM_LLM_MODEL` | 기존 `gpt-5.6-luna` | OpenAI 모델 |
| `TYPESAFE_API_KEY` | 없음 | Jev 선택 시 사람이 준비 |
| `CAREER_FORM_JEV_MODEL` | `jev-latest` | Jev 모델 |
| `CAREER_FORM_JEV_TIMEOUT_MS` | `8000` | 1–8000ms |
| `CAREER_FORM_JEV_MIN_CONFIDENCE` | `0.8` | 보류 기준, 정확도 보장 수치 아님 |
| `CAREER_FORM_JEV_DATA_POLICY_REVIEWED` | `false` | 실제 전송 자료·보관 정책을 사람이 확인한 뒤 설정 |

새 enable이 없으면 기존 enable을 사용한다. 둘 다 없으면 비활성이다.
둘 다 명시했는데 값이 다르면 시작에 실패한다. 알 수 없는 공급자, 누락·중복·혼합 포트도
시작에 실패한다. Jev 선택 또는 분석 비활성 상태에는 OpenAI 모델 자동 구성을 끄므로
OpenAI 키를 준비할 필요가 없다.

Jev 시작에는 키가 필요하지만 정책 확인 설정이 false이면 외부 호출은 보류한다.
기존 OpenAI 저장 옵션을 Jev의 보관 정책으로 간주하지 않는다.
실제 키나 요청 원문을 문서·Issue·로그에 기록하지 않는다.

OpenAI 전송은 8초, SDK 재시도 0회로 제한한다. 기존
`CAREER_FORM_LLM_TIMEOUT` / `CAREER_FORM_LLM_MAX_RETRIES` 대신 이 제한을 적용한다.
Jev도 자동 재시도와 redirect를 사용하지 않는다.
Jev [공식 API](https://docs.typesafe.ai/api)의 Choice 요청/응답에 맞춰
후보별 질문을 만들고, 응답 집합·선택지·확률 분포·confidence를 확인한 뒤 공통 결과로 변환한다.
자유 문장을 실행 명령으로 사용하지 않는다.

## 브라우저 실행 경계

검색 표면은 동일 문서 dialog/popover, 동일 출처 iframe, 명시적으로 연결된 inline listbox다.
표면과 검색 방식(existing-options / query-only / query-and-submit)을 별도로 판정한다.

- 원래 readonly 필드와 반복 행 identity를 유지하고, 이미 같은 값이면 클릭 없이 별도 집계한다.
- 역할 후보는 로컬 안전 조건을 통과한 경우에만 분류한다. snapshot 사이 결정 캐시는 사용하지 않는다.
- 검색 결과 선택은 로컬 정확 일치로만 한다. 이전 검색 결과·중복·pagination·가상화·불명확한 전체 개수는 중단한다.
- 결과 완료는 현재 query 표시와 완료 marker, busy 전이와 내용 변경, 검증된 iframe 검색 문서 등을 사용한다.
  전체 목록은 명시적인 완료 marker 또는 전체 개수/aria-setsize로 확인해야 한다.
- native submit은 별도 동일 출처 iframe의 검색 전용 GET form에서만 허용한다.
  hidden/외부 전송 control, 다른 목적지, top/parent 이동은 허용하지 않는다.
- opener 이후 실패하면 뒤의 일반 입력까지 중단한다. 자동 닫기·되돌리기·다른 방식 재클릭은 하지 않는다.
- 회사 callback, JavaScript URL, MAIN 재실행, hidden code 직접 쓰기는 범용 경로에서 사용하지 않는다.
  기존 MAIN content-script 진입점을 제거했다.
- 현재 collector의 전체 관계를 보장하지 못하는 ShadowRoot 대상과 접근 불가 iframe은 미지원이다.
- 실제 값 반영과 검색 화면 종료를 함께 관찰한 뒤 500ms 유지 구간을 둔다.
  이는 지원서 저장·제출 성공 확인이 아니다.

run당 검색 4개/역할 provider 호출 4회, transaction당 30초/호출 2회/역할 3개,
역할당 후보 8개/transaction 후보 24개가 상한이다. DOM 관찰과 역할 호출은 단계당
최대 8초 및 남은 transaction 시간 안에서 종료한다. 준비와 쓰기는 문서별 실행 lease를 공유한다.
취소 후 늦은 응답으로 DOM 조작을 재개하지 않는다. 확장 runtime 메시지는 직접 취소할 수 없어
진행 중 백그라운드 HTTP 요청은 자체 8초 timeout으로 종료하고 응답 실행권은 폐기한다.

## Aside로 넘길 자료

- 설계: worktree Git 메타데이터 `cf-workflow/generic-autofill-design.md`.
- 합성 화면: `frontend/fixtures/generic-search/` 및 `surfaces.html`.
- 합성 프로필: 두 행 양식은 `profile-export.generic-search.two-university.json`, 한 행 `surfaces.html`은 `profile-export.generic-search.single-university.json`.
- 프론트 실행 환경에는 `VITE_API_BASE_URL=http://localhost:8080`을 설정한다.
- 로컬 OpenAI 구성의 세 표면 정상 입력·동일값 재실행과 일부 안전 보류를 실제 확장으로 확인했다.
  Jev 실제 호출, 실제 미등록 지원서 및 모든 중단·회귀 조합은 미검증이다. 상세 검사 상태는 위 결과 문서를 따른다.

이번 인계에서 커밋·PR 게시·Wiki 정본 갱신도 수행하지 않았다.


## 비활성 분석의 안전 경계

분석 비활성 상태에서는 generic 경로가 주입된 custom provider를 호출하지 않고
`LLM_UNAVAILABLE`로 끝나야 한다. 정적 회사 정책의 adapter 경로는 이 조건과 별개로
기존처럼 유지한다. 따라서 조건부 provider bean이 없는 기본 구성뿐 아니라 테스트나 배포
구성의 custom resolver/provider 주입도 외부 공급자 호출을 허용해서는 안 된다.
