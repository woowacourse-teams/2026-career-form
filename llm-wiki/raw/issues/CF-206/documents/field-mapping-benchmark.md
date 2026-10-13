# 필드 매핑 공급자 벤치마크

범용 fields 분석 공급자(OpenAI, Jev)는 `harness/fixtures/field-mapping-benchmark`의 고정 입력과 칸별 정답으로 비교한다.

## 계약

- 입력은 네 사이트(네이버, LG AI연구원, 안랩, 크래프톤) fields 분석 요청의 비식별 사본이다.
- 정답 라벨은 후보마다 `DIRECT:<프로필 키>`, `DERIVED:<recipe>`, `NO_MATCH` 중 하나와 `CONFIRMED` 또는 `NEEDS_REVIEW` 검수 상태를 가진다. 파일 전체의 `label_status`는 `DRAFT` 또는 `CONFIRMED`다.
- 결과 파일 계약은 `1.0`이다. 모든 라벨 사이트와 후보를 포함해야 하며 결과는 `NO_MATCH`, `ERROR` 또는 `<binding 종류>:<값>` 형식이다.
- 지표: 정확도 = 맞은 매핑 / 매핑한 후보, 재현율 = 맞은 매핑 / 기대값이 매핑인 후보, `wrong_rate` = 틀린 매핑 / 전체 후보. 기대값이 `NO_MATCH`인 후보에 매핑하면 틀린 매핑이다.
- 응답이 `LLM_UNAVAILABLE`이거나 차단이면 해당 요청의 모든 후보를 `ERROR`로 기록하고 매핑으로 세지 않는다.

## 비식별 규칙

host와 path, snapshotId, section·item·candidate ID, DOM id와 name은 별칭으로 바꾼다. 라벨, placeholder, 선택지 문구는 매핑 근거라서 유지한다. 원래 ID와 별칭의 대응표는 저장소 밖에 보관한다. 지원자 입력값, URL, selector, 계정과 세션 정보는 포함하지 않는다.

## Jev 판단 수집

Jev의 칸별 판단(기준 적용 전 1순위, confidence, 확률 분포)은 분석 API 응답에 없고 백엔드 `JevClient`의 `[JEV]` INFO 로그에만 있다. 로그 구간에 다른 호출이 섞일 수 있으므로 requestId로 묶어 질문 ID가 모두 `field_`인 요청 하나만 사용한다. `field_N`은 요청의 후보 순회 순서(섹션의 fields, 이어서 items의 fields)를 따른다.

## 초안 라벨 기준 결과 (2026-10-13)

221개 후보 중 78개가 검수 필요인 초안 라벨 기준이다. 라벨 확정 전이므로 공급자 우열의 결론으로 쓰지 않는다.

| 공급자 | 매핑 | 맞음 | 틀림 | 정확도 | 재현율 |
| --- | --- | --- | --- | --- | --- |
| OpenAI | 85 | 60 | 25 | 0.71 | 0.51 |
| Jev, 기준 0.8 | 41 | 32 | 9 | 0.78 | 0.27 |

두 공급자가 함께 틀린 유형은 추천인 연락처를 본인 전화로, 전화 국가번호를 국적으로, 경력 블록의 담당 역할을 프로젝트 역할로 매핑한 경우다. Jev 결과는 질문 묶음 전송과 확률 합 허용 오차를 바꾼 미병합 실험 백엔드로 수집했다.
