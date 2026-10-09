import copy
import hashlib
import json
import unittest

from harness.lib.evaluation_revision import RevisionEvidence, RevisionError


def revision_evidence(source="LIVE_SITE", revision="a" * 40):
    metadata = {"schema_version": "1.0", "revision": revision, "source_state": "CLEAN"}
    encoded = json.dumps(metadata, separators=(",", ":")) + "\n"
    return {
        "method": (
            "INSTALLED_BUILD_METADATA" if source == "LIVE_SITE"
            else "FIXTURE_SOURCE_METADATA"
        ),
        "metadata": metadata,
        "metadata_sha256": hashlib.sha256(encoded.encode()).hexdigest(),
        "unverified_reason": None,
    }


def unavailable_evidence():
    return {
        "method": "UNAVAILABLE",
        "metadata": None,
        "metadata_sha256": None,
        "unverified_reason": "INSTALLATION_UNAVAILABLE",
    }


class RevisionEvidenceTest(unittest.TestCase):
    def test_accepts_installed_clean_metadata_and_matching_digest(self):
        evidence = revision_evidence()
        result = RevisionEvidence.parse(evidence, "LIVE_SITE")
        result.validate_claim("a" * 40, "VERIFIED")
        self.assertEqual(evidence, result.render())

    def test_rejects_forged_or_misidentified_proof(self):
        for change in (
            {"metadata_sha256": "0" * 64},
            {"method": "HEAD"},
            {"method": "FIXTURE_SOURCE_METADATA"},
            {"unverified_reason": "UNKNOWN_SOURCE"},
            {"path": "/private/path"},
        ):
            with self.subTest(change=change):
                evidence = revision_evidence() | change
                with self.assertRaises(RevisionError):
                    RevisionEvidence.parse(evidence, "LIVE_SITE")

    def test_rejects_malformed_metadata_even_with_matching_digest(self):
        for metadata in (
            {"schema_version": "1.0", "revision": "abc123", "source_state": "CLEAN"},
            {"schema_version": "9", "revision": "a" * 40, "source_state": "CLEAN"},
            {"schema_version": "1.0", "revision": None, "source_state": "CLEAN"},
            {"schema_version": "1.0", "revision": "a" * 40, "source_state": "PRIVATE"},
        ):
            with self.subTest(metadata=metadata):
                evidence = revision_evidence()
                evidence["metadata"] = metadata
                evidence["metadata_sha256"] = hashlib.sha256(
                    (json.dumps(metadata, separators=(",", ":")) + "\n").encode()
                ).hexdigest()
                with self.assertRaises(RevisionError):
                    RevisionEvidence.parse(evidence, "LIVE_SITE")

    def test_dirty_and_unknown_builds_cannot_be_verified(self):
        for state, reason, revision in (
            ("DIRTY", "DIRTY_SOURCE", "a" * 40),
            ("UNKNOWN", "UNKNOWN_SOURCE", None),
        ):
            with self.subTest(state=state):
                evidence = revision_evidence()
                evidence["metadata"].update(source_state=state, revision=revision)
                evidence["metadata_sha256"] = hashlib.sha256(
                    (json.dumps(evidence["metadata"], separators=(",", ":")) + "\n").encode()
                ).hexdigest()
                evidence["unverified_reason"] = reason
                result = RevisionEvidence.parse(evidence, "LIVE_SITE")
                result.validate_claim("UNVERIFIED", "UNVERIFIED")
                with self.assertRaises(RevisionError):
                    result.validate_claim("a" * 40, "VERIFIED")

    def test_unavailable_proof_requires_unverified_sentinel(self):
        result = RevisionEvidence.parse(unavailable_evidence(), "LIVE_SITE")
        result.validate_claim("UNVERIFIED", "UNVERIFIED")
        for revision, status in (("a" * 40, "VERIFIED"), ("a" * 40, "UNVERIFIED")):
            with self.subTest(status=status):
                with self.assertRaises(RevisionError):
                    result.validate_claim(revision, status)

    def test_claim_must_match_installed_revision(self):
        result = RevisionEvidence.parse(revision_evidence(), "LIVE_SITE")
        with self.assertRaises(RevisionError):
            result.validate_claim("b" * 40, "VERIFIED")

    def test_parsed_proof_does_not_retain_mutable_input(self):
        payload = revision_evidence()
        expected = copy.deepcopy(payload)
        parsed = RevisionEvidence.parse(payload, "LIVE_SITE")
        payload["metadata"]["revision"] = "b" * 40
        self.assertEqual(expected, parsed.render())
