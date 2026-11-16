# 범용 섹션 분석 캐시: 확장 쪽과 서버 쪽

> Topic: generic-section-analysis-cache
> Status: Current
> Current: [CF-467 범용 섹션 분석 캐시: 확장 쪽과 서버 쪽](../../raw/issues/CF-467/documents/generic-section-answer-cache.md)
> History: [CF-244 섹션 분석 캐시](../../raw/issues/CF-244/documents/generic-section-analysis-cache.md), [CF-467 범용 섹션 분석 캐시: 확장 쪽과 서버 쪽](../../raw/issues/CF-467/documents/generic-section-answer-cache.md)
> Updated: 2026-11-17

## 현재 상태

범용 섹션 분석에는 캐시가 둘 있다.

| | 확장 쪽(CF-244) | 서버 쪽(CF-467) |
|---|---|---|
| 사는 범위 | 한 실행, 한 URL | 백엔드 프로세스(배포나 재시작까지), 기한 7일, 섹션 5,000개 |
| 키 | 섹션 지문, 제목, 상위 제목, 반복 여부, 칸별 visibility/disabled/readonly/inert | 공급자에 보내는 내용의 SHA-256(모델 이름, 섹션 상태, 선택 기준) |
| 나눠 쓰는 대상 | 같은 사용자의 같은 실행 | 모든 사용자, 모든 사이트 |
| 줄이는 것 | 서버 요청 | 공급자 호출 |
| 저장하는 것 | 서버 응답(분류와 매칭 결과) | 공급자의 답(질문 번호별 선택과 확신도) |

확장 쪽은 실행 객체별 WeakMap과 URL로 수명을 제한하며, 같은 키는 한 실행 안에서도 대표 하나만 요청한다. 분류·매칭 호출 실패와 reason이 있는 칸 응답은 저장하지 않는다. 요청에는 프로필 값이나 항목 개수를 추가하지 않는다.

서버 쪽은 `SectionAnswerCache`가 맡는다. `ChoiceFieldResolver.resolveSection`이 공급자를 부르기 전에 찾고, 모든 질문에 답을 받았을 때만 넣는다. 판단 보류는 넣고, 공급자 실패, 허가 대기 초과, 토큰 한도로 답이 빠진 섹션은 넣지 않는다. host, 경로, `snapshotId`, `candidateId`, 섹션 id, DOM의 id와 name은 키에 없다. 답을 칸에 붙이는 일과 후처리는 요청마다 한다. 찾기(`getIfPresent`)와 넣기(`put`)를 따로 해서 같은 섹션이 처음에 동시에 오면 각자 공급자를 부른다. Spring이 만드는 운영 분석기에만 붙고 평가용 사본(`withModel`, `withBatching`)에는 붙지 않는다.

저장 위치는 백엔드 프로세스 안의 Caffeine이다. 운영 서버가 한 대라서 서버 사이에 나눌 것이 없어 Redis를 쓰지 않는다. Redis는 새 컨테이너, 접속 설정, 장애와 지연 처리, 키 버전 관리, 배포 구성 변경을 치른다. 캐시가 사라져도 다시 분석하면 되고, 배포로 비워지는 것이 옛 코드와 옛 프롬프트의 답을 지운다. MongoDB도 같은 이유로 쓰지 않는다.

설정은 `career-form.analysis.jev.section-cache`의 `enabled`(true), `max-sections`(5000), `ttl`(7d)이고 배포 구성은 환경 변수를 전달하지 않는다. 지표는 카운터 `career.form.analysis.section.cache`의 `outcome`=`hit`|`miss`다. 응답 형식은 그대로다.

평가 데이터셋 `generic-matching` v5의 칸 분석 요청 4개를 순서대로 넣은 테스트에서 질문이 있는 섹션 31개 가운데 13개가 적중했고 공급자 호출이 47회에서 29회로 줄었다.

한계: 배포할 때마다 처음부터 쌓는다. 글자는 그대로인데 칸의 뜻만 바뀌는 변화는 키가 잡지 못하고 기한이 그 영향을 묶는다. 공급자의 답이 흔들린 경우 처음 저장된 답이 기한까지 모든 사이트에 쓰인다. 서버가 두 대 이상이 되거나 배포 뒤 적중률이 떨어지는 것이 지표로 확인되면 서버 밖 저장(MongoDB, Redis)을 검토한다.

결정의 이유와 버린 대안은 [ADR](../../raw/issues/CF-467/documents/adr/467-generic-section-answer-cache.md)에 있다.

## 변경 이유

CF-244는 검토나 재분석 진입 때 페이지 전체를 다시 보내지 않으면서 구조 또는 칸 상태가 바뀐 섹션은 다시 분석하려고 확장 쪽 캐시를 두었다. CF-467은 같은 양식을 여는 사용자들이 같은 내용을 공급자에 보내고 같은 답을 받는데도 매번 공급자를 불러 호출 비용과 대기 시간이 들던 것을 줄이려고 서버 쪽 캐시를 더했다.
