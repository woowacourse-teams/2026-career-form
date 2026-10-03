#!/usr/bin/env python3
"""Keep release refs until deployment and development synchronization complete."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path


RELEASE_PATTERN = re.compile(r"release/(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
SHA_PATTERN = re.compile(r"[0-9a-f]{40}")


class SyncError(ValueError):
    pass


def git(*arguments: str) -> str:
    result = subprocess.run(
        ["git", *arguments], text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise SyncError(result.stderr.strip() or "Git 명령이 실패했습니다")
    return result.stdout.strip()


def validate_release(branch: str, sha: str) -> None:
    if not RELEASE_PATTERN.fullmatch(branch):
        raise SyncError("release 브랜치 형식이 올바르지 않습니다")
    if not SHA_PATTERN.fullmatch(sha):
        raise SyncError("release SHA 형식이 올바르지 않습니다")


def remote_sha(branch: str) -> str:
    ref = f"refs/heads/{branch}"
    output = git("ls-remote", "--heads", "origin", ref)
    for line in output.splitlines():
        sha, name = line.split()
        if name == ref:
            return sha
    return ""


def verify_head(branch: str, expected: str) -> str:
    current = remote_sha(branch)
    if current and current != expected:
        raise SyncError("release SHA가 확인한 커밋과 다릅니다. 변경을 확인하고 수동 복구하세요")
    return current


def delete_release(branch: str, expected: str) -> None:
    if not verify_head(branch, expected):
        return
    ref = f"refs/heads/{branch}"
    # The server rejects deletion if the ref moved after our last read.
    git("push", f"--force-with-lease={ref}:{expected}", "origin", f":{ref}")


def prepare() -> str:
    if os.environ.get("DEPLOY_RESULT") != "success":
        raise SyncError("배포 성공 확인 없이 release를 정리할 수 없습니다")
    branch = os.environ.get("RELEASE_BRANCH", "")
    expected = os.environ.get("RELEASE_SHA", "")
    validate_release(branch, expected)
    current = verify_head(branch, expected)
    git("fetch", "--no-tags", "origin", "+refs/heads/develop:refs/remotes/origin/develop")
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", expected, "refs/remotes/origin/develop"],
        text=True, capture_output=True, check=False,
    )
    if result.returncode == 0:
        delete_release(branch, expected)
        return "complete"
    if result.returncode != 1:
        raise SyncError(result.stderr.strip() or "develop 반영 여부를 확인할 수 없습니다")
    if not current:
        raise SyncError("release 브랜치가 없습니다. 자동 삭제 설정과 원래 SHA를 확인해 수동 복구하세요")
    return "pr"


def cleanup() -> str:
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    pull_request = event.get("pull_request") or {}
    head = pull_request.get("head") or {}
    branch = head.get("ref", "")
    if not (
        event.get("action") == "closed"
        and pull_request.get("merged") is True
        and (pull_request.get("base") or {}).get("ref") == "develop"
        and (head.get("repo") or {}).get("full_name") == os.environ["GITHUB_REPOSITORY"]
        and branch.startswith("release/")
    ):
        return "skipped"
    expected = head.get("sha", "")
    validate_release(branch, expected)
    delete_release(branch, expected)
    return "complete"


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in ("prepare", "cleanup"):
        print("사용법: release-sync.py prepare|cleanup", file=sys.stderr)
        return 2
    try:
        print(prepare() if sys.argv[1] == "prepare" else cleanup())
    except (SyncError, OSError, KeyError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
