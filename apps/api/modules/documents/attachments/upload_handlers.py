from django.conf import settings
from django.core.files.uploadhandler import FileUploadHandler, StopUpload


class AttachmentSizeLimitHandler(FileUploadHandler):
    """Stop multipart parsing as soon as a single attachment exceeds policy."""

    def __init__(self, request=None):
        super().__init__(request)
        self.file_count = 0
        self.too_many_files = False
        self.exceeded = False

    def new_file(self, *args, **kwargs):
        self.file_count += 1
        if self.file_count > 1:
            self.too_many_files = True
            raise StopUpload(connection_reset=False)
        super().new_file(*args, **kwargs)
        self.file_size = 0
        self.exceeded = False

    def receive_data_chunk(self, raw_data, start):
        self.file_size += len(raw_data)
        if self.file_size > settings.DOCUMENT_ATTACHMENT_MAX_BYTES:
            self.exceeded = True
            raise StopUpload(connection_reset=False)
        return raw_data

    def file_complete(self, file_size):
        return None
