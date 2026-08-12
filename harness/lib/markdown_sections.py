import re


HEADING_PATTERN = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)


def extract_sections(body: str) -> dict[str, str]:
    matches = tuple(HEADING_PATTERN.finditer(body))
    return {
        match.group(1): body[
            match.end() : matches[index + 1].start()
            if index + 1 < len(matches)
            else len(body)
        ].strip()
        for index, match in enumerate(matches)
    }
