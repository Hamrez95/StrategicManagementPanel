import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { requestApi } from '../../api/client';
import './feedbackInbox.css';
type FeedbackStatus = 'new' | 'reviewed' | 'resolved';
type Entry = {
  id: number;
  unit_id: string;
  unit_title: string;
  target_id: string;
  target_title: string;
  target_text: string;
  content_path: string;
  content_revision: string;
  category: string;
  status: FeedbackStatus;
  message: string;
  created_at: string;
};
const labels = { new: 'تازه', reviewed: 'بررسی‌شده', resolved: 'رسیدگی‌شده' };
const categories: Record<string, string> = {
  correction: 'اصلاح محتوا',
  question: 'ابهام',
  suggestion: 'پیشنهاد',
};
export function AcademyFeedbackInbox({
  embedded = false,
  english = false,
  canTriage = false,
}: {
  embedded?: boolean;
  english?: boolean;
  canTriage?: boolean;
} = {}) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const number = (value: number) => new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(value);
  const statusLabels = english
    ? { new: 'New', reviewed: 'Reviewed', resolved: 'Resolved' }
    : labels;
  const categoryLabels = english
    ? ({ correction: 'Correction', question: 'Question', suggestion: 'Suggestion' } as Record<
        string,
        string
      >)
    : categories;
  const Container = embedded ? 'section' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const [status, setStatus] = useState('new');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    requestApi<{ results: Entry[]; count: number }>(
      `/api/v1/academy/feedback/inbox/?status=${status}&page=${page}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setEntries(data.results);
        setCount(data.count);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, page, reload]);
  async function update(entry: Entry, next: FeedbackStatus) {
    setBusy(entry.id);
    setError('');
    try {
      await requestApi(`/api/v1/academy/feedback/${entry.id}/`, {
        method: 'PATCH',
        body: { status: next },
      });
      setReload((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Container className="academy-feedback-inbox" dir={english ? 'ltr' : 'rtl'}>
      {!embedded && <Link to="/academy">{t('رفتن به آکادمی', 'Open Academy')}</Link>}
      <Heading>{t('نظرهای یادگیرنده‌ها', 'Learner feedback')}</Heading>
      <p>
        {t(
          'نظرها همراه با متن و آدرس بخش مربوط ثبت شدن. بعد از بررسی می‌تونی وضعیتشون رو تغییر بدی.',
          'Feedback includes the text and exact content location. Authorized reviewers can update its status.',
        )}
      </p>
      <div className="feedback-inbox-controls">
        <label>
          {t('وضعیت', 'Status')}{' '}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="new">{t('تازه', 'New')}</option>
            <option value="reviewed">{t('بررسی‌شده', 'Reviewed')}</option>
            <option value="resolved">{t('رسیدگی‌شده', 'Resolved')}</option>
            <option value="all">{t('همه', 'All')}</option>
          </select>
        </label>
        <button type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>
          {t('تازه‌کردن', 'Refresh')}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">{t('داریم نظرها رو می‌گیریم…', 'Loading feedback…')}</p>
      ) : (
        !error && (
          <>
            <p>
              {number(count)} {t('نظر', 'comments')}
            </p>
            {!entries.length && (
              <p>{t('نظری با این وضعیت نداریم.', 'No feedback with this status.')}</p>
            )}
            {entries.map((entry) => (
              <article key={entry.id} className="feedback-inbox-entry">
                <p>
                  {categoryLabels[entry.category]} · {statusLabels[entry.status]} ·{' '}
                  {new Intl.DateTimeFormat(english ? 'en' : 'fa-IR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(entry.created_at))}
                </p>
                <h2 dir="auto">{entry.unit_title}</h2>
                <h3 dir="auto">{entry.target_title}</h3>
                <p className="feedback-inbox-message" dir="auto">
                  {entry.message}
                </p>
                <Link to={entry.content_path}>
                  {t('دیدن بخش مربوط در درس', 'Open the exact lesson location')}
                </Link>
                <details>
                  <summary>{t('متن و نشانی هنگام ثبت', 'Text and location at submission')}</summary>
                  <p className="feedback-inbox-message">{entry.target_text}</p>
                  <code dir="ltr">{entry.target_id}</code>
                  <br />
                  <code dir="ltr">{entry.content_revision}</code>
                </details>
                {canTriage && (
                  <div className="feedback-inbox-controls">
                    {(Object.keys(labels) as FeedbackStatus[]).map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={busy !== null || next === entry.status}
                        onClick={() => void update(entry, next)}
                      >
                        {busy === entry.id
                          ? t('داریم ثبت می‌کنیم…', 'Saving…')
                          : statusLabels[next]}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            <nav
              className="feedback-inbox-controls"
              aria-label={t('صفحه‌های نظرها', 'Feedback pages')}
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t('صفحهٔ قبل', 'Previous page')}
              </button>
              <span>
                {t('صفحهٔ ', 'Page ')}
                {number(page)}
              </span>
              <button
                type="button"
                disabled={page * 25 >= count}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('صفحهٔ بعد', 'Next page')}
              </button>
            </nav>
          </>
        )
      )}
    </Container>
  );
}
