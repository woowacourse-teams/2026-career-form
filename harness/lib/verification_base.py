import os
import subprocess
from collections.abc import Mapping
from pathlib import Path

from harness.lib.branching import is_hotfix_branch, is_release_branch, validate_branch_flow
from harness.lib.raw_immutability import LOCAL_GIT_ENVIRONMENT


class VerificationBaseError(ValueError):
    pass


def resolve_verification_base(
    root: Path,
    *,
    explicit: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> str:
    context = os.environ if environment is None else environment
    branch = _git(root, "symbolic-ref", "--quiet", "--short", "HEAD").stdout.strip()
    configured = (
        _git(root, "config", "--get", f"branch.{branch}.career-form-base").stdout.strip()
        if branch else ""
    )
    pr_base = context.get("GITHUB_BASE_REF", "")
    if context.get("GITHUB_EVENT_NAME") == "pull_request" and not pr_base:
        raise VerificationBaseError("PR base를 확인할 수 없습니다: GITHUB_BASE_REF가 필요합니다")
    push_base = context.get("GITHUB_REF_NAME", "")
    declared = tuple(value for value in (
        explicit, configured, f"origin/{pr_base}" if pr_base else None,
    ) if value)
    if len(set(declared)) > 1:
        raise VerificationBaseError("검증 기준 ref가 CLI, 브랜치 설정 또는 PR base와 충돌합니다")
    if declared:
        base = declared[0]
    elif context.get("GITHUB_EVENT_NAME") == "push" and push_base in ("develop", "main"):
        base = f"origin/{push_base}"
    elif branch in ("develop", "main"):
        base = f"origin/{branch}"
    elif is_hotfix_branch(branch):
        base = "origin/main"
    else:
        raise VerificationBaseError(
            "검증 기준 ref가 없습니다. --base-ref origin/<PR 기준 브랜치> 또는 "
            f"git config branch.{branch or '<작업 브랜치>'}.career-form-base "
            "origin/<PR 기준 브랜치>로 지정하세요"
        )
    return _validate_base(root, base, context.get("GITHUB_HEAD_REF", "") or branch)


def _validate_base(root: Path, base: str, head: str) -> str:
    target = base.removeprefix("origin/")
    if not base.startswith("origin/") or (
        target not in ("develop", "main") and not is_release_branch(target)
    ):
        raise VerificationBaseError(f"허용되지 않은 검증 기준 ref입니다: {base}")
    if head and (head, target) not in (("develop", "develop"), ("main", "main")):
        flow = validate_branch_flow(head, target)
        if not flow.is_valid:
            raise VerificationBaseError("; ".join(flow.errors))
    if _git(root, "rev-parse", "--verify", f"{base}^{{commit}}").returncode:
        raise VerificationBaseError(f"검증 기준 ref가 없습니다: {base}. 해당 브랜치를 fetch하세요")
    return base


def _git(root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = {
        key: value for key, value in os.environ.items() if key not in LOCAL_GIT_ENVIRONMENT
    }
    return subprocess.run(
        ("git", *arguments), cwd=root, env=environment,
        capture_output=True, text=True, check=False,
    )
