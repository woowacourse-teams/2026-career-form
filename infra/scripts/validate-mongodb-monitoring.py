#!/usr/bin/env python3
import ipaddress
import os
import re
import sys


def validate_environment(environment):
    errors = []
    if environment.get("HOST_INSTANCE") != "career-db":
        errors.append("HOST_INSTANCE은 공용 DB의 논리 식별자 career-db여야 합니다")
    identifiers = [environment.get(f"MONGODB_{name}_DATABASE", "") for name in ("DEV", "STAGING", "PROD")]
    if any(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", value) is None for value in identifiers):
        errors.append("환경별 DB 이름은 영문, 숫자, 밑줄로 구성된 1-63자 식별자여야 합니다")
    if len(set(identifiers)) != 3:
        errors.append("dev, staging, prod 데이터베이스 이름은 서로 달라야 합니다")
    try:
        address = ipaddress.IPv4Address(environment.get("MONITORING_PRIVATE_IP", ""))
        if not address.is_private or address.is_link_local or address.is_unspecified:
            errors.append("MONITORING_PRIVATE_IP는 내부 IPv4 주소여야 합니다")
    except ValueError:
        errors.append("MONITORING_PRIVATE_IP는 IPv4 주소여야 합니다")
    return errors


def main():
    errors = validate_environment(os.environ)
    for error in errors:
        print(error, file=sys.stderr)
    if not errors:
        print("MongoDB 모니터링 환경 매핑이 정상입니다")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
