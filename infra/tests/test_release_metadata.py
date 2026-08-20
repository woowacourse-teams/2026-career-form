import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra" / "scripts" / "classify-main-merge.py"
MAIN_SHA = "a" * 40
RELEASE_SHA = "b" * 40
HOTFIX_SHA = "c" * 40


class MainMergeClassificationTest(unittest.TestCase):
    def test_classifies_release_merge(self) -> None:
        result = self._classify(
            self._event(),
            [self._pull_request("release/1.2.3", RELEASE_SHA)],
        )

        self.assertEqual(
            {
                "kind": "release",
                "head_ref": "release/1.2.3",
                "head_sha": RELEASE_SHA,
                "version": "1.2.3",
            },
            result,
        )

    def test_classifies_hotfix_squash_merge(self) -> None:
        result = self._classify(
            self._event(),
            [self._pull_request("hotfix/CF-19", HOTFIX_SHA)],
        )

        self.assertEqual(
            {
                "kind": "hotfix",
                "head_ref": "hotfix/CF-19",
                "head_sha": HOTFIX_SHA,
            },
            result,
        )

    def test_classifies_revert_merge_as_source_alignment(self) -> None:
        reverted_sha = "d" * 40
        result = self._classify(
            self._event(),
            [self._pull_request(f"revert/{reverted_sha}", "e" * 40)],
        )

        self.assertEqual(
            {
                "kind": "revert",
                "head_ref": f"revert/{reverted_sha}",
                "head_sha": "e" * 40,
            },
            result,
        )

    def test_rejects_non_main_push(self) -> None:
        completed = self._run(
            self._event(ref="refs/heads/develop"),
            [self._pull_request("release/1.2.3", RELEASE_SHA)],
        )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("main", completed.stderr)

    def test_rejects_unapproved_source_branch(self) -> None:
        completed = self._run(
            self._event(),
            [self._pull_request("CF-19", HOTFIX_SHA)],
        )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("release", completed.stderr)
        self.assertIn("hotfix", completed.stderr)

    def test_rejects_missing_or_ambiguous_matching_pull_request(self) -> None:
        for pulls in (
            [],
            [
                self._pull_request("release/1.2.3", RELEASE_SHA),
                self._pull_request("hotfix/CF-19", HOTFIX_SHA),
            ],
        ):
            with self.subTest(count=len(pulls)):
                completed = self._run(self._event(), pulls)

                self.assertNotEqual(0, completed.returncode)
                self.assertIn("exactly one", completed.stderr)

    def test_rejects_malformed_external_json(self) -> None:
        completed = self._run(
            self._event(),
            [{"merge_commit_sha": MAIN_SHA, "base": {"ref": "main"}}],
        )

        self.assertNotEqual(0, completed.returncode)
        self.assertIn("invalid", completed.stderr)

    def _classify(self, event: object, pulls: object) -> dict[str, str]:
        completed = self._run(event, pulls)
        self.assertEqual(0, completed.returncode, completed.stderr)
        value = json.loads(completed.stdout)
        self.assertIsInstance(value, dict)
        return value

    def _run(
        self, event: object, pulls: object
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            event_path = Path(directory) / "event.json"
            pulls_path = Path(directory) / "pulls.json"
            event_path.write_text(json.dumps(event), encoding="utf-8")
            pulls_path.write_text(json.dumps(pulls), encoding="utf-8")
            return subprocess.run(
                (
                    sys.executable,
                    str(SCRIPT),
                    str(event_path),
                    str(pulls_path),
                ),
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )

    def _event(self, *, ref: str = "refs/heads/main") -> dict[str, str]:
        return {"ref": ref, "after": MAIN_SHA}

    def _pull_request(self, head_ref: str, head_sha: str) -> dict[str, object]:
        return {
            "number": 101,
            "merged_at": "2026-08-17T00:00:00Z",
            "merge_commit_sha": MAIN_SHA,
            "base": {"ref": "main"},
            "head": {"ref": head_ref, "sha": head_sha},
        }


if __name__ == "__main__":
    unittest.main()
