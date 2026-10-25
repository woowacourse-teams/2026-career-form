# 검색 종류별 정확 일치 없음 전수 조사 절차와 새 정책 버전의 로컬 스택 검증

> Issue: CF-346
> Collected: 2026-10-25
> Approval-Digest: fe9263182f4be99fa243d40d23b9a65061d4226063cc78707b5149c59599feb3
> Source-Revision: d5a5005cc47d628b9044e460e0956021df523c90

이 문서는 2026-10-25 CF-346에서 승인된 후보 3을 실사이트 평가 관점에서 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 바꾸지 않은 내용(서비스 워커 API 관찰, 반복 관찰 루프, 테스트 계정 모드, 설치본 잠금, 채점 재사용)은 Supersedes가 가리키는 CF-334 근거와 그 앞의 근거를 따른다. 실제 지원값·계정·세션은 포함하지 않으며 전수 조사 값은 합성값이다.

## 승인 후보

- 검색 종류별 "정확 일치 없음" 전수 조사: 정확히 같은 항목이 없는 합성값 프로필을 `start --profile`로 심고, 읽기 전용 관찰기로 검색 칸 목록(항목 수, 마지막 항목, `data-value`)을 기록해 종류별 직접 입력 제공 여부를 표로 확정한 뒤 기본 프로필을 다시 심는다.
- 새 정책 버전은 worktree별 compose 프로젝트의 새 볼륨 로컬 스택에서 `policy-versions`로 활성 버전을 확인하고 로컬 API 빌드로 검증한다. 로컬 빌드에 `VITE_LOCAL_WORKFLOW_DIAGNOSTICS=1`을 켜면 드라이버 단계 진단이 콘솔로 나오고, 디버그 표(`console.table`)는 관찰기가 JSON으로 받을 수 있다.

## 근거

### 전수 조사 절차

- 정확 일치가 없는 값은 기본 합성 프로필에서는 한 종류(전공명 세 칸)만 생기므로, 종류별 구조를 보려면 모든 검색 칸 값을 정확히 같은 항목이 없는 합성값(예: `커리어폼대학교`)으로 바꾼 별도 프로필을 쓴다. 하네스 `start --profile <파일>`로 심고(설치본 잠금은 그대로), 관측이 끝나면 기본 합성 프로필로 다시 `start --profile`한다. 값은 비식별 합성값만 쓰고 저장·제출은 하지 않는다.
- 관찰기는 CDP로 같은 탭에 붙어 `input[role=combobox][name]` 중 검색 칸 이름(`majors.<n>`, `schoolName`, `companyName`, `testName`, `credentials`, `nationalityCode`)에 맞는 칸의 값·`aria-expanded`·열린 목록 항목(최대 40개의 라벨과 `data-value`)을 0.2초 간격으로 읽기 전용으로 기록한다. 클릭·입력은 하지 않는다. 종류별로 목록 항목 수, 마지막 항목이 `직접 입력하기:“값”`(`[[new]]`)인지, 선택 뒤 `data-value`가 `[[new]]-값`으로 바뀌는지를 표로 정리하면 사이트가 직접 입력을 주는 종류가 확정된다.
- 한 양식에 없는 종류(컬리에는 고교·자격증명·시험명·국적 칸이 없음)는 그 칸이 있는 다른 Greeting 공고(카카오게임즈)에서 같은 절차로 관측한다. 지원서 탭은 사용자가 열거나 사용자 요청으로 하네스 `open`을 쓴다.
- 결과 패널 문구와 함께 보려면 `run --label`의 `run.json`에서 `panel.pending`과 `review` 집계를 읽는다. 패널은 값 없이 사유 문구만 담는다.

### 새 정책 버전의 로컬 스택 검증

- 정책 버전을 올린 시드는 dev 배포 전에는 dev API에 없으므로, worktree별 compose 프로젝트(`scripts/local.py up`, 새 볼륨, 8080)로 로컬 스택을 띄우고 `GET /api/v1/policy-versions`에서 seed·DB 활성 버전이 새 버전인지 확인한다. `.env.local`은 `.env.example`을 복사해 만들며 시크릿은 없다. `local.py`는 저장소 루트의 절대 경로로 실행한다(셸 작업 디렉터리가 호출 사이에 바뀜).
- 확장은 `VITE_API_BASE_URL=http://localhost:8080`으로 다시 빌드해 `start --reinstall`로 설치하고, 기존 탭은 `goto`로 재진입한다. 검증이 끝나면 dev API 빌드로 다시 설치하고 `local.py down`으로 컨테이너만 내린다(볼륨은 지우지 않음). 설치본 잠금 파일의 `revision`·`apiHosts`로 어느 빌드가 설치됐는지 확인한다.
- `VITE_LOCAL_WORKFLOW_DIAGNOSTICS=1`을 켠 로컬 빌드는 `[CareerForm local workflow]` 접두의 `console.info` 객체로 드라이버 단계(재수집 판정, 리뷰 계획 승인, 상태 드라이버 완료 키)를 남긴다. 디버그 빌드의 `console.table` 행은 관찰기가 콘솔 메시지 인자를 `jsonValue`로 받아 JSON 배열로 저장할 수 있어, 반복 기입처럼 하네스 `run.json`의 문자열 요약으로는 좁히지 못한 원인을 값 없이 재구성할 수 있다.

## 한계

- 로컬 스택 검증은 dev 배포본과 백엔드 코드·시드만 같고 운영 데이터는 없다. 머지 뒤 dev 배포 빌드의 재확인은 별도다.
- 전수 조사 프로필은 검색 칸 외 값은 기본 합성 프로필과 같아, 다른 칸의 결과 패널 수치는 기본 프로필 실행과 비교하지 않는다.
