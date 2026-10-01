# CF-46 로컬 작업 인계

## 현재 상태

- 작업 위치: `/Users/han/Projects/active/2026-career-form/.worktrees/CF-46`
- 브랜치: `CF-46`
- 변경사항은 **커밋하거나 푸시하지 않았다**.
- 백엔드 기준 origin은 `http://127.0.0.1:8080`이다.
- 확장프로그램 기본 production 설정(`frontend/.env.production.local`)도 `VITE_API_BASE_URL=http://127.0.0.1:8080`을 사용한다.

## 사용자 요구사항

SK하이닉스 지원서의 조건부 필드를 자동 기입한다.

1. 준비 단계에서 보훈/장애 여부 라디오를 먼저 선택한다.
2. 선택으로 보훈번호·본인과의 관계·장애 유형 같은 필드가 나타나면 DOM을 다시 읽는다.
3. 그 새 DOM을 field API로 분석한 뒤 실제 값을 입력한다.
4. 프론트가 회사별 의미를 추측하지 않는다. 회사별 선택값/규칙은 백엔드 회사 정책(DB seed)에 둔다.
5. 고정 delay 대신 `MutationObserver`로 기대 필드의 표시를 감지한다.

## 현재까지 적용된 변경

### 기존 자동입력/값 처리

- 프론트 전역 `예/대상`, `아니오/비대상` 의미 추측은 executor에서 제거했다.
- `BOOLEAN_YN` derived binding을 추가했다.
- SK 보훈/장애 여부는 backend policy가 `BOOLEAN_YN` 및 실제 표시값 `대상`/`비대상`을 내려주도록 수정했다.
- `DerivedBinding`은 `profileFieldKey`, `trueLabel`, `falseLabel`을 갖도록 확장됐다.
- 학력 `EDUCATION_TYPE_AND_DEGREE`와 프로필 학교 유형(`전문대학`/`대학교`) 변경도 이 worktree에 포함되어 있다.

### 준비 API 라디오 확장 (완료)

- `PreparationAnalysisRequest.FormControl`에 `RADIO` 추가
- `CompanyFormPolicy.ActionKind`에 `CHOOSE_RADIO` 추가
- SK policy에 `prsVeteranBenefitYN`, `prsDisabledYN` action rule 및 fingerprint structure 추가
- `ActionRule`에 `optionDisplayName` 추가
- `ActionResolver.SelectOptionAction`, `PreparationAnalysisResponse.SelectOptionToRevealPlan`에 `optionDisplayName` 추가
- frontend preparation collector가 `input[type='radio']`를 action candidate로 수집
- workflow의 `selectProfileOption`이 radio input을 클릭하도록 확장
- `ActionRule`과 `ActionResolver.SelectOptionAction`, `SelectOptionToRevealPlan`이 정책의 `expectedFieldNames`를 전달한다.
- SK 정책은 보훈에 `prsVeteranBenefitNumber`, `prsVeteranBenefitRelation`을, 장애에 `prsDisabledType`, `prsDisabledTypeDtl`을 기대 필드로 둔다.
- 프론트 응답 validator와 `PreparationPlan`이 이 계약을 검증한다.
- executor는 선택 뒤 기대 필드가 표시될 때까지 기다린 뒤 DOM을 다시 수집한다.

## 해결된 문제

첫 자동 기입에서:

`준비 동작을 안전하게 완료하지 못했습니다`

가 나오고, 다시 실행하면 일부 기입된다.

원인은 라디오 클릭 직후 이미 보이는 `section-1`만 확인해 조건부 필드의 실제 생성 여부를 판별하지 못하던 것이었다. 이제 정책이 지정한 기대 필드의 존재·가시성을 `MutationObserver`로 확인하고, 성공 시 즉시 관찰을 해제한 뒤 최신 DOM을 다시 분석한다. timeout은 무한 대기 방지용 실패 안전장치일 뿐 성공으로 간주하지 않는다.

## 검증 및 실행

- backend: `./gradlew test --tests '*Preparation*' --tests '*CompanyFormPolicyTest'`
- frontend: `npm test -- --run src/autofill/preparation/executor.test.ts src/autofill/preparation/wait-for-fields.test.ts`
- frontend: `npm run typecheck`
- frontend build: `VITE_API_BASE_URL=http://127.0.0.1:8080 npm run build`
- 백엔드 실행:

```sh
SPRING_PROFILES_ACTIVE=local \
SPRING_MONGODB_URI=mongodb://127.0.0.1:27018/career-form \
SERVER_PORT=8080 ./gradlew bootRun
```

## 주의

- 사용자 요청 전에는 커밋/푸시하지 않는다.
- `.serena`는 삭제 요청을 받았으나 현재 상태를 별도 확인해야 한다.
- 실제 지원서 제출/임시저장은 사용자가 수행한다.
