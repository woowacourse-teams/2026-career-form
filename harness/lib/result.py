from dataclasses import dataclass


@dataclass(frozen=True)
class ValidationResult:
    errors: tuple[str, ...] = ()

    @property
    def is_valid(self) -> bool:
        return not self.errors


def merge_results(*results: ValidationResult) -> ValidationResult:
    return ValidationResult(
        errors=tuple(error for result in results for error in result.errors)
    )
