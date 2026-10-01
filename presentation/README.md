# 밍글링 데이 발표 자료

Career Form이 내린 판단, 실제 적용 결과와 막힌 지점을 실제 자료와 함께 공유하는
20분 대화 자료다. 제품, 클라이언트, 백엔드와 팀 및 AX를 네 발표자가 순서대로
담당한다. 각 구간은 선택 이유, 실제 자료, 현재 동작과 다음 개선 계획을 포함한다.

## 실행

`index.html`을 데스크톱 브라우저에서 연다. 화면 아래 제어를 사용해 발표한다.

- `←`, `→`: 이전 슬라이드와 다음 슬라이드
- `N 노트`: 현재 슬라이드의 발표자, 예상 시간, 대본과 근거 표시
- `F 전체화면`: 발표 모드 진입과 종료

## 발표 구간

| 구간 | 슬라이드 | 대본 시간 |
| --- | ---: | ---: |
| 제품 | 1-8 | 5분 20초 |
| 클라이언트 | 9-13 | 5분 10초 |
| 백엔드와 LLM | 14-17 | 4분 40초 |
| 팀과 AX 및 마무리 | 18-22 | 4분 35초 |
| 합계 | 22장 | 19분 45초 |

남은 15초는 발표자 전환과 화면 조작에 사용한다.

## 실제 자료와 실험 집계

- `assets/experiment-screen.png`: 실제 가설 검증 인터뷰 HTML 화면
- `assets/experiment-a-direct-input.png`: A 직접 입력 화면
- `assets/experiment-b-side-panel.png`: B 같은 화면 사이드 패널 복사 화면
- `assets/experiment-c-profile-tab.png`: C 별도 프로필 탭 화면
- `assets/experiment-d-autofill-review.png`: D 검토형 자동 기입 화면
- `assets/extension-screen.png`: 빌드된 사이드 패널과 비식별 샘플 데이터
- `assets/project-board.png`: 담당자 정보를 가린 GitHub Project 칸반
- `experiment-report.js`: 10회 비식별 세션의 시간과 정확도 재현 집계

발표 수치는 `experiment-report.js`의 원자료에서 계산하며 `deck.test.mjs`가 세션 수,
필드 수, 평균 시간, 감소율과 정확 필드 수를 고정된 기대값과 비교한다.

## 자동 검증

```bash
node --check presentation/deck.js
node --test presentation/deck.test.mjs
git diff --check
.venv/bin/python harness/scripts/verify.py
```

전용 테스트는 실험 집계, 발표자 구간 순서, 대본 시간, 발표자 노트와 근거, 책임 주제,
서비스 흐름, 파트별 로드맵, 자동 기입 책임 경계, LLM Wiki 이해 정렬, 실제 PNG 서명과
슬라이드 이동 경계를 검증한다. 이 메타데이터는
필요한 내용의 배치를 확인하는 지표이며 청중의 이해나 실제 발표 품질을 증명하지 않는다.

## 사람 검증

- 16:9 전체화면에서 22장을 한 장씩 확인
- 의도하지 않은 겹침, 잘림, 넘침과 비정상 줄바꿈 확인
- 이전, 다음, 발표자 노트와 전체화면 제어 확인
- 네 발표자의 20분 리허설
- 발표 직전 구현 상태와 Wiki 정본의 변경 여부 확인
- 각 파트의 부족한 상태와 다음 계획에서 대화로 전환할 수 있는지 확인

렌더링 검사용 이미지와 실제 지원서 정보, 계정 정보, 브라우저 상태는 저장소에
기록하지 않는다.
