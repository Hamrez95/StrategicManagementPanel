import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { requestApi } from '../../api/client';
import './lessonFeedback.css';

export type FeedbackContext = {
  unitId: string;
  revision: string;
  userId: string;
  kind: 'card' | 'question' | 'activity' | 'summary';
  targetId: string;
  title: string;
};
export function LessonFeedback({ context }: { context: FeedbackContext }) {
  const [open, setOpen] = useState(false);
  const [draftContext, setDraftContext] = useState(context);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('correction');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submissionId = useRef('');
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const query =
    draftContext.kind === 'card'
      ? `card=${encodeURIComponent(draftContext.targetId)}`
      : draftContext.kind === 'question'
        ? `question=${encodeURIComponent(draftContext.targetId)}`
        : `step=${draftContext.kind}`;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    submissionId.current ||= crypto.randomUUID();
    try {
      const response = await requestApi<{ saved: boolean }>(
        `/api/v1/academy/units/${draftContext.unitId}/feedback/`,
        {
          method: 'POST',
          body: {
            submission_id: submissionId.current,
            expected_user_id: draftContext.userId,
            content_revision: draftContext.revision,
            target_kind: draftContext.kind,
            target_id: draftContext.targetId,
            category,
            message: text,
          },
        },
      );
      if (!response.saved) throw new Error('نظرت ثبت نشد؛ دوباره تلاش کن.');
      setNotice('نظرت همراه آدرس دقیق این بخش ثبت شد.');
      setText('');
      submissionId.current = '';
      setOpen(false);
      trigger.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <aside className="learning-comment-dock" aria-label="نظر و اصلاح محتوا">
        <button
          ref={trigger}
          type="button"
          className="learning-comment-trigger"
          aria-expanded={open}
          aria-controls={open ? 'lesson-feedback-form' : undefined}
          onClick={() => {
            if (!open && !text.trim()) {
              setDraftContext(context);
              setError('');
            }
            setOpen(!open);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M4 4h16v12H9l-5 4V4Z" />
            <path d="M8 8h8M8 12h5" />
          </svg>
          <span>نظر یا اصلاحی داری؟</span>
          <span aria-hidden="true">{open ? '×' : '+'}</span>
        </button>
        {open && (
          <form id="lesson-feedback-form" onSubmit={(event) => void submit(event)}>
            <p className="learning-comment-context">
              دربارهٔ{' '}
              <Link to={`/academy/lesson/${draftContext.unitId}?${query}`}>
                {draftContext.title}
              </Link>
            </p>
            <label>
              نوع نظر
              <select
                value={category}
                disabled={busy}
                onChange={(event) => {
                  setCategory(event.target.value);
                  submissionId.current = '';
                }}
              >
                <option value="correction">اصلاح محتوا</option>
                <option value="question">بخشی که مبهمه</option>
                <option value="suggestion">پیشنهاد</option>
              </select>
            </label>
            <label>
              نظرت رو برای تیم آموزش بنویس
              <textarea
                ref={input}
                rows={2}
                minLength={5}
                maxLength={3000}
                required
                disabled={busy}
                value={text}
                placeholder="چی رو می‌تونیم روشن‌تر یا درست‌تر کنیم؟"
                onChange={(event) => {
                  setText(event.target.value);
                  submissionId.current = '';
                  setError('');
                }}
              />
            </label>
            <div className="learning-comment-actions">
              <small>نظر تو عمومی نمایش داده نمی‌شه.</small>
              <button type="submit" disabled={busy || text.trim().length < 5}>
                {busy ? 'داریم ثبت می‌کنیم…' : 'فرستادن نظر'}
              </button>
            </div>
            {error && (
              <p role="alert" className="academy-warning">
                {error}
              </p>
            )}
          </form>
        )}
      </aside>
      {notice && (
        <div className="academy-toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
