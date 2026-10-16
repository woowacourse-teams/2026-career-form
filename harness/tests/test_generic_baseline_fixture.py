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
        self._capture: list[str] | None = None
        self._capture_kind = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k: v or "" for k, v in attrs}
        self.tags.append(tag)
        classes = values.get("class", "").split()
        if tag == "form":
            self.in_form = True
        if tag == "input" and values.get("type", "text") not in {"hidden", "submit", "button"}:
            self.controls.append((tag, values.get("type", "text")))
        if tag in {"select", "textarea"}:
            self.controls.append((tag, tag))
        if tag == "button":
            self.buttons.append((values.get("type", "submit"), "", self.in_form))
            self._capture, self._capture_kind = [], "button"
        if tag == "div" and "section-title" in classes:
            self._capture, self._capture_kind = [], "title"
        if tag == "div" and "repeat-row" in classes:
            self.rows += 1

    def handle_endtag(self, tag: str) -> None:
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
        if self._capture is not None:
            self._capture.append(data)


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
        self.assertEqual(len(page.controls), len(fields))
        self.assertEqual(
            [f"f{index:03d}" for index in range(1, len(fields) + 1)],
            [field["field_id"] for field in fields],
        )
        kinds = {"text": "TEXT", "select": "SELECT", "textarea": "TEXTAREA", "file": "FILE"}
        for (tag, input_type), field in zip(page.controls, fields):
            expected = kinds["select" if tag == "select" else "textarea" if tag == "textarea" else input_type]
            self.assertEqual(expected, field["control_kind"], field["field_id"])

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
