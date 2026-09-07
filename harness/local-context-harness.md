# 로컬 컨텍스트 정합성 하네스

`frontend/`, `backend/`, MongoDB 사이의 계약을 한 작업 단위로 검증해, 한 계층만 수정해서 발생하는 사이드 이펙트를 막기 위한 로컬 개발 규칙이다. 제품 데이터와 실제 지원서 값은 하네스에 넣지 않는다.

## 시스템 경계

| 계층 | 책임 | 정본 | 반드시 확인할 소비자 |
|---|---|---|---|
| `frontend/` | 프로필 UI, canonical profile key, 브라우저 저장, snapshot/write | `frontend/src/profile/model.ts`, `frontend/src/profile/field-definitions.ts` | backend allowlist, 회사 adapter mapping |
| `backend/` | snapshot 분석, adapter 구조 검증, profile key allowlist, write plan 정책 | `SupportedProfileFields`, `CompanyFormPolicy`, 분석 DTO/서비스 | frontend response validator, Mongo 정책 |
| MongoDB | 회사별 정책과 버전 보관 | `FormAnalysisCompanyDocument` 및 seed 정책 | backend policy provider/resolver |
| `harness/` | 세 계층 계약과 실행 순서 검증 | 이 문서와 `harness/scripts/verify.py` | 모든 변경 작업 |

## 핵심 불변식

1. 프로필 UI 저장 키는 backend canonical key와 정확히 일치한다.
2. backend 응답의 `candidateId`, `profileFieldKey`, `writePlan`, `interactionStatus`는 frontend validator가 이해할 수 있다.
3. 회사 adapter 구조가 다르면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 범용 매칭하지 않는다.
4. Mongo 정책 구조·매핑 변경 시 정책 버전을 증가시키고 seed 후 API 활성 버전과 일치시킨다.
5. 최종 승인 전 지원서에 쓰지 않으며 저장·이동·미리보기·제출은 사용자가 수행한다.

## 변경 전 컨텍스트 로딩

```bash
python3 harness/scripts/ensure-environment.py
sed -n '1,240p' llm-wiki/wiki/topics/product-concept.md
sed -n '1,260p' llm-wiki/wiki/topics/profile-fields.md
```

회사 adapter를 건드리면 `adapter-development.md`, `adapter-field-inventory.md`도 읽는다. 계획과 체크포인트는 다음 worktree Git 메타데이터 경로에 기록한다.

```bash
git rev-parse --git-path cf-workflow/plan.md
git rev-parse --git-path cf-workflow/checkpoint.json
```

## 계층별 변경 규칙

### 프로필/프론트

`field-definitions.ts`의 새 필드·키는 같은 변경에서 `profile/model.ts` 타입·기본값, UI/storage 테스트, backend `SupportedProfileFields`, 회사 snapshot의 `domName`/`domId`를 확인한다.

### 백엔드 분석/정책

DTO·resolver·adapter 정책 변경 시 `frontend/src/autofill/api/types.ts`와 `validate-response.ts`, 성공·부분 성공·구조 불일치·omission 테스트, allowlist·정책 버전·Mongo 활성 정책을 함께 확인한다.

### Mongo/seed

정책 문서 변경 시 Java 모델과 양방향 호환성을 확인하고 `VERSION`을 올린다. seed 테스트에서 회사·경로·버전·alias를 검증한다. 데이터 삭제·volume 초기화·migration은 사용자 명시 승인 없이는 실행하지 않는다.

## 표준 실행과 통합 게이트

```bash
python3 scripts/local.py up
python3 scripts/local.py status
```

직접 실행할 때는 로컬 Mongo `27018`, API `18080`을 명시한다.

```bash
SPRING_MONGODB_URI=mongodb://127.0.0.1:27018/career-form \
SERVER_PORT=18080 ./gradlew bootRun
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/actuator/health
```

최소 검증 순서:

```bash
git diff --check
./gradlew test
cd frontend && npm test && npm run typecheck
VITE_API_BASE_URL=http://127.0.0.1:18080 npm run build
cd .. && .venv/bin/python harness/scripts/verify.py
```

`health`가 200이 아니면 분석을 재시도하지 말고 Mongo 연결·포트·seed를 먼저 고친다. `preparation`의 `COMPLETE`는 plan 생성 성공, `fields`의 `MATCH/READY`는 매핑 성공이며, `CONDITIONAL`은 사용자 검토 대기다. `NO_MATCH`와 구조 불일치는 각각 지원되지 않음과 안전 차단으로 구분한다.

## 완료 보고

- 변경 계층과 영향을 받은 계약(frontend / backend / Mongo)
- 테스트·타입 검사·build·`verify.py`·health 결과
- 확장 프로그램 reload와 사용자 검토/승인 등 남은 수동 단계
- 미검증 snapshot ID와 정확한 reason code

분석 응답만으로 자동 기입·지원서 제출 완료라고 보고하지 않는다.
