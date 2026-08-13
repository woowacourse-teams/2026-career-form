#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RULES = ROOT / ".codex" / "rules" / "command-policy.rules"


def check(command: tuple[str, ...]) -> dict[str, object]:
    completed = subprocess.run(
        ("codex", "execpolicy", "check", "--rules", str(RULES), *command),
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "execpolicy 실행 실패")
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise ValueError("execpolicy 결과가 객체가 아닙니다")
    return value


def main() -> int:
    try:
        forbidden = check(("gh", "pr", "merge", "1"))
        allowed = check(("gh", "pr", "create", "--draft"))
    except (FileNotFoundError, RuntimeError, json.JSONDecodeError, ValueError) as error:
        print(f"execpolicy를 검증할 수 없습니다: {error}")
        return 1

    if forbidden.get("decision") != "forbidden":
        print("PR 머지 명령이 forbidden으로 판정되지 않았습니다")
        return 1
    if allowed.get("decision") == "forbidden":
        print("Draft PR 생성 명령이 잘못 차단되었습니다")
        return 1

    print("execpolicy 검증을 통과했습니다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
