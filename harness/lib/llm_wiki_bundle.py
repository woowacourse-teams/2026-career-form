import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
ISSUE_PATTERN = re.compile(r"CF-[1-9][0-9]*")
DIGEST_PATTERN = re.compile(r"[0-9a-f]{64}")
REQUIRED_MANIFEST_METADATA = ("Issue", "Collected", "Approval-Digest")
REQUIRED_TOPIC_METADATA = ("Topic", "Status", "Current", "History", "Updated")


@dataclass(frozen=True)
class KnowledgeEntry:
    topic: str
    payload: Path
    supersedes: tuple[Path, ...]


def validate_issue_bundles(raw_root: Path, wiki_root: Path) -> list[str]:
    errors: list[str] = []
    entries: list[KnowledgeEntry] = []
    issues_root = raw_root / "issues"
    if issues_root.exists():
        for bundle in sorted(path for path in issues_root.iterdir() if path.is_dir()):
            manifest = bundle / "manifest.md"
            if not manifest.is_file():
                errors.append(f"Issue raw manifest가 없습니다: {bundle.name}")
                continue
            parsed, manifest_errors = _parse_manifest(manifest, raw_root)
            entries.extend(parsed)
            errors.extend(manifest_errors)
    errors.extend(_validate_topic_graph(tuple(entries), raw_root, wiki_root))
    return errors


def _parse_manifest(
    manifest: Path,
    raw_root: Path,
) -> tuple[tuple[KnowledgeEntry, ...], list[str]]:
    content = manifest.read_text(encoding="utf-8")
    metadata = _metadata(content.split("\n## ", maxsplit=1)[0])
    relative = manifest.relative_to(raw_root).as_posix()
    errors = _required_metadata_errors(
        metadata,
        REQUIRED_MANIFEST_METADATA,
        f"manifest 메타데이터: {relative}",
    )
    expected_issue = manifest.parent.name
    if ISSUE_PATTERN.fullmatch(expected_issue) is None:
        errors.append(f"Issue raw 디렉터리 이름이 올바르지 않습니다: {expected_issue}")
    if metadata.get("Issue") != expected_issue:
        errors.append(f"manifest Issue가 디렉터리와 다릅니다: {relative}")
    if metadata.get("Approval-Digest") and DIGEST_PATTERN.fullmatch(
        metadata["Approval-Digest"]
    ) is None:
        errors.append(f"manifest 승인 digest가 올바르지 않습니다: {relative}")

    entries: list[KnowledgeEntry] = []
    sections = re.split(r"(?m)^## ", content)[1:]
    if not sections:
        errors.append(f"manifest 주제 항목이 없습니다: {relative}")
    for section in sections:
        lines = section.splitlines()
        topic = lines[0].strip()
        values = _metadata("\n".join(lines[1:]))
        entry, entry_errors = _entry_from(
            topic,
            values,
            manifest,
            raw_root,
        )
        if entry is not None:
            entries.append(entry)
        errors.extend(entry_errors)
    return tuple(entries), errors


def _entry_from(
    topic: str,
    values: dict[str, str],
    manifest: Path,
    raw_root: Path,
) -> tuple[KnowledgeEntry | None, list[str]]:
    errors: list[str] = []
    if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", topic) is None:
        errors.append(f"manifest topic id가 올바르지 않습니다: {topic}")
    payload_links = LINK_PATTERN.findall(values.get("Payload", ""))
    if len(payload_links) != 1:
        errors.append(f"manifest payload 링크는 하나여야 합니다: {topic}")
        return None, errors
    payload = (manifest.parent / payload_links[0]).resolve()
    documents = (manifest.parent / "documents").resolve()
    if not payload.is_relative_to(documents):
        errors.append(f"manifest payload는 documents 하위여야 합니다: {topic}")
    if not payload.is_file():
        errors.append(f"manifest payload가 없습니다: {topic}: {payload_links[0]}")
    else:
        errors.extend(_validate_payload_links(topic, payload, manifest.parent))

    raw_supersedes = values.get("Supersedes", "")
    supersedes: tuple[Path, ...] = ()
    if raw_supersedes != "None":
        links = LINK_PATTERN.findall(raw_supersedes)
        if not links:
            errors.append(f"manifest Supersedes는 None 또는 raw 링크여야 합니다: {topic}")
        resolved: list[Path] = []
        for link in links:
            target = (manifest.parent / link).resolve()
            if not target.is_relative_to(raw_root.resolve()):
                errors.append(f"Supersedes가 raw 밖을 가리킵니다: {topic}: {link}")
            elif not target.is_file():
                errors.append(f"Supersedes 근거가 없습니다: {topic}: {link}")
            else:
                resolved.append(target)
        supersedes = tuple(resolved)
    return KnowledgeEntry(topic, payload, supersedes), errors


