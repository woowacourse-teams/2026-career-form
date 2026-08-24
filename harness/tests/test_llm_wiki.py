import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from harness.lib.llm_wiki import validate_wiki


class LlmWikiTest(unittest.TestCase):
    def test_accepts_wiki_with_indexed_article_and_raw_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)

            result = validate_wiki(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_article_missing_from_index(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            (root / "llm-wiki" / "wiki" / "index.md").write_text(
                "# Knowledge Base Index\n", encoding="utf-8"
            )

            result = validate_wiki(root)

        self.assertIn(
            "색인에 없는 Wiki 문서가 있습니다: business/product-safety.md",
            result.errors,
        )

    def test_rejects_raw_link_outside_raw_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            article = root / "llm-wiki" / "wiki" / "business" / "product-safety.md"
            article.write_text(
                article.read_text(encoding="utf-8").replace(
                    "../../raw/business/product-concept.md", "../../wiki/index.md"
                ),
                encoding="utf-8",
            )

            result = validate_wiki(root)

        self.assertIn(
            "raw 밖을 가리키는 Wiki 근거 링크가 있습니다: business/product-safety.md",
            result.errors,
        )

    def test_rejects_empty_required_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            raw = root / "llm-wiki" / "raw" / "business" / "product-concept.md"
            raw.write_text(
                raw.read_text(encoding="utf-8").replace(
                    "> Source: docs/PRODUCT_CONCEPT.md",
                    "> Source: ",
                ),
                encoding="utf-8",
            )

            result = validate_wiki(root)

        self.assertIn(
            "raw 메타데이터 값이 비어 있습니다: business/product-concept.md: Source",
            result.errors,
        )

    def test_rejects_index_link_to_missing_article(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            index = root / "llm-wiki" / "wiki" / "index.md"
            index.write_text(
                index.read_text(encoding="utf-8")
                + "\n[없는 문서](topics/missing.md)\n",
                encoding="utf-8",
            )

            result = validate_wiki(root)

        self.assertIn("존재하지 않는 Wiki 색인 링크가 있습니다: topics/missing.md", result.errors)

    def test_accepts_issue_bundle_and_current_topic_page(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            self._write_issue_bundle(
                root,
                issue="CF-41",
                topic="product-safety",
                payload="documents/product-safety.md",
                supersedes="[legacy](../../business/product-concept.md)",
            )
            self._write_topic_page(
                root,
                status="Current",
                current=("../../raw/issues/CF-41/documents/product-safety.md",),
                history=(
                    "../../raw/business/product-concept.md",
                    "../../raw/issues/CF-41/documents/product-safety.md",
                ),
            )

            result = validate_wiki(root)

        self.assertTrue(result.is_valid, result.errors)

    def test_rejects_topic_page_without_issue_manifest_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            self._write_topic_page(
                root,
                status="Current",
                current=("../../raw/business/product-concept.md",),
                history=("../../raw/business/product-concept.md",),
            )

            result = validate_wiki(root)

        self.assertIn(
            "manifest 근거가 없는 topic Wiki 문서가 있습니다: product-safety",
            result.errors,
        )

    def test_rejects_manifest_payload_that_does_not_exist(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            self._write_issue_bundle(
                root,
                issue="CF-41",
                topic="product-safety",
                payload="documents/product-safety.md",
                supersedes="None",
            )
            payload = (
                root
                / "llm-wiki"
                / "raw"
                / "issues"
                / "CF-41"
                / "documents"
                / "product-safety.md"
            )
            payload.unlink()

            result = validate_wiki(root)

        self.assertIn("manifest payload가 없습니다", "\n".join(result.errors))

    def test_rejects_payload_link_to_missing_bundle_asset(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            self._write_issue_bundle(
                root,
                issue="CF-41",
                topic="product-safety",
                payload="documents/product-safety.md",
                supersedes="None",
            )
            payload = (
                root
                / "llm-wiki"
                / "raw"
                / "issues"
                / "CF-41"
                / "documents"
                / "product-safety.md"
            )
            payload.write_text("# 결정\n\n![도식](../assets/missing.png)\n", encoding="utf-8")

            result = validate_wiki(root)

        self.assertIn("payload 내부 링크가 없습니다: product-safety: ../assets/missing.png", result.errors)

    def test_requires_disputed_status_for_multiple_unsuperseded_heads(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            for issue in ("CF-41", "CF-42"):
                self._write_issue_bundle(
                    root,
                    issue=issue,
                    topic="product-safety",
                    payload=f"documents/{issue.lower()}.md",
                    supersedes="None",
                )
            self._write_topic_page(
                root,
                status="Current",
                current=("../../raw/issues/CF-42/documents/cf-42.md",),
                history=(
                    "../../raw/issues/CF-41/documents/cf-41.md",
                    "../../raw/issues/CF-42/documents/cf-42.md",
                ),
            )

            result = validate_wiki(root)

        self.assertIn(
            "최신 근거가 둘 이상이면 Disputed여야 합니다: product-safety",
            result.errors,
        )

    def test_rejects_supersedes_cycle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            self._write_issue_bundle(
                root,
                issue="CF-41",
                topic="product-safety",
                payload="documents/cf-41.md",
                supersedes="[CF-42](../CF-42/documents/cf-42.md)",
            )
            self._write_issue_bundle(
                root,
                issue="CF-42",
                topic="product-safety",
                payload="documents/cf-42.md",
                supersedes="[CF-41](../CF-41/documents/cf-41.md)",
            )

            result = validate_wiki(root)

        self.assertIn("Supersedes 순환이 있습니다: product-safety", result.errors)

    def test_rejects_change_to_raw_that_exists_on_base_ref(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            environment = self._clean_git_environment()
            for command in (
                ("git", "init", "-q", "-b", "develop"),
                ("git", "config", "user.name", "Harness Test"),
                ("git", "config", "user.email", "harness@example.com"),
                ("git", "add", "llm-wiki"),
                ("git", "commit", "-q", "-m", "baseline"),
                ("git", "switch", "-q", "-c", "CF-41"),
            ):
                subprocess.run(command, cwd=root, env=environment, check=True)
            raw = root / "llm-wiki" / "raw" / "business" / "product-concept.md"
            raw.write_text(raw.read_text(encoding="utf-8") + "변경\n", encoding="utf-8")

            result = validate_wiki(root, base_ref="develop")

        self.assertIn(
            "기준 브랜치에 존재하는 raw를 변경할 수 없습니다: "
            "llm-wiki/raw/business/product-concept.md",
            result.errors,
        )

    def test_accepts_unchanged_binary_raw_asset_from_base_ref(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self._write_valid_wiki(root)
            asset = root / "llm-wiki" / "raw" / "assets" / "diagram.png"
            asset.parent.mkdir(parents=True)
            asset.write_bytes(bytes((0x89, 0x50, 0x4E, 0x47, 0xFF, 0x00)))
            environment = self._clean_git_environment()
            for command in (
                ("git", "init", "-q", "-b", "develop"),
                ("git", "config", "user.name", "Harness Test"),
                ("git", "config", "user.email", "harness@example.com"),
                ("git", "add", "llm-wiki"),
                ("git", "commit", "-q", "-m", "baseline"),
                ("git", "switch", "-q", "-c", "CF-41"),
            ):
                subprocess.run(command, cwd=root, env=environment, check=True)

            result = validate_wiki(root, base_ref="develop")

        self.assertTrue(result.is_valid, result.errors)

    def _write_valid_wiki(self, root: Path) -> None:
        raw = root / "llm-wiki" / "raw" / "business" / "product-concept.md"
        raw.parent.mkdir(parents=True)
        raw.write_text(
            "# 제품 원칙\n\n"
            "> Source: docs/PRODUCT_CONCEPT.md\n"
            "> Collected: 2026-08-18\n"
            "> Published: Unknown\n\n"
            "사용자 확인을 거친 항목만 자동 입력하고 제출은 자동화하지 않는다.\n",
            encoding="utf-8",
        )
        wiki = root / "llm-wiki" / "wiki"
        article = wiki / "business" / "product-safety.md"
        article.parent.mkdir(parents=True)
        article.write_text(
            "# 제품 안전 원칙\n\n"
            "> Sources: 제품 기획 문서\n"
            "> Raw: [제품 원칙](../../raw/business/product-concept.md)\n"
            "> Updated: 2026-08-18\n\n"
            "## 개요\n\n사용자 승인과 제출 금지 원칙을 정리한다.\n",
            encoding="utf-8",
        )
        (wiki / "index.md").write_text(
            "# Knowledge Base Index\n\n"
            "## business\n\n"
            "| Article | Summary | Updated |\n"
            "| --- | --- | --- |\n"
            "| [제품 안전 원칙](business/product-safety.md) | 사용자 통제 | 2026-08-18 |\n",
            encoding="utf-8",
        )
        (wiki / "log.md").write_text("# Wiki Log\n", encoding="utf-8")

    def _clean_git_environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        for name in (
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_COMMON_DIR",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_PREFIX",
        ):
            environment.pop(name, None)
        return environment

    def _write_issue_bundle(
        self,
        root: Path,
        *,
        issue: str,
        topic: str,
        payload: str,
        supersedes: str,
    ) -> None:
        bundle = root / "llm-wiki" / "raw" / "issues" / issue
        document = bundle / payload
        document.parent.mkdir(parents=True, exist_ok=True)
        document.write_text(f"# {issue} 결정\n", encoding="utf-8")
        (bundle / "manifest.md").write_text(
            f"# {issue} Knowledge Bundle\n\n"
            f"> Issue: {issue}\n"
            "> Collected: 2026-08-21\n"
            f"> Approval-Digest: {'a' * 64}\n\n"
            f"## {topic}\n\n"
            f"> Payload: [결정]({payload})\n"
            f"> Supersedes: {supersedes}\n",
            encoding="utf-8",
        )

    def _write_topic_page(
        self,
        root: Path,
        *,
        status: str,
        current: tuple[str, ...],
        history: tuple[str, ...],
    ) -> None:
        wiki = root / "llm-wiki" / "wiki"
        topic = wiki / "topics" / "product-safety.md"
        topic.parent.mkdir(parents=True, exist_ok=True)
        current_links = "; ".join(
            f"[current-{index}]({path})" for index, path in enumerate(current, start=1)
        )
        history_links = "; ".join(
            f"[history-{index}]({path})" for index, path in enumerate(history, start=1)
        )
        topic.write_text(
            "# 제품 안전 원칙 이력\n\n"
            "> Topic: product-safety\n"
            f"> Status: {status}\n"
            f"> Current: {current_links}\n"
            f"> History: {history_links}\n"
            "> Updated: 2026-08-21\n\n"
            "## 현재 상태\n\n승인된 근거를 따른다.\n",
            encoding="utf-8",
        )
        index = wiki / "index.md"
        index.write_text(
            index.read_text(encoding="utf-8")
            + "\n[제품 안전 이력](topics/product-safety.md)\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
