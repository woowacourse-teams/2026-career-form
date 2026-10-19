# 범용 범주 안 JEV 매칭 누락 원인과 의미 근거 보강

## 승인한 지식 후보

1. Offline reproduction with mock JEV on two independent fixtures (a sanitized NAVER-structure request and a synthetic request) shows the category, criteria keys, candidate linking and the abstain/token-limit paths were intact. The confirmed backend cause is that the shared ProviderSemanticSanitizer finite vocabulary returned no text for labels such as work content, license kind, exam and spaced variants, so JEV received those fields without any label. The shared sanitizer is unchanged (static paths depend on it). Real JEV and live-site behavior were not run, so the improvement is not claimed.
2. GenericProfileSemantics inside the generic package adds a finite structural vocabulary only for confirmed CAREER, CERTIFICATE and LANGUAGE sections, and gives the five existing keys (responsibilities, certificate name, certificate issuer, language test name, language test grade) value-free meaning descriptions. No new key, category or DTO; no company, host or DOM identifier branch. A free-text score field has no supported key, so it stays ABSTAIN.
3. Provider observations now also carry inputMode, required, multiple, maxLength and label sources, and drop repeat.rowCount (rowIndex stays); no profile value, current value or count is sent. Tests use an ideal mock keyed by question order, so mock success must not be read as real JEV accuracy.

## 코드 근거와 검증 범위

- `backend/src/main/java/com/careerform/formanalysis/generic/GenericProfileSemantics.java`, `JevCategoryFieldResolver.java`: 범용 패키지 안의 어휘 보강, 키 설명, 관측 투영.
- `backend/src/test/java/com/careerform/formanalysis/generic/GenericFieldsResolverTest.java`와 `backend/src/test/resources/generic/`의 두 독립 요청 fixture: 범주 criteria, 관측, 후보 연결, 기권·토큰 초과 구분.

수정 전 네 테스트가 실패(exit 1)했고 수정 뒤 통과했다. mock JEV 결과이며 실제 JEV의 의미 정확도와 실사이트 성공률을 뜻하지 않는다. 실제 지원서 값, 계정과 세션 정보는 포함하지 않는다.
