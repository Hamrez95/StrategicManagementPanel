import hashlib
import io
import json
import tarfile
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from scripts.private_file_snapshot import (
    MANIFEST,
    SnapshotError,
    create,
    restore,
    verify,
)


class PrivateFileSnapshotTests(TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'source'
        self.source.mkdir()
        (self.source / 'document').mkdir()
        (self.source / 'document' / 'فایل.bin').write_bytes(bytes(range(256)) * 300)
        (self.source / 'empty').write_bytes(b'')
        self.archive = self.base / 'private-files.tar.gz'
        self.destination = self.base / 'restored'

    def capture(self):
        return create(self.source, self.archive, quiesced=True)

    def malicious(self, name, *, kind=tarfile.REGTYPE, manifest=True):
        with tarfile.open(self.archive, 'w') as archive:
            entry = tarfile.TarInfo(name)
            entry.type, entry.size = kind, 0
            entry.linkname = '/outside' if kind == tarfile.SYMTYPE else ''
            archive.addfile(entry, io.BytesIO(b''))
            if manifest:
                metadata = json.dumps({'schema_version': 1, 'files': [{'path': name, 'size': 0, 'sha256': hashlib.sha256(b'').hexdigest()}]}).encode()
                entry = tarfile.TarInfo(MANIFEST)
                entry.size = len(metadata)
                archive.addfile(entry, io.BytesIO(metadata))

    def test_roundtrip_preserves_unicode_paths_binary_bytes_empty_files_and_source(self):
        expected = {'files': 2, 'bytes': 76800}
        self.assertEqual(self.capture(), expected)
        self.assertEqual(restore(self.archive, self.destination), expected)
        self.assertEqual(verify(self.archive, self.destination), expected)
        self.assertEqual((self.source / 'document' / 'فایل.bin').read_bytes(), (self.destination / 'document' / 'فایل.bin').read_bytes())
        self.assertTrue((self.source / 'empty').exists())

    def test_create_requires_quiescence_and_refuses_overwrite_or_output_inside_source(self):
        with self.assertRaises(SnapshotError):
            create(self.source, self.archive)
        self.capture()
        before = self.archive.read_bytes()
        with self.assertRaises(FileExistsError):
            self.capture()
        self.assertEqual(self.archive.read_bytes(), before)
        with self.assertRaises(SnapshotError):
            create(self.source, self.source / 'archive.tar', quiesced=True)

    def test_restore_never_overwrites_existing_destination(self):
        self.capture()
        self.destination.mkdir()
        marker = self.destination / 'existing'
        marker.write_bytes(b'preserve')
        with self.assertRaises(SnapshotError):
            restore(self.archive, self.destination)
        self.assertEqual(marker.read_bytes(), b'preserve')

    def test_missing_corrupted_and_extra_restored_files_fail_verification(self):
        self.capture()
        restore(self.archive, self.destination)
        target = self.destination / 'empty'
        target.write_bytes(b'changed')
        with self.assertRaises(SnapshotError):
            verify(self.archive, self.destination)
        target.unlink()
        with self.assertRaises(SnapshotError):
            verify(self.archive, self.destination)
        target.write_bytes(b'')
        (self.destination / 'extra').write_bytes(b'extra')
        with self.assertRaises(SnapshotError):
            verify(self.archive, self.destination)

    def test_unsafe_and_duplicate_archive_members_are_rejected_before_restore(self):
        for name in ('../outside', '/absolute', 'dir/../outside', 'a\\b', 'C:/outside', './relative', '.'):
            with self.subTest(name=name):
                self.malicious(name)
                with self.assertRaises(SnapshotError):
                    restore(self.archive, self.destination)
                self.assertFalse(self.destination.exists())
        self.malicious('duplicate')
        with tarfile.open(self.archive, 'a') as archive:
            archive.addfile(tarfile.TarInfo('duplicate'), io.BytesIO(b''))
        with self.assertRaises(SnapshotError):
            restore(self.archive, self.destination)

    def test_links_and_missing_manifest_are_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.DIRTYPE):
            self.malicious('link', kind=kind)
            with self.assertRaises(SnapshotError):
                restore(self.archive, self.destination)
        self.malicious('without-manifest', manifest=False)
        with self.assertRaises(SnapshotError):
            restore(self.archive, self.destination)

    def test_source_symlink_is_rejected(self):
        outside = self.base / 'outside'
        outside.write_bytes(b'private outside source')
        try:
            (self.source / 'link').symlink_to(outside)
        except OSError:
            self.skipTest('Symlink creation unavailable on this platform')
        with self.assertRaises(SnapshotError):
            self.capture()

    def test_corrupted_archive_never_passes_as_a_restore(self):
        self.capture()
        self.archive.write_bytes(self.archive.read_bytes()[:20])
        with self.assertRaises((SnapshotError, tarfile.TarError, EOFError)):
            restore(self.archive, self.destination)

    def test_valid_tar_with_incorrect_manifest_checksum_is_not_accepted(self):
        with tarfile.open(self.archive, 'w') as archive:
            entry = tarfile.TarInfo('payload')
            entry.size = 4
            archive.addfile(entry, io.BytesIO(b'data'))
            data = json.dumps({'schema_version': 1, 'files': [{'path': 'payload', 'size': 4, 'sha256': '0' * 64}]}).encode()
            entry = tarfile.TarInfo(MANIFEST)
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        with self.assertRaises(SnapshotError):
            restore(self.archive, self.destination)
        self.assertTrue((self.source / 'document' / 'فایل.bin').exists())

    def test_empty_private_storage_is_supported_but_not_claimed_as_file_recovery(self):
        empty = self.base / 'empty-source'
        empty.mkdir()
        self.assertEqual(create(empty, self.archive, quiesced=True), {'files': 0, 'bytes': 0})
        self.assertEqual(restore(self.archive, self.destination), {'files': 0, 'bytes': 0})
