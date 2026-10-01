#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path
from typing import Never


SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
VERSION_PART = r"(?:0|[1-9][0-9]*)"
RELEASE_PATTERN = re.compile(
    rf"^release/(?P<version>{VERSION_PART}\.{VERSION_PART}\.{VERSION_PART})$"
)
HOTFIX_PATTERN = re.compile(r"^hotfix/CF-[1-9][0-9]*$")
REVERT_PATTERN = re.compile(r"^revert/[0-9a-f]{7,40}$")


def abort(message: str) -> Never:
    print(f"classification error: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_json(path: str) -> object:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        abort(f"invalid JSON input: {error}")


def require_mapping(value: object, name: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(
        isinstance(key, str) for key in value
    ):
        abort(f"invalid {name} object")
    return value


def nested_string(
    value: dict[str, object], mapping_key: str, string_key: str
) -> str:
    nested = require_mapping(value.get(mapping_key), mapping_key)
    result = nested.get(string_key)
    if not isinstance(result, str) or not result:
        abort(f"invalid {mapping_key}.{string_key}")
    return result


def classify(event_value: object, pulls_value: object) -> dict[str, str]:
    event = require_mapping(event_value, "event")
    if event.get("ref") != "refs/heads/main":
        abort("event must be a main branch push")
    after = event.get("after")
    if not isinstance(after, str) or SHA_PATTERN.fullmatch(after) is None:
        abort("invalid event.after commit SHA")
    if not isinstance(pulls_value, list):
        abort("invalid associated pull requests list")

    matching: list[dict[str, object]] = []
    for index, value in enumerate(pulls_value):
        pull = require_mapping(value, f"pull request {index}")
        merge_sha = pull.get("merge_commit_sha")
        base_ref = nested_string(pull, "base", "ref")
        if merge_sha == after and base_ref == "main":
            matching.append(pull)

    if len(matching) != 1:
        abort("exactly one merged pull request must match the main commit")

    pull = matching[0]
    if not isinstance(pull.get("merged_at"), str) or not pull["merged_at"]:
        abort("invalid merged pull request metadata")
    head_ref = nested_string(pull, "head", "ref")
    head_sha = nested_string(pull, "head", "sha")
    if SHA_PATTERN.fullmatch(head_sha) is None:
        abort("invalid pull request head SHA")

    release = RELEASE_PATTERN.fullmatch(head_ref)
    if release is not None:
        return {
            "kind": "release",
            "head_ref": head_ref,
            "head_sha": head_sha,
            "version": release.group("version"),
        }
    if HOTFIX_PATTERN.fullmatch(head_ref) is not None:
        return {"kind": "hotfix", "head_ref": head_ref, "head_sha": head_sha}
    if REVERT_PATTERN.fullmatch(head_ref) is not None:
        return {"kind": "revert", "head_ref": head_ref, "head_sha": head_sha}
    abort("source branch must be release/<version>, hotfix/CF-<issue>, or revert/<sha>")


def main() -> int:
    if len(sys.argv) != 3:
        abort("usage: classify-main-merge.py <event-json> <associated-prs-json>")
    result = classify(read_json(sys.argv[1]), read_json(sys.argv[2]))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
