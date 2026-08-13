import subprocess
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class EnvironmentSetupCode(Enum):
    ENTRYPOINT_MISSING = "entrypoint_missing"
    READY = "ready"
    BOOTSTRAP_FAILED = "bootstrap_failed"
    VERIFICATION_FAILED = "verification_failed"
    CONFIGURED = "configured"


@dataclass(frozen=True)
class EnvironmentSetupResult:
    status: EnvironmentSetupCode
    message: str

    @property
    def code(self) -> str:
        return self.status.value

    @property
    def is_ready(self) -> bool:
        return self.status in (
            EnvironmentSetupCode.READY,
            EnvironmentSetupCode.CONFIGURED,
        )


@dataclass(frozen=True)
class CommandRunResult:
    returncode: int
    error: str | None = None


def ensure_environment(root: Path) -> EnvironmentSetupResult:
    scripts = root / "harness" / "scripts"
    doctor = scripts / "doctor.py"
    bootstrap = scripts / "bootstrap.py"
    missing = tuple(path for path in (doctor, bootstrap) if not path.is_file())
    if missing:
        names = ", ".join(path.name for path in missing)
        return EnvironmentSetupResult(
            status=EnvironmentSetupCode.ENTRYPOINT_MISSING,
            message=f"환경 구성 진입점을 찾을 수 없습니다: {names}",
        )

    if _run(doctor, root).returncode == 0:
        return EnvironmentSetupResult(
            status=EnvironmentSetupCode.READY,
            message="하네스 작업 환경이 이미 준비되어 있습니다",
        )
    bootstrap_result = _run(bootstrap, root)
    if bootstrap_result.returncode != 0:
        return EnvironmentSetupResult(
            status=EnvironmentSetupCode.BOOTSTRAP_FAILED,
            message=_failure_message(
                "하네스 작업 환경을 자동 구성하지 못했습니다",
                bootstrap,
                bootstrap_result,
            ),
        )
    verification_result = _run(doctor, root)
    if verification_result.returncode != 0:
        return EnvironmentSetupResult(
            status=EnvironmentSetupCode.VERIFICATION_FAILED,
            message=_failure_message(
                "자동 구성 뒤 하네스 작업 환경 검증에 실패했습니다",
                doctor,
                verification_result,
            ),
        )
    return EnvironmentSetupResult(
        status=EnvironmentSetupCode.CONFIGURED,
        message="하네스 작업 환경을 자동 구성했습니다",
    )


def _run(path: Path, root: Path) -> CommandRunResult:
    try:
        completed = subprocess.run((str(path),), cwd=root, check=False)
        return CommandRunResult(returncode=completed.returncode)
    except OSError as error:
        return CommandRunResult(returncode=1, error=str(error))


def _failure_message(
    summary: str,
    path: Path,
    result: CommandRunResult,
) -> str:
    detail = result.error or f"종료 코드 {result.returncode}"
    return f"{summary}: {path}: {detail}"
