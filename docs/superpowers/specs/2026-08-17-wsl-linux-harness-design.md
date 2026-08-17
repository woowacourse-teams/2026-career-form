# WSL/Linux 하네스 실행 환경 설계

## 목표

하네스, Git 훅, 에이전트 검증의 공식 실행 기준을 WSL/Linux로 고정한다. Windows 사용자는 WSL 내부 파일시스템의 `/home/...` clone에서 WSL 도구로 같은 검증 진입점을 실행한다.

## 범위와 경계

- Windows PowerShell에서 하네스 전체 검증을 지원하지 않는다.
- 제품 런타임, 백엔드, 확장 프로그램 동작은 변경하지 않는다.
- WSL 내부 새 clone의 `ensure-environment.py`와 `verify.py`, Linux CI 품질 게이트가 동일한 Linux/POSIX 경로를 사용한다.
- 실제 지원서 정보, 계정·세션, 시크릿은 다루지 않는다.

## 설계

### 문서와 작업 흐름

`AGENTS.md`와 `harness/README.md`는 공식 실행 환경, Windows PowerShell 비지원, `/home/...` clone, WSL Git·가상환경·VS Code Remote WSL 흐름을 명시한다. 명령 예시는 `python3`과 `.venv/bin/python`만 사용한다.

### 런타임 선택

하네스의 Python 및 셸 선택기는 Linux/POSIX 계약만 따른다. Git-for-Windows 탐색과 `.venv/Scripts/python.exe` 선택은 제거한다. 셸 문법 검증은 `PATH`에서 해석한 `sh`를 사용하며 특정 절대 경로를 코드나 테스트에 적지 않는다.

### 줄바꿈과 Git 훅

`.gitattributes`는 `.githooks/**`와 `*.sh`에 LF를 강제한다. 계약 테스트는 속성 선언과 실제 추적 파일 바이트의 CRLF 부재를 함께 검사한다. 이로써 WSL 내부 새 clone에서 Git 훅이 CRLF 때문에 실패하지 않음을 보장한다.

### 검증

단위 테스트는 Windows 전용 경로 가정이 없고, 셸 선택·문법·LF 정책·CI 명령을 검증한다. `verify.py`는 모든 새 검사를 포함한다. GitHub Actions의 Linux 품질 게이트도 `python3 harness/scripts/verify.py`로 같은 진입점을 호출한다.

## 오류 처리

문서는 Windows 파일시스템의 `/mnt/<drive>/...` clone과 PowerShell 직접 검증을 지원 대상 밖으로 안내한다. 하네스는 누락된 POSIX 가상환경이나 Git 훅 구성을 기존 `doctor.py` 오류로 명확히 보고한다. 셸을 찾지 못하면 검증 스크립트는 예외를 숨기지 않고 실패한다.

## 검증 계획

1. WSL/Linux 전용 선택 규칙과 LF 정책을 우선 실패 테스트로 작성한다.
2. 최소 구현과 문서·CI 변경 뒤 관련 단위 테스트를 실행한다.
3. WSL `/home/...` 새 clone에서 `ensure-environment.py`와 `verify.py`를 실행한다.
4. 전체 하네스 검증, 공백 검사, 두 축 코드 리뷰를 수행한다.

## 대안

- Windows PowerShell 호환 계층을 유지하는 안은 Windows/WSL 혼합 경로와 셸 선택 문제가 계속 남으므로 채택하지 않는다.
- 컨테이너를 추가하는 안은 새 실행 경로와 운영 의존성을 만들므로 채택하지 않는다.
