import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { ApiError } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { readExecutionBoard } from '../decisions/api';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';
import {
  addCardAction,
  appendCard,
  blankCard,
  blankIndicator,
  perspectives,
  readCards,
  saveCard,
  writable,
  type Card,
  type Indicator,
  type Objective,
  type Perspective,
} from './api';
import './scorecards.css';

const labels: Record<Perspective, [string, string, string]> = {
  financial: ['مالی', 'Financial', '↗'],
  customer: ['مشتری', 'Customer', '◎'],
  process: ['فرایندهای داخلی', 'Internal processes', '⇄'],
  learning: ['یادگیری و رشد', 'Learning and growth', '✦'],
};
const normalize = (v: string) =>
  v
    .replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) - (d.charCodeAt(0) >= 1776 ? 1776 : 1632)))
    .replace(/٫/g, '.');
function display(v: string | number | null | undefined, en: boolean) {
  if (v === null || v === undefined || v === '') return en ? 'Unknown' : 'نامشخص';
  const text = String(v)
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');
  return en ? text : text.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]).replace(/\./g, '٫');
}
function date(v: string | null | undefined, en: boolean) {
  return v
    ? new Intl.DateTimeFormat(en ? 'en-US' : 'fa-IR', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${v}T00:00:00Z`))
    : en
      ? 'Not set'
      : 'تعیین نشده';
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  multiline = false,
}: {
  label: string;
  value: string | number | null;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="bsc-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          required={required}
          maxLength={2000}
        />
      ) : (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          required={required}
          maxLength={type === 'date' ? undefined : 2000}
          inputMode={type === 'text' ? undefined : 'numeric'}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="bsc-field">
      <span>{label}</span>
      <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
const steps = [
  ['جهت و دوره', 'Direction and period'],
  ['هدف‌ها و شاخص‌ها', 'Objectives and measures'],
  ['نقشهٔ استراتژی', 'Strategy map'],
  ['عملکرد و مرور', 'Performance and review'],
];

function IndicatorForm({
  indicator: i,
  update,
  en,
  members,
}: {
  indicator: Indicator;
  update: (value: Partial<Indicator>) => void;
  en: boolean;
  members: { id: string; name: string }[];
}) {
  const [expanded, setExpanded] = useState(!i.name);
  const t = (fa: string, english: string) => (en ? english : fa);
  const num = (key: 'baseline' | 'target' | 'target_high' | 'warning_margin', label: string) => (
    <Field
      label={label}
      value={i[key]}
      onChange={(v) => update({ [key]: v === '' ? null : normalize(v) })}
    />
  );
  return (
    <details
      className="bsc-indicator"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        {i.name || t('شاخص تازه', 'New indicator')}
        <small>{i.unit}</small>
      </summary>
      <div className="bsc-form-grid">
        <Field
          label={t('نام شاخص', 'Indicator name')}
          value={i.name}
          required
          onChange={(name) => update({ name })}
        />
        <Field
          label={t('واحد سنجش', 'Unit')}
          value={i.unit}
          onChange={(unit) => update({ unit })}
        />
        <Field
          label={t(
            'تعریف عملیاتی؛ دقیقاً چه چیزی سنجیده می‌شه؟',
            'Operational definition: what exactly is measured?',
          )}
          value={i.definition}
          multiline
          onChange={(definition) => update({ definition })}
        />
        <Select
          label={t('جهت مطلوب', 'Desired direction')}
          value={i.direction}
          onChange={(direction) =>
            update({ direction: direction as Indicator['direction'], target_high: null })
          }
        >
          <option value="increase">{t('بیشتر بهتره', 'Higher is better')}</option>
          <option value="decrease">{t('کمتر بهتره', 'Lower is better')}</option>
          <option value="range">{t('داخل یک محدوده', 'Within a range')}</option>
        </Select>
        {num(
          'target',
          i.direction === 'range'
            ? t('حد پایین هدف', 'Target lower bound')
            : t('مقدار هدف', 'Target value'),
        )}
        {i.direction === 'range' && num('target_high', t('حد بالای هدف', 'Target upper bound'))}
        <Field
          label={t('موعد تحقق', 'Target deadline')}
          type="date"
          value={i.due_on}
          onChange={(v) => update({ due_on: v || null })}
        />
        {num(
          'baseline',
          t('مقدار خط پایه؛ خالی یعنی نامشخص', 'Baseline value; empty means unknown'),
        )}
        <Field
          label={t('تاریخ خط پایه', 'Baseline date')}
          type="date"
          value={i.baseline_on}
          onChange={(v) => update({ baseline_on: v || null })}
        />
        <Select
          label={t('مسئول شاخص', 'Indicator owner')}
          value={i.owner_id}
          onChange={(owner_id) => update({ owner_id: owner_id || null })}
        >
          <option value="">{t('هنوز مشخص نیست', 'Not assigned')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          {i.owner_id && !members.some((m) => m.id === i.owner_id) && (
            <option value={i.owner_id}>
              {t('عضو قبلی؛ مسئول تازه انتخاب کن', 'Former member; select an owner')}
            </option>
          )}
        </Select>
        <Field
          label={t('فاصلهٔ سنجش به روز', 'Measurement interval in days')}
          value={i.cadence_days}
          onChange={(v) => update({ cadence_days: v === '' ? null : Number(normalize(v)) })}
        />
        <Field
          label={t('منبع داده', 'Data source')}
          value={i.source}
          onChange={(source) => update({ source })}
        />
      </div>
      <details>
        <summary>
          {t('روش محاسبه و جزئیات تکمیلی', 'Calculation method and advanced details')}
        </summary>
        <div className="bsc-form-grid">
          <Field
            label={t(
              'روش محاسبه؛ فقط توضیح، بدون اجرای فرمول',
              'Calculation method; description only',
            )}
            value={i.formula}
            multiline
            onChange={(formula) => update({ formula })}
          />
          <Select
            label={t('نوع شاخص', 'Measure type')}
            value={i.kind}
            onChange={(kind) => update({ kind: kind as Indicator['kind'] })}
          >
            <option value="leading">{t('پیشرو (Leading)', 'Leading')}</option>
            <option value="lagging">{t('پسرو (Lagging)', 'Lagging')}</option>
          </Select>
          {num('warning_margin', t('حاشیهٔ هشدار با همین واحد', 'Warning margin in the same unit'))}
          <Field
            label={t(
              'محافظ کیفیت؛ چه چیزی نباید آسیب ببینه؟',
              'Quality guardrail: what must not suffer?',
            )}
            value={i.guardrail}
            onChange={(guardrail) => update({ guardrail })}
          />
        </div>
        <p>
          {t(
            'داخل هدف یعنی وضعیت مطلوب. بیرون هدف، فاصله تا نزدیک‌ترین مرز با حاشیهٔ هشدار مقایسه می‌شه. حاشیهٔ خالی یعنی وضعیت نزدیک به هدف تعریف نشده.',
            'On target means the desired threshold is met. Otherwise the distance to the nearest boundary is compared with your warning margin. An empty margin disables the near-target band.',
          )}
        </p>
      </details>
    </details>
  );
}

export default function ScorecardPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const en = dir === 'ltr';
  const t = (fa: string, english: string) => (en ? english : fa);
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const queryKey = ['bsc', session.user.id, workspaceId];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => readCards(workspaceId, signal) });
  const execution = useQuery({
    queryKey: queryKeys.workspace.execution(workspaceId),
    queryFn: ({ signal }) => readExecutionBoard(workspaceId, signal),
  });
  const [draft, setDraft] = useState<Card | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [conflict, setConflict] = useState(false);
  const [observation, setObservation] = useState({
    indicator_id: '',
    observed_on: new Date().toISOString().slice(0, 10),
    value: '',
    evidence: '',
    request_id: crypto.randomUUID(),
  });
  const [review, setReview] = useState({
    reviewed_on: new Date().toISOString().slice(0, 10),
    decision: '',
    action_id: '',
    request_id: crypto.randomUUID(),
  });
  const [newAction, setNewAction] = useState({
    request_id: crypto.randomUUID(),
    objective_id: '',
    decision_id: '',
    owner_id: '',
    title: '',
    due_on: '',
    description: '',
  });
  const card =
    draft ??
    query.data?.cards.find((c) => c.id === params.get('card')) ??
    query.data?.cards[0] ??
    null;
  const dirty = draft !== null;
  const pendingEntries = Boolean(
    observation.value ||
    observation.evidence ||
    review.decision ||
    newAction.title ||
    newAction.description,
  );
  useWorkspaceDirtyGuard(`bsc-${workspaceId}`, dirty || pendingEntries);
  const editable = Boolean(query.data?.can_edit);
  const members = execution.data?.members ?? [];
  const actions = execution.data?.actions ?? [];
  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  function change(value: Partial<Card>) {
    if (card) {
      setDraft({ ...card, ...value });
      setSaved('');
    }
  }
  function objectiveChange(id: string, value: Partial<Objective>) {
    if (card)
      change({ objectives: card.objectives.map((o) => (o.id === id ? { ...o, ...value } : o)) });
  }
  function newObjective(perspective: Perspective) {
    if (card)
      change({
        objectives: [
          ...card.objectives,
          {
            id: crypto.randomUUID(),
            perspective,
            title: '',
            goal_id: null,
            action_ids: [],
            indicators: [],
          },
        ],
      });
  }
  function accept(value: Card) {
    client.setQueryData(queryKey, (previous: Awaited<ReturnType<typeof readCards>> | undefined) =>
      previous
        ? { ...previous, cards: [value, ...previous.cards.filter((c) => c.id !== value.id)] }
        : previous,
    );
    setDraft(null);
    setConflict(false);
    setParams({ card: value.id }, { replace: true });
    setSaved(t('ذخیره شد.', 'Saved.'));
  }
  async function run(operation: () => Promise<Card>, after?: () => void) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      accept(await operation());
      after?.();
    } catch (reason) {
      setConflict(reason instanceof ApiError && reason.status === 409);
      setError(
        reason instanceof ApiError
          ? (en
              ? `Could not save (${reason.code || reason.status}). Your entries are kept. `
              : reason.message + ' ') +
              (en
                ? Object.keys(reason.fields).join(', ')
                : Object.values(reason.fields).flat().join(' '))
          : t(
              'ذخیره نشد. نوشته‌هات حفظ شده؛ دوباره تلاش کن.',
              'Could not save. Your entries are kept; retry.',
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  function mayLeave() {
    return (
      !(dirty || pendingEntries) ||
      window.confirm(t('تغییرهای ذخیره‌نشده کنار گذاشته بشن؟', 'Discard unsaved changes?'))
    );
  }
  function resetEntries() {
    setObservation({
      ...observation,
      indicator_id: '',
      value: '',
      evidence: '',
      request_id: crypto.randomUUID(),
    });
    setReview({ ...review, decision: '', action_id: '', request_id: crypto.randomUUID() });
    setNewAction({
      ...newAction,
      objective_id: '',
      decision_id: '',
      owner_id: '',
      title: '',
      description: '',
      request_id: crypto.randomUUID(),
    });
  }
  function downloadDraft() {
    if (!card) return;
    const link = document.createElement('a');
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              card: writable(card),
              pending_observation: observation,
              pending_review: review,
              pending_action: newAction,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    link.href = url;
    link.download = 'scorecard-draft.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  if (query.isPending)
    return <Skeleton label={t('در حال دریافت کارت‌های امتیازی', 'Loading scorecards')} />;
  if (query.isError)
    return (
      <Notice title={t('کارت‌ها دریافت نشدن', 'Could not load scorecards')}>
        <Button onClick={() => void query.refetch()}>{t('تلاش دوباره', 'Retry')}</Button>
      </Notice>
    );
  const indicators = card?.objectives.flatMap((o) => o.indicators) ?? [];
  const persisted = card && card.revision > 0 && !dirty;
  const report = params.get('view') === 'report';
  return (
    <section
      className={`bsc-page${report ? ' bsc-page--report' : ''}`}
      dir={dir}
      aria-labelledby="bsc-title"
    >
      <div className="bsc-screen">
        <header className="bsc-header">
          <div>
            <p>Balanced Scorecard</p>
            <h1 id="bsc-title">{t('کارت امتیازی متوازن', 'Balanced scorecard')}</h1>
            <p>
              {t(
                'از انتخاب استراتژیک تا مشاهدهٔ نتیجه؛ در چهار منظر.',
                'From strategic choices to observed results, across four perspectives.',
              )}
            </p>
          </div>
          <div className="bsc-actions">
            {editable && (
              <Button
                disabled={busy}
                onClick={() => {
                  if (mayLeave()) {
                    setDraft(blankCard());
                    resetEntries();
                    setStep(0);
                    setError('');
                    setConflict(false);
                  }
                }}
              >
                {t('کارت تازه', 'New scorecard')}
              </Button>
            )}
            <Link to={`/app/workspaces/${workspaceId}/tools/execution`}>
              {t('هدف‌ها و اقدام‌های من', 'My goals and actions')}
            </Link>
          </div>
        </header>
        <details className="bsc-guide">
          <summary>{t('از کجا شروع کنم؟', 'Where do I start?')}</summary>
          <ol>
            <li>
              {t(
                'هدف می‌گه چه نتیجه‌ای می‌خوای؛ شاخص می‌گه چطور اون رو می‌سنجی. مقدار هدف، عدد مطلوب و اقدام، کاریه که انجام می‌دی.',
                'An objective describes the desired outcome; an indicator measures it. A target is the desired value, and an action is the work you do.',
              )}
            </li>
            <li>
              {t(
                'هدف‌ها رو بین چهار منظر بچین. لازم نیست برای پُرکردن صفحه، شاخص اضافه کنی.',
                'Place objectives across the four perspectives. Do not add indicators just to fill the page.',
              )}
            </li>
            <li>
              {t(
                'خط پایه و تاریخش رو بنویس، بعد مسئول، منبع داده، فاصلهٔ سنجش و موعد رو مشخص کن. صفر یک مقداره؛ خالی یعنی هنوز نمی‌دونیم.',
                'Record a dated baseline, then the owner, data source, interval and deadline. Zero is a value; empty means unknown.',
              )}
            </li>
            <li>
              {t(
                'عملکرد هر دوره رو ثبت کن و در جلسهٔ مرور دربارهٔ اقدام بعدی تصمیم بگیر. پیوندهای نقشه، فرضیه‌اند و نیاز به بررسی دارن.',
                'Record each period and decide the next action in review. Map links are hypotheses to test.',
              )}
            </li>
          </ol>
          <p>
            {t(
              'درس‌ها هنوز پیش‌نویس آموزشی‌اند؛ این ابزار تأیید علمی محتوای اون‌ها نیست.',
              'The lessons remain educational drafts; this tool does not certify their content.',
            )}
          </p>
          <div className="bsc-actions">
            <Link to="/academy/lesson/C07-ST05-L03">
              {t('شاخص نتیجه و اقدام', 'Outcome measures and actions')}
            </Link>
            <Link to="/academy/lesson/S01-C4-ST02-L04">
              {t('کارت امتیازی و فرض رابطه', 'Scorecard and causal hypotheses')}
            </Link>
            <a
              href="https://www.hbs.edu/ris/Publication%20Files/10-074_0bf3c151-f82b-4592-b885-cdde7f5d97a6.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Kaplan — Conceptual Foundations
            </a>
          </div>
          <p>
            {t(
              'مثال فرضی: هدف «کاهش زمان حل درخواست»، شاخص «میانهٔ ساعت تا حل»، خط پایهٔ ۴۸ ساعت و هدف ۲۴ ساعت؛ نرخ بازگشایی درخواست محافظ کیفیته.',
              'Fictional example: reduce resolution time; median hours to resolution, baseline 48 hours, target 24 hours, with reopening rate as a quality guardrail.',
            )}
          </p>
          {editable && card && (
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      'یک هدف و شاخص نمونه به همین کارت اضافه بشه؟ دادهٔ فرضی رو قبل از استفاده بررسی کن.',
                      'Add a fictional sample objective and indicator to this card? Review it before use.',
                    ),
                  )
                )
                  change({
                    objectives: [
                      ...card.objectives,
                      {
                        id: crypto.randomUUID(),
                        title: t('کاهش زمان حل درخواست', 'Reduce resolution time'),
                        perspective: 'process',
                        goal_id: null,
                        action_ids: [],
                        indicators: [
                          {
                            ...blankIndicator(),
                            name: t('میانهٔ زمان حل', 'Median resolution time'),
                            definition: t(
                              'میانهٔ زمان از ثبت درخواست تا حل، برای درخواست‌های بسته‌شدهٔ دوره.',
                              'Median elapsed time from opening to resolution for tickets closed in the period.',
                            ),
                            unit: t('ساعت', 'hours'),
                            direction: 'decrease',
                            target: '24',
                            guardrail: t('نرخ بازگشایی درخواست', 'Ticket reopening rate'),
                          },
                        ],
                      },
                    ],
                  });
              }}
            >
              {t('افزودن مثال فرضی با انتخاب من', 'Add the fictional example')}
            </Button>
          )}
        </details>
        {query.data.cards.length > 0 && (
          <Select
            label={t('کارت‌های ذخیره‌شده', 'Saved scorecards')}
            value={card?.id ?? null}
            onChange={(id) => {
              if (busy) return;
              if (mayLeave()) {
                setDraft(null);
                resetEntries();
                setParams({ card: id });
                setConflict(false);
                setError('');
              }
            }}
          >
            <option value="" disabled>
              {t('یک کارت انتخاب کن', 'Select a card')}
            </option>
            {card?.revision === 0 && (
              <option value={card.id}>{t('کارت تازه؛ هنوز ذخیره نشده', 'New unsaved card')}</option>
            )}
            {query.data.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        )}
        {error && <Notice title={t('اطلاعات ذخیره نشد', 'Not saved')}>{error}</Notice>}
        {saved && (
          <p role="status" className="bsc-saved">
            {saved}
          </p>
        )}
        {conflict && (
          <div className="bsc-conflict">
            <p>
              {t(
                'نسخهٔ کارت تغییر کرده. نوشته‌هات رو نگه دار و نسخهٔ تازه رو جدا بررسی کن؛ هیچ ادغام خودکاری انجام نمی‌شه.',
                'The card changed. Keep your draft and inspect the latest version separately; nothing is automatically merged.',
              )}
            </p>
            <Button onClick={downloadDraft}>{t('دریافت نوشته‌های من', 'Download my draft')}</Button>
            <Button onClick={() => void query.refetch()}>
              {t('دریافت نسخهٔ تازه در فهرست', 'Refresh saved versions')}
            </Button>
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      'نوشته‌های فعلی کنار گذاشته و نسخهٔ تازه باز بشه؟',
                      'Discard current edits and open the latest saved card?',
                    ),
                  )
                ) {
                  setDraft(null);
                  setConflict(false);
                  setError('');
                  resetEntries();
                }
              }}
            >
              {t('بازکردن نسخهٔ تازه', 'Open latest version')}
            </Button>
          </div>
        )}
        {!card ? (
          <div className="bsc-empty">
            <div aria-hidden="true">◎ ⇄ ✦ ↗</div>
            <h2>
              {t(
                'استراتژی رو به چند سنجهٔ روشن وصل کن',
                'Connect strategy to a few clear measures',
              )}
            </h2>
            <p>
              {t(
                'یک کارت بساز و مرحله‌به‌مرحله کاملش کن. کارت ناقص هم ذخیره می‌شه تا بعداً ادامه بدی.',
                'Create a card and complete it step by step. Incomplete cards can be saved and resumed.',
              )}
            </p>
          </div>
        ) : (
          <>
            <nav className="bsc-steps" aria-label={t('مراحل تدوین', 'Scorecard steps')}>
              {steps.map(([fa, english], index) => (
                <Button
                  key={english}
                  aria-current={step === index ? 'step' : undefined}
                  onClick={() => setStep(index)}
                >
                  <span>{display(index + 1, en)}</span>
                  <span className="bsc-step-label">{en ? english : fa}</span>
                </Button>
              ))}
            </nav>
            <fieldset disabled={!editable || busy} className="bsc-editor">
              {step === 0 && (
                <div className="bsc-form-grid">
                  <Field
                    label={t('عنوان کارت', 'Scorecard title')}
                    value={card.title}
                    required
                    onChange={(title) => change({ title })}
                  />
                  <Field
                    label={t(
                      'دامنه؛ برای کدوم بخش کسب‌وکار؟',
                      'Scope: which part of the business?',
                    )}
                    value={card.scope}
                    onChange={(scope) => change({ scope })}
                  />
                  <Field
                    label={t('شروع دوره', 'Period start')}
                    type="date"
                    value={card.period_start}
                    onChange={(period_start) => change({ period_start: period_start || null })}
                  />
                  <Field
                    label={t('پایان دوره', 'Period end')}
                    type="date"
                    value={card.period_end}
                    onChange={(period_end) => change({ period_end: period_end || null })}
                  />
                  <Field
                    label={t(
                      'جهت‌گیری استراتژیک؛ دنبال چه تغییری هستی؟',
                      'Strategic direction: what change are you pursuing?',
                    )}
                    value={card.strategy}
                    multiline
                    onChange={(strategy) => change({ strategy })}
                  />
                  <Select
                    label={t('پیوند با تصمیم موجود', 'Link an existing decision')}
                    value={card.decision_id}
                    onChange={(decision_id) => change({ decision_id: decision_id || null })}
                  >
                    <option value="">{t('فعلاً بدون پیوند', 'No link yet')}</option>
                    {execution.data?.decisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {step === 1 && (
                <div className="bsc-perspectives">
                  {perspectives.map((p) => (
                    <section className={`bsc-perspective bsc-perspective--${p}`} key={p}>
                      <header>
                        <span aria-hidden="true">{labels[p][2]}</span>
                        <h2>{labels[p][en ? 1 : 0]}</h2>
                        <Button onClick={() => newObjective(p)}>
                          {t('افزودن هدف', 'Add objective')}
                        </Button>
                      </header>
                      {!card.objectives.some((o) => o.perspective === p) && (
                        <p>
                          {t(
                            'هنوز هدفی برای این منظر ننوشتی.',
                            'No objectives in this perspective yet.',
                          )}
                        </p>
                      )}
                      {card.objectives
                        .filter((o) => o.perspective === p)
                        .map((o) => (
                          <article className="bsc-objective" key={o.id}>
                            <Field
                              label={t('هدف استراتژیک', 'Strategic objective')}
                              value={o.title}
                              required
                              onChange={(title) => objectiveChange(o.id, { title })}
                            />
                            <details>
                              <summary>
                                {t(
                                  'پیوند با هدف و اقدام‌های موجود',
                                  'Link existing goals and actions',
                                )}
                              </summary>
                              <Select
                                label={t('هدف موجود', 'Existing goal')}
                                value={o.goal_id}
                                onChange={(goal_id) =>
                                  objectiveChange(o.id, { goal_id: goal_id || null })
                                }
                              >
                                <option value="">{t('بدون پیوند', 'No link')}</option>
                                {execution.data?.goals.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.title}
                                  </option>
                                ))}
                              </Select>
                              <div className="bsc-checkboxes">
                                {actions.map((a) => (
                                  <label key={a.id}>
                                    <input
                                      type="checkbox"
                                      checked={o.action_ids.includes(a.id)}
                                      onChange={(e) =>
                                        objectiveChange(o.id, {
                                          action_ids: e.target.checked
                                            ? [...o.action_ids, a.id]
                                            : o.action_ids.filter((id) => id !== a.id),
                                        })
                                      }
                                    />
                                    {a.title}
                                  </label>
                                ))}
                              </div>
                            </details>
                            {o.indicators.map((i) => (
                              <IndicatorForm
                                key={i.id}
                                indicator={i}
                                en={en}
                                members={members}
                                update={(value) =>
                                  objectiveChange(o.id, {
                                    indicators: o.indicators.map((old) =>
                                      old.id === i.id ? { ...old, ...value } : old,
                                    ),
                                  })
                                }
                              />
                            ))}
                            <Button
                              variant="quiet"
                              onClick={() =>
                                objectiveChange(o.id, {
                                  indicators: [...o.indicators, blankIndicator()],
                                })
                              }
                            >
                              {t('افزودن شاخص', 'Add indicator')}
                            </Button>
                          </article>
                        ))}
                    </section>
                  ))}
                </div>
              )}
              {step === 2 && (
                <>
                  <p>
                    {t(
                      'پیوندها فرضیه‌اند. دلیل و روش بررسی هر پیوند رو بنویس؛ پیکان به‌تنهایی رابطه‌ای رو ثابت نمی‌کنه.',
                      'Links are hypotheses. Record a rationale and a way to test each link; an arrow is not causal proof.',
                    )}
                  </p>
                  <div className="bsc-map">
                    {[...perspectives].reverse().map((p) => (
                      <section className={`bsc-map-lane bsc-perspective--${p}`} key={p}>
                        <h2>{labels[p][en ? 1 : 0]}</h2>
                        <div>
                          {card.objectives
                            .filter((o) => o.perspective === p)
                            .map((o) => (
                              <span key={o.id}>{o.title}</span>
                            ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  {card.relations.map((r) => (
                    <div key={r.id} className="bsc-relation bsc-form-grid">
                      {(['source_id', 'destination_id'] as const).map((key) => (
                        <Select
                          key={key}
                          label={
                            key === 'source_id'
                              ? t('از هدف', 'From objective')
                              : t('به هدف', 'To objective')
                          }
                          value={r[key]}
                          onChange={(v) =>
                            change({
                              relations: card.relations.map((old) =>
                                old.id === r.id ? { ...old, [key]: v } : old,
                              ),
                            })
                          }
                        >
                          {card.objectives.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.title}
                            </option>
                          ))}
                        </Select>
                      ))}
                      <Field
                        label={t(
                          'چرا انتظار این رابطه رو داری؟',
                          'Why do you expect this relationship?',
                        )}
                        value={r.rationale}
                        multiline
                        onChange={(rationale) =>
                          change({
                            relations: card.relations.map((old) =>
                              old.id === r.id ? { ...old, rationale } : old,
                            ),
                          })
                        }
                      />
                      <Field
                        label={t('چطور بررسی‌اش می‌کنی؟', 'How will you test it?')}
                        value={r.test_method}
                        multiline
                        onChange={(test_method) =>
                          change({
                            relations: card.relations.map((old) =>
                              old.id === r.id ? { ...old, test_method } : old,
                            ),
                          })
                        }
                      />
                      <Button
                        variant="quiet"
                        onClick={() =>
                          change({ relations: card.relations.filter((old) => old.id !== r.id) })
                        }
                      >
                        {t('حذف پیوند', 'Remove link')}
                      </Button>
                    </div>
                  ))}
                  <Button
                    disabled={card.objectives.length < 2}
                    onClick={() =>
                      change({
                        relations: [
                          ...card.relations,
                          {
                            id: crypto.randomUUID(),
                            source_id: card.objectives[0].id,
                            destination_id: card.objectives[1].id,
                            rationale: '',
                            test_method: '',
                          },
                        ],
                      })
                    }
                  >
                    {t('افزودن فرضیهٔ رابطه', 'Add a relationship hypothesis')}
                  </Button>
                </>
              )}
            </fieldset>
            {step === 3 && (
              <>
                {!persisted && (
                  <p>
                    {t(
                      'اول کارت رو ذخیره کن تا ثبت عملکرد و مرور فعال بشه.',
                      'Save the card to record performance and reviews.',
                    )}
                  </p>
                )}
                <div className="bsc-performance">
                  {indicators.map((i) => (
                    <article key={i.id} className="bsc-reading">
                      <header>
                        <h2>{i.name}</h2>
                        <span
                          className={`bsc-status bsc-status--${i.assessment?.status ?? 'unknown'}`}
                        >
                          {
                            {
                              unknown: t('داده کافی نیست', 'Insufficient data'),
                              on_target: t('در محدودهٔ هدف', 'On target'),
                              near_target: t('نزدیک به هدف', 'Near target'),
                              off_target: t('نیاز به توجه', 'Off target'),
                            }[i.assessment?.status ?? 'unknown']
                          }
                        </span>
                      </header>
                      <p>
                        <strong>{display(i.assessment?.actual, en)}</strong>{' '}
                        {i.assessment?.actual_unit ?? i.unit} · {t('هدف', 'Target')}:{' '}
                        {display(i.target, en)}
                        {i.direction === 'range' ? ` — ${display(i.target_high, en)}` : ''}
                      </p>
                      <p>
                        {t('آخرین مشاهده', 'Latest reading')}: {date(i.assessment?.observed_on, en)}{' '}
                        · {t('سنجش بعدی', 'Next measurement')}: {date(i.assessment?.next_due, en)}
                      </p>
                      <p>
                        {t('اختلاف با هدف', 'Difference from target')}:{' '}
                        {display(i.assessment?.difference, en)} {i.unit} ·{' '}
                        {t('تغییر نسبت به مشاهدهٔ قبلی', 'Change from previous reading')}:{' '}
                        {display(i.assessment?.trend_delta, en)} {i.unit}
                      </p>
                      {i.assessment?.baseline_progress_percent != null && (
                        <p>
                          {t('پیشرفت از خط پایه تا هدف', 'Progress from baseline to target')}:{' '}
                          {display(i.assessment.baseline_progress_percent, en)}
                          {en ? '%' : '٪'}
                        </p>
                      )}
                      {i.assessment?.needs_review && (
                        <p className="bsc-review-needed">
                          {t(
                            'بازبینی کن؛ تعریف‌های ناقص، موعد سنجش یا فاصله از هدف نیاز به توجه دارن.',
                            'Review incomplete definitions, measurement dates and distance from target.',
                          )}
                        </p>
                      )}
                      <details>
                        <summary>
                          {t('تاریخچهٔ مشاهده‌ها', 'Observation history')} (
                          {display(i.observations?.length ?? 0, en)})
                        </summary>
                        {i.observations?.map((o) => (
                          <div key={o.id} className="bsc-history">
                            <strong>
                              {date(o.observed_on, en)}: {display(o.value, en)}{' '}
                              {String(o.definition_snapshot.unit ?? i.unit)}
                            </strong>
                            <p>{o.evidence}</p>
                            <details>
                              <summary>
                                {t('تعریف شاخص در زمان ثبت', 'Definition when recorded')}
                              </summary>
                              <p>{String(o.definition_snapshot.definition ?? '')}</p>
                              <p>
                                {t('هدف آن زمان', 'Target then')}:{' '}
                                {display(o.definition_snapshot.target as string | null, en)}
                              </p>
                            </details>
                          </div>
                        ))}
                      </details>
                    </article>
                  ))}
                </div>
                <form
                  className="bsc-panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (card && persisted)
                      void run(
                        () =>
                          appendCard(workspaceId, card.id, 'observations', {
                            ...observation,
                            revision: card.revision,
                            value: observation.value === '' ? null : normalize(observation.value),
                          }),
                        () =>
                          setObservation({
                            ...observation,
                            value: '',
                            evidence: '',
                            request_id: crypto.randomUUID(),
                          }),
                      );
                  }}
                >
                  <fieldset disabled={!editable || busy || !persisted}>
                    <legend>{t('ثبت مشاهدهٔ تازه', 'Record a new observation')}</legend>
                    <div className="bsc-form-grid">
                      <Select
                        label={t('شاخص', 'Indicator')}
                        value={observation.indicator_id}
                        onChange={(indicator_id) =>
                          setObservation({
                            ...observation,
                            indicator_id,
                            request_id: crypto.randomUUID(),
                          })
                        }
                      >
                        <option value="">{t('انتخاب کن', 'Select')}</option>
                        {indicators.map((i) => (
                          <option value={i.id} key={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </Select>
                      <Field
                        label={t('تاریخ مشاهده', 'Observation date')}
                        type="date"
                        value={observation.observed_on}
                        required
                        onChange={(observed_on) =>
                          setObservation({
                            ...observation,
                            observed_on,
                            request_id: crypto.randomUUID(),
                          })
                        }
                      />
                      <Field
                        label={t(
                          'مقدار واقعی؛ خالی یعنی نامشخص',
                          'Actual value; empty means unknown',
                        )}
                        value={observation.value}
                        onChange={(value) =>
                          setObservation({ ...observation, value, request_id: crypto.randomUUID() })
                        }
                      />
                      <Field
                        label={t(
                          'شواهد یا دلیل نامشخص‌بودن',
                          'Evidence or reason for unknown value',
                        )}
                        value={observation.evidence}
                        required
                        multiline
                        onChange={(evidence) =>
                          setObservation({
                            ...observation,
                            evidence,
                            request_id: crypto.randomUUID(),
                          })
                        }
                      />
                    </div>
                    <Button type="submit" disabled={!observation.indicator_id} pending={busy}>
                      {t('ثبت در تاریخچه', 'Append observation')}
                    </Button>
                  </fieldset>
                </form>
                <form
                  className="bsc-panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (card && persisted)
                      void run(
                        () =>
                          appendCard(workspaceId, card.id, 'reviews', {
                            ...review,
                            action_id: review.action_id || null,
                            revision: card.revision,
                          }),
                        () =>
                          setReview({ ...review, decision: '', request_id: crypto.randomUUID() }),
                      );
                  }}
                >
                  <fieldset disabled={!editable || busy || !persisted}>
                    <legend>{t('نتیجهٔ جلسهٔ مرور', 'Review meeting outcome')}</legend>
                    <div className="bsc-form-grid">
                      <Field
                        label={t('تاریخ مرور', 'Review date')}
                        type="date"
                        value={review.reviewed_on}
                        required
                        onChange={(reviewed_on) =>
                          setReview({ ...review, reviewed_on, request_id: crypto.randomUUID() })
                        }
                      />
                      <Select
                        label={t('اقدام پیگیری', 'Follow-up action')}
                        value={review.action_id}
                        onChange={(action_id) =>
                          setReview({ ...review, action_id, request_id: crypto.randomUUID() })
                        }
                      >
                        <option value="">{t('بدون اقدام مرتبط', 'No linked action')}</option>
                        {actions.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
                          </option>
                        ))}
                      </Select>
                      <Field
                        label={t('چه تصمیمی گرفتین و چرا؟', 'What did you decide and why?')}
                        value={review.decision}
                        multiline
                        required
                        onChange={(decision) =>
                          setReview({ ...review, decision, request_id: crypto.randomUUID() })
                        }
                      />
                    </div>
                    <Button type="submit" pending={busy}>
                      {t('ثبت مرور', 'Record review')}
                    </Button>
                  </fieldset>
                </form>
                {card.reviews?.map((r) => (
                  <article key={r.id} className="bsc-history">
                    <strong>{date(r.reviewed_on, en)}</strong>
                    <p>{r.decision}</p>
                    {r.action_id && <p>{actions.find((a) => a.id === r.action_id)?.title}</p>}
                  </article>
                ))}
                <details className="bsc-panel">
                  <summary>
                    {t('ساخت اقدام برای هدف کارت', 'Create an action for a scorecard objective')}
                  </summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const o = card.objectives.find((o) => o.id === newAction.objective_id);
                      if (o && persisted)
                        void run(
                          () =>
                            addCardAction(
                              workspaceId,
                              card,
                              o.id,
                              {
                                decision_id: newAction.decision_id,
                                goal_id: o.goal_id,
                                owner_id: newAction.owner_id,
                                title: newAction.title,
                                description: newAction.description,
                                due_on: newAction.due_on,
                                status: 'planned',
                              },
                              newAction.request_id,
                            ),
                          () => {
                            setNewAction({
                              ...newAction,
                              title: '',
                              description: '',
                              request_id: crypto.randomUUID(),
                            });
                            void execution.refetch();
                          },
                        );
                    }}
                  >
                    <fieldset disabled={!editable || busy || !persisted}>
                      <div className="bsc-form-grid">
                        <Select
                          label={t('هدف کارت', 'Scorecard objective')}
                          value={newAction.objective_id}
                          onChange={(objective_id) =>
                            setNewAction({
                              ...newAction,
                              objective_id,
                              request_id: crypto.randomUUID(),
                            })
                          }
                        >
                          <option value="">{t('انتخاب کن', 'Select')}</option>
                          {card.objectives.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.title}
                            </option>
                          ))}
                        </Select>
                        <Select
                          label={t('تصمیم مبنای اقدام', 'Action decision')}
                          value={newAction.decision_id}
                          onChange={(decision_id) =>
                            setNewAction({
                              ...newAction,
                              decision_id,
                              request_id: crypto.randomUUID(),
                            })
                          }
                        >
                          <option value="">{t('انتخاب کن', 'Select')}</option>
                          {execution.data?.decisions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.title}
                            </option>
                          ))}
                        </Select>
                        <Field
                          label={t('عنوان اقدام', 'Action title')}
                          value={newAction.title}
                          required
                          onChange={(title) =>
                            setNewAction({ ...newAction, title, request_id: crypto.randomUUID() })
                          }
                        />
                        <Select
                          label={t('مسئول اقدام', 'Action owner')}
                          value={newAction.owner_id}
                          onChange={(owner_id) =>
                            setNewAction({
                              ...newAction,
                              owner_id,
                              request_id: crypto.randomUUID(),
                            })
                          }
                        >
                          <option value="">{t('انتخاب کن', 'Select')}</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                        <Field
                          label={t('موعد اقدام', 'Action due date')}
                          type="date"
                          value={newAction.due_on}
                          required
                          onChange={(due_on) =>
                            setNewAction({ ...newAction, due_on, request_id: crypto.randomUUID() })
                          }
                        />
                        <Field
                          label={t('شرح اقدام', 'Action description')}
                          value={newAction.description}
                          multiline
                          onChange={(description) =>
                            setNewAction({
                              ...newAction,
                              description,
                              request_id: crypto.randomUUID(),
                            })
                          }
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={
                          !newAction.objective_id || !newAction.decision_id || !newAction.owner_id
                        }
                      >
                        {t('ساخت و پیوند اقدام', 'Create and link action')}
                      </Button>
                    </fieldset>
                  </form>
                </details>
              </>
            )}
            {execution.isError && (
              <Notice
                title={t(
                  'فهرست هدف‌ها، اقدام‌ها و اعضا دریافت نشد',
                  'Could not load goals, actions and members',
                )}
              >
                <Button onClick={() => void execution.refetch()}>
                  {t('تلاش دوباره', 'Retry')}
                </Button>
              </Notice>
            )}
            <footer className="bsc-toolbar">
              <p>
                {dirty
                  ? t('تغییرهای ذخیره‌نشده', 'Unsaved changes')
                  : t('نسخهٔ ذخیره‌شده', 'Saved revision')}{' '}
                {display(card.revision, en)}
              </p>
              <div className="bsc-actions">
                {editable && (
                  <Button
                    variant="primary"
                    pending={busy}
                    disabled={!dirty || conflict}
                    onClick={() => void run(() => saveCard(workspaceId, card))}
                  >
                    {t('ذخیرهٔ کارت', 'Save scorecard')}
                  </Button>
                )}
                {step < 3 && (
                  <Button onClick={() => setStep(step + 1)}>{t('مرحلهٔ بعد', 'Next step')}</Button>
                )}
                <Button
                  disabled={!persisted}
                  onClick={() => {
                    setParams({ card: card.id, view: 'report' });
                  }}
                >
                  {t('گزارش و PDF', 'Report and PDF')}
                </Button>
                <Link to={`/app/workspaces/${workspaceId}/tools/reports`}>
                  {t('اکسل کامل فضای کار', 'Full workspace Excel')}
                </Link>
              </div>
            </footer>
          </>
        )}
      </div>
      {report && card && (
        <>
          <div className="bsc-report-controls bsc-actions">
            <Button onClick={() => window.print()}>
              {t('چاپ / ذخیرهٔ PDF', 'Print / Save PDF')}
            </Button>
            <Button onClick={() => setParams({ card: card.id })}>
              {t('بازگشت به کارت', 'Back to scorecard')}
            </Button>
          </div>
          <ScorecardReport
            card={card}
            business={workspace?.name ?? ''}
            en={en}
            actions={actions}
            members={members}
          />
          {createPortal(
            <div className="bsc-print-root" dir={dir}>
              <ScorecardReport
                card={card}
                business={workspace?.name ?? ''}
                en={en}
                actions={actions}
                members={members}
              />
            </div>,
            document.body,
          )}
        </>
      )}
    </section>
  );
}

function ScorecardReport({
  card,
  business,
  en,
  actions,
  members,
}: {
  card: Card;
  business: string;
  en: boolean;
  actions: { id: string; title: string; due_on: string; status: string }[];
  members: { id: string; name: string }[];
}) {
  const t = (fa: string, english: string) => (en ? english : fa);
  return (
    <article className="bsc-report" aria-label={t('گزارش کارت امتیازی', 'Scorecard report')}>
      <header>
        <p>{business} · Balanced Scorecard</p>
        <h1>{card.title}</h1>
        <p>
          {date(card.period_start, en)} — {date(card.period_end, en)}
        </p>
        <p>
          {t('تاریخ تهیه', 'Generated')}:{' '}
          {new Intl.DateTimeFormat(en ? 'en-US' : 'fa-IR', { dateStyle: 'long' }).format(
            new Date(),
          )}{' '}
          · {t('نسخه', 'Revision')} {display(card.revision, en)}
        </p>
        <p>{card.scope}</p>
        <p>{card.strategy}</p>
      </header>
      {perspectives.map((p) => (
        <section key={p} className={`bsc-report-perspective bsc-perspective--${p}`}>
          <h2>{labels[p][en ? 1 : 0]}</h2>
          {!card.objectives.some((o) => o.perspective === p) && (
            <p>{t('هنوز هدفی ثبت نشده.', 'No objectives recorded.')}</p>
          )}
          {card.objectives
            .filter((o) => o.perspective === p)
            .map((o) => (
              <section key={o.id}>
                <h3>{o.title}</h3>
                {o.indicators.map((i) => (
                  <section key={i.id} className="bsc-report-indicator">
                    <h4>
                      {i.name} ({i.unit})
                    </h4>
                    <p>{i.definition}</p>
                    <p>
                      {t('روش محاسبه', 'Calculation')}: {i.formula || '—'}
                    </p>
                    <p>
                      {t('خط پایه', 'Baseline')}: {display(i.baseline, en)} ·{' '}
                      {date(i.baseline_on, en)} | {t('هدف', 'Target')}: {display(i.target, en)}
                      {i.direction === 'range' ? ` — ${display(i.target_high, en)}` : ''} ·{' '}
                      {date(i.due_on, en)}
                    </p>
                    <p>
                      {t('جهت مطلوب', 'Direction')}:{' '}
                      {
                        {
                          increase: t('افزایش', 'Increase'),
                          decrease: t('کاهش', 'Decrease'),
                          range: t('محدوده', 'Range'),
                        }[i.direction]
                      }{' '}
                      · {i.kind === 'leading' ? t('پیشرو', 'Leading') : t('پسرو', 'Lagging')} ·{' '}
                      {t('حاشیهٔ هشدار', 'Warning margin')}: {display(i.warning_margin, en)}
                    </p>
                    <p>
                      {t('مسئول', 'Owner')}:{' '}
                      {members.find((m) => m.id === i.owner_id)?.name ??
                        t('تعیین نشده یا عضو قبلی', 'Unassigned or former member')}{' '}
                      · {t('فاصلهٔ سنجش به روز', 'Interval in days')}: {display(i.cadence_days, en)}
                    </p>
                    <p>
                      {t('منبع', 'Source')}: {i.source || '—'} ·{' '}
                      {t('محافظ کیفیت', 'Quality guardrail')}: {i.guardrail || '—'}
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>{t('تاریخ مشاهده', 'Observed')}</th>
                          <th>{t('مقدار واقعی', 'Actual')}</th>
                          <th>{t('شواهد', 'Evidence')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {i.observations?.map((v) => (
                          <tr key={v.id}>
                            <td>{date(v.observed_on, en)}</td>
                            <td>
                              {display(v.value, en)} {String(v.definition_snapshot.unit ?? i.unit)}
                            </td>
                            <td>
                              {v.evidence}
                              <small>{String(v.definition_snapshot.definition ?? '')}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
                <h4>{t('اقدام‌های مرتبط', 'Linked actions')}</h4>
                <ul>
                  {o.action_ids.map((id) => {
                    const a = actions.find((a) => a.id === id);
                    return (
                      <li key={id}>
                        {a?.title ?? id} · {date(a?.due_on, en)} ·{' '}
                        {a
                          ? (
                              {
                                planned: t('برنامه‌ریزی‌شده', 'Planned'),
                                in_progress: t('در حال انجام', 'In progress'),
                                blocked: t('متوقف', 'Blocked'),
                                done: t('انجام‌شده', 'Done'),
                              } as Record<string, string>
                            )[a.status]
                          : ''}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </section>
      ))}
      <section>
        <h2>{t('فرضیه‌های نقشهٔ استراتژی', 'Strategy map hypotheses')}</h2>
        <p>{t('این پیوندها علت اثبات‌شده نیستن.', 'These relationships are not proven causes.')}</p>
        {card.relations.map((r) => (
          <div key={r.id}>
            <h3>
              {card.objectives.find((o) => o.id === r.source_id)?.title} →{' '}
              {card.objectives.find((o) => o.id === r.destination_id)?.title}
            </h3>
            <p>{r.rationale}</p>
            <p>{r.test_method}</p>
          </div>
        ))}
      </section>
      <section>
        <h2>{t('جلسه‌های مرور', 'Review meetings')}</h2>
        {card.reviews?.map((r) => (
          <div key={r.id}>
            <h3>{date(r.reviewed_on, en)}</h3>
            <p>{r.decision}</p>
            <p>{actions.find((a) => a.id === r.action_id)?.title}</p>
          </div>
        ))}
      </section>
      <footer>
        {t(
          'بدون امتیاز کلی یا میانگین‌گیری منظرها. وضعیت‌ها بر اساس هدف و حاشیهٔ تعریف‌شدهٔ خودت هستن.',
          'No overall score or averaging of perspectives. Statuses use your configured targets and margins.',
        )}
      </footer>
    </article>
  );
}
