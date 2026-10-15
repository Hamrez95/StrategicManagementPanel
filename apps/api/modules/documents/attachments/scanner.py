import socket
import struct

from django.conf import settings


class ScanUnavailable(Exception):
    """The scanner could not produce a trustworthy clean result."""


class MalwareFound(Exception):
    """ClamAV identified an infected attachment."""


def scan_stream(file_obj):
    host = settings.CLAMAV_HOST
    if not host:
        raise ScanUnavailable('Scanner is not configured.')

    try:
        with socket.create_connection((host, settings.CLAMAV_PORT), timeout=settings.CLAMAV_TIMEOUT_SECONDS) as client:
            client.settimeout(settings.CLAMAV_TIMEOUT_SECONDS)
            client.sendall(b'zINSTREAM\0')
            for chunk in iter(lambda: file_obj.read(64 * 1024), b''):
                client.sendall(struct.pack('!I', len(chunk)))
                client.sendall(chunk)
            client.sendall(struct.pack('!I', 0))
            response = bytearray()
            while len(response) <= 4096:
                chunk = client.recv(512)
                if not chunk:
                    break
                response.extend(chunk)
                if b'\0' in response or b'\n' in response:
                    break
    except (OSError, TimeoutError, struct.error) as error:
        raise ScanUnavailable('Scanner did not complete.') from error

    result = bytes(response).strip(b'\0\r\n ').decode('ascii', errors='replace')
    if result.endswith(': OK'):
        return
    if result.endswith(' FOUND'):
        raise MalwareFound('Scanner detected malware.')
    raise ScanUnavailable('Scanner returned an invalid result.')
