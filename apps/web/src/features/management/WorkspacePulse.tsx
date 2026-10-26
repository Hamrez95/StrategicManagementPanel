import { Link } from 'react-router';
import type { ApiWorkspaceSummary } from '../../api/contracts';
import { Icon } from '../experience/ExperienceUI';
import { chartNumber, DecisionOrbit, DistributionChart } from './ManagementCharts';

export function WorkspacePulse({
  summary,
  workspaceId,
  english,
}: {
  summary: ApiWorkspaceSummary;
  workspaceId: string;
  english: boolean;
}) {
  const base = `/app/workspaces/${encodeURIComponent(workspaceId)}/tools/`;
  return (
    <section
      className="workspace-pulse"
      aria-label={english ? 'Management overview' : 'مرور مدیریتی'}
    >
      <div className="management-welcome">
        <div>
          <p className="management-eyebrow">
            {english ? 'A clearer view. A better next step.' : 'یک نگاه روشن‌تر، یک قدم سنجیده‌تر'}
          </p>
          <h2>{english ? 'Your business, in perspective' : 'تصویر امروز کسب‌وکارت'}</h2>
          <p>
            {english
              ? 'Start with what needs your attention, then follow the evidence.'
              : 'ببین کجا به توجهت نیاز داره؛ بعد، جزئیات و شواهدش رو دنبال کن.'}
          </p>
          <Link className="ui-button ui-button--primary" to={base + 'reports'}>
            <Icon name="chart" />
            {english ? 'Open report studio' : 'رفتن به استودیوی گزارش'}
          </Link>
        </div>
        <DecisionOrbit />
      </div>
      <div className="management-stat-grid">
        {[
          {
            icon: 'chart',
            count: summary.analyses.finalized_count,
            label: english ? 'Finalized analyses' : 'تحلیل نهایی',
            hint: english ? 'Saved in this Workspace' : 'ثبت‌شده در همین فضا',
            to: 'matrices',
          },
          {
            icon: 'file',
            count: summary.analyses.draft_count,
            label: english ? 'Analysis drafts' : 'تحلیل در دست تکمیل',
            hint: english ? 'Continue your analysis' : 'ادامهٔ تحلیل‌هات رو ببین',
            to: 'matrices',
          },
          {
            icon: 'flag',
            count: summary.attention_items.length,
            label: english ? 'Items in this review' : 'پیگیری در این مرور',
            hint: english ? 'Suggested attention items' : 'موارد پیشنهادی برای توجه',
            to: 'execution',
          },
        ].map((item) => (
          <Link className="management-stat" key={item.label} to={base + item.to}>
            <span className="management-stat__icon">
              <Icon name={item.icon} size={25} />
            </span>
            <span>
              <span>{item.label}</span>
              <strong>{chartNumber(item.count, english)}</strong>
              <small>{item.hint}</small>
            </span>
            <Icon name="arrow" size={18} />
          </Link>
        ))}
      </div>
      <div className="management-overview-grid">
        <DistributionChart
          title={english ? 'Where your analyses stand' : 'تحلیل‌هات در چه وضعیتی‌اند؟'}
          english={english}
          rows={[
            {
              id: 'final',
              label: english ? 'Finalized' : 'نهایی‌شده',
              count: summary.analyses.finalized_count,
              color: '#496f9e',
            },
            {
              id: 'draft',
              label: english ? 'Draft' : 'پیش‌نویس',
              count: summary.analyses.draft_count,
              color: '#b68648',
            },
          ]}
          caption={
            english
              ? 'Counts show saved status, not the scientific quality of an analysis.'
              : 'این تعداد، وضعیت ثبت رو نشون می‌ده؛ معیار کیفیت علمی تحلیل نیست.'
          }
        />
        <section className="management-focus">
          <span className="management-focus__icon">
            <Icon name="compass" size={30} />
          </span>
          <h3>
            {english
              ? 'From the overview to the next decision'
              : 'از این نگاه کلی، به تصمیم بعدی برس'}
          </h3>
          <p>
            {english
              ? 'Use the next-step section below, or open a saved report for a visual review of execution, strategy and documents.'
              : 'گام بعدی رو همین پایین ببین؛ یا یک گزارش ثبت‌شده رو باز کن و اجرا، راهبرد و مدارک رو کنار هم مرور کن.'}
          </p>
          <p className="management-note">
            {english
              ? 'The overview is a shortlist. Open the execution plan for all actions.'
              : 'این مرور یک فهرست خلاصه‌ست. همهٔ اقدام‌ها رو در برنامهٔ اجرا ببین.'}
          </p>
          <Link to={base + 'execution'}>
            {english ? 'Open execution plan' : 'دیدن برنامهٔ اجرا'} <Icon name="arrow" size={17} />
          </Link>
        </section>
      </div>
    </section>
  );
}
