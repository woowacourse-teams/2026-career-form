import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from harness.lib.cli import (
    current_branch,
    labels_from_payload,
    nested_payload,
    print_result,
    read_json,
)
from harness.lib.result import ValidationResult


class CliTest(unittest.TestCase):
    def test_reads_json_object(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory) / "payload.json"
            payload.write_text(
                json.dumps({"body": "내용"}, ensure_ascii=False), encoding="utf-8"
            )

            result = read_json(payload)

        self.assertEqual("내용", result["body"])

    def test_rejects_non_object_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory) / "payload.json"
            payload.write_text(json.dumps([]), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "객체여야 합니다"):
                read_json(payload)

    def test_extracts_nested_payload(self) -> None:
        issue = {"body": "내용"}

        result = nested_payload({"issue": issue}, "issue")

        self.assertEqual(issue, result)

    def test_extracts_pull_request_labels(self) -> None:
        result = labels_from_payload(
            {
                "pull_request": {
                    "labels": [
                        {"name": "harness-change"},
                        {"name": "status:review"},
                    ]
                }
            }
        )

        self.assertEqual(("harness-change", "status:review"), result)

    def test_prints_validation_errors(self) -> None:
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr):
            status = print_result(ValidationResult(("계약 위반",)))

        self.assertEqual(1, status)
        self.assertIn("오류: 계약 위반", stderr.getvalue())

    def test_print_result_accepts_valid_result(self) -> None:
        self.assertEqual(0, print_result(ValidationResult()))

    @patch("harness.lib.cli.subprocess.run")
    def test_current_branch_rejects_git_failure(self, run) -> None:
        run.return_value.returncode = 128
        run.return_value.stdout = ""
        run.return_value.stderr = "저장소가 아님"

        with self.assertRaisesRegex(RuntimeError, "현재 브랜치를 확인할 수 없습니다"):
            current_branch()


if __name__ == "__main__":
    unittest.main()
