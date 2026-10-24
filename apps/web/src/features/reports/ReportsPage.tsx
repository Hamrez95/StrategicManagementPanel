import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';
import {
  createWorkspaceExport,
  downloadWorkspaceExport,
  listWorkspaceExports,
  readWorkspaceExport,
  type ExportSnapshot,
  type ReportEnvelope,
} from './api';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function numberLabel(value: unknown, english: boolean, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(english ? 'en-US' : 'fa-IR', {
    maximumFractionDigits: digits,
  }).format(value);
}

function dateLabel(value: string, english: boolean) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function dateOnlyLabel(value: string, english: boolean) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', { dateStyle: 'medium' }).format(date);
}

function statusLabel(value: unknown, english: boolean) {
  const key = text(value);
  const labels: Record<string, { fa: string; en: string }> = {
    draft: { fa: 'پیش‌نویس', en: 'Draft' },
    finalized: { fa: 'نهایی‌شده', en: 'Finalized' },
    proposed: { fa: 'پیشنهادی', en: 'Proposed' },
    approved: { fa: 'پذیرفته‌شده', en: 'Approved' },
    rejected: { fa: 'ردشده', en: 'Rejected' },
    superseded: { fa: 'جایگزین‌شده', en: 'Superseded' },
    active: { fa: 'فعال', en: 'Active' },
    complete: { fa: 'کامل‌شده', en: 'Complete' },
    planned: { fa: 'برنامه‌ریزی‌شده', en: 'Planned' },
    in_progress: { fa: 'در حال انجام', en: 'In progress' },
    blocked: { fa: 'متوقف', en: 'Blocked' },
    done: { fa: 'انجام‌شده', en: 'Done' },
    ready: { fa: 'آماده', en: 'Ready' },
    review: { fa: 'در حال بازبینی', en: 'In review' },
    low: { fa: 'کم', en: 'Low' },
    medium: { fa: 'متوسط', en: 'Medium' },
    high: { fa: 'زیاد', en: 'High' },
    untested: { fa: 'آزمون‌نشده', en: 'Untested' },
    observed: { fa: 'ثبت‌شده', en: 'Observed' },
    unknown: { fa: 'نامشخص', en: 'Unknown' },
    invalid: { fa: 'نامعتبر', en: 'Invalid' },
    not_applicable: { fa: 'کاربرد ندارد', en: 'Not applicable' },
    available: { fa: 'در دسترس', en: 'Available' },
    unverified: { fa: 'بررسی‌نشده', en: 'Unverified' },
    revoked: { fa: 'مجوز لغو شده', en: 'Revoked' },
    verified: { fa: 'محاسبه‌شده در سرور', en: 'Calculated on server' },
    supported: { fa: 'پشتیبانی‌شده', en: 'Supported' },
    interview: { fa: 'مصاحبه', en: 'Interview' },
    sales: { fa: 'فروش', en: 'Sales' },
    support: { fa: 'پشتیبانی', en: 'Support' },
    usage: { fa: 'استفاده', en: 'Usage' },
    survey: { fa: 'پرسش‌نامه', en: 'Survey' },
    document: { fa: 'سند', en: 'Document' },
    secondary: { fa: 'منبع ثانویه', en: 'Secondary source' },
    other: { fa: 'سایر', en: 'Other' },
    strength: { fa: 'نقطه قوت', en: 'Strength' },
    weakness: { fa: 'نقطه ضعف', en: 'Weakness' },
    opportunity: { fa: 'فرصت', en: 'Opportunity' },
    threat: { fa: 'تهدید', en: 'Threat' },
    SO: { fa: 'قوت به فرصت', en: 'Strength to opportunity' },
    WO: { fa: 'رفع ضعف با فرصت', en: 'Weakness to opportunity' },
    ST: { fa: 'قوت در برابر تهدید', en: 'Strength against threat' },
    WT: { fa: 'کاهش ضعف و تهدید', en: 'Weakness and threat response' },
  };
  return labels[key]?.[english ? 'en' : 'fa'] ?? (key || '—');
}

function MatrixChart({ analysis, english }: { analysis: RecordValue; english: boolean }) {
  const output = record(analysis.output);
  const score = typeof output.rounded_score === 'number' ? output.rounded_score : output.score;
  if (
    output.ready !== true ||
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    score < 1 ||
    score > 4
  ) {
    return (
      <p className="report-muted">
        {english
          ? 'A score is not available until the matrix is complete.'
          : 'امتیاز ماتریس پس از تکمیل ورودی‌ها در دسترس است.'}
      </p>
    );
  }
  const value = (score - 1) / 3;
  const kind = text(analysis.kind).toUpperCase();
  const midpoint =
    typeof output.midpoint === 'number' && Number.isFinite(output.midpoint)
      ? Math.max(1, Math.min(output.midpoint, 4))
      : 2.5;
  const midpointPosition = (midpoint - 1) / 3;
  return (
    <figure className="report-score">
      <svg
        viewBox="0 0 420 76"
        role="img"
        aria-label={
          english
            ? `${kind} score ${numberLabel(score, true)} on a scale from 1 to 4`
            : `امتیاز ${kind} برابر ${numberLabel(score, false)} روی مقیاس ۱ تا ۴`
        }
      >
        <rect x="8" y="24" width="404" height="20" rx="10" fill="var(--report-track)" />
        <rect x="8" y="24" width={404 * value} height="20" rx="10" fill="var(--report-score)" />
        <line
          x1={8 + 404 * midpointPosition}
          x2={8 + 404 * midpointPosition}
          y1="15"
          y2="54"
          stroke="var(--report-midpoint)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <text x="8" y="69" fontSize="12" fill="currentColor">
          {numberLabel(1, english, 0)}
        </text>
        <text x="396" y="69" fontSize="12" textAnchor="end" fill="currentColor">
          {numberLabel(4, english, 0)}
        </text>
      </svg>
      <figcaption>
        <strong>{numberLabel(score, english)}</strong>
        <span>
          {english
            ? `weighted score · scale 1–4 · midpoint ${numberLabel(midpoint, true)}`
            : `امتیاز وزنی · مقیاس ۱ تا ۴ · نقطه میانی ${numberLabel(midpoint, false)}`}
        </span>
      </figcaption>
    </figure>
  );
}

