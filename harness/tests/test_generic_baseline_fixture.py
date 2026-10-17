import json
import re
import subprocess
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from harness.lib.generic_autofill_eval import validate_ground_truth

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "harness" / "fixtures" / "generic-autofill"
PAGE = FIXTURES / "pages" / "large-generic-form.html"
TRUTH = FIXTURES / "ground-truth-generic-jev-v1.json"
PROFILE = ROOT / "frontend" / "fixtures" / "profile-export.example.json"
STATIC_CONTROL_COUNT = 131
KINDS = {"text": "TEXT", "select": "SELECT", "textarea": "TEXTAREA", "file": "FILE"}
SCRIPT = ROOT / "harness" / "scripts" / "evaluate-generic-autofill.py"
COMPANY_IDENTIFIERS = re.compile(
    r"hyundai|sk-?careers|greeting|naver|krafton|ahnlab|lgresearch|recruiter\.co\.kr",
    re.IGNORECASE,
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.controls: list[tuple[str, str]] = []
        self.tags: list[str] = []
        self.buttons: list[tuple[str, str, bool]] = []
        self.labels: list[str] = []
        self.in_form = False
        self.titles: list[str] = []
        self.rows = 0
        self.scripts: list[tuple[dict[str, str], str]] = []
        self.add_buttons: dict[str, dict[str, str]] = {}
        self.row_controls: dict[str, list[list[tuple[str, str]]]] = {}
        self._row_group: str | None = None
        self._row_depth = 0
        self._script: list[str] | None = None
        self._capture: list[str] | None = None
        self._capture_kind = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k: v or "" for k, v in attrs}
        self.tags.append(tag)
        classes = values.get("class", "").split()
        if tag == "form":
            self.in_form = True
        if tag == "script":
            self.scripts.append((values, ""))
            self._script = []
        if self._row_group is not None and tag == "div":
            self._row_depth += 1
        control = None
        if tag == "input" and values.get("type", "text") not in {"hidden", "submit", "button"}:
            control = (tag, values.get("type", "text"))
        if tag in {"select", "textarea"}:
            control = (tag, tag)
        if control is not None:
            self.controls.append(control)
            if self._row_group is not None:
                self.row_controls[self._row_group][-1].append(control)
        if tag == "button" and "add" in classes:
            self.add_buttons[values.get("data-group", "")] = values
        if tag == "button":
            self.buttons.append((values.get("type", "submit"), "", self.in_form))
            self._capture, self._capture_kind = [], "button"
        if tag == "div" and "section-title" in classes:
            self._capture, self._capture_kind = [], "title"
        if tag == "div" and "repeat-row" in classes:
            self.rows += 1
            self._row_group = values.get("data-row", "")
            self._row_depth = 1
            self.row_controls.setdefault(self._row_group, []).append([])

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script is not None:
            attrs, _ = self.scripts[-1]
            self.scripts[-1] = (attrs, "".join(self._script))
            self._script = None
        if self._row_group is not None and tag == "div":
            self._row_depth -= 1
            if self._row_depth == 0:
                self._row_group = None
        if tag == "form":
            self.in_form = False
        if self._capture is not None and tag in {"button", "div"}:
            text = "".join(self._capture).strip()
            if self._capture_kind == "button" and tag == "button":
                kind, _, in_form = self.buttons[-1]
                self.buttons[-1] = (kind, text, in_form)
            elif self._capture_kind == "title" and tag == "div":
                self.titles.append(text)
            self._capture = None

    def handle_data(self, data: str) -> None:
        if self._script is not None:
            self._script.append(data)
        if self._capture is not None:
            self._capture.append(data)


def kind(control: tuple[str, str]) -> str:
    tag, input_type = control
    return KINDS["select" if tag == "select" else "textarea" if tag == "textarea" else input_type]


def parse_page() -> PageParser:
    parser = PageParser()
    parser.feed(PAGE.read_text(encoding="utf-8"))
    return parser


