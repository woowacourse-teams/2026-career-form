# 범용 자격증명 검색 합성 fixture

이 디렉터리는 설치 확장의 브라우저 smoke를 위한 **로컬 합성 화면**입니다. 외부
네트워크, 실제 지원서, 계정, 저장·제출·페이지 이동을 사용하지 않습니다.

기존 전체 공개 예시 프로필인
[`../profile-export.example.json`](../profile-export.example.json)을 가져옵니다. 이 파일의
자격증 3개(`SQLD(SQL개발자)`, `정보처리기사`, `정보처리산업기사`)만 검색 결과로
사용하며, 이 fixture는 새 프로필 값을 만들지 않습니다. 이름은 원본 exact 검색으로
제시되고, 프로필의 명시 등급은 같은 행의 비동기 native select에만 드러납니다. suffix
grade 분리 검색형은 확장의 로컬 ReviewPlan 계약을 검토하기 위한 경계이며, 이 fixture의
원본 exact 결과가 실제 사이트 검색 규칙을 주장하지 않습니다.

검색 iframe은 `GET ./search.html?targetCode=…&query=…`의 native form입니다. 결과 목록의
`data-search-query`, `data-result-count`, `data-total-count`, `data-search-complete="true"`,
그리고 각 후보의 `data-code`/`data-code-target`은 **합성 completion evidence**입니다.
이 마커는 실제 채용 사이트의 query-응답 연계, 전체 결과 완결성, 또는 자동 기입 지원의
근거가 아닙니다.

결과를 선택하면 같은 반복 행의 readonly 이름과 hidden 관계 코드가 먼저 갱신됩니다.
그 뒤 80ms 후 같은 행의 grade select와 issuer/date 텍스트 입력이 나타납니다. issuer와
취득일은 새 분석·새 승인 전에는 채우지 않는 smoke 경계입니다. 반복 행은 명시 marker와
`data-max-items="5"`를 사용하며, 1개에서 최대 5개까지만 추가됩니다.

로컬 제공:

```sh
cd frontend/fixtures
python3 -m http.server 8766
```

브라우저에서 <http://localhost:8766/generic-certificate/>를 열고, 확장 프로필 UI에서
기존 `profile-export.example.json`을 가져온 뒤 사람이 자동 기입을 시작합니다. 이 README는
실행 성공이나 실제 사이트 지원을 기록하지 않습니다.