def _validate_payload_links(topic: str, payload: Path, bundle: Path) -> list[str]:
    errors: list[str] = []
    for link in LINK_PATTERN.findall(payload.read_text(encoding="utf-8")):
        if link.startswith(("#", "http://", "https://", "mailto:")):
            continue
        relative = link.split("#", maxsplit=1)[0]
        target = (payload.parent / relative).resolve()
        if not target.is_relative_to(bundle.resolve()):
            errors.append(f"payload 내부 링크가 bundle 밖을 가리킵니다: {topic}: {link}")
        elif not target.exists():
            errors.append(f"payload 내부 링크가 없습니다: {topic}: {link}")
    return errors


def _validate_topic_graph(
    entries: tuple[KnowledgeEntry, ...],
    raw_root: Path,
    wiki_root: Path,
) -> list[str]:
    by_topic: dict[str, list[KnowledgeEntry]] = defaultdict(list)
    for entry in entries:
        by_topic[entry.topic].append(entry)
    errors: list[str] = []
    topic_root = wiki_root / "topics"
    page_topics = {
        page.stem for page in topic_root.glob("*.md") if page.is_file()
    }
    for topic in sorted(page_topics - by_topic.keys()):
        errors.append(
            f"manifest 근거가 없는 topic Wiki 문서가 있습니다: {topic}"
        )
    for topic, topic_entries in sorted(by_topic.items()):
        if _has_cycle(tuple(topic_entries)):
            errors.append(f"Supersedes 순환이 있습니다: {topic}")
            continue
        payloads = {entry.payload for entry in topic_entries}
        superseded = {
            target for entry in topic_entries for target in entry.supersedes
        }
        heads = payloads - superseded
        history = payloads | superseded
        errors.extend(
            _validate_topic_page(
                topic,
                heads,
                history,
                raw_root,
                wiki_root,
            )
        )
    return errors


def _has_cycle(entries: tuple[KnowledgeEntry, ...]) -> bool:
    graph = {entry.payload: set(entry.supersedes) for entry in entries}
    visiting: set[Path] = set()
    visited: set[Path] = set()

    def visit(node: Path) -> bool:
        if node in visiting:
            return True
        if node in visited or node not in graph:
            return False
        visiting.add(node)
        if any(visit(target) for target in graph[node]):
            return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in graph)


def _validate_topic_page(
    topic: str,
    heads: set[Path],
    history: set[Path],
    raw_root: Path,
    wiki_root: Path,
) -> list[str]:
    page = wiki_root / "topics" / f"{topic}.md"
    if not page.is_file():
        return [f"topic Wiki 문서가 없습니다: {topic}"]
    metadata = _metadata(page.read_text(encoding="utf-8"))
    errors = _required_metadata_errors(
        metadata,
        REQUIRED_TOPIC_METADATA,
        f"topic Wiki 메타데이터: {topic}",
    )
    if metadata.get("Topic") != topic:
        errors.append(f"topic Wiki id가 파일명과 다릅니다: {topic}")
    expected_status = "Disputed" if len(heads) > 1 else "Current"
    if metadata.get("Status") != expected_status:
        if expected_status == "Disputed":
            errors.append(f"최신 근거가 둘 이상이면 Disputed여야 합니다: {topic}")
        else:
            errors.append(f"최신 근거가 하나이면 Current여야 합니다: {topic}")
    current = _resolved_raw_links(page, metadata.get("Current", ""), raw_root, errors)
    recorded_history = _resolved_raw_links(
        page,
        metadata.get("History", ""),
        raw_root,
        errors,
    )
    if current != heads:
        errors.append(f"topic Wiki Current가 최신 raw와 다릅니다: {topic}")
    if recorded_history != history:
        errors.append(f"topic Wiki History가 raw 이력과 다릅니다: {topic}")
    return errors


def _resolved_raw_links(
    page: Path,
    value: str,
    raw_root: Path,
    errors: list[str],
) -> set[Path]:
    resolved: set[Path] = set()
    for link in LINK_PATTERN.findall(value):
        target = (page.parent / link).resolve()
        if not target.is_relative_to(raw_root.resolve()) or not target.is_file():
            errors.append(f"topic Wiki raw 링크가 올바르지 않습니다: {page.name}: {link}")
        else:
            resolved.add(target)
    return resolved


def _required_metadata_errors(
    metadata: dict[str, str],
    required: tuple[str, ...],
    prefix: str,
) -> list[str]:
    return [f"{prefix}: {name}" for name in required if not metadata.get(name)]


def _metadata(content: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in content.splitlines():
        if not line.startswith("> ") or ":" not in line:
            continue
        name, value = line[2:].split(":", maxsplit=1)
        values[name.strip()] = value.strip()
    return values