class LargeGenericFormPageTest(unittest.TestCase):
    def test_page_has_at_least_120_controls_without_semantic_containers(self) -> None:
        page = parse_page()
        self.assertGreaterEqual(len(page.controls), 120)
        for forbidden in ("fieldset", "legend", "h1", "h2", "h3", "section"):
            self.assertNotIn(forbidden, page.tags)

    def test_page_contains_required_structures(self) -> None:
        page = parse_page()
        text = PAGE.read_text(encoding="utf-8")
        self.assertGreaterEqual(len(page.titles), 6)
        self.assertGreaterEqual(page.rows, 6)
        button_texts = [text for _, text, _ in page.buttons]
        self.assertTrue(any("추가" in value for value in button_texts))
        self.assertTrue(
            any(kind == "submit" and in_form and "제출" in value for kind, value, in_form in page.buttons)
        )
        self.assertTrue(
            any(in_form and "저장" in value for _, value, in_form in page.buttons)
        )
        self.assertIn("추천인", text)
        self.assertIn("국가번호", text)
        self.assertRegex(text, r'<select[^>]*name="referrer-phone-country"')

    def test_page_script_is_inline_without_external_resources(self) -> None:
        page = parse_page()
        self.assertEqual(1, len(page.scripts))
        attrs, source = page.scripts[0]
        self.assertNotIn("src", attrs)
        self.assertTrue(source.strip())
        self.assertNotRegex(
            source,
            r"https?:|fetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(|\.src\b|sendBeacon",
        )

    def test_add_buttons_declare_fixed_dynamic_row_numbering(self) -> None:
        page = parse_page()
        self.assertEqual(
            {"education": "132 141", "career": "150"},
            {
                group: page.add_buttons.get(group, {}).get("data-id-starts")
                for group in ("education", "career")
            },
        )

    def test_page_has_no_personal_data_or_company_identifiers(self) -> None:
        text = PAGE.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"\d{6}-?\d{7}", text))
        self.assertIsNone(re.search(r"\b0\d{1,2}-\d{3,4}-\d{4}\b", text))
        self.assertIsNone(re.search(r"https?://", text))
        self.assertIsNone(COMPANY_IDENTIFIERS.search(text))
        self.assertNotRegex(text, r'value="[^"]+"')


class GenericBaselineGroundTruthTest(unittest.TestCase):
    def load(self) -> dict[str, object]:
        return json.loads(TRUTH.read_text(encoding="utf-8"))

    def test_ground_truth_is_contract_1_1_with_nonempty_denominator(self) -> None:
        payload = self.load()
        truth = validate_ground_truth(payload)
        self.assertEqual("1.1", payload["contract_version"])
        self.assertEqual(1, len(truth.sites))
        self.assertGreater(truth.sites[0].autofillable_count, 0)

    def test_ground_truth_fields_follow_page_controls_in_dom_order(self) -> None:
        page = parse_page()
        fields = self.load()["sites"][0]["fields"]
        self.assertEqual(STATIC_CONTROL_COUNT, len(page.controls))
        self.assertEqual(
            [f"f{index:03d}" for index in range(1, len(fields) + 1)],
            [field["field_id"] for field in fields],
        )
        for control, field in zip(page.controls, fields[:STATIC_CONTROL_COUNT]):
            self.assertEqual(kind(control), field["control_kind"], field["field_id"])

    def test_dynamic_row_fields_repeat_first_row_structure(self) -> None:
        page = parse_page()
        fields = self.load()["sites"][0]["fields"][STATIC_CONTROL_COUNT:]
        expected = (
            page.row_controls["education"][0] * 2 + page.row_controls["career"][0]
        )
        self.assertEqual(28, len(expected))
        self.assertEqual(
            [f"f{index:03d}" for index in range(132, 160)],
            [field["field_id"] for field in fields],
        )
        self.assertEqual(
            [kind(control) for control in expected],
            [field["control_kind"] for field in fields],
        )
        self.assertTrue(
            all(
                (field["classification"], field["classification_reason"])
                == ("PROFILE_VALUE_MISSING", "PROFILE_VALUE_UNAVAILABLE")
                for field in fields
            )
        )

    def test_second_language_row_without_test_values_is_not_autofillable(self) -> None:
        profile = json.loads(PROFILE.read_text(encoding="utf-8"))["profile"]
        second = profile["languages"][1]["values"]
        fields = {field["field_id"]: field for field in self.load()["sites"][0]["fields"]}
        missing = ("testName", "registrationNo", "acquisitionDate", "grade")
        self.assertFalse(any(second.get(key) for key in missing))
        for field_id in ("f092", "f093", "f094", "f095"):
            self.assertEqual(
                ("PROFILE_VALUE_MISSING", "PROFILE_VALUE_UNAVAILABLE"),
                (fields[field_id]["classification"], fields[field_id]["classification_reason"]),
                field_id,
            )
        self.assertTrue(second.get("language"))
        for field_id in ("f085", "f086", "f087", "f088", "f089", "f091"):
            self.assertEqual("AUTOFILLABLE", fields[field_id]["classification"], field_id)
        self.assertEqual(
            67, sum(field["classification"] == "AUTOFILLABLE" for field in fields.values())
        )

    def test_education_major_and_gpa_follow_example_profile_rows(self) -> None:
        profile = json.loads(PROFILE.read_text(encoding="utf-8"))["profile"]
        fields = {field["field_id"]: field for field in self.load()["sites"][0]["fields"]}
        rows = ((profile["education"][0]["values"], "f026", "f027"),
                (profile["education"][1]["values"], "f035", "f036"))
        for values, major_id, gpa_id in rows:
            for key, field_id in (("majorName", major_id), ("gpaScore", gpa_id)):
                expected = (
                    ("AUTOFILLABLE", "PROFILE_VALUE_AVAILABLE")
                    if values.get(key)
                    else ("PROFILE_VALUE_MISSING", "PROFILE_VALUE_UNAVAILABLE")
                )
                self.assertEqual(
                    expected,
                    (fields[field_id]["classification"], fields[field_id]["classification_reason"]),
                    field_id,
                )
        self.assertTrue(profile["education"][1]["values"].get("majorName"))
        self.assertFalse(profile["education"][0]["values"].get("majorName"))

    def test_ground_truth_declares_only_definitional_labels(self) -> None:
        fields = self.load()["sites"][0]["fields"]
        allowed = {
            ("AUTOFILLABLE", "PROFILE_VALUE_AVAILABLE"),
            ("PROFILE_VALUE_MISSING", "PROFILE_VALUE_UNAVAILABLE"),
            ("FORBIDDEN", "SENSITIVE_FIELD"),
        }
        self.assertTrue(
            {(f["classification"], f["classification_reason"]) for f in fields} <= allowed
        )
        self.assertTrue(any(f["classification"] == "FORBIDDEN" for f in fields))