function ProfileList({
  title,
  items,
  nameField,
  fields,
  english,
}: {
  title: string;
  items: RecordValue[];
  nameField: string;
  fields: readonly (readonly [string, string, string])[];
  english: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="report-profile-list">
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={text(item.id) || `${nameField}-${index}`}>
            <strong>
              <bdi dir="auto">{text(item[nameField]) || (english ? 'Untitled' : 'بدون عنوان')}</bdi>
            </strong>
            {fields.map(([field, labelFa, labelEn]) =>
              text(item[field]) ? (
                <p key={field}>
                  <span>{english ? labelEn : labelFa}:</span>{' '}
                  <bdi dir="auto">{text(item[field])}</bdi>
                </p>
              ) : null,
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisTable({ rows, english }: { rows: RecordValue[]; english: boolean }) {
  if (!rows.length)
    return (
      <p className="report-muted">
        {english ? 'No factor rows were saved.' : 'عاملی برای این ماتریس ذخیره نشده است.'}
      </p>
    );
  return (
    <div
      className="report-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={english ? 'Analysis factors' : 'عوامل تحلیل'}
    >
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">{english ? 'Factor' : 'عامل'}</th>
            <th scope="col">{english ? 'Weight (%)' : 'وزن (٪)'}</th>
            <th scope="col">{english ? 'Rating' : 'رتبه'}</th>
            <th scope="col">{english ? 'Evidence' : 'شواهد'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={text(row.id) || `${text(row.title)}-${index}`}>
              <th scope="row">
                <bdi dir="auto">{text(row.title) || '—'}</bdi>
              </th>
              <td>{numberLabel(row.weight, english)}</td>
              <td>{numberLabel(row.rating, english)}</td>
              <td>
                <bdi dir="auto">{text(row.evidence) || '—'}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function decimalLabel(value: unknown, english: boolean) {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) return '—';
  return english
    ? value
    : value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]).replace('.', '٫');
}

function CanonicalReport({ data, english }: { data: ReportEnvelope['data']; english: boolean }) {
  const binding = (value: unknown) =>
    ({
      net_revenue: english ? 'Net revenue' : 'درآمد خالص',
      variable_costs: english ? 'Variable costs' : 'هزینه‌های متغیر',
    })[text(value)] || (english ? 'Recorded input' : 'ورودی ثبت‌شده');
  const unit = (value: unknown) =>
    text(value) === 'currency' ? (english ? 'Monetary amount' : 'مبلغ') : text(value);
  const verification = record(data.report_verification);
  const runs = records(data.calculation_runs);
  return (
    <>
      <section className="report-section" aria-labelledby="report-observations-title">
        <h3 id="report-observations-title">
          {english ? 'Recorded observations' : 'مشاهده‌های ثبت‌شده'}
        </h3>
        {!data.observations?.length && (
          <p>
            {english ? 'No numeric observations have been recorded.' : 'مشاهدهٔ عددی ثبت نشده.'}
          </p>
        )}
        {records(data.observations).map((item) => (
          <article className="report-entry" key={text(item.id)}>
            <h4>{binding(item.binding_id)}</h4>
            <p>
              {statusLabel(item.state, english)} ·{' '}
              <bdi dir="auto">{decimalLabel(item.value, english)}</bdi> · {unit(item.unit)}{' '}
              <bdi dir="ltr">{text(item.currency)}</bdi>
            </p>
            <p>
              {english ? 'Period' : 'دوره'}: {dateOnlyLabel(text(item.period_start), english)} /{' '}
              {dateOnlyLabel(text(item.period_end), english)}
            </p>
            <p>
              {english ? 'Accounting basis' : 'مبنای حسابداری'}:{' '}
              <bdi dir="auto">{text(item.accounting_basis)}</bdi>
            </p>
            {text(item.cost_scope) && (
              <p>
                {english ? 'Included variable costs' : 'دامنهٔ هزینهٔ متغیر'}:{' '}
                <bdi dir="auto">{text(item.cost_scope)}</bdi>
              </p>
            )}
            <p>
              {english ? 'Source / revision' : 'منبع / نسخه'}:{' '}
              <bdi dir="auto">{text(item.source_id)}</bdi> /{' '}
              <bdi dir="auto">{text(item.source_revision)}</bdi>
            </p>
            {text(item.reason) && <p dir="auto">{text(item.reason)}</p>}
          </article>
        ))}
      </section>
      <section className="report-section" aria-labelledby="report-metrics-title">
        <h3 id="report-metrics-title">
          {english ? 'Verified metric calculations' : 'محاسبات شاخص‌ها'}
        </h3>
        {!runs.length && (
          <p>
            {english
              ? 'No server calculation runs have been recorded.'
              : 'اجرای محاسبه‌ای در سرور ثبت نشده.'}
          </p>
        )}
        {runs.map((run) => {
          const result = records(verification.metrics).find((item) => item.run_id === run.id);
          return (
            <article className="report-entry" key={text(run.id)}>
              <h4>{english ? 'Contribution amount' : 'مبلغ حاشیهٔ مشارکت'}</h4>
              <p>
                {english ? 'Method / knowledge release' : 'روش / نسخهٔ دانش'}:{' '}
                <bdi dir="ltr">{text(run.method_revision)}</bdi> /{' '}
                <bdi dir="ltr">{text(run.knowledge_release_id)}</bdi>
              </p>
              <p>
                {english ? 'Period / accounting basis' : 'دوره / مبنای حسابداری'}:{' '}
                {dateOnlyLabel(text(run.period_start), english)} /{' '}
                {dateOnlyLabel(text(run.period_end), english)} ·{' '}
                <bdi dir="auto">{text(run.accounting_basis)}</bdi>
              </p>
              <p>
                {english ? 'Included variable costs' : 'دامنهٔ هزینهٔ متغیر'}:{' '}
                <bdi dir="auto">{text(run.cost_scope)}</bdi>
              </p>
              {result ? (
                <>
                  <p>
                    {statusLabel(result.status, english)} ·{' '}
                    <bdi dir="auto">{decimalLabel(result.value, english)}</bdi> ·{' '}
                    {unit(result.unit)} <bdi dir="ltr">{text(result.currency)}</bdi>
                  </p>
                  {Array.isArray(result.missing_inputs) && result.missing_inputs.length > 0 && (
                    <p>
                      {english ? 'Missing inputs' : 'ورودی‌های ناقص'}:{' '}
                      {result.missing_inputs.map(binding).join('، ')}
                    </p>
                  )}
                  {text(result.reason) && <p dir="auto">{text(result.reason)}</p>}
                </>
              ) : (
                <p>
                  {english
                    ? 'A professional recalculation has not been requested.'
                    : 'بازمحاسبهٔ حرفه‌ای درخواست نشده.'}
                </p>
              )}
            </article>
          );
        })}
      </section>
      <section className="report-section" aria-labelledby="report-evidence-title">
        <h3 id="report-evidence-title">{english ? 'Claims and evidence' : 'ادعاها و شواهد'}</h3>
        {!data.claims?.length && !data.evidence?.length && (
          <p>{english ? 'No claims or evidence have been recorded.' : 'ادعا یا شاهدی ثبت نشده.'}</p>
        )}
        {records(data.claims).map((item) => (
          <article className="report-entry" key={text(item.id)}>
            <h4 dir="auto">{text(item.statement)}</h4>
            <p>
              {statusLabel(item.status, english)} ·{' '}
              {
                {
                  fact: english ? 'Fact' : 'واقعیت',
                  estimate: english ? 'Estimate' : 'برآورد',
                  hypothesis: english ? 'Hypothesis' : 'فرضیه',
                  assumption: english ? 'Assumption' : 'فرض',
                }[text(item.claim_type)]
              }
            </p>
            {records(data.confidence_assessments)
              .filter((assessment) => assessment.claim_id === item.id)
              .map((assessment) => (
                <p key={text(assessment.id)}>
                  {english ? 'Confidence review' : 'بررسی اطمینان'}:{' '}
                  {statusLabel(assessment.confidence, english)} ·{' '}
                  <bdi dir="auto">{text(assessment.rationale)}</bdi>
                </p>
              ))}
          </article>
        ))}
        {records(data.evidence).map((item) => (
          <article className="report-entry" key={text(item.id)}>
            <h4 dir="auto">{text(item.provenance)}</h4>
            <p>
              {statusLabel(item.permission_status, english)} · {english ? 'Revision' : 'نسخه'}{' '}
              {numberLabel(item.revision, english, 0)}
            </p>
            <p>
              {english ? 'Source / revision' : 'منبع / نسخه'}:{' '}
              <bdi dir="auto">{text(item.source_id)}</bdi> /{' '}
              <bdi dir="auto">{text(item.source_revision)}</bdi>
            </p>
            <p>
              {english ? 'Observed' : 'زمان مشاهده'}: {dateLabel(text(item.observed_at), english)}
            </p>
            {text(item.method) && <p dir="auto">{text(item.method)}</p>}
            {text(item.limitations) && (
              <p>
                {english ? 'Limitations' : 'محدودیت‌ها'}:{' '}
                <bdi dir="auto">{text(item.limitations)}</bdi>
              </p>
            )}
          </article>
        ))}
      </section>
      <section className="report-section" aria-labelledby="report-history-title">
        <h3 id="report-history-title">
          {english ? 'Analysis revision history' : 'تاریخچهٔ نسخه‌های تحلیل'}
        </h3>
        {!data.analysis_history?.length && (
          <p>{english ? 'No retained revisions.' : 'نسخه‌ای در تاریخچه ثبت نشده.'}</p>
        )}
        {records(data.analysis_history).map((item) => {
          const saved = record(item.snapshot);
          return (
            <article className="report-entry" key={text(item.id)}>
              <h4>
                <bdi dir="ltr">{text(saved.kind).toUpperCase()}</bdi> ·{' '}
                {english ? 'Revision' : 'نسخه'} {numberLabel(item.revision, english, 0)}
              </h4>
              <p>
                {dateLabel(text(item.recorded_at), english)} · {statusLabel(saved.state, english)} ·{' '}
                <bdi dir="ltr">{text(saved.method_version)}</bdi>
              </p>
              {item.is_backfill === true && (
                <p>
                  {english
                    ? 'Initial retained version; earlier history is unknown.'
                    : 'اولین نسخهٔ نگهداری‌شده؛ تاریخچهٔ قبل از اون نامشخصه.'}
                </p>
              )}
              <AnalysisTable rows={records(record(saved.inputs).rows)} english={english} />
            </article>
          );
        })}
      </section>
    </>
  );
}

function ReportDocument({ snapshot, english }: { snapshot: ReportEnvelope; english: boolean }) {
  const data = snapshot.data;
  const profile = record(data.workspace_profile);
  const decisions = records(data.decisions);
  const goals = records(data.goals);
  const actions = records(data.actions);
  const documents = records(data.documents);
  const templates = records(data.document_templates);
  const templateTitles = new Map(
    templates.map((template) => {
      const title = record(template.title);
      return [text(template.id), text(title[english ? 'en' : 'fa'])] as const;
    }),
  );
  const verification = record(data.report_verification);
  const professional = verification.calculated_server_side === true;
  const analyses = records(professional ? verification.analyses : data.analyses);
  const factors = records(data.strategy_factors);
  const options = records(data.strategy_options);
  const products = records(data.products ?? profile.products);
  const customerSegments = records(data.segments ?? profile.customer_segments);
  const profileGoals = records(profile.goals);
  const icps = records(data.icps ?? profile.icps);
  const workspace = data.workspace;
  const heading = text(profile.company_name) || workspace.name;

  return (
    <article
      className="report-sheet"
      aria-label={english ? 'Management report preview' : 'پیش‌نمایش گزارش مدیریتی'}
    >
      <header className="report-sheet__cover">
        <p className="report-kicker">{english ? 'Strategy review' : 'مرور راهبرد'}</p>
        <h2>
          <bdi dir="auto">{heading}</bdi>
        </h2>
        <p className="report-sheet__workspace">
          {english ? 'Workspace · ' : 'فضای کار · '}
          <bdi dir="auto">{workspace.name}</bdi>
        </p>
        <p className="report-sheet__date">
          {english ? 'Snapshot date' : 'زمان ثبت گزارش'}: {dateLabel(snapshot.exported_at, english)}
        </p>
        <div className="report-cover-rule" aria-hidden="true" />
        <p className="report-cover-intro">
          {english
            ? 'A versioned view of the available analysis, decisions, execution and working documents.'
            : 'نمایی نسخه‌دار از تحلیل‌ها، تصمیم‌ها، اقدام‌ها و مدارک ثبت‌شده در این پروژه.'}
        </p>
      </header>

      <section className="report-section" aria-labelledby="report-profile-title">
        <div className="report-section__heading">
          <span aria-hidden="true">الف</span>
          <h3 id="report-profile-title">{english ? 'Project context' : 'زمینه پروژه'}</h3>
        </div>
        <dl className="report-facts">
          {[
            [english ? 'Industry' : 'صنعت', text(profile.industry)],
            [english ? 'Stage' : 'مرحله', text(profile.stage)],
          ].map(
            ([label, value]) =>
              value && (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ),
          )}
        </dl>
        {text(profile.mission) && (
          <div className="report-prose">
            <h4>{english ? 'Mission' : 'ماموریت'}</h4>
            <p>{text(profile.mission)}</p>
          </div>
        )}
        {text(profile.problem_statement) && (
          <div className="report-prose">
            <h4>{english ? 'Problem to solve' : 'مسئلهٔ محوری'}</h4>
            <p>{text(profile.problem_statement)}</p>
          </div>
        )}
        <ProfileList
          title={english ? 'Products and services' : 'محصول‌ها و خدمات'}
          items={products}
          nameField="name"
          fields={[
            ['description', 'شرح', 'Description'],
            ['problem_solved', 'مسئله‌ای که حل می‌شود', 'Problem solved'],
            ['target_customer', 'مشتری هدف', 'Target customer'],
          ]}
          english={english}
        />
        <ProfileList
          title={english ? 'Customer segments' : 'بخش‌های مشتری'}
          items={customerSegments}
          nameField="name"
          fields={[
            ['description', 'شرح', 'Description'],
            ['needs', 'نیازها', 'Needs'],
            ['buying_roles', 'نقش‌های خرید', 'Buying roles'],
          ]}
          english={english}
        />
        <ProfileList
          title={english ? 'Strategic objectives' : 'هدف‌های راهبردی'}
          items={profileGoals}
          nameField="title"
          fields={[
            ['success_signal', 'نشانه موفقیت', 'Success signal'],
            ['timeframe', 'بازه زمانی', 'Timeframe'],
          ]}
          english={english}
        />
        {icps.length > 0 && (
          <div className="report-profile-list">
            <h4>{english ? 'Ideal customer profiles' : 'پروفایل مشتری ایده‌آل'}</h4>
            <ul>
              {icps.map((icp) => {
                const segment = record(icp.segment);
                const persona = record(icp.persona);
                const evidence = records(icp.evidence);
                const assumptions = records(icp.assumptions);
                const segmentDetails = [
                  segment.industry,
                  segment.organization_size,
                  segment.geography,
                  segment.buying_context,
                ]
                  .map(text)
                  .filter(Boolean);
                const buyerDetails = [
                  persona.role,
                  persona.decision_role,
                  persona.goals,
                  persona.pains,
                ]
                  .map(text)
                  .filter(Boolean);
                return (
                  <li key={text(icp.id)}>
                    <strong>
                      <bdi dir="auto">
                        {text(icp.name) || (english ? 'Untitled profile' : 'پروفایل بدون عنوان')}
                      </bdi>
                    </strong>
                    {text(icp.problem) && <p>{text(icp.problem)}</p>}
                    <p>
                      <span>{english ? 'Segment' : 'بخش'}:</span>{' '}
                      <bdi dir="auto">{segmentDetails.join(english ? ', ' : '، ') || '—'}</bdi>
                    </p>
                    <p>
                      <span>{english ? 'Buyer' : 'مشتری'}:</span>{' '}
                      <bdi dir="auto">{buyerDetails.join(english ? ', ' : '، ') || '—'}</bdi>
                    </p>
                    {evidence.length > 0 && (
                      <div>
                        <span>{english ? 'Evidence' : 'شواهد'}</span>
                        <ul>
                          {evidence.map((item) => (
                            <li key={text(item.id)}>
                              <bdi dir="auto">{text(item.statement)}</bdi>{' '}
                              <small>
                                {statusLabel(item.source_type, english)} ·{' '}
                                {statusLabel(item.confidence, english)}
                                {text(item.reference) && (
                                  <>
                                    {' · '}
                                    <bdi dir="auto">{text(item.reference)}</bdi>
                                  </>
                                )}
                                {text(item.date) && ` · ${dateOnlyLabel(text(item.date), english)}`}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {assumptions.length > 0 && (
                      <div>
                        <span>{english ? 'Assumptions to test' : 'فرضیه‌های نیازمند آزمون'}</span>
                        <ul>
                          {assumptions.map((item) => (
                            <li key={text(item.id)}>
                              <bdi dir="auto">{text(item.statement)}</bdi>{' '}
                              <small>
                                {statusLabel(item.status, english)}
                                {text(item.confidence) &&
                                  ` · ${statusLabel(item.confidence, english)}`}
                                {text(item.test) && (
                                  <>
                                    {' · '}
                                    <bdi dir="auto">{text(item.test)}</bdi>
                                  </>
                                )}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!profile.industry &&
          !profile.stage &&
          !profile.mission &&
          !profile.problem_statement &&
          !products.length &&
          !customerSegments.length &&
          !profileGoals.length &&
          !icps.length && (
            <p className="report-muted">
              {english
                ? 'Workspace profile details have not been added yet.'
                : 'هنوز جزئیات پروفایل پروژه ثبت نشده است.'}
            </p>
          )}
      </section>

      <section className="report-section" aria-labelledby="report-analysis-title">
        <div className="report-section__heading">
          <span aria-hidden="true">ب</span>
          <h3 id="report-analysis-title">{english ? 'Analysis' : 'تحلیل'}</h3>
        </div>
        {analyses.length ? (
          analyses.map((analysis) => {
            const input = record(analysis.inputs);
            const rows = records(input.rows);
            const kind = text(analysis.kind).toUpperCase();
            return (
              <article className="report-entry" key={text(analysis.id)}>
                <div className="report-entry__heading">
                  <h4>
                    {kind === 'IFE'
                      ? english
                        ? 'Internal factors (IFE)'
                        : 'عوامل داخلی (IFE)'
                      : english
                        ? 'External factors (EFE)'
                        : 'عوامل بیرونی (EFE)'}
                  </h4>
                  <span>{statusLabel(analysis.state, english)}</span>
                </div>
                <p>
                  {english ? 'Method / revision' : 'روش / نسخه'}:{' '}
                  <bdi dir="ltr">{text(analysis.method_version)}</bdi> ·{' '}
                  {numberLabel(analysis.revision, english, 0)}
                </p>
                {professional && <MatrixChart analysis={analysis} english={english} />}
                {!professional && (
                  <p className="report-muted">
                    {english
                      ? 'Recorded inputs; professional calculation has not been requested.'
                      : 'ورودی‌های ثبت‌شده؛ محاسبهٔ گزارش حرفه‌ای درخواست نشده.'}
                  </p>
                )}
                <AnalysisTable rows={rows} english={english} />
              </article>
            );
          })
        ) : (
          <p className="report-muted">
            {english ? 'No saved evaluation matrices.' : 'ماتریس ارزیابی ذخیره‌شده‌ای وجود ندارد.'}
          </p>
        )}
      </section>

      <section className="report-section" aria-labelledby="report-strategy-title">
        <div className="report-section__heading">
          <span aria-hidden="true">پ</span>
          <h3 id="report-strategy-title">{english ? 'Strategic choices' : 'گزینه‌های راهبردی'}</h3>
        </div>
        {options.length ? (
          <div className="report-choice-list">
            {options.map((option) => (
              <article className="report-choice" key={text(option.id)}>
                <span className="report-choice__category">{text(option.category)}</span>
                <h4>
                  <bdi dir="auto">
                    {text(option.title) || (english ? 'Untitled option' : 'گزینه بدون عنوان')}
                  </bdi>
                </h4>
                {text(option.action) && <p dir="auto">{text(option.action)}</p>}
                {text(option.rationale) && (
                  <div>
                    <strong>{english ? 'Reason' : 'دلیل'}</strong>
                    <p>{text(option.rationale)}</p>
                  </div>
                )}
                {text(option.hypothesis) && (
                  <div>
                    <strong>{english ? 'Hypothesis' : 'فرضیه'}</strong>
                    <p>{text(option.hypothesis)}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="report-muted">
            {english
              ? 'No strategy options have been saved.'
              : 'گزینهٔ راهبردی ذخیره‌شده‌ای وجود ندارد.'}
          </p>
        )}
        {factors.length > 0 && (
          <div className="report-factor-summary">
            <h4>{english ? 'Evidence base' : 'پایه شواهد'}</h4>
            <ul>
              {factors.map((factor) => (
                <li key={text(factor.id)}>
                  <strong>{text(factor.title)}</strong>
                  <span>{statusLabel(factor.factor_type, english)}</span>
                  {text(factor.evidence) && <p>{text(factor.evidence)}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="report-section" aria-labelledby="report-decisions-title">
        <div className="report-section__heading">
          <span aria-hidden="true">ت</span>
          <h3 id="report-decisions-title">
            {english ? 'Decisions and execution' : 'تصمیم و اجرا'}
          </h3>
        </div>
        {decisions.length ? (
          <div className="report-decision-list">
            {decisions.map((decision) => (
              <article className="report-decision" key={text(decision.id)}>
                <div className="report-entry__heading">
                  <h4>
                    <bdi dir="auto">{text(decision.title)}</bdi>
                  </h4>
                  <span>{statusLabel(decision.status, english)}</span>
                </div>
                {text(decision.rationale) && <p>{text(decision.rationale)}</p>}
                {text(decision.assumptions) && (
                  <p>
                    <strong>{english ? 'Assumptions' : 'فرض‌ها'}:</strong>{' '}
                    {text(decision.assumptions)}
                  </p>
                )}
                {text(decision.review_trigger) && (
                  <p>
                    <strong>{english ? 'Review when' : 'زمان بازبینی'}:</strong>{' '}
                    {text(decision.review_trigger)}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="report-muted">
            {english ? 'No decisions have been recorded.' : 'تصمیمی ثبت نشده است.'}
          </p>
        )}
        {goals.length > 0 && (
          <div className="report-subsection">
            <h4>{english ? 'Goals' : 'هدف‌ها'}</h4>
            <ul>
              {goals.map((goal) => (
                <li key={text(goal.id)}>
                  <strong>{text(goal.title)}</strong>
                  <span>{statusLabel(goal.status, english)}</span>
                  {text(goal.description) && <p>{text(goal.description)}</p>}
                  {text(goal.due_on) && (
                    <small>
                      {english ? 'Due' : 'موعد'}: {dateOnlyLabel(text(goal.due_on), english)}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {actions.length > 0 && (
          <div className="report-subsection">
            <h4>{english ? 'Next actions' : 'اقدام‌ها'}</h4>
            <div
              className="report-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={english ? 'Execution actions' : 'اقدام‌های اجرایی'}
            >
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">{english ? 'Action' : 'اقدام'}</th>
                    <th scope="col">{english ? 'Status' : 'وضعیت'}</th>
                    <th scope="col">{english ? 'Description' : 'شرح اقدام'}</th>
                    <th scope="col">{english ? 'Due date' : 'موعد'}</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr key={text(action.id)}>
                      <th scope="row">{text(action.title)}</th>
                      <td>{statusLabel(action.status, english)}</td>
                      <td>{text(action.description) || '—'}</td>
                      <td>{dateOnlyLabel(text(action.due_on), english)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="report-section" aria-labelledby="report-documents-title">
        <div className="report-section__heading">
          <span aria-hidden="true">ث</span>
          <h3 id="report-documents-title">{english ? 'Working documents' : 'مدارک کاری'}</h3>
        </div>
        {documents.length ? (
          documents.map((document) => (
            <article className="report-document" key={text(document.id)}>
              <div className="report-entry__heading">
                <h4>
                  {templateTitles.get(text(document.template_id)) ||
                    (english ? 'Workspace document' : 'مدرک فضای کار')}
                </h4>
                <span>{statusLabel(document.status, english)}</span>
              </div>
              <p className="report-document__meta">
                {english ? 'Stage' : 'مرحله'}: <bdi dir="auto">{text(document.stage) || '—'}</bdi> ·{' '}
                {english ? 'Industry' : 'صنعت'}:{' '}
                <bdi dir="auto">{text(document.industry) || '—'}</bdi>
              </p>
              <div className="report-document__content" dir="auto">
                {text(document.content) ||
                  (english
                    ? 'No document content has been saved.'
                    : 'محتوایی برای این مدرک ذخیره نشده است.')}
              </div>
              {records(document.attachments).length > 0 && (
                <p className="report-document__meta">
                  {english ? 'Ready files in ZIP archive' : 'فایل‌های آماده در آرشیو ZIP'}:{' '}
                  {numberLabel(records(document.attachments).length, english)}
                </p>
              )}
            </article>
          ))
        ) : (
          <p className="report-muted">
            {english
              ? 'No working documents have been saved.'
              : 'مدرکی برای این پروژه ذخیره نشده است.'}
          </p>
        )}
        <div className="report-template-list">
          <h4>{english ? 'Five available document templates' : 'پنج قالب سند در نسخهٔ فعلی'}</h4>
          {templates.map((template) => {
            const title = record(template.title);
            const structure = record(template.structure);
            const outline = Array.isArray(structure[english ? 'en' : 'fa'])
              ? (structure[english ? 'en' : 'fa'] as unknown[])
              : [];
            return (
              <article key={text(template.id)}>
                <h5>{text(title[english ? 'en' : 'fa'])}</h5>
                <ul>
                  {outline.map((item, index) => (
                    <li key={`${text(template.id)}-${index}`}>{text(item)}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {snapshot.schema_version === 2 && <CanonicalReport data={data} english={english} />}
      <footer className="report-footer">
        {professional && (
          <p>
            {english ? 'Report status' : 'وضعیت گزارش'}: {statusLabel(verification.state, english)}
          </p>
        )}
        <p>
          {english
            ? `Workspace revision ${numberLabel(data.workspace.revision, true, 0)} · method `
            : `نسخه پروژه ${numberLabel(data.workspace.revision, false, 0)} · روش گزارش `}
          <bdi dir="ltr">{snapshot.method_version}</bdi>
        </p>
      </footer>
    </article>
  );
}

export default function ReportsPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const queryClient = useQueryClient();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const [selection, setSelection] = useState<{ workspaceId: string; exportId: string } | null>(
    null,
  );
  const selectedId = selection?.workspaceId === workspaceId ? selection.exportId : '';
  const setSelectedId = (exportId: string) => setSelection({ workspaceId, exportId });
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<'json' | 'csv' | 'zip' | ''>('');
  const [actionError, setActionError] = useState('');
  const createKey = useRef<{ workspaceId: string; purpose: string; key: string } | null>(null);
  useWorkspaceDirtyGuard(`workspace-report-${workspaceId}`, creating);

  const exportsQuery = useQuery({
    queryKey: queryKeys.workspace.exports(workspaceId),
    queryFn: ({ signal }) => listWorkspaceExports(workspaceId, signal),
    enabled: Boolean(workspace),
  });
  useEffect(() => {
    if (!selectedId && exportsQuery.data?.items[0]) {
      setSelection({ workspaceId, exportId: exportsQuery.data.items[0].id });
    }
  }, [selectedId, exportsQuery.data, workspaceId]);
  const snapshotQuery = useQuery({
    queryKey: queryKeys.workspace.export(workspaceId, selectedId),
    queryFn: ({ signal }) => readWorkspaceExport(workspaceId, selectedId, signal),
    enabled: Boolean(workspace && selectedId),
  });

  async function createReport(purpose: 'raw' | 'professional' = 'raw') {
    if (creating) return;
    setCreating(true);
    setActionError('');
    if (
      !createKey.current ||
      createKey.current.workspaceId !== workspaceId ||
      createKey.current.purpose !== purpose
    )
      createKey.current = {
        workspaceId,
        purpose,
        key:
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    try {
      const snapshot = await createWorkspaceExport(workspaceId, createKey.current.key, purpose);
      createKey.current = null;
      setSelectedId(snapshot.id);
      queryClient.setQueryData(queryKeys.workspace.export(workspaceId, snapshot.id), snapshot);
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.exports(workspaceId) });
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : english
            ? 'The report could not be prepared.'
            : 'آماده‌سازی گزارش انجام نشد.',
      );
    } finally {
      setCreating(false);
    }
  }

  async function download(format: 'json' | 'csv' | 'zip') {
    if (!selectedId || downloading) return;
    setActionError('');
    setDownloading(format);
    try {
      await downloadWorkspaceExport(workspaceId, selectedId, format);
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : english
            ? 'The file could not be downloaded.'
            : 'دریافت فایل انجام نشد.',
      );
    } finally {
      setDownloading('');
    }
  }

  async function printReport() {
    try {
      await snapshotQuery.refetch({ throwOnError: true });
      window.print();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'دسترسی گزارش رو دوباره بررسی کن.');
    }
  }

  if (!workspace) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">
          {english
            ? 'This Workspace is not in your access list.'
            : 'این فضا در فهرست دسترسی حساب شما نیست.'}
        </p>
        <Link className="text-link" to="/app/workspaces">
          {english ? 'Your Workspaces' : 'فضاهای من'}
        </Link>
      </Notice>
    );
  }

  const activeSnapshot: ExportSnapshot | undefined = snapshotQuery.data;
  const report = activeSnapshot?.snapshot;

  return (
    <main className="reports-page" aria-labelledby="reports-page-title">
      <header className="reports-heading">
        <div className="reports-heading__copy">
          <p className="reports-kicker">{english ? 'Evidence to action' : 'از شواهد تا اقدام'}</p>
          <h1 id="reports-page-title" tabIndex={-1}>
            {english ? 'Management report' : 'گزارش مدیریتی'}
          </h1>
          <p>
            {english
              ? 'Review a frozen view of analysis, decisions, execution and documents in '
              : 'نمای نسخه‌داری از تحلیل، تصمیم، اجرا و مدارک «'}
            <bdi dir="auto">{workspace.name}</bdi>
            {english ? '.' : '» بسازید و دریافت کنید.'}
          </p>
        </div>
        <div className="reports-heading__workspace">
          <span>{english ? 'Current Workspace' : 'فضای کار فعال'}</span>
          <strong dir="auto">{workspace.name}</strong>
        </div>
      </header>

      <section
        className="reports-controls"
        aria-label={english ? 'Report actions' : 'عملیات گزارش'}
      >
        <div className="reports-controls__build">
          <Button
            variant="primary"
            pending={creating}
            pendingLabel={english ? 'Preparing snapshot…' : 'در حال ثبت نسخه گزارش…'}
            onClick={() => void createReport()}
          >
            {english ? 'Save personal data snapshot' : 'ثبت نسخهٔ داده‌های شخصی'}
          </Button>
          <Button
            variant="secondary"
            disabled={creating}
            onClick={() => void createReport('professional')}
          >
            {english
              ? 'Professional report · special subscription'
              : 'گزارش حرفه‌ای با اشتراک ویژه'}
          </Button>
          {creating && (
            <span className="reports-progress" role="status">
              <progress aria-label={english ? 'Preparing report' : 'آماده‌سازی گزارش'} />
              {english
                ? 'Saving project records and ready files'
                : 'در حال ثبت داده‌های پروژه و فایل‌های آماده'}
            </span>
          )}
        </div>
        {exportsQuery.data?.items.length ? (
          <label className="reports-version-select">
            <span>{english ? 'Saved snapshot' : 'نسخهٔ ذخیره‌شده'}</span>
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.currentTarget.value);
                setActionError('');
              }}
            >
              {exportsQuery.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {dateLabel(item.created_at, english)} ·{' '}
                  {numberLabel(item.artifact.size_bytes, english, 0)} {english ? 'bytes' : 'بایت'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {actionError && (
        <p className="reports-error" role="alert">
          {actionError}
        </p>
      )}
      {exportsQuery.isPending && (
        <Skeleton
          label={english ? 'Loading saved reports' : 'در حال بارگذاری نسخه‌های گزارش'}
          lines={2}
        />
      )}
      {exportsQuery.isError && (
        <Notice title={english ? 'Reports are unavailable' : 'گزارش‌ها در دسترس نیستند'}>
          <p role="alert">{exportsQuery.error.message}</p>
          <Button variant="secondary" onClick={() => void exportsQuery.refetch()}>
            {english ? 'Retry' : 'تلاش دوباره'}
          </Button>
        </Notice>
      )}
      {snapshotQuery.isError && (
        <Notice title={english ? 'Snapshot could not be opened' : 'نسخه گزارش باز نشد'}>
          <p role="alert">{snapshotQuery.error.message}</p>
          <Button variant="secondary" onClick={() => void snapshotQuery.refetch()}>
            {english ? 'Retry' : 'تلاش دوباره'}
          </Button>
        </Notice>
      )}

      {activeSnapshot && report && (
        <>
          <div
            className="reports-toolbar"
            role="group"
            aria-label={english ? 'Export formats' : 'قالب‌های خروجی'}
          >
            <p>
              {english
                ? `Saved ${dateLabel(activeSnapshot.created_at, true)} · schema ${activeSnapshot.schema_version} · ${numberLabel(report.data.documents.length, true, 0)} documents`
                : `ثبت‌شده در ${dateLabel(activeSnapshot.created_at, false)} · نسخه داده ${numberLabel(activeSnapshot.schema_version, false, 0)} · ${numberLabel(report.data.documents.length, false, 0)} مدرک`}
            </p>
            <div className="reports-toolbar__actions">
              <Button
                variant="secondary"
                disabled={Boolean(downloading)}
                pending={downloading === 'json'}
                pendingLabel={english ? 'Downloading JSON…' : 'در حال دریافت JSON…'}
                onClick={() => void download('json')}
              >
                {english ? 'JSON' : 'دریافت JSON'}
              </Button>
              <Button
                variant="secondary"
                disabled={Boolean(downloading)}
                pending={downloading === 'csv'}
                pendingLabel={english ? 'Downloading CSV…' : 'در حال دریافت CSV…'}
                onClick={() => void download('csv')}
              >
                {english ? 'CSV' : 'دریافت CSV'}
              </Button>
              <Button
                variant="secondary"
                disabled={Boolean(downloading)}
                pending={downloading === 'zip'}
                pendingLabel={english ? 'Downloading ZIP…' : 'در حال دریافت ZIP…'}
                onClick={() => void download('zip')}
              >
                {english ? 'ZIP with files' : 'ZIP همراه فایل‌ها'}
              </Button>
              <Button variant="quiet" onClick={() => void printReport()}>
                {english ? 'Print / save PDF' : 'چاپ / ذخیره PDF'}
              </Button>
            </div>
          </div>
          <ReportDocument snapshot={report} english={english} />
        </>
      )}

      {!exportsQuery.isPending && !exportsQuery.isError && !exportsQuery.data?.items.length && (
        <EmptyState
          title={english ? 'No report snapshots yet' : 'هنوز نسخه‌ای از گزارش ندارید'}
          description={
            english
              ? 'Create a snapshot to bring saved analysis, strategy, decisions, actions and documents into one review.'
              : 'یک نسخه بسازید تا تحلیل‌ها، گزینه‌های راهبردی، تصمیم‌ها، اقدام‌ها و مدارک ثبت‌شده در یک گزارش مرور شوند.'
          }
        />
      )}
      {snapshotQuery.isPending && selectedId && (
        <Skeleton label={english ? 'Opening report snapshot' : 'در حال بازکردن گزارش'} lines={4} />
      )}
    </main>
  );
}
