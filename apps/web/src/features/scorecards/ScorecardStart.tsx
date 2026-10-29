import { Link, useOutletContext, useSearchParams } from 'react-router';
import { useUIAppearance } from '@stratino/ui';
import type { Session } from '../../session';

export default function ScorecardStart() {
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const en = dir === 'ltr';
  const [params] = useSearchParams();
  const from = ['C07-ST05-L03', 'S01-C4-ST02-L04'].includes(params.get('from') ?? '')
    ? params.get('from')
    : '';
  return (
    <section className="workspace-tool">
      <h1>
        {en
          ? 'Choose a workspace for your scorecard'
          : 'کارت امتیازی رو برای کدوم فضای کار می‌سازی؟'}
      </h1>
      <p>
        {en
          ? 'The scorecard and observations stay with the selected business.'
          : 'کارت و عملکرد ثبت‌شده، به همین کسب‌وکار وصل می‌شن.'}
      </p>
      <ul>
        {session.workspaces.map((w) => (
          <li key={w.id}>
            <Link
              className="ui-button ui-button--secondary"
              to={`/app/workspaces/${w.id}/tools/scorecard${from ? `?from=${from}` : ''}`}
            >
              {w.name}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        className="ui-button ui-button--primary"
        to={`/app/start?next=${encodeURIComponent(`/app/scorecards${from ? `?from=${from}` : ''}`)}`}
      >
        {en ? 'Create a workspace' : 'ساخت فضای کار'}
      </Link>
      {from && (
        <p>
          <Link to={`/academy/lesson/${from}`}>{en ? 'Back to lesson' : 'بازگشت به درس'}</Link>
        </p>
      )}
    </section>
  );
}
