"""시험 데이터 표지. 생성, 등록, 안전장치, 정리가 모두 이 값을 쓴다."""

ENDPOINT_MARKER = "/fcm/send/loadtest-"
TEST_ENDPOINT_PATTERN = r"^http://[^/?#]+/fcm/send/loadtest-"
TEST_LINK_PREFIX = "https://loadtest.invalid/"
TEST_LINK_PATTERN = r"^https://loadtest\.invalid/"
