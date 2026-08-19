VALID_VERIFICATION_RECORD = """<details>
<summary>검증 기록</summary>

### 자동 검증
- 전체 검증 통과

### 수동 검증
- 실제 제출은 사람이 확인한다

</details>"""


VALID_PR_BODY = f"""## 무엇이 바뀌었나요?
- 삼성 채용 사이트 자동 입력이 추가됐다

## 왜 바꿨나요?
- 반복 입력 비용을 줄인다

## 어떻게 바꿨나요?
- 삼성 Adapter를 추가했다

## 기존 기능에 미치는 영향
- 기존 Adapter 동작은 유지한다

## 검토한 대안과 선택 이유
- 범용 매처보다 회사별 Adapter가 안전하다

## 리뷰 포인트
- Adapter 필드 매핑

{VALID_VERIFICATION_RECORD}

Closes #123
"""
