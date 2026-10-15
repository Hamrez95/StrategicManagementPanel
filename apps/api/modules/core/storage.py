from django.core.files.storage import FileSystemStorage
from pathlib import Path
import os

class PrivateFileStorage(FileSystemStorage):
    def url(self, name):
        raise NotImplementedError('Private files require an authorized download endpoint.')

    def atomic_move(self, source, destination):
        """Move a private object within the same storage volume atomically."""
        source_path = Path(self.path(source))
        destination_path = Path(self.path(destination))
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source_path, destination_path)
