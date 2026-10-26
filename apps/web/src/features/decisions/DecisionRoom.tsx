import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton, useUIAppearance } from '@stratino/ui';
import { readStrategyBoard } from '../strategy/api';
import { queryKeys } from '../../api/queryKeys';
import ExecutionPlanPage from './ExecutionPlanPage';

export default function DecisionRoom() {
  const { workspaceId = '' } = useParams();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const [selected, setSelected] = useState<string[]>([]);
  const query = useQuery({
    queryKey: queryKeys.workspace.strategyBoard(workspaceId),
    queryFn: ({ signal }) => readStrategyBoard(workspaceId, signal),
  });
  const intro = (
    <section className="strategy-panel planning-page" aria-labelledby="comparison-title">
      <h2 id="comparison-title">{english ? 'Compare your options' : 'گزینه‌هات رو مقایسه کن'}</h2>
      <p>
        {english
          ? 'Compare the recorded rationale, assumptions and cost before registering a decision. This is a qualitative comparison, not a QSPM score.'
          : 'قبل از ثبت تصمیم، دلیل، فرض‌ها و هزینهٔ گزینه‌ها رو کنار هم ببین. این مقایسه کیفیه و امتیاز QSPM تولید نمی‌کنه.'}
      </p>
      {query.isPending ? (
        <Skeleton label={english ? 'Loading options' : 'در حال دریافت گزینه‌ها'} />
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>{english ? 'Retry' : 'تلاش دوباره'}</Button>
        </div>
      ) : (
        <>
          {!query.data.options.length ? (
            <p>
              {english
                ? 'Create strategy options in Growth options first.'
                : 'اول در بخش «گزینه‌های رشد» چند گزینه ثبت کن.'}
            </p>
          ) : (
            <>
              <div className="planning-actions">
                {query.data.options.map((option) => (
                  <Button
                    key={option.id}
                    aria-pressed={selected.includes(option.id)}
                    onClick={() =>
                      setSelected((ids) =>
                        ids.includes(option.id)
                          ? ids.filter((id) => id !== option.id)
                          : [...ids, option.id],
                      )
                    }
                  >
                    {option.title}
                  </Button>
                ))}
              </div>
              <div className="planning-record-grid">
                {query.data.options
                  .filter((o) => selected.includes(o.id))
                  .map((option) => (
                    <article key={option.id} className="strategy-panel planning-record">
                      <h3>{option.title}</h3>
                      {option.needs_review && (
                        <p role="status">
                          {english
                            ? 'Linked evidence changed. Review this option before deciding.'
                            : 'عامل‌های پیوندخورده تغییر کردن؛ قبل از تصمیم این گزینه رو بازبینی کن.'}
                        </p>
                      )}
                      <dl>
                        {(
                          [
                            ['action', 'اقدام', 'Action'],
                            ['rationale', 'دلیل', 'Rationale'],
                            ['hypothesis', 'فرضیه', 'Hypothesis'],
                            ['cost', 'هزینه', 'Cost'],
                          ] as const
                        ).map(([field, fa, en]) => (
                          <div key={field}>
                            <dt>{english ? en : fa}</dt>
                            <dd>{option[field] || (english ? 'Not recorded' : 'ثبت نشده')}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
              </div>
            </>
          )}
          <Link
            className="text-link"
            to={`/app/workspaces/${encodeURIComponent(workspaceId)}/tools/swot`}
          >
            {english ? 'Edit growth options' : 'ویرایش گزینه‌های رشد'}
          </Link>
        </>
      )}
    </section>
  );
  return (
    <ExecutionPlanPage
      focus="decisions"
      title={english ? 'Decision room' : 'اتاق تصمیم'}
      intro={intro}
    />
  );
}
