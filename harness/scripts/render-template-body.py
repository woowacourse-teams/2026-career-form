#!/usr/bin/env python3
import json
import sys
import tempfile
from collections.abc import Mapping
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from harness.lib.template_body import render_issue_form, render_pr_template


def main() -> int:
    if len(sys.argv) not in (4, 5) or sys.argv[1] not in ("issue", "pr"):
        print(
            "사용법: render-template-body issue <form.yml> <answers.json> | "
            "render-template-body pr <template.md> <answers.json> <Issue 번호>",
            file=sys.stderr,
        )
        return 2
    try:
        answers = _read_answers(Path(sys.argv[3]))
        if sys.argv[1] == "issue" and len(sys.argv) == 4:
            body = render_issue_form(Path(sys.argv[2]), answers)
        elif sys.argv[1] == "pr" and len(sys.argv) == 5:
            body = render_pr_template(
                Path(sys.argv[2]).read_text(encoding="utf-8"),
                answers,
                issue_number=int(sys.argv[4]),
            )
        else:
            raise ValueError("명령 인자 수가 올바르지 않습니다")
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 2

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".md",
        prefix="cf-template-",
        delete=False,
    ) as output:
        output.write(body)
        print(output.name)
    return 0


def _read_answers(path: Path) -> Mapping[str, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"본문 응답을 읽을 수 없습니다: {error}") from error
    if not isinstance(value, Mapping) or any(
        not isinstance(key, str) or not isinstance(answer, str)
        for key, answer in value.items()
    ):
        raise ValueError("본문 응답은 문자열 키와 값으로 구성된 JSON 객체여야 합니다")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
