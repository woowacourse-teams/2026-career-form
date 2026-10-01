from dataclasses import dataclass


@dataclass(frozen=True)
class AccessDiagnosis:
    code: str
    message: str
    resolutions: tuple[str, ...] = ()


def diagnose_project_access(
    gh_available: bool,
    auth_exit_code: int | None,
    project_exit_code: int | None,
    project_error: str,
) -> AccessDiagnosis:
    if not gh_available:
        return AccessDiagnosis(
            code="gh_missing",
            message="GitHub CLI가 설치되어 있지 않습니다.",
            resolutions=("https://cli.github.com/",),
        )
    if auth_exit_code != 0:
        return AccessDiagnosis(
            code="unauthenticated",
            message="GitHub CLI 인증이 필요합니다.",
            resolutions=("gh auth login",),
        )
    if project_exit_code == 0:
        return AccessDiagnosis(
            code="ready",
            message="GitHub Project에 접근할 수 있습니다.",
        )

    normalized_error = project_error.lower()
    if "project" in normalized_error and "scope" in normalized_error:
        return AccessDiagnosis(
            code="project_scope_missing",
            message="GitHub CLI 인증에 Project scope가 필요합니다.",
            resolutions=("gh auth refresh -s project",),
        )
    return AccessDiagnosis(
        code="project_unavailable",
        message="설정된 GitHub Project에 접근할 수 없습니다.",
    )
