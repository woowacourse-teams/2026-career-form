import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class SharedFilesCliTest(unittest.TestCase):
    def check_pr(self, payload: dict) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = root / "paths.txt"
            event = root / "pr.json"
            paths.write_text("harness/scripts/verify.py\n", encoding="utf-8")
            event.write_text(json.dumps(payload), encoding="utf-8")
            gh = root / "gh"
            gh.write_text(
                '#!/bin/sh\nprintf \'%s\' \'{"labels":[{"name":"harness-change"}]}\'\n',
                encoding="utf-8",
            )
            gh.chmod(0o755)
            return subprocess.run(
                [sys.executable, str(ROOT / "harness/scripts/validate-shared-files.py"),
                 str(paths), str(event)],
                env={**os.environ, "PATH": directory}, capture_output=True, text=True,
            )

    def test_system_pr_accepts_actual_nested_branch_metadata(self) -> None:
        result = self.check_pr({"pull_request": {
            "body": "", "labels": [],
            "head": {"ref": "release/1.2.0"}, "base": {"ref": "main"},
        }})
        self.assertEqual(0, result.returncode, result.stderr)

    def test_work_pr_keeps_linked_issue_lookup(self) -> None:
        result = self.check_pr({
            "body": "Closes #197", "labels": [{"name": "harness-change"}],
            "head": {"ref": "CF-197"}, "base": {"ref": "release/1.2.0"},
        })
        self.assertEqual(0, result.returncode, result.stderr)

    def test_missing_and_invalid_metadata_fail_closed(self) -> None:
        for head, base in (
            (None, None), ({"ref": "release/1.2.0"}, None),
            ({"ref": 1}, {"ref": "main"}), ({"ref": "release/fake"}, {"ref": "main"}),
        ):
            with self.subTest(head=head, base=base):
                result = self.check_pr({
                    "body": "Closes #197", "labels": [{"name": "harness-change"}],
                    "head": head, "base": base,
                })
                self.assertNotEqual(0, result.returncode)
