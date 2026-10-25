import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, requestApi } from '../../api/client';
import { OperatorIcon } from './OperatorIcon';

const metrics = [
  ['accounts', 'کاربر ثبت‌شده', 'Registered accounts', 'mint'],
  ['workspaces', 'فضای کاری', 'Workspaces', 'sand'],
  ['subscriptions', 'اشتراک ثبت‌شده', 'Recorded subscriptions', 'lilac'],
  ['academy', 'مجموعهٔ آموزشی', 'Academy courses', 'rose'],
] as const;

export function OperatorOverview({
  english,
  sections,
  onReauthenticate,
}: {
  english: boolean;
  sections: string[];
  onReauthenticate: () => void;
}) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    requestApi<{ counts: Record<string, number> }>('/api/v1/operator/overview/', {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setCounts(data.counts);
          setError('');
        }
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && [401, 403].includes(err.status)) onReauthenticate();
        setCounts(null);
        setError(err.message);
      });
    return () => controller.abort();
  }, [reload, onReauthenticate]);
  return (
    <div className="op-overview">
      <section className="op-welcome op-card">
        <div>
          <span className="op-eyebrow">{t('نمای کلی سرویس', 'Service overview')}</span>
          <h2>{t('از یک نگاه، به کار بعدی', 'From an overview to the next action')}</h2>
          <p>
            {t(
              'حساب‌ها، دسترسی‌ها و آکادمی رو از همین‌جا دنبال کن.',
              'Follow accounts, access and the Academy from one place.',
            )}
          </p>
          <Link
            to={sections.includes('feedback') ? '/internal/feedback' : '/internal/security'}
            className="op-primary"
          >
            {sections.includes('feedback')
              ? t('بررسی نظرهای یادگیرنده‌ها', 'Review learner feedback')
              : t('امنیت حساب مدیریت', 'Admin account security')}
            <OperatorIcon name="arrow" size={18} />
          </Link>
        </div>
        <div className="op-welcome-art" aria-hidden="true">
          <div className="op-art-sheet">
            <OperatorIcon name="academy" size={40} />
            <i />
            <i />
            <i />
          </div>
          <span className="op-art-seal">
            <OperatorIcon name="check" size={26} />
          </span>
          <span className="op-art-dot" />
        </div>
      </section>
      {error ? (
        <div className="op-error" role="alert">
          <p>{error}</p>
          <button onClick={() => setReload((value) => value + 1)}>
            {t('تلاش دوباره', 'Retry')}
          </button>
        </div>
      ) : (
        <section className="op-metrics" aria-label={t('آمار سرویس', 'Service statistics')}>
          {metrics
            .filter(([section]) => sections.includes(section))
            .map(([section, fa, en, tone]) => (
              <Link key={section} className="op-stat op-card" to={'/internal/' + section}>
                <span className={'op-icon-tile op-tone-' + tone}>
                  <OperatorIcon name={section} size={25} />
                </span>
                <div>
                  <span>{english ? en : fa}</span>
                  <strong>
                    {counts && typeof counts[section] === 'number'
                      ? new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(counts[section])
                      : '—'}
                  </strong>
                </div>
                <OperatorIcon name="arrow" size={18} />
              </Link>
            ))}
          {!counts && (
            <span className="op-sr-only" role="status">
              {t('داریم آمار رو می‌گیریم…', 'Loading statistics…')}
            </span>
          )}
        </section>
      )}
      <div className="op-overview-grid">
        <section className="op-card op-destinations">
          <header>
            <span className="op-icon-tile op-tone-mint">
              <OperatorIcon name="workspaces" />
            </span>
            <div>
              <h3>{t('مدیریت سرویس', 'Manage the service')}</h3>
              <p>
                {t(
                  'دسترسی کاربران و مسیر تغییرات رو بررسی کن.',
                  'Review user access and its history.',
                )}
              </p>
            </div>
          </header>
          {[
            [
              'accounts',
              'حساب‌های کاربران',
              'User accounts',
              'وضعیت حساب و تأیید ایمیل',
              'Account and email verification status',
            ],
            [
              'subscriptions',
              'اشتراک‌های مدیریت',
              'Management subscriptions',
              'دسترسی‌های ثبت‌شده برای هر کاربر',
              'Recorded grants for each account',
            ],
            [
              'audit',
              'تاریخچهٔ فعالیت‌ها',
              'Activity history',
              'رویدادهای دسترسی و کارهای مدیریتی',
              'Access and administration events',
            ],
          ]
            .filter(([s]) => sections.includes(s))
            .map(([s, fa, en, subfa, suben]) => (
              <Link to={'/internal/' + s} className="op-destination" key={s}>
                <span className="op-soft-icon">
                  <OperatorIcon name={s} />
                </span>
                <span>
                  <strong>{t(fa, en)}</strong>
                  <small>{t(subfa, suben)}</small>
                </span>
                <OperatorIcon name="arrow" size={18} />
              </Link>
            ))}
        </section>
        <section className="op-card op-destinations">
          <header>
            <span className="op-icon-tile op-tone-sand">
              <OperatorIcon name="academy" />
            </span>
            <div>
              <h3>{t('آکادمی استراتینو', 'Stratino Academy')}</h3>
              <p>
                {t(
                  'محتوای آموزشی و بازخوردها، کنار هم.',
                  'Learning content and feedback, together.',
                )}
              </p>
            </div>
          </header>
          {sections.includes('academy') && (
            <Link to="/internal/academy" className="op-destination">
              <span className="op-soft-icon">
                <OperatorIcon name="academy" />
              </span>
              <span>
                <strong>{t('فهرست مجموعه‌ها', 'Course inventory')}</strong>
                <small>
                  {counts?.lessons !== undefined
                    ? new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(counts.lessons) +
                      t(
                        ' بخش آموزشی و مرور در پایگاه داده',
                        ' learning and review units in the database',
                      )
                    : t('ترتیب و شناسهٔ محتوای متصل', 'Connected content identifiers and order')}
                </small>
              </span>
              <OperatorIcon name="arrow" size={18} />
            </Link>
          )}
          {sections.includes('feedback') && (
            <Link to="/internal/feedback" className="op-destination">
              <span className="op-soft-icon">
                <OperatorIcon name="feedback" />
              </span>
              <span>
                <strong>{t('نظرهای یادگیرنده‌ها', 'Learner feedback')}</strong>
                <small>
                  {t('متن نظر همراه با آدرس دقیق کارت', 'Comments with the exact card location')}
                </small>
              </span>
              <OperatorIcon name="arrow" size={18} />
            </Link>
          )}
          <div className="op-inline-note">
            <OperatorIcon name="access" size={20} />
            <p>
              {t(
                'ویرایش محتوای تأییدشده، به گردش بازبینی علمی وابسته است.',
                'Changes to approved content require the scientific review workflow.',
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
