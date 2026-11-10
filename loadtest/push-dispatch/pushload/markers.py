"""시험 데이터 표지. 생성, 등록, 안전장치, 정리가 모두 이 값을 쓴다."""

import re

ENDPOINT_MARKER = "/fcm/send/loadtest-"
TEST_LINK_PREFIX = "https://loadtest.invalid/"
TEST_ENDPOINT_PATTERN = r"^http://[^/?#]+" + re.escape(ENDPOINT_MARKER)
TEST_LINK_PATTERN = "^" + re.escape(TEST_LINK_PREFIX)
