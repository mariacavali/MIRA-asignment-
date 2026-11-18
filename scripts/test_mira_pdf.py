"""Unit checks for page failure isolation and extraction limits; synthetic only."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("mira_extract", Path(__file__).with_name("extract-mira-pdf.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Page:
    def __init__(self, text=None, broken=False):
        self.text, self.broken = text, broken

    def extract_text(self):
        if self.broken:
            raise ValueError("Synthetic damaged page")
        return self.text


class Reader:
    def __init__(self, pages):
        self.pages = pages


class ExtractionTests(unittest.TestCase):
    def test_page_failure_does_not_drop_other_pages(self):
        result = module.extract_pages(Reader([Page("First"), Page(broken=True), Page("Third")]))
        self.assertEqual([p["page"] for p in result["pages"]], [1, 2, 3])
        self.assertEqual([p["status"] for p in result["pages"]], ["extracted", "error", "extracted"])
        self.assertEqual(result["pages"][2]["text"], "Third")

    def test_unicode_truncation_respects_browser_character_budget(self):
        result = module.extract_pages(Reader([Page("😀" * 20000)]))
        self.assertEqual(result["pages"][0]["status"], "truncated")
        self.assertEqual(len(result["pages"][0]["text"].encode("utf-16-le")) // 2, 30000)

    def test_nested_image_resources_are_flagged_without_decoding(self):
        class Ref(dict):
            def get_object(self):
                return self
        image = Ref({"/Subtype": "/Image"})
        form = Ref({"/Subtype": "/Form", "/Resources": Ref({"/XObject": Ref({"/Image1": image})})})
        page = Ref({"/Resources": Ref({"/XObject": Ref({"/Form1": form})})})
        self.assertTrue(module.has_images(page))
        self.assertFalse(module.has_images(Ref({})))

    def test_total_limit_marks_remaining_pages_without_losing_page_numbers(self):
        old = module.MAX_TOTAL_TEXT
        try:
            module.MAX_TOTAL_TEXT = 5
            result = module.extract_pages(Reader([Page("12345"), Page("other")]))
            self.assertEqual(result["pages"][1], {"page": 2, "text": "", "status": "limit_reached", "hasImages": False})
        finally:
            module.MAX_TOTAL_TEXT = old


if __name__ == "__main__":
    unittest.main()
