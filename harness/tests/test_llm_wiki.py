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


if __name__ == "__main__":
    unittest.main()
