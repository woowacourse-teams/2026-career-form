import re
from pathlib import Path

from harness.lib.result import ValidationResult


RAW_LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
INDEX_LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+\.md)\)")
REQUIRED_RAW_METADATA = ("Source", "Collected", "Published")
REQUIRED_WIKI_METADATA = ("Sources", "Raw", "Updated")


def validate_wiki(root: Path) -> ValidationResult:
    wiki_root = root / "llm-wiki"
    raw_root = wiki_root / "raw"
    article_root = wiki_root / "wiki"
    errors = _required_structure(raw_root, article_root)
    if errors:
        return ValidationResult(tuple(errors))

    errors.extend(_validate_raw_files(raw_root))
    index = article_root / "index.md"
    indexed = _indexed_articles(index)
    for article in _articles(article_root):
        relative = article.relative_to(article_root).as_posix()
        errors.extend(_validate_article(article, raw_root))
        if relative not in indexed:
            errors.append(f"색인에 없는 Wiki 문서가 있습니다: {relative}")
    return ValidationResult(tuple(errors))


def _required_structure(raw_root: Path, article_root: Path) -> list[str]:
    paths = (raw_root, article_root, article_root / "index.md", article_root / "log.md")
    return [f"LLM Wiki 필수 경로가 없습니다: {path.name}" for path in paths if not path.exists()]


def _validate_raw_files(raw_root: Path) -> list[str]:
    errors: list[str] = []
    for raw in raw_root.rglob("*.md"):
        metadata = _metadata(raw.read_text(encoding="utf-8"))
        for name in REQUIRED_RAW_METADATA:
            if name not in metadata:
                errors.append(f"raw 메타데이터가 없습니다: {raw.relative_to(raw_root)}: {name}")
    return errors


def _validate_article(article: Path, raw_root: Path) -> list[str]:
    metadata = _metadata(article.read_text(encoding="utf-8"))
    relative = article.relative_to(article.parents[1]).as_posix()
    errors = [
        f"Wiki 메타데이터가 없습니다: {relative}: {name}"
        for name in REQUIRED_WIKI_METADATA
        if name not in metadata
    ]
    raw_value = metadata.get("Raw", "")
    links = RAW_LINK_PATTERN.findall(raw_value)
    if not links:
        return errors + [f"raw 근거 링크가 없습니다: {relative}"]
    for link in links:
        target = (article.parent / link).resolve()
        if not target.is_relative_to(raw_root.resolve()):
            errors.append(f"raw 밖을 가리키는 Wiki 근거 링크가 있습니다: {relative}")
        elif not target.is_file():
            errors.append(f"존재하지 않는 raw 근거 링크가 있습니다: {relative}: {link}")
    return errors


def _metadata(content: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in content.splitlines():
        if not line.startswith("> ") or ":" not in line:
            continue
        name, value = line[2:].split(":", maxsplit=1)
        values[name.strip()] = value.strip()
    return values


def _indexed_articles(index: Path) -> set[str]:
    return set(INDEX_LINK_PATTERN.findall(index.read_text(encoding="utf-8")))


def _articles(article_root: Path) -> tuple[Path, ...]:
    return tuple(
        path
        for path in article_root.rglob("*.md")
        if path.name not in {"index.md", "log.md"}
    )
