# 범용 매칭 모델 평가
> Topic: generic-matching-model-evaluation
> Status: Current
> Current: [CF-356 범용 매칭 모델 평가](../../raw/issues/CF-356/documents/generic-matching-model-evaluation.md)
> History: [CF-356 범용 매칭 모델 평가](../../raw/issues/CF-356/documents/generic-matching-model-evaluation.md)
> Updated: 2026-11-05
## 현재 상태
범용 자동기입의 모델 정확도와 처리 성능은 사람이 검토한 비식별 화면으로 만든 버전 고정 데이터셋(저장소 파일, sha256)으로 잰다. 개발 서버의 비동기 실행 API가 제품 서비스를 그대로 호출한다. 결정 근거는 [CF-356 ADR](../../raw/issues/CF-356/documents/adr/356-versioned-model-evaluation.md)이다.
대표 점수는 정밀도를 채움률보다 2배 중시한 F0.5이고, 전체(자동기입 점수)·준비·매핑을 같은 식으로 낸다. 칸 매핑은 제품과 같은 확신도 0.8 이상만 답으로 본다. 잘못 답하면 사용자가 찾아 고쳐야 하지만 놓친 것은 직접 입력하면 되기 때문이다. 항목 단위 정확도(`item-weighted-exact-v2`)는 깎인 이유를 보는 진단 지표이고, 단계는 호출이 일어난 단계로 센다. 자동기입 1번은 같은 반복·같은 사이트에서 준비만 있는 처음 화면의 호출과 칸 매핑이 있는 화면 하나의 호출을 합친 것이다.
정답은 칸 의미 기준이며 병역·보훈·장애도 포함한다. 요청은 제품 코드가 fixture에서 만들고 손으로 쓰지 않는다. 시간, 처리량, 토큰, 비용의 측정 범위와 프롬프트 버전 해시, 실행 운영 규칙은 [CF-356 근거](../../raw/issues/CF-356/documents/generic-matching-model-evaluation.md)를 따른다.
현재 데이터셋은 `catalog.json`의 현재 버전 generic-matching v4다. 우아한형제들 화면 4개와 NHN Careers 지원서 최초 화면 1개, 합성 프로필 1개다. 공고나 화면을 더할 때는 `catalog.json`과 새 버전 폴더만 고친다. 기준 측정(반복 3회, 2026-11-03)은 자동기입 점수 JEV 86.0%, GPT-6-luna 84.4%이고, 공고 하나의 합성 프로필 기준이라 일반 성능의 근거는 아니다.
프롬프트·모델·설정이 같아도 실행마다 점수가 몇 %p 움직이므로(관측 4.7%p) 전후 비교는 둘 다 반복 3회 이상으로 하고, 반복 1회이거나 범위가 겹치면 구분 불가로 표시한다.
로컬은 `scripts/evaluation_local.py`로 고칠 때마다 재고, 개발서버는 AI 호출 없이 계산한 평가 입력(동작 지문, 프롬프트, 설정, 공급자 연결 코드, 데이터셋)이 바뀐 배포에서만 자동 평가를 돌린다. 공급자가 같은 이름으로 바꾼 모델과 속도만 바뀐 변경은 직접 돌린다. 기록 삭제는 로컬에서만 켠다.
이 평가는 모델 응답의 정확도와 성능만 잰다. [오프라인 기입 정확도](offline-write-accuracy.md)나 [실사이트 평가 기준선](generic-autofill-evaluation-baselines.md)과 분모가 다르므로 합산하거나 직접 비교하지 않는다.
## 변경 이유
실사이트 반복 측정은 공고 마감과 화면 변경 때문에 같은 입력으로 다시 잴 수 없고, 모델·프롬프트·배치 설정을 같은 분모로 비교할 방법이 없었다.
