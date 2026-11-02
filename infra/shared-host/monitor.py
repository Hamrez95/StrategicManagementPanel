#!/usr/bin/env python3
"""Host timer: notify the owner only when public readiness changes or backup fails."""
from datetime import datetime, timezone
from email.message import EmailMessage
import json
from pathlib import Path
import smtplib
import shutil
import ssl
import sys
import urllib.request

from configuration import read_env

ROOT = Path(__file__).resolve().parent


def notify(message):
    private = Path(read_env(ROOT / 'release.env')['HOST_SECRETS_DIR'])
    smtp = read_env(private / 'stratino-api.env')
    recipient = read_env(private / 'mazeduneh-api.env')['Admin__Email']
    mail = EmailMessage()
    mail['Subject'] = 'Business server: action required'
    mail['From'] = smtp['DEFAULT_FROM_EMAIL']
    mail['To'] = recipient
    mail.set_content(message + '\n' + datetime.now(timezone.utc).isoformat())
    with smtplib.SMTP(smtp['EMAIL_HOST'], int(smtp['EMAIL_PORT']), timeout=20) as connection:
        connection.starttls(context=ssl.create_default_context())
        connection.login(smtp['EMAIL_HOST_USER'], smtp['EMAIL_HOST_PASSWORD'])
        connection.send_message(mail)


def probe(url):
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            return response.status == 200
    except OSError:
        return False


def check():
    private = Path(read_env(ROOT / 'release.env')['HOST_SECRETS_DIR'])
    state_file = private / 'monitor-state.json'
    previous = json.loads(state_file.read_text()) if state_file.exists() else {}
    current = {url: probe(url) for url in ['https://mazeduneh.ir/', 'https://api.mazeduneh.ir/health/ready',
                                           'https://stratino.ir/api/v1/health/ready']}
    backup_file = private / 'last-backup.json'
    if backup_file.exists():
        uploaded = datetime.fromisoformat(json.loads(backup_file.read_text())['uploaded_at'])
        current['Encrypted backup age under 36 hours'] = (datetime.now(timezone.utc) - uploaded).total_seconds() < 36 * 3600
    else:
        current['Encrypted backup age under 36 hours'] = False
    disk = shutil.disk_usage(private)
    current['Server disk free above 10 percent and 5 GiB'] = disk.free > max(disk.total // 10, 5 * 1024 ** 3)
    changed = [url for url, healthy in current.items() if previous.get(url, True) != healthy]
    if changed:
        notify('\n'.join(f'{url}: {"recovered" if current[url] else "unavailable"}' for url in changed))
    # A notification failure leaves old state intact so the next timer retries delivery.
    state_file.write_text(json.dumps(current))


if __name__ == '__main__':
    if len(sys.argv) > 1:
        notify('Scheduled encrypted backup failed. Inspect the businesses-backup systemd journal privately.')
    else:
        check()
