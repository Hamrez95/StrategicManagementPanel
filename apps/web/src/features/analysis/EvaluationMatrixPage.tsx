import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  evaluateMatrix,
  type EvaluationMatrixKind,
  type EvaluationMatrixRow,
} from '@stratino/domain/evaluation-matrices';
import { Button, EmptyState, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type {
  ApiAnalysis,
  ApiAnalysisKind,
  ApiAnalysisRow,
  ApiAnalysisState,
  ApiAnalysisWrite,
  ApiStrategyFactorType,
} from '../../api/contracts';
import type { Session } from '../../session';
import { useWorkspaceDirtyGuard, useWorkspaceSwitch } from '../workspaces/switchContext';
import { readStrategyBoard } from '../strategy/api';
import { AnalysisApiError, createAnalysis, readAnalyses, updateAnalysis } from './api';

const MATRIX_COPY = {
  efe: {
    fa: {
      title: 'ارزیابی عوامل بیرونی',
      short: 'EFE',
      description: 'کیفیت پاسخ سازمان به فرصت‌ها و تهدیدهای محیط را با وزن و رتبه مستند بسنجید.',
    },
    en: {
      title: 'External Factor Evaluation',
      short: 'EFE',
      description: 'Assess how the organization responds to weighted opportunities and threats.',
    },
    types: ['opportunity', 'threat'] as const,
    ratingHelp: {
      fa: 'در EFE رتبه، کیفیت پاسخ سازمان را نشان می‌دهد؛ فرصت یا تهدید بودن عامل، رتبه را تعیین نمی‌کند.',
      en: 'In EFE, the rating measures the organization’s response; opportunity or threat type does not determine it.',
    },
    limitations: {
      fa: 'نمره، پاسخ سازمان به عوامل بیرونی را خلاصه می‌کند و به‌تنهایی احتمال موفقیت را پیش‌بینی نمی‌کند.',
      en: 'The score summarizes response to external factors; it does not predict success on its own.',
    },
  },
  ife: {
    fa: {
      title: 'ارزیابی عوامل درونی',
      short: 'IFE',
      description: 'قوت‌ها و ضعف‌های فضای کار را با رتبه متناسب و شواهد قابل پیگیری ارزیابی کنید.',
    },
    en: {
      title: 'Internal Factor Evaluation',
      short: 'IFE',
      description:
        'Evaluate Workspace strengths and weaknesses with consistent ratings and evidence.',
    },
    types: ['strength', 'weakness'] as const,
    ratingHelp: {
      fa: 'رتبه قوت باید ۳ یا ۴ و رتبه ضعف باید ۱ یا ۲ باشد.',
      en: 'Rate strengths 3 or 4 and weaknesses 1 or 2.',
    },
    limitations: {
      fa: 'نمره، تصویری نسبی از وضعیت درونی بر پایه عوامل انتخاب‌شده است؛ کیفیت شواهد و انتخاب عوامل مهم است.',
      en: 'The score is a relative view of selected internal factors; factor selection and evidence quality matter.',
    },
  },
} as const;

const FACTOR_NAMES: Record<ApiStrategyFactorType, { fa: string; en: string }> = {
  strength: { fa: 'قوت', en: 'Strength' },
  weakness: { fa: 'ضعف', en: 'Weakness' },
  opportunity: { fa: 'فرصت', en: 'Opportunity' },
  threat: { fa: 'تهدید', en: 'Threat' },
};

function rowId() {
  return (
    globalThis.crypto?.randomUUID?.().replaceAll('-', '_') ??
    `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );
}

function emptyRow(kind: ApiAnalysisKind): ApiAnalysisRow {
  return {
    id: rowId(),
    title: '',
    factor_type: kind === 'efe' ? 'opportunity' : 'strength',
    weight: null,
    rating: null,
    evidence: '',
  };
}

function outputMessage(code: string, english: boolean) {
  const messages: Record<string, { fa: string; en: string }> = {
    rows_required: { fa: 'حداقل یک عامل اضافه کنید.', en: 'Add at least one factor.' },
    row_limit: {
      fa: 'هر ماتریس حداکثر ۱۰۰ عامل دارد.',
      en: 'A matrix can have at most 100 factors.',
    },
    duplicate_or_missing_id: {
      fa: 'شناسه عامل یکتا نیست.',
      en: 'Factor identifiers must be unique.',
    },
    title_required: { fa: 'عنوان عامل را وارد کنید.', en: 'Enter a factor title.' },
    evidence_required: {
      fa: 'برای نهایی‌کردن، شاهد یا منبع لازم است.',
      en: 'Evidence or a source is required to finalize.',
    },
    factor_type_invalid: {
      fa: 'دسته عامل با این ماتریس سازگار نیست.',
      en: 'This factor type does not belong in this matrix.',
    },
    weight_required: { fa: 'وزن عامل را وارد کنید.', en: 'Enter the factor weight.' },
    weight_out_of_range: {
      fa: 'وزن باید بین صفر تا ۱۰۰ باشد.',
      en: 'Weight must be between 0 and 100.',
    },
    rating_out_of_range: {
      fa: 'رتبه باید عددی از ۱ تا ۴ باشد.',
      en: 'Rating must be an integer from 1 to 4.',
    },
    ife_rating_mismatch: {
      fa: 'رتبه قوت ۳ یا ۴ و رتبه ضعف ۱ یا ۲ است.',
      en: 'Strengths use 3–4; weaknesses use 1–2.',
    },
    weights_must_total_100: {
      fa: 'مجموع وزن‌ها باید دقیقاً ۱۰۰٪ باشد (با تلورانس ۰٫۰۰۱).',
      en: 'Weights must total 100% (within 0.001).',
    },
  };
  return messages[code]?.[english ? 'en' : 'fa'] ?? code;
}

function interpretationLabel(value: string, english: boolean) {
  if (value === 'above_midpoint')
    return english ? 'Above the scale midpoint' : 'بالاتر از میانه مقیاس';
  if (value === 'below_midpoint')
    return english ? 'Below the scale midpoint' : 'پایین‌تر از میانه مقیاس';
  if (value === 'at_midpoint') return english ? 'At the scale midpoint' : 'روی میانه مقیاس';
  return english ? 'Not available yet' : 'پس از تکمیل داده‌ها محاسبه می‌شود';
}

export default function EvaluationMatrixPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const editable = workspace?.role === 'owner' || workspace?.role === 'editor';
  const queryClient = useQueryClient();
  const { canSwitch } = useWorkspaceSwitch();
  const [kind, setKind] = useState<ApiAnalysisKind>('efe');
  const [rows, setRows] = useState<ApiAnalysisRow[]>([]);
  const [cleanRows, setCleanRows] = useState<ApiAnalysisRow[]>([]);
  const [saveState, setSaveState] = useState<ApiAnalysisState>('draft');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState('');
  const [revisionConflict, setRevisionConflict] = useState(false);
  const loadedContext = useRef('');
  const contextKey = `${workspaceId}:${kind}`;
  const dirty = JSON.stringify(rows) !== JSON.stringify(cleanRows);
  useWorkspaceDirtyGuard(`evaluation-matrix-${workspaceId}-${kind}`, dirty);

  const matricesQuery = useQuery({
    queryKey: queryKeys.workspace.analyses(workspaceId),
    queryFn: ({ signal }) => readAnalyses(workspaceId, signal),
    enabled: Boolean(workspace),
  });
  const strategyQuery = useQuery({
    queryKey: queryKeys.workspace.strategyBoard(workspaceId),
    queryFn: ({ signal }) => readStrategyBoard(workspaceId, signal),
    enabled: Boolean(workspace),
    staleTime: 60_000,
  });
  const record = matricesQuery.data?.items.find((item) => item.kind === kind);
  const importedFactors = useMemo(() => {
    const allowed = new Set<string>(MATRIX_COPY[kind].types);
    return (strategyQuery.data?.factors ?? []).filter((factor) => allowed.has(factor.factor_type));
  }, [kind, strategyQuery.data?.factors]);

  useEffect(() => {
    if (!matricesQuery.data) return;
    if (loadedContext.current === contextKey && dirty) return;
    loadedContext.current = contextKey;
    const nextRows = record?.inputs.rows ?? [emptyRow(kind)];
    setRows(nextRows);
    setCleanRows(nextRows);
    setSaveState(record?.state ?? 'draft');
    setFeedback('');
    setSaved('');
    setRevisionConflict(false);
    // A kind/workspace/record change is the only safe point to replace the open draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, contextKey, kind, record?.id, Boolean(matricesQuery.data), dirty]);

  const preview = useMemo(
    () => evaluateMatrix(kind as EvaluationMatrixKind, rows as EvaluationMatrixRow[]),
    [kind, rows],
  );
  const number = (value: number, fraction = 2) =>
    new Intl.NumberFormat(english ? 'en-US' : 'fa-IR', { maximumFractionDigits: fraction }).format(
      value,
    );

  if (!workspace) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">
          {english
            ? 'This Workspace is not in your access list.'
            : 'این فضا در فهرست دسترسی حساب شما نیست.'}
        </p>
      </Notice>
    );
  }
  if (matricesQuery.isPending)
    return (
      <main className="strategy-page">
        <Skeleton label={english ? 'Loading matrix' : 'در حال بارگیری ماتریس'} />
      </main>
    );
  if (matricesQuery.isError)
    return (
      <main className="strategy-page">
        <Notice title={english ? 'Matrix could not be loaded' : 'ماتریس بارگیری نشد'}>
          <p role="alert">{matricesQuery.error.message}</p>
          <Button onClick={() => void matricesQuery.refetch()}>
            {english ? 'Retry' : 'تلاش دوباره'}
          </Button>
        </Notice>
      </main>
    );

  function changeRow(index: number, patch: Partial<ApiAnalysisRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
    setFeedback('');
    setSaved('');
  }

  function changeKind(next: ApiAnalysisKind) {
    if (
      next === kind ||
      !canSwitch(
        english ? 'Discard unsaved matrix changes?' : 'تغییرات ذخیره‌نشده ماتریس کنار گذاشته شوند؟',
      )
    )
      return;
    setKind(next);
  }

  function importFactors() {
    const currentKeys = new Set(
      rows.map((row) => `${row.factor_type}:${row.title.trim()}:${row.evidence.trim()}`),
    );
    const additions = importedFactors
      .filter(
        (factor) =>
          !currentKeys.has(
            `${factor.factor_type}:${factor.title.trim()}:${factor.evidence.trim()}`,
          ),
      )
      .slice(0, Math.max(0, 100 - rows.length))
      .map((factor) => ({
        ...emptyRow(kind),
        title: factor.title,
        factor_type: factor.factor_type,
        evidence: factor.evidence,
      }));
    if (!additions.length) {
      setSaved(
        english
          ? 'There are no new SWOT factors to copy.'
          : 'عامل تازه‌ای برای افزودن از SWOT نیست.',
      );
      return;
    }
    setRows((current) => [...current, ...additions]);
    setFeedback('');
    setSaved(
      english
        ? `${number(additions.length, 0)} factors copied as a snapshot.`
        : `${number(additions.length, 0)} عامل به‌صورت عکس ورودی افزوده شد.`,
    );
  }

  async function save(nextState: ApiAnalysisState) {
    setFeedback('');
    setSaved('');
    setPending(true);
    const body: ApiAnalysisWrite = {
      revision: record?.revision ?? 1,
      kind,
      schema_version: 1,
      method_version: kind === 'efe' ? 'efe-v1' : 'ife-v1',
      inputs: { rows },
      state: nextState,
    };
    try {
      const response = record
        ? await updateAnalysis(workspaceId, record.id, body)
        : await createAnalysis(workspaceId, body);
      queryClient.setQueryData(
        queryKeys.workspace.analyses(workspaceId),
        (current: { items: ApiAnalysis[]; next_cursor: string | null } | undefined) => ({
          items: [
            ...(current?.items.filter((item) => item.kind !== response.kind) ?? []),
            response,
          ].sort((a, b) => a.kind.localeCompare(b.kind)),
          next_cursor: null,
        }),
      );
      setRows(response.inputs.rows);
      setCleanRows(response.inputs.rows);
      setSaveState(response.state);
      setSaved(
        nextState === 'finalized'
          ? english
            ? 'Matrix finalized and saved.'
            : 'ماتریس نهایی و ذخیره شد.'
          : english
            ? 'Draft saved.'
            : 'پیش‌نویس ذخیره شد.',
      );
      setRevisionConflict(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : english
            ? 'Matrix could not be saved.'
            : 'ذخیره ماتریس انجام نشد.';
      setFeedback(message);
      if (error instanceof AnalysisApiError && error.status === 409) {
        setRevisionConflict(true);
        void matricesQuery.refetch();
      }
    } finally {
      setPending(false);
    }
  }

  const issue = (field: string, code?: string) =>
    preview.issues.some((entry) => entry.field === field && (!code || entry.code === code));
  const matrixCopy = MATRIX_COPY[kind];
  const copy = matrixCopy[english ? 'en' : 'fa'];
  const ratingHelp = matrixCopy.ratingHelp[english ? 'en' : 'fa'];
  const limitations = matrixCopy.limitations[english ? 'en' : 'fa'];
  const factorName = (type: ApiStrategyFactorType) => FACTOR_NAMES[type][english ? 'en' : 'fa'];

  return (
    <main className="strategy-page evaluation-page">
      <header className="strategy-heading evaluation-heading">
        <div>
          <p className="auth-kicker">
            {english ? 'STRATEGY WORK / MATRIX STUDIO' : 'کار استراتژی / آزمایشگاه ماتریس‌ها'}
          </p>
          <h1 tabIndex={-1}>{english ? 'Factor evaluation' : 'ارزیابی عوامل راهبردی'}</h1>
          <p>{english ? `Workspace: ${workspace.name}` : `فضای کار: ${workspace.name}`}</p>
        </div>
        <Link
          className="text-link"
          to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}
        >
          {english ? 'Back to overview' : 'بازگشت به نمای کلی'}
        </Link>
      </header>

      <section
        className="evaluation-intro"
        aria-label={english ? 'Matrix selection' : 'انتخاب ماتریس'}
      >
        <div
          className="evaluation-tabs"
          role="group"
          aria-label={english ? 'Choose a matrix' : 'انتخاب نوع ماتریس'}
        >
          {(['efe', 'ife'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={kind === item}
              onClick={() => changeKind(item)}
            >
              <span>{MATRIX_COPY[item][english ? 'en' : 'fa'].short}</span>
              {MATRIX_COPY[item][english ? 'en' : 'fa'].title}
            </button>
          ))}
        </div>
        <div className="evaluation-summary">
          <p>{copy.description}</p>
          <span
            className={`evaluation-save-state evaluation-save-state--${saveState}`}
            role="status"
          >
            {saveState === 'finalized'
              ? english
                ? 'Finalized'
                : 'نهایی‌شده'
              : english
                ? 'Draft'
                : 'پیش‌نویس'}
          </span>
        </div>
      </section>

      {strategyQuery.isError && (
        <p className="evaluation-feedback" role="status">
          {english
            ? 'SWOT factors are unavailable; you can still enter factors manually.'
            : 'عامل‌های SWOT در دسترس نیستند؛ می‌توانید عامل‌ها را دستی وارد کنید.'}
        </p>
      )}
      {feedback && (
        <p className="evaluation-feedback is-error" role="alert">
          {feedback}
        </p>
      )}
      {revisionConflict && record && (
        <Button
          variant="secondary"
          onClick={() => {
            setRows(record.inputs.rows);
            setCleanRows(record.inputs.rows);
            setSaveState(record.state);
            setFeedback('');
            setRevisionConflict(false);
          }}
        >
          {english ? 'Load the latest saved revision' : 'بارگیری آخرین نسخه ذخیره‌شده'}
        </Button>
      )}
      {saved && (
        <p className="evaluation-feedback is-success" role="status">
          {saved}
        </p>
      )}

      <section className="evaluation-workspace" aria-label={copy.title}>
        <section
          className="evaluation-ledger strategy-panel"
          aria-labelledby="evaluation-ledger-title"
        >
          <header className="evaluation-ledger__heading">
            <div>
              <h2 id="evaluation-ledger-title">
                {english ? 'Factors and evidence' : 'عامل‌ها و شواهد'}
              </h2>
              <p>
                {english
                  ? 'Weights are percentages. Every factor needs a traceable source before finalization.'
                  : 'وزن‌ها درصد هستند. برای نهایی‌کردن، هر عامل باید شاهد یا منبع قابل پیگیری داشته باشد.'}
              </p>
            </div>
            <span className="evaluation-count">
              {number(rows.length, 0)} / {number(100, 0)}
            </span>
          </header>
          <p className="evaluation-rating-help">{ratingHelp}</p>
          {rows.length === 0 ? (
            <EmptyState
              title={english ? 'No factors yet' : 'هنوز عاملی ثبت نشده'}
              description={
                english
                  ? 'Add a factor or copy a SWOT snapshot to begin.'
                  : 'برای شروع یک عامل بسازید یا از SWOT عکس ورودی بگیرید.'
              }
            />
          ) : (
            <div
              className="evaluation-table-scroll"
              role="region"
              aria-label={
                english
                  ? 'Scrollable factor editor'
                  : 'جدول عامل‌ها؛ برای دیدن ستون‌ها افقی پیمایش کنید'
              }
              tabIndex={0}
            >
              <table className="evaluation-table">
                <thead>
                  <tr>
                    <th scope="col">{english ? 'Factor' : 'عامل'}</th>
                    <th scope="col">{english ? 'Type' : 'دسته'}</th>
                    <th scope="col">{english ? 'Weight %' : 'وزن ٪'}</th>
                    <th scope="col">{english ? 'Rating' : 'رتبه'}</th>
                    <th scope="col">{english ? 'Evidence / source' : 'شاهد / منبع'}</th>
                    <th scope="col">
                      <span className="ui-sr-only">{english ? 'Remove' : 'حذف'}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        <label className="evaluation-cell-field">
                          <span className="ui-sr-only">
                            {english ? `Factor ${index + 1}` : `عامل ${number(index + 1, 0)}`}
                          </span>
                          <input
                            type="text"
                            value={row.title}
                            maxLength={500}
                            aria-invalid={issue(`rows.${index}.title`, 'title_required')}
                            onChange={(event) =>
                              changeRow(index, { title: event.currentTarget.value })
                            }
                          />
                        </label>
                      </td>
                      <td>
                        <label className="evaluation-cell-field">
                          <span className="ui-sr-only">
                            {english
                              ? `Type for factor ${index + 1}`
                              : `دسته عامل ${number(index + 1, 0)}`}
                          </span>
                          <select
                            value={row.factor_type}
                            onChange={(event) =>
                              changeRow(index, {
                                factor_type: event.currentTarget.value as ApiStrategyFactorType,
                              })
                            }
                          >
                            {MATRIX_COPY[kind].types.map((type) => (
                              <option key={type} value={type}>
                                {factorName(type)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      <td>
                        <label className="evaluation-cell-field">
                          <span className="ui-sr-only">
                            {english
                              ? `Weight percent for factor ${index + 1}`
                              : `وزن درصدی عامل ${number(index + 1, 0)}`}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="100"
                            step="0.01"
                            value={row.weight ?? ''}
                            aria-invalid={issue(`rows.${index}.weight`)}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              changeRow(index, {
                                weight:
                                  event.currentTarget.value === ''
                                    ? null
                                    : Number(event.currentTarget.value),
                              })
                            }
                          />
                        </label>
                      </td>
                      <td>
                        <label className="evaluation-cell-field">
                          <span className="ui-sr-only">
                            {english
                              ? `Rating for factor ${index + 1}`
                              : `رتبه عامل ${number(index + 1, 0)}`}
                          </span>
                          <select
                            value={row.rating ?? ''}
                            aria-invalid={issue(`rows.${index}.rating`)}
                            onChange={(event) =>
                              changeRow(index, {
                                rating:
                                  event.currentTarget.value === ''
                                    ? null
                                    : Number(event.currentTarget.value),
                              })
                            }
                          >
                            <option value="">{english ? 'Select' : 'انتخاب'}</option>
                            {[1, 2, 3, 4].map((rating) => (
                              <option key={rating} value={rating}>
                                {number(rating, 0)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      <td>
                        <label className="evaluation-cell-field">
                          <span className="ui-sr-only">
                            {english
                              ? `Evidence for factor ${index + 1}`
                              : `شاهد عامل ${number(index + 1, 0)}`}
                          </span>
                          <textarea
                            rows={2}
                            maxLength={2000}
                            value={row.evidence}
                            aria-invalid={issue(`rows.${index}.evidence`, 'evidence_required')}
                            onChange={(event) =>
                              changeRow(index, { evidence: event.currentTarget.value })
                            }
                            placeholder={
                              english
                                ? 'A source, observation, or dated note'
                                : 'منبع، مشاهده یا یادداشت تاریخ‌دار'
                            }
                          />
                        </label>
                      </td>
                      <td>
                        <Button
                          variant="quiet"
                          disabled={!editable || pending}
                          aria-label={
                            english
                              ? `Remove factor ${index + 1}`
                              : `حذف عامل ${number(index + 1, 0)}`
                          }
                          onClick={() => {
                            setRows((current) =>
                              current.filter((_, rowIndex) => rowIndex !== index),
                            );
                            setSaved('');
                          }}
                        >
                          ×
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="evaluation-actions">
            <Button
              variant="secondary"
              disabled={!editable || pending || rows.length >= 100}
              onClick={() => setRows((current) => [...current, emptyRow(kind)])}
            >
              {english ? 'Add factor' : 'افزودن عامل'}
            </Button>
            <Button
              variant="quiet"
              disabled={!editable || pending || !importedFactors.length || rows.length >= 100}
              onClick={importFactors}
            >
              {english
                ? `Copy SWOT factors (${importedFactors.length})`
                : `افزودن عکس عامل‌های SWOT (${number(importedFactors.length, 0)})`}
            </Button>
            {strategyQuery.isPending && (
              <span role="status">
                {english ? 'Loading SWOT factors…' : 'در حال دریافت عامل‌های SWOT…'}
              </span>
            )}
            {!editable && <span>{english ? 'View only' : 'فقط مشاهده'}</span>}
          </div>
          <footer className="evaluation-save-actions">
            <p>
              {dirty
                ? english
                  ? 'Unsaved changes'
                  : 'تغییرات ذخیره‌نشده'
                : english
                  ? 'All changes are saved'
                  : 'همه تغییرها ذخیره شده‌اند'}
            </p>
            <div>
              <Button
                disabled={!editable || !dirty || pending}
                pending={pending}
                pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
                onClick={() => void save('draft')}
              >
                {english ? 'Save draft' : 'ذخیره پیش‌نویس'}
              </Button>
              <Button
                variant="primary"
                disabled={
                  !editable ||
                  !preview.can_finalize ||
                  pending ||
                  (saveState === 'finalized' && !dirty)
                }
                pending={pending}
                pendingLabel={english ? 'Finalizing…' : 'در حال نهایی‌سازی…'}
                onClick={() => void save('finalized')}
              >
                {english ? 'Finalize matrix' : 'نهایی‌کردن ماتریس'}
              </Button>
            </div>
          </footer>
        </section>

        <aside className="evaluation-result" aria-labelledby="evaluation-result-title">
          <header>
            <span>{kind.toUpperCase()}</span>
            <p>{english ? 'Weighted score' : 'نمره وزنی'}</p>
            <h2 id="evaluation-result-title" aria-live="polite">
              {preview.rounded_score === null ? '—' : number(preview.rounded_score)}
              <small> / {number(4, 0)}</small>
            </h2>
          </header>
          <dl>
            <div>
              <dt>{english ? 'Total weight' : 'مجموع وزن'}</dt>
              <dd>{number(preview.total_weight)}٪</dd>
            </div>
            <div>
              <dt>{english ? 'Calculation' : 'وضعیت محاسبه'}</dt>
              <dd>
                {preview.ready ? (english ? 'Ready' : 'کامل') : english ? 'Incomplete' : 'ناقص'}
              </dd>
            </div>
            <div>
              <dt>{english ? 'Interpretation' : 'برداشت مقیاس'}</dt>
              <dd>{interpretationLabel(preview.interpretation, english)}</dd>
            </div>
          </dl>
          <p className="evaluation-result__midpoint">
            {english
              ? '2.5 is the arithmetic midpoint of the 1–4 scale, not a universal success threshold.'
              : '۲٫۵ میانه حسابی مقیاس ۱ تا ۴ است و آستانه عمومی موفقیت نیست.'}
          </p>
          <p className="evaluation-result__limitation">{limitations}</p>
          {!preview.can_finalize && (
            <section
              className="evaluation-issues"
              aria-label={english ? 'What is missing' : 'موارد نیازمند تکمیل'}
            >
              <h3>{english ? 'To finalize' : 'برای نهایی‌کردن'}</h3>
              <ul>
                {[...new Map(preview.issues.map((entry) => [entry.code, entry])).values()]
                  .slice(0, 5)
                  .map((entry) => (
                    <li key={`${entry.code}:${entry.field}`}>
                      {outputMessage(entry.code, english)}
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {record && (
            <p className="evaluation-result__revision">
              {english
                ? `Saved revision ${number(record.revision, 0)} · ${record.method_version}`
                : `نسخه ذخیره‌شده ${number(record.revision, 0)} · ${record.method_version}`}
            </p>
          )}
        </aside>
      </section>
      <p className="evaluation-footnote">
        {english
          ? 'Calculation uses weight ÷ 100 × rating for each factor. Source evidence remains part of the saved input snapshot.'
          : 'محاسبه برای هر عامل برابر وزن تقسیم بر ۱۰۰ ضربدر رتبه است. شواهد منبع همراه عکس ورودی ذخیره می‌شود.'}
      </p>
    </main>
  );
}
