import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('knowledge_inbox', Path(__file__).with_name('scan-knowledge-inbox.py'))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class KnowledgeInboxTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='mira-inbox-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def pdf(self, relative, content=b'%PDF-1.7\nsynthetic local test'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_groups_later_parts_and_new_books_without_modifying_originals(self):
        original = self.pdf('book-brand management/original.pdf')
        before = hashlib.sha256(original.read_bytes()).hexdigest()
        self.pdf('book-brand management/part-03.pdf', b'%PDF-1.7\nlater scan')
        self.pdf('knowledge-inbox/another-book/part-01.PDF')
        self.pdf('knowledge-inbox/a-guide.pdf')
        (original.parent/'source-status.json').write_text('{"completeness":"incomplete"}')
        result = inventory.scan_inventory(self.root)
        groups = {item['path']: item['sourceGroup'] for item in result['files']}
        self.assertEqual(groups['book-brand management/part-03.pdf'], 'book-brand management')
        self.assertEqual(groups['knowledge-inbox/another-book/part-01.PDF'], 'knowledge-inbox/another-book')
        self.assertEqual(groups['knowledge-inbox/a-guide.pdf'], 'knowledge-inbox/a-guide')
        self.assertEqual(result['sourceCompleteness']['book-brand management'], 'incomplete')
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), before)
        self.assertTrue(all(item['remoteSeedStatus'] == 'not_checked' for item in result['files']))

    def test_distinguishes_new_changed_unchanged_and_exact_duplicates_across_runs(self):
        original = self.pdf('book-brand management/one.pdf')
        changed = self.pdf('book-brand management/two.pdf', b'%PDF-1.7\ntwo')
        first = inventory.scan_inventory(self.root)
        changed.write_bytes(b'%PDF-1.7\ncorrected scan')
        self.pdf('knowledge-inbox/duplicate.pdf', original.read_bytes())
        self.pdf('knowledge-inbox/new.pdf', b'%PDF-1.7\nnew')
        result = inventory.scan_inventory(self.root, first)
        states = {item['path']: item['change'] for item in result['files']}
        self.assertEqual(states['book-brand management/one.pdf'], 'unchanged')
        self.assertEqual(states['book-brand management/two.pdf'], 'changed')
        self.assertEqual(states['knowledge-inbox/duplicate.pdf'], 'existing_content_new_path')
        self.assertEqual(states['knowledge-inbox/new.pdf'], 'new')
        self.assertEqual(result['exactByteDuplicateGroups'], [['book-brand management/one.pdf', 'knowledge-inbox/duplicate.pdf']])
        self.assertEqual(result['summary']['seedRequests'], 0)

    def test_reports_renames_and_missing_files_without_requesting_remote_deletion(self):
        old = self.pdf('knowledge-inbox/old-name.pdf')
        first = inventory.scan_inventory(self.root)
        old.rename(old.with_name('new-name.pdf'))
        result = inventory.scan_inventory(self.root, first)
        self.assertEqual(result['files'][0]['change'], 'existing_content_new_path')
        self.assertEqual(result['missingSincePreviousInventory'], ['knowledge-inbox/old-name.pdf'])
        self.assertEqual(result['summary']['networkRequests'], 0)

    def test_identifies_large_parts_and_bad_signatures_without_extracting_them(self):
        large = self.pdf('knowledge-inbox/large.pdf')
        with large.open('r+b') as output:
            output.truncate(inventory.UPLOAD_LIMIT + 1)
        self.pdf('knowledge-inbox/not-really.pdf', b'not a PDF')
        result = inventory.scan_inventory(self.root)
        statuses = {item['path']: item['intakeStatus'] for item in result['files']}
        self.assertEqual(statuses['knowledge-inbox/large.pdf'], 'needs_splitting')
        self.assertEqual(statuses['knowledge-inbox/not-really.pdf'], 'signature_rejected')
        self.assertTrue(all(item['textOrOcrStatus'] == 'not_checked' for item in result['files']))

    def test_ignores_symlinks_and_unrelated_or_hidden_files(self):
        outside = self.pdf('outside.pdf')
        inbox = self.root/'knowledge-inbox'
        inbox.mkdir()
        (inbox/'linked.pdf').symlink_to(outside)
        (inbox/'linked-directory').symlink_to(self.root, target_is_directory=True)
        (inbox/'notes.txt').write_text('local notes')
        self.pdf('knowledge-inbox/.hidden.pdf')
        result = inventory.scan_inventory(self.root)
        self.assertEqual(result['files'], [])
        self.assertEqual(result['skipped'], [{'path': 'knowledge-inbox/linked.pdf', 'reason': 'not_a_regular_file'}])


if __name__ == '__main__':
    unittest.main()
