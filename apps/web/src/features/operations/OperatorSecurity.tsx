import { useState, type FormEvent } from 'react';
import { requestApi } from '../../api/client';
import { OperatorIcon } from './OperatorIcon';

export type OperatorCapabilities = {
  triage_feedback?: boolean;
  grant?: boolean;
  revoke?: boolean;
  identity?: boolean;
  manage_accounts?: boolean;
};
export type OperatorStatus = {
  sections: string[];
  mfa_ready: boolean;
  mfa_configured: boolean;
  mfa_enrolled: boolean;
  expires_at: string | null;
  actor: { name: string };
  capabilities?: OperatorCapabilities;
};
type Enrollment = { secret: string; qr_svg: string; expires_at: string };

export function OperatorSecurity({
  status,
  english,
  onVerified,
  onLock,
}: {
  status: OperatorStatus;
  english: boolean;
  onVerified: () => void;
  onLock: () => void;
}) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const enrolled = status.mfa_enrolled || enrollment !== null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!enrolled) {
        const result = await requestApi<Enrollment>('/api/v1/operator/mfa/enroll/', {
          method: 'POST',
          body: { password },
        });
        setEnrollment(result);
      } else {
        await requestApi('/api/v1/operator/mfa/' + (removing ? 'remove' : 'verify') + '/', {
          method: 'POST',
          body: { password, code },
        });
        setPassword('');
        setCode('');
        setEnrollment(null);
        setRemoving(false);
        setConfirmed(false);
        onVerified();
      }
    } catch (err) {
      setError(
        english
          ? 'Verification failed. Check your password and a fresh code, then try again.'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="op-security" aria-labelledby="op-security-title">
      <div className="op-security-story">
        <div className="op-orbit" aria-hidden="true">
          <div className="op-orbit-ring" />
          <span>
            <OperatorIcon name="access" size={54} />
          </span>
          <i>
            <OperatorIcon name="check" size={18} />
          </i>
        </div>
        <span className="op-eyebrow">{t('امنیت حساب مدیریت', 'Admin account security')}</span>
        <h2 id="op-security-title">
          {status.mfa_ready
            ? t('با خیال راحت، مدیریت کن', 'Your admin session is verified')
            : t('یک لایهٔ امن‌تر برای مدیریت', 'An extra layer for your admin account')}
        </h2>
        <p>
          {t(
            'برای دیدن اطلاعات کاربران و انجام کارهای مدیریتی، گذرواژه و کد برنامهٔ Authenticator رو تأیید کن.',
            'Verify your password and an Authenticator code to view users and manage the service.',
          )}
        </p>
        <ol className="op-security-steps">
          <li className={status.mfa_enrolled ? 'is-done' : ''}>
            <span>۱</span>
            <div>
              <strong>{t('برنامهٔ Authenticator', 'Authenticator app')}</strong>
              <p>
                {t(
                  'مثل Google Authenticator یا Microsoft Authenticator.',
                  'For example Google Authenticator or Microsoft Authenticator.',
                )}
              </p>
            </div>
          </li>
          <li className={status.mfa_enrolled ? 'is-done' : ''}>
            <span>۲</span>
            <div>
              <strong>{t('اتصال حساب مدیریت', 'Connect your admin account')}</strong>
              <p>
                {t(
                  'QR رو اسکن کن یا کلید رو در برنامه وارد کن.',
                  'Scan the QR code or enter the key in your app.',
                )}
              </p>
            </div>
          </li>
          <li className={status.mfa_ready ? 'is-done' : ''}>
            <span>۳</span>
            <div>
              <strong>{t('تأیید با کد شش‌رقمی', 'Verify the six-digit code')}</strong>
              <p>
                {t(
                  'تأیید این نشست تا ۱۵ دقیقه معتبره.',
                  'This session is verified for 15 minutes.',
                )}
              </p>
            </div>
          </li>
        </ol>
      </div>
      <div className="op-card op-security-form">
        {status.mfa_ready && !removing ? (
          <>
            <span className="op-icon-tile op-tone-mint">
              <OperatorIcon name="check" size={28} />
            </span>
            <h3>{t('نشست مدیریت تأیید شده', 'Admin session verified')}</h3>
            {status.expires_at && (
              <p>
                {t('اعتبار تا ', 'Valid until ')}
                {new Intl.DateTimeFormat(english ? 'en' : 'fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(status.expires_at))}
              </p>
            )}
            <button className="op-primary" onClick={onLock}>
              <OperatorIcon name="security" size={18} />
              {t('قفل‌کردن نشست', 'Lock session')}
            </button>
            <button className="op-text-button" onClick={() => setRemoving(true)}>
              {t('حذف اتصال برنامهٔ Authenticator', 'Remove Authenticator')}
            </button>
          </>
        ) : !status.mfa_configured ? (
          <div className="op-empty" role="alert">
            <OperatorIcon name="security" size={36} />
            <h3>{t('راه‌اندازی سرور لازمه', 'Server setup required')}</h3>
            <p>
              {t(
                'امنیت دومرحله‌ای هنوز روی سرور تنظیم نشده. از مسئول فنی بخواه تنظیمش کنه.',
                'Ask your server administrator to configure operator MFA before continuing.',
              )}
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <span className="op-icon-tile op-tone-mint">
              <OperatorIcon name={removing ? 'security' : 'access'} size={27} />
            </span>
            <h3>
              {removing
                ? t('حذف اتصال Authenticator', 'Remove Authenticator')
                : enrolled
                  ? t('کد برنامه‌ات رو وارد کن', 'Enter your Authenticator code')
                  : t('برنامه‌ات رو متصل کن', 'Connect your Authenticator')}
            </h3>
            <p>
              {t(
                'از گذرواژهٔ همین حساب مدیریت استفاده کن.',
                'Use the password for this admin account.',
              )}
            </p>
            <label>
              {t('گذرواژه', 'Password')}
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={4096}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {enrollment && (
              <div className="op-qr">
                <img
                  src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(enrollment.qr_svg)}
                  alt={t(
                    'QR اتصال حساب استراتینو به Authenticator',
                    'QR code for connecting Stratino to Authenticator',
                  )}
                  width="188"
                  height="188"
                />
                <p>{t('این کلید رو با کسی به اشتراک نذار.', 'Do not share this key.')}</p>
                <details>
                  <summary>{t('واردکردن دستی کلید', 'Enter key manually')}</summary>
                  <code dir="ltr">{enrollment.secret}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(enrollment.secret)
                        .then(() => setCopyMessage(t('کلید کپی شد.', 'Key copied.')))
                        .catch(() =>
                          setCopyMessage(
                            t(
                              'کپی نشد؛ کلید رو دستی وارد کن.',
                              'Could not copy. Enter it manually.',
                            ),
                          ),
                        );
                    }}
                  >
                    {t('کپی کلید', 'Copy key')}
                  </button>
                  <span role="status">{copyMessage}</span>
                </details>
              </div>
            )}
            {enrolled && (
              <label>
                {t('کد شش‌رقمی', 'Six-digit code')}
                <input
                  className="op-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  pattern="[0-9]{6}"
                  required
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value
                        .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
                        .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
                        .replace(/[^0-9]/g, ''),
                    )
                  }
                />
              </label>
            )}
            {removing && (
              <label className="op-confirm">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t(
                  'می‌دونم با حذف اتصال، همهٔ نشست‌های مدیریت قفل می‌شن.',
                  'I understand removing the factor locks all admin sessions.',
                )}
              </label>
            )}
            {error && (
              <p className="op-error" role="alert">
                {error}
              </p>
            )}
            <button
              className={removing ? 'op-danger' : 'op-primary'}
              disabled={busy || (removing && !confirmed)}
              type="submit"
            >
              {busy
                ? t('داریم بررسی می‌کنیم…', 'Verifying…')
                : removing
                  ? t('حذف اتصال', 'Remove factor')
                  : enrolled
                    ? t('تأیید و ادامه', 'Verify and continue')
                    : t('ساخت QR اتصال', 'Generate setup QR')}
              <OperatorIcon name="arrow" size={18} />
            </button>
            {removing && (
              <button
                type="button"
                onClick={() => {
                  setRemoving(false);
                  setCode('');
                  setPassword('');
                }}
              >
                {t('انصراف', 'Cancel')}
              </button>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
