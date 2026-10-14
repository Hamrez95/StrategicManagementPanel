from django.core.files.storage import FileSystemStorage

class PrivateFileStorage(FileSystemStorage):
    def url(self, name):
        raise NotImplementedError('Private files require an authorized download endpoint.')
