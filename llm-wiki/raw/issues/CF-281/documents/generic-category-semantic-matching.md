# 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강

## 승인한 지식 후보

1. Offline reproduction with mock JEV on two independent fixtures (a sanitized NAVER-structure request and a synthetic request) shows the category, criteria keys, candidate linking and the abstain/token-limit paths were intact. The confirmed backend cause is that the shared ProviderSemanticSanitizer finite vocabulary returned no text for labels such as work content, license kind, exam and spaced variants, so JEV received those fields without any label. The shared sanitizer is unchanged (static paths depend on it). Real JEV and live-site behavior were not run, so the improvement is not claimed. The gate regression also confirmed that the score label 성적 was reduced to the unrelated term 성; the generic finite vocabulary now retains a test-score term without changing the shared sanitizer.
2. GenericProfileSemantics inside the generic package adds a finite structural vocabulary only for confirmed CAREER, CERTIFICATE and LANGUAGE sections, and gives the five existing keys (responsibilities, certificate name, certificate issuer, language test name, language test grade) value-free meaning descriptions. No new key, category or DTO; no company, host or DOM identifier branch. The existing languages.languageTest.grade field supports both numeric scores and grade strings. Its provider criterion exposes acceptedTargetKinds NUMERIC_SCORE and GRADE and requires abstention only when competing score and grade controls cannot be resolved from structure. Score-only and grade-only cases retain the same key without any profile value.
3. Provider observations now also carry inputMode, required, multiple, maxLength and label sources, and drop repeat.rowCount (rowIndex stays); no profile value, current value or count is sent. Tests use an ideal mock keyed by question order, so mock success must not be read as real JEV accuracy. Gate regression mocks consume the actual provider criterion and sanitized observations for single-result targets, competing-result abstention and responsibilities/project-detail separation; they do not infer the answer from raw fixture labels or candidate IDs. Real JEV remains NOT RUN.
4. The approved NAVER sanitized source has no project-detail control. The original request fixture stays unchanged. A separate synthetic-adversarial request copies its first career row and clones the duties control shape with a synthetic ID and the independent synthetic fixture project label. This mutation is explicitly documented and is not collected source evidence. Score-only and grade-only requests are explicit synthetic ablations removing the opposite control from each original two-control language row.

## 코드 근거와 검증 범위

- `backend/src/main/java/com/careerform/formanalysis/generic/GenericProfileSemantics.java`, `JevCategoryFieldResolver.java`: 범용 패키지 안의 어휘 보강, 키 설명, 관측 투영.
- `backend/src/test/java/com/careerform/formanalysis/generic/GenericFieldsResolverTest.java`와 `backend/src/test/resources/generic/`의 두 독립 요청 fixture: 범주 criteria, 관측, 후보 연결, 기권·토큰 초과 구분.

수정 전 네 테스트가 실패(exit 1)했고 수정 뒤 통과했다. mock JEV 결과이며 실제 JEV의 의미 정확도와 실사이트 성공률을 뜻하지 않는다. 실제 지원서 값, 계정과 세션 정보는 포함하지 않는다.

## Astra 게이트 B1·B2 보완

기존 `grade`의 등급·점수 계약을 등급 전용으로 좁혔던 설명은 잘못되어 제거했다.
공급자 criterion의 JSON 문자열은 기존 키와 `acceptedTargetKinds` 두 종류,
`multipleTargetPolicy`를 명시한다. 새 회귀 테스트는 이 기계 판독 값과 정제된 관측을
소비하므로 prompt 문구 전체를 고정하지 않는다. 실제 JEV의 판별 능력을 검증한 것은 아니다.

수정 전 새 3개 검사 중 점수 지원과 프로젝트 반례 존재 검사 2개가 실패(exit 1)했다.
첫 보완 뒤에는 독립 합성 라벨 `성적`의 의미가 정제 중 사라지는 추가 실패가 드러났고,
공유 정제기 대신 범용 어휘에 `test score`를 보완한 뒤 대상 테스트가 통과했다.
출처와 합성 범위는 `backend/src/test/resources/generic/fixture-provenance.md`에 기록한다.
