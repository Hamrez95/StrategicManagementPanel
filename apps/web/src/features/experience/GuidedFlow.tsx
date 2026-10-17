import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './ExperienceUI';
import { useSpaces, path } from './store';
import { updateSpace, type Space } from './model';
import './guided.css';

export const fa = (value: number, digits = 2) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);

export function useToolDraft(space: Space, scope: string) {
  const { spaces, save } = useSpaces();
  const [message, setMessage] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(space.toolNotes)
        .filter(([key]) => key.startsWith(`${scope}:`))
        .map(([key, value]) => [key.slice(scope.length + 1), value]),
    ),
  );
  function write(updates: Record<string, string>) {
    const next = { ...values, ...updates };
    setValues(next);
    const okay = save(
      updateSpace(spaces, space.id, (current) => ({
        ...current,
        toolNotes: {
          ...current.toolNotes,
          ...Object.fromEntries(
            Object.entries(next).map(([key, value]) => [`${scope}:${key}`, value]),
          ),
        },
      })),
    );
    setMessage(okay ? 'در این مرورگر ذخیره شد' : 'ذخیره نشد؛ پاسخ قبلی حفظ شده است.');
    return okay;
  }
  return { values, write, message };
}

export function GuideHeader({
  space,
  title,
  description,
  status,
}: {
  space: Space;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <>
      <Link className="ex-back-link" to={path(space, 'strategy')}>
        <Icon name="arrow" size={16} />
        همهٔ تحلیل‌ها
      </Link>
      <div className="gx-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <small role="status">{status || 'پاسخ‌ها فقط در همین فضای کار ثبت می‌شوند'}</small>
      </div>
    </>
  );
}

export function GuideStart({
  title,
  description,
  steps,
  onStart,
  started = false,
}: {
  title: string;
  description: string;
  steps: string[];
  onStart: () => void;
  started?: boolean;
}) {
  return (
    <section className="gx-start">
      <span className="gx-start-icon">
        <Icon name="compass" size={32} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <ol className="gx-roadmap">
        {steps.map((step, i) => (
          <li key={step}>
            <span>{fa(i + 1)}</span>
            {step}
          </li>
        ))}
      </ol>
      <button className="ex-button" onClick={onStart}>
        {started ? 'ادامهٔ تکمیل' : 'با هم شروع کنیم'}
        <Icon name="arrow" />
      </button>
      <small>لازم نیست همه‌چیز را بدانی؛ هر پاسخ نامشخص را می‌توانی برای بعد بگذاری.</small>
    </section>
  );
}

export function GuideCard({
  title,
  description,
  step,
  total,
  children,
  onBack,
  onNext,
  onPause,
  nextLabel = 'ادامه',
  error,
}: {
  title: string;
  description: string;
  step: number;
  total: number;
  children: ReactNode;
  onBack: () => void;
  onNext: () => void;
  onPause: () => void;
  nextLabel?: string;
  error?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, title]);
  return (
    <section className="gx-flow">
      <div className="gx-progress-label">
        <span>
          گام {fa(step + 1)} از {fa(total)}
        </span>
        <button className="ex-button ex-button--quiet" onClick={onPause}>
          فعلاً بستن
        </button>
      </div>
      <progress value={step + 1} max={total} aria-label="پیشرفت پرسش‌ها" />
      <form
        className="gx-card"
        key={`${step}:${title}`}
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <p className="gx-card-intro">{description}</p>
        <div className="gx-card-body">{children}</div>
        {error && (
          <p className="gx-error" role="alert">
            {error}
          </p>
        )}
        <footer className="gx-card-footer">
          <button className="ex-button ex-button--quiet" type="button" onClick={onBack}>
            بازگشت
          </button>
          <button className="ex-button" type="submit">
            {nextLabel}
            <Icon name="arrow" />
          </button>
        </footer>
      </form>
    </section>
  );
}

export function Learn({ children, example }: { children: ReactNode; example?: string }) {
  return (
    <details className="gx-learn">
      <summary>
        <Icon name="book" size={18} />
        راهنما و مثال
      </summary>
      <div>
        {children}
        {example && (
          <blockquote>
            <strong>مثال آموزشی</strong>
            <p>{example}</p>
          </blockquote>
        )}
      </div>
    </details>
  );
}

export function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: readonly { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <fieldset className="gx-choices">
      <legend>{label}</legend>
      {options.map((option) => (
        <label key={option.value} className={value === option.value ? 'is-selected' : ''}>
          <input
            type="radio"
            name={label}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
            {option.hint && <small>{option.hint}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ResultRows({ rows }: { rows: { label: string; value: string; note?: string }[] }) {
  return (
    <dl className="gx-result-rows">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>
            {row.label}
            {row.note && <small>{row.note}</small>}
          </dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
