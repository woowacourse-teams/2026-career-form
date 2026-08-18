# LLM Wiki 기반 비즈니스 맥락 탐색 체계 구현 계획

> **실행 방식:** 저장소의 `cf-executing-plans` 절차로 각 작업을 테스트 우선으로 수행한다.

**목표:** 정본 문서의 비식별 원본 스냅샷과 근거 링크를 갖춘 LLM Wiki, 이를 사용하는 저장소 공용 스킬, 구조 검증을 제공한다.

**구조:** `llm-wiki/raw/`는 변경하지 않는 정본 발췌 스냅샷이고, `llm-wiki/wiki/`는 raw 파일을 링크하는 요약·색인·append-only 로그다. 하네스 검증기는 경로, 메타데이터, raw 링크, 색인 누락을 검사하며 전체 `verify.py`에 연결한다.

**제약:** 실제 지원 정보·대화 전문·계정·세션을 기록하지 않는다. 원본 정본과 Wiki가 충돌하면 정본을 우선한다. 외부 스킬은 고정 SHA와 MIT 라이선스를 함께 보관한다.

---

### 작업 1: Wiki 구조 검증기와 회귀 테스트

**파일:** `harness/lib/llm_wiki.py`, `harness/scripts/validate-llm-wiki.py`, `harness/tests/test_llm_wiki.py`, `harness/scripts/verify.py`

- [ ] Wiki 디렉터리·필수 파일·문서 메타데이터·raw 링크·색인 누락을 표현하는 실패 테스트를 추가한다.
- [ ] 테스트가 검증기 부재로 실패하는 것을 확인한다.
- [ ] 최소 검증기와 CLI를 구현하고 `verify.py`에 연결한다.
- [ ] 관련 단위 테스트와 Wiki 검증기를 통과시킨다.

### 작업 2: 공용 `cf-karpathy-llm-wiki` 스킬 등록

**파일:** `.agents/skills/cf-karpathy-llm-wiki/`

- [ ] 외부 스킬의 이름·upstream 메타데이터·MIT 라이선스·참조 템플릿이 없을 때 실패하는 인벤토리 테스트를 추가한다.
- [ ] `Astro-Han/karpathy-llm-wiki`의 고정 SHA 스냅샷을 `cf-` 이름으로 등록하고 원본 라이선스와 근거 검사 스크립트를 포함한다.
- [ ] `validate-skills.py`와 관련 테스트를 통과시킨다.

### 작업 3: 초기 정본 스냅샷과 Wiki 문서

**파일:** `llm-wiki/raw/{business,technical,conventions}/`, `llm-wiki/wiki/{business,technical,conventions}/`, `llm-wiki/wiki/index.md`, `llm-wiki/wiki/log.md`

- [ ] 빈 구조 또는 끊어진 raw 링크를 검출하는 테스트를 먼저 추가한다.
- [ ] 제품 의도·안전 원칙, Issue/ADR/하네스 흐름, 개발 컨벤션의 비식별 원본 스냅샷과 이를 근거로 한 Wiki 문서를 작성한다.
- [ ] 색인과 append-only 초기 수집 로그를 작성하고 근거 검사 스크립트를 실행한다.
- [ ] 전체 하네스 검증과 `git diff --check`를 통과시킨다.

### 작업 4: 정책 문서화와 독립 검토

**파일:** `AGENTS.md`, `docs/adr/25-llm-wiki.md`

- [ ] 승인 없는 자동 수집 또는 정본보다 Wiki를 우선하는 문구를 검출하는 테스트를 추가한다.
- [ ] 사용자 요청 즉시 수집, 에이전트 발견 후보의 사전 승인, 정본 우선순위와 사용 순서를 문서화한다.
- [ ] 전체 검증, Issue 인수 조건 대조, `origin/develop...HEAD` 두 축 리뷰를 수행한다.
