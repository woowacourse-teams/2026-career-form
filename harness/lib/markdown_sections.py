import re


SECTION_PATTERN = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
SUBSECTION_PATTERN = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)


def extract_sections(body: str) -> dict[str, str]:
    return _extract_headings(body, SECTION_PATTERN)


def extract_subsections(body: str) -> dict[str, str]:
    return _extract_headings(body, SUBSECTION_PATTERN)


def _extract_headings(body: str, pattern: re.Pattern[str]) -> dict[str, str]:
    matches = tuple(pattern.finditer(body))
    return {
        match.group(1): body[
            match.end() : matches[index + 1].start()
            if index + 1 < len(matches)
            else len(body)
        ].strip()
        for index, match in enumerate(matches)
    }