class CommittedBaselineRescoreTest(unittest.TestCase):
    def test_unmapped_candidate_reasons_match_ground_truth(self) -> None:
        truth = json.loads(TRUTH.read_text(encoding="utf-8"))
        classes = {f["field_id"]: f["classification"] for f in truth["sites"][0]["fields"]}
        for provider in ("jev", "openai"):
            path = FIXTURES / f"observations-generic-{provider}-baseline-v1.json"
            runs = json.loads(path.read_text(encoding="utf-8"))["runs"]
            for candidate in (c for run in runs for c in run.get("candidates", [])):
                if "MAPPED" in candidate["stages"]:
                    continue
                expected = (
                    "PROFILE_VALUE_MISSING"
                    if classes[candidate["field_id"]] == "PROFILE_VALUE_MISSING"
                    else "MAPPING_NO_MATCH"
                )
                self.assertEqual(
                    expected, candidate["reason_code"], f"{provider} {candidate['field_id']}"
                )

    def test_committed_results_equal_cli_output(self) -> None:
        for provider in ("jev", "openai"):
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "result.json"
                subprocess.run(
                    (
                        sys.executable, str(SCRIPT),
                        "--ground-truth", str(TRUTH),
                        "--observations",
                        str(FIXTURES / f"observations-generic-{provider}-baseline-v1.json"),
                        "--output", str(output),
                    ),
                    cwd=ROOT, capture_output=True, check=True,
                )
                committed = FIXTURES / f"result-generic-{provider}-baseline-v1.json"
                self.assertEqual(committed.read_bytes(), output.read_bytes(), provider)


class ContractRejectionTest(unittest.TestCase):
    def test_contract_1_0_observations_are_rejected_against_new_ground_truth(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.run(
                (
                    sys.executable, str(SCRIPT),
                    "--ground-truth", str(TRUTH),
                    "--observations", str(FIXTURES / "observations-v1.json"),
                    "--output", str(Path(directory) / "out.json"),
                ),
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            self.assertFalse((Path(directory) / "out.json").exists())
        self.assertNotEqual(0, completed.returncode)
        self.assertIn("contract_version", completed.stderr)
        self.assertNotIn("Traceback", completed.stderr)


if __name__ == "__main__":
    unittest.main()
