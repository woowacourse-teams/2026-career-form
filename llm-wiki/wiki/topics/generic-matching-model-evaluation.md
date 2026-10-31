# 범용 매칭 모델 평가
> Topic: generic-matching-model-evaluation
> Status: Current
> Current: [CF-356 범용 매칭 모델 평가](../../raw/issues/CF-356/documents/generic-matching-model-evaluation.md)
> History: [CF-356 범용 매칭 모델 평가](../../raw/issues/CF-356/documents/generic-matching-model-evaluation.md)
> Updated: 2026-10-30
## 현재 상태
범용 자동기입의 모델 정확도와 처리 성능은 사람이 검토한 비식별 화면으로 만든 버전 고정 데이터셋(저장소 파일, sha256)으로 잰다. 개발 서버의 비동기 실행 API가 제품 서비스를 그대로 호출한다. 결정 근거는 [CF-356 ADR](../../raw/issues/CF-356/documents/adr/356-versioned-model-evaluation.md)이다.
채점 단위는 제품 API 호출 1건이고, 호출 점수는 맞힌 항목 ÷ 정답 항목(매핑 불가·기권 포함)이며 부분 점수는 없다. 단계는 호출이 일어난 단계로 센다. 준비 단계에서는 버튼·선택지 대응과 섹션 범주만 채점하고, 행 추가 횟수·순서와 실제 값 선택은 프론트엔드 책임이라 채점하지 않는다. 학력 행 종류 정답은 프로필과 무관한 학력 단계별 선택지 대응표다.
정답은 칸 의미 기준이며 병역·보훈·장애도 포함한다. 요청은 제품 코드가 fixture에서 만들고 손으로 쓰지 않는다. 시간, 처리량, 토큰, 비용의 측정 범위와 프롬프트 버전 해시, 실행 운영 규칙은 [CF-356 근거](../../raw/issues/CF-356/documents/generic-matching-model-evaluation.md)를 따른다.
첫 데이터셋 generic-matching v1은 우아한형제들 공고 1개의 화면 상태 3개다. 아직 실제 평가 수치는 없다.
이 평가는 모델 응답의 정확도와 성능만 잰다. [오프라인 기입 정확도](offline-write-accuracy.md)나 [실사이트 평가 기준선](generic-autofill-evaluation-baselines.md)과 분모가 다르므로 합산하거나 직접 비교하지 않는다.
## 변경 이유
실사이트 반복 측정은 공고 마감과 화면 변경 때문에 같은 입력으로 다시 잴 수 없고, 모델·프롬프트·배치 설정을 같은 분모로 비교할 방법이 없었다.
