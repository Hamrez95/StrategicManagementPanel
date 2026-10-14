"""Only synthetic local records; never sends through an external mail server."""
import json
import os
import sys
from pathlib import Path
import urllib.request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.mail import send_mail

NAME = 'synthetic-ci-persistence.txt'
BODY = b'synthetic persistent private file'
if sys.argv[1] == 'write':
    if default_storage.exists(NAME):
        raise RuntimeError('Smoke requires a fresh, isolated CI volume.')
    assert default_storage.save(NAME, ContentFile(BODY)) == NAME
    assert send_mail('Synthetic smoke', 'Local catcher only.', 'ci@stratino.invalid', ['test@stratino.invalid']) == 1
elif sys.argv[1] == 'read':
    with default_storage.open(NAME, 'rb') as file:
        assert file.read() == BODY
    with urllib.request.urlopen('http://mailpit:8025/api/v1/messages', timeout=5) as response:
        assert json.load(response)['total'] >= 1
    with urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/ready', timeout=5) as response:
        assert json.load(response) == {'status': 'ok'}
else:
    raise ValueError('Use write or read.')
print('PASS: synthetic private bytes and local mail catcher.')
