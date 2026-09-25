# 범용 readonly 검색 선택 fixture

공개 합성값만 사용하는 수동 확인용 fixture입니다. 실제 지원서 정보나 계정·세션 데이터는 포함하지 않습니다.

대학교 두 행의 학교명·학교소재지·전공을 각각 가까운 `dd`의 검색 버튼으로 선택합니다. 소재지·전공의 hidden 선택 코드는 fixture의 사이트 선택 callback만 갱신합니다. 두 번째 학교명에는 기존 동일값이 있어 무동작 유지 확인을 구분할 수 있습니다. 한 번에 새 검색은 최대 네 번이며, 나머지는 항목을 선택해 다음 실행에서 확인합니다.

저장소 루트에서 fixture 상위 디렉터리를 포트 8766으로 제공합니다.

```sh
cd frontend/fixtures
python3 -m http.server 8766
```

브라우저에서 [http://localhost:8766/generic-search/](http://localhost:8766/generic-search/)를 엽니다. 프로필 UI의 가져오기에서 [`profile-export.generic-search.two-university.json`](./profile-export.generic-search.two-university.json)을 선택해 합성 프로필을 불러올 수 있습니다.

접근 불가 iframe 시나리오를 실제 다른 출처로 확인하려면 별도 터미널에서 같은 디렉터리를 포트 8081에도 제공합니다. 외부 네트워크 요청은 사용하지 않습니다.

```sh
cd frontend/fixtures
python3 -m http.server 8081
```

시나리오를 설정할 때는 `검증 도구`를 펼친 채 필요한 토글을 켭니다. 확장 자동 기입을 시작하기 전 `검증 도구`를 닫아 진단 버튼이 준비 단계의 동작 후보로 해석되지 않게 합니다. 닫힌 진단 컨트롤의 field 후보가 collector의 전체 후보 수 분모에 남을 수 있으므로, 분모를 화면에 보이는 실제 입력 수로 간주하지 않습니다.

실제 확장 확인 순서는 다음과 같습니다.

1. 프로필 UI에서 합성 프로필 JSON을 가져옵니다.
2. `Ctrl+Shift+1`로 팝업을 열고 `지원서 패널 열기`를 누른 뒤 `자동 기입`을 선택합니다.
3. 학교명·학교소재지·전공의 같은 출처 정상 흐름과 재실행, 중복 opener/result, 접근 불가 iframe, stale 원본 행을 각각 따로 확인합니다. 실제 CJ 결과와 이 합성 결과는 분리해 기록합니다.
4. 각 시나리오 뒤 fixture의 `가상 양식 초기화`를 누르고, 다음 시나리오 전에 필요한 토글을 다시 설정합니다.
5. 종료 후 확장 프로필 UI에서 원래 프로필 파일을 다시 가져와 원래 상태를 복원합니다.

시나리오별 실제 관찰 결과를 기록하며, 이 fixture README는 모든 흐름이 통과했다고 주장하지 않습니다.

## CF-98 SearchSurface 인계 추가 (2026-09-22)

이번 변경 후 fixture 서버나 브라우저를 실행하지 않았다. 아래 내용은 실행 자료이며 통과 기록이 아니다.

같은 서버의 [surfaces.html](http://localhost:8766/generic-search/surfaces.html)은
첫 대학교 항목의 세 필드에 서로 다른 표면을 제공한다.

| 필드       | 표면                                      | 검색 방식                |
| ---------- | ----------------------------------------- | ------------------------ |
| 학교명     | native modal dialog 안의 동일 출처 iframe | query + 비제출 검색 버튼 |
| 학교소재지 | 동일 문서 modal dialog                    | 기존 전체 목록           |
| 전공       | 원래 필드와 ARIA로 연결된 inline listbox  | query-only               |

기존 iframe 예시는 검색 버튼을 비제출 버튼으로 바꾸고 검색 완료·현재 query·전체 결과 개수를
DOM에 명시했다. 자동 기입 구현은 이 자료를 읽을 뿐 fixture 전용 selector나 callback을 호출하지 않는다.
합성 사이트의 이벤트 handler만 readonly 표시값을 반영한다.

프로필 가져오기 및 실행은 Aside에서 사람이 지시할 후속 작업이다.
최신 구현의 실제 동작, 설정 조합, 장애·중단·회귀 결과는 아직 기록하지 않았다.

## 실제 확장 검증용 프로필 선택 (2026-09-23)

- 두 행 `index.html`: 기존 `profile-export.generic-search.two-university.json`을 사용합니다.
- 한 행 `surfaces.html`: `profile-export.generic-search.single-university.json`을 사용합니다. 학교 소재지는 지원되는 표준값 `region:seoul`입니다.
- 두 학력을 한 행 화면에 연결하거나 `가상지역` 같은 미지원 표준값을 사용하면 입력 불가로 남을 수 있습니다. 이를 성공으로 집계하지 않습니다.
- 확장의 실제 플로팅 진입 버튼을 사용하는 경우 `surfaces.html?apply=1`로 엽니다. 이는 로컬 합성 URL에서 기존 버튼 표시 조건을 만족시키기 위한 것이며 정적 정책 host를 위조하거나 확장 메시지를 직접 호출하지 않습니다.
- 2026-09-23 실제 설치 확장의 OpenAI 범용 경로에서 한 행의 세 검색 표면을 확인했습니다. 분석 화면 표시는 2.2초, 탐지 5개/연결 3개, 기입 성공 3개/실패 0개/확인 필요 0개/입력 불가 2개였습니다. 실제 세 필드 값 반영과 검색 화면 종료를 확인했습니다.
- 재실행은 분석 화면 표시 2.9초, 새 기입 0개, 동일값 유지 3개, 입력 불가 2개였습니다. 이 수치는 단일 로컬 합성 화면의 관측값이며 실제 채용 사이트 또는 공급자 간 성능 비교가 아닙니다.
- 가져오기 UI 전후에 내보내기를 수행해 원래 프로필의 전체 `profile` 객체가 동일하게 복원됨을 확인했습니다. 원본 프로필이나 백업 내용은 저장소에 기록하지 않았습니다.

## POST/hidden school refusal and independent KOR region fixture

[legacy-search-form.html](./legacy-search-form.html) uses public synthetic values and two separate **same-origin iframe** popups. The school iframe ([legacy-school-frame.html](./legacy-school-frame.html)) preserves the reported structure: POST form, hidden row context, fieldset, text query, unlabelled `<input type="submit" value="검색">`, and a result `ul/li/a` **inside the form** with `href="javascript:;"` and a literal-only inline callback. There is no invented completion marker. Its original unlabelled submit input is currently not discovered as a submit control, so the expected first failure is `search_submit_not_found`, before the POST/hidden form guard. The separate labelled **button** variant in the interaction test is solely diagnostic and reaches `unverified_search_form`; it is not a claim about the observed page.

The independent [legacy-region-frame.html](./legacy-region-frame.html) has no school form: it presents the KOR/한국 country select and 17 public regions outside a form. Selecting a region reflects its label and synthetic code and closes only its popup. The school and region opener, query, submit, and selection counters are exposed by `syntheticLegacyCounts()`. The other school row starts with a synthetic existing value and code; neither scenario should change it. Serve from `frontend/fixtures` using the local server instructions above. These fixtures are structural reproductions, not proof of company support or live-site behavior.

Native GET characterization in `search-results.test.ts` records the present contract: completed navigation without a completion marker, count, or full position evidence still rejects an incomplete list. A declared count can permit the result; this is not evidence that the original school POST form is supported.
