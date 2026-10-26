"""Private-file snapshots with a checksum manifest; never extract arbitrary tar paths."""
import argparse
import hashlib
import io
import json
import os
import tarfile
from pathlib import Path, PurePosixPath

MANIFEST = '.stratino-snapshot.json'
MAX_MANIFEST_BYTES = 16 * 1024 * 1024


class SnapshotError(ValueError):
    pass


def safe_name(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name or '\x00' in name:
        raise SnapshotError('Invalid snapshot path.')
    path = PurePosixPath(name)
    if not path.parts or path.is_absolute() or '..' in path.parts or path.as_posix() != name or name == MANIFEST:
        raise SnapshotError('Invalid snapshot path.')
    return path


def files(root):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise SnapshotError('Snapshot root must be a real directory.')
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise SnapshotError('Symlinks are not supported in private-file snapshots.')
        if path.is_dir():
            continue
        if not path.is_file():
            raise SnapshotError('Only regular private files can be snapshotted.')
        name = path.relative_to(root).as_posix()
        safe_name(name)
        result[name] = path
    return result


class HashedReader:
    def __init__(self, source):
        self.source = source
        self.digest = hashlib.sha256()

    def read(self, size=-1):
        data = self.source.read(size)
        self.digest.update(data)
        return data


def create(root, output, *, quiesced=False):
    if not quiesced:
        raise SnapshotError('Quiesce all file writers before creating a snapshot.')
    if Path(root).is_symlink():
        raise SnapshotError('Snapshot root must not be a symlink.')
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or root in output.parents:
        raise SnapshotError('Snapshot output must be outside the private-file root.')
    entries = files(root)
    manifest = {'schema_version': 1, 'files': []}
    # Exclusive creation prevents accidental overwrite of an existing backup.
    with output.open('xb') as destination, tarfile.open(fileobj=destination, mode='w:gz') as archive:
        for name, path in entries.items():
            before = path.stat()
            info = tarfile.TarInfo(name)
            info.size, info.mode = before.st_size, 0o600
            # Reject symlink substitution between enumeration and open on Linux.
            descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
            with os.fdopen(descriptor, 'rb') as source:
                opened = os.fstat(source.fileno())
                if (opened.st_ino, opened.st_dev, opened.st_size) != (before.st_ino, before.st_dev, before.st_size):
                    raise SnapshotError('Private files changed during snapshot creation.')
                reader = HashedReader(source)
                archive.addfile(info, reader)
                after = os.fstat(source.fileno())
            if (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_size, before.st_mtime_ns, before.st_ctime_ns):
                raise SnapshotError('Private files changed during snapshot creation.')
            manifest['files'].append({'path': name, 'size': info.size, 'sha256': reader.digest.hexdigest()})
        data = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()
        if len(data) > MAX_MANIFEST_BYTES:
            raise SnapshotError('Snapshot manifest exceeds the supported size.')
        info = tarfile.TarInfo(MANIFEST)
        info.size, info.mode = len(data), 0o600
        archive.addfile(info, io.BytesIO(data))
    return {'files': len(entries), 'bytes': sum(row['size'] for row in manifest['files'])}


def inspect(archive):
    members = archive.getmembers()
    names = [member.name for member in members]
    if len(set(names)) != len(names) or names.count(MANIFEST) != 1:
        raise SnapshotError('Snapshot members are duplicated or the manifest is missing.')
    metadata = archive.getmember(MANIFEST)
    if not metadata.isfile() or metadata.size > MAX_MANIFEST_BYTES:
        raise SnapshotError('Invalid snapshot manifest.')
    try:
        manifest = json.load(archive.extractfile(metadata))
    except (ValueError, UnicodeError) as error:
        raise SnapshotError('Invalid snapshot manifest.') from error
    if not isinstance(manifest, dict) or set(manifest) != {'schema_version', 'files'} or type(manifest['schema_version']) is not int or manifest['schema_version'] != 1 or not isinstance(manifest['files'], list):
        raise SnapshotError('Unsupported snapshot manifest.')
    entries = {}
    for row in manifest['files']:
        if not isinstance(row, dict) or set(row) != {'path', 'size', 'sha256'}:
            raise SnapshotError('Invalid snapshot file metadata.')
        safe_name(row['path'])
        if row['path'] in entries or type(row['size']) is not int or row['size'] < 0 or not isinstance(row['sha256'], str) or len(row['sha256']) != 64 or any(c not in '0123456789abcdef' for c in row['sha256']):
            raise SnapshotError('Invalid snapshot file metadata.')
        entries[row['path']] = row
    if set(names) != {*entries, MANIFEST}:
        raise SnapshotError('Snapshot files do not match the manifest.')
    for member in members:
        if not member.isfile() or getattr(member, 'sparse', None) is not None or (member.name != MANIFEST and member.size != entries[member.name]['size']):
            raise SnapshotError('Snapshot contains unsupported file types or sizes.')
    return entries


def restore(archive_path, destination):
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        raise SnapshotError('Restore destination must not exist; never restore over live files.')
    with tarfile.open(archive_path, 'r:*') as archive:
        entries = inspect(archive)
        destination.mkdir(mode=0o700)
        for name, row in entries.items():
            target = destination.joinpath(*safe_name(name).parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            digest = hashlib.sha256()
            with archive.extractfile(name) as source, target.open('xb') as output:
                os.chmod(target, 0o600)
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
            if target.stat().st_size != row['size'] or digest.hexdigest() != row['sha256']:
                raise SnapshotError('Snapshot file checksum mismatch; partial destination is not accepted.')
    return verify(archive_path, destination)


def verify(archive_path, root):
    with tarfile.open(archive_path, 'r:*') as archive:
        entries = inspect(archive)
    actual = files(root)
    if set(actual) != set(entries):
        raise SnapshotError('Restored files are missing or unexpected files exist.')
    for name, path in actual.items():
        with path.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        if path.stat().st_size != entries[name]['size'] or digest != entries[name]['sha256']:
            raise SnapshotError('Restored file checksum mismatch.')
    return {'files': len(entries), 'bytes': sum(row['size'] for row in entries.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    capture = commands.add_parser('create')
    capture.add_argument('--root', required=True)
    capture.add_argument('--output', required=True)
    capture.add_argument('--quiesced', action='store_true')
    recovery = commands.add_parser('restore')
    recovery.add_argument('--archive', required=True)
    recovery.add_argument('--destination', required=True)
    audit = commands.add_parser('verify')
    audit.add_argument('--archive', required=True)
    audit.add_argument('--root', required=True)
    args = parser.parse_args()
    try:
        if args.action == 'create':
            result = create(args.root, args.output, quiesced=args.quiesced)
        elif args.action == 'restore':
            result = restore(args.archive, args.destination)
        else:
            result = verify(args.archive, args.root)
    except (OSError, ValueError, EOFError, tarfile.TarError):
        # Do not print private paths, filenames, file contents or traceback secrets.
        parser.exit(1, 'Private-file snapshot failed; preserve the source and inspect the private recovery evidence.\n')
    print(json.dumps({'status': 'pass', 'action': args.action, **result}))


if __name__ == '__main__':
    main()
