import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256


class RevisionError(ValueError):
    pass


@dataclass(frozen=True)
class BuildMetadata:
    revision: str | None
    source_state: str

    def render(self) -> dict[str, object]:
        return {
            "schema_version": "1.0",
            "revision": self.revision,
            "source_state": self.source_state,
        }

    def digest(self) -> str:
        encoded = json.dumps(self.render(), separators=(",", ":")) + "\n"
        return sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class RevisionEvidence:
    method: str
    metadata: BuildMetadata | None
    metadata_sha256: str | None
    unverified_reason: str | None

    @classmethod
    def parse(cls, payload: object, source: str) -> "RevisionEvidence":
        if not isinstance(payload, Mapping) or set(payload) != {
            "method", "metadata", "metadata_sha256", "unverified_reason",
        }:
            raise RevisionError("revision_evidence 키가 올바르지 않습니다")
        method = payload["method"]
        reason = payload["unverified_reason"]
        if method == "UNAVAILABLE":
            if payload["metadata"] is not None or payload["metadata_sha256"] is not None:
                raise RevisionError("UNAVAILABLE에는 metadata를 기록할 수 없습니다")
            if reason not in (
                "METADATA_MISSING", "METADATA_INVALID", "INSTALLATION_UNAVAILABLE",
            ):
                raise RevisionError("미확인 사유가 필요합니다")
            return cls(method, None, None, reason)
        expected_method = {
            "LIVE_SITE": "INSTALLED_BUILD_METADATA",
            "FIXTURE": "FIXTURE_SOURCE_METADATA",
        }.get(source)
        if expected_method is None or method != expected_method:
            raise RevisionError("source와 revision 확인 방법이 일치해야 합니다")
        raw = payload["metadata"]
        if not isinstance(raw, Mapping) or set(raw) != {
            "schema_version", "revision", "source_state",
        }:
            raise RevisionError("build metadata 키가 올바르지 않습니다")
        revision, state = raw["revision"], raw["source_state"]
        if raw["schema_version"] != "1.0" or state not in ("CLEAN", "DIRTY", "UNKNOWN"):
            raise RevisionError("build metadata version 또는 source_state가 올바르지 않습니다")
        if revision is not None and (
            not isinstance(revision, str) or re.fullmatch(r"[a-f0-9]{40}", revision) is None
        ):
            raise RevisionError("revision은 전체 commit SHA여야 합니다")
        if state in ("CLEAN", "DIRTY") and revision is None:
            raise RevisionError("확인한 소스에는 revision이 필요합니다")
        metadata = BuildMetadata(revision, state)
        digest = payload["metadata_sha256"]
        if digest != metadata.digest():
            raise RevisionError("metadata_sha256이 build metadata와 다릅니다")
        expected_reason = {"CLEAN": None, "DIRTY": "DIRTY_SOURCE", "UNKNOWN": "UNKNOWN_SOURCE"}[state]
        if reason != expected_reason:
            raise RevisionError("source_state와 미확인 사유가 일치해야 합니다")
        return cls(method, metadata, digest, reason)

    def validate_claim(self, revision: object, status: object) -> None:
        verified = self.metadata is not None and self.metadata.source_state == "CLEAN"
        expected_revision = self.metadata.revision if verified else "UNVERIFIED"
        expected_status = "VERIFIED" if verified else "UNVERIFIED"
        if revision != expected_revision or status != expected_status:
            raise RevisionError("revision과 검증 상태가 설치본 근거와 다릅니다")

    def render(self) -> dict[str, object]:
        return {
            "method": self.method,
            "metadata": self.metadata.render() if self.metadata else None,
            "metadata_sha256": self.metadata_sha256,
            "unverified_reason": self.unverified_reason,
        }
