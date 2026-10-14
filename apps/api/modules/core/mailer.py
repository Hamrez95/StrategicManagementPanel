import logging
import smtplib
import time

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def deliver_email(subject, body, recipient, *, purpose='product'):
    """Send through the configured mailer with a small bounded retry window."""
    for attempt in range(3):
        try:
            sent = send_mail(
                subject,
                body,
                settings.DEFAULT_FROM_EMAIL,
                [recipient],
                fail_silently=False,
            )
            if sent == 1:
                return True
        except (OSError, smtplib.SMTPException):
            if attempt < 2:
                time.sleep(0.2 * (attempt + 1))
    logger.warning('%s email delivery failed after bounded retries.', purpose)
    return False
