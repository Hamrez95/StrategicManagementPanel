import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { requestApi } from '../../api/client';
import { faNumber } from './connectedData';
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
export function AcademyFeedbackInbox() {
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
    <main className="academy-feedback-inbox" dir="rtl">
      <Link to="/academy">رفتن به آکادمی</Link>
      <h1>نظرهای یادگیرنده‌ها</h1>
      <p>
        نظرها همراه با متن و آدرس بخش مربوط ثبت شدن. بعد از بررسی می‌تونی وضعیتشون رو تغییر بدی.
      </p>
      <div className="feedback-inbox-controls">
        <label>
          وضعیت{' '}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="new">تازه</option>
            <option value="reviewed">بررسی‌شده</option>
            <option value="resolved">رسیدگی‌شده</option>
            <option value="all">همه</option>
          </select>
        </label>
        <button type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>
          تازه‌کردن
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">داریم نظرها رو می‌گیریم…</p>
      ) : (
        !error && (
          <>
            <p>{faNumber(count)} نظر</p>
            {!entries.length && <p>نظری با این وضعیت نداریم.</p>}
            {entries.map((entry) => (
              <article key={entry.id} className="feedback-inbox-entry">
                <p>
                  {categories[entry.category]} · {labels[entry.status]} ·{' '}
                  {new Intl.DateTimeFormat('fa-IR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(entry.created_at))}
                </p>
                <h2>{entry.unit_title}</h2>
                <h3>{entry.target_title}</h3>
                <p className="feedback-inbox-message">{entry.message}</p>
                <Link to={entry.content_path}>دیدن بخش مربوط در درس</Link>
                <details>
                  <summary>متن و نشانی هنگام ثبت</summary>
                  <p className="feedback-inbox-message">{entry.target_text}</p>
                  <code dir="ltr">{entry.target_id}</code>
                  <br />
                  <code dir="ltr">{entry.content_revision}</code>
                </details>
                <div className="feedback-inbox-controls">
                  {(Object.keys(labels) as FeedbackStatus[]).map((next) => (
                    <button
                      key={next}
                      type="button"
                      disabled={busy !== null || next === entry.status}
                      onClick={() => void update(entry, next)}
                    >
                      {busy === entry.id ? 'داریم ثبت می‌کنیم…' : labels[next]}
                    </button>
                  ))}
                </div>
              </article>
            ))}
            <nav className="feedback-inbox-controls" aria-label="صفحه‌های نظرها">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                صفحهٔ قبل
              </button>
              <span>صفحهٔ {faNumber(page)}</span>
              <button
                type="button"
                disabled={page * 25 >= count}
                onClick={() => setPage((value) => value + 1)}
              >
                صفحهٔ بعد
              </button>
            </nav>
          </>
        )
      )}
    </main>
  );
}
