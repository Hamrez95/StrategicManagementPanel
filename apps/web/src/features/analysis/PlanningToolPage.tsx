import { useState, type FormEvent } from 'react';
import { useOutletContext, useParams, Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import type { Session } from '../../session';
import { ApiError } from '../../api/client';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';
import { planningDefinitions } from './planningDefinitions';
import { readPlanning, savePlanning, type PlanningRecord } from './planningApi';

export default function PlanningToolPage({ tool }: { tool: string }) {
  const { workspaceId = '' } = useParams();
  return <PlanningEditor key={`${workspaceId}:${tool}`} workspaceId={workspaceId} tool={tool} />;
}
function PlanningEditor({ workspaceId, tool }: { workspaceId: string; tool: string }) {
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const language = english ? 'en' : 'fa';
  const definition = planningDefinitions[tool];
  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const editable = workspace?.role === 'owner' || workspace?.role === 'editor';
  const client = useQueryClient();
  const key = ['workspace', workspaceId, 'planning', tool];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => readPlanning(workspaceId, tool, signal),
    enabled: !!workspace,
  });
  const [draft, setDraft] = useState<Record<string, string | null> | null>(null);
  const [selected, setSelected] = useState<PlanningRecord | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState('');
  const [conflict, setConflict] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(8);
  useWorkspaceDirtyGuard(`planning:${workspaceId}:${tool}`, draft !== null);
  const number = (v: number) => new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(v);
  function open(record: PlanningRecord | null) {
    if (
      draft &&
      !window.confirm(english ? 'Discard the unsaved draft?' : 'تغییرات ذخیره‌نشده رو کنار بذاریم؟')
    )
      return;
    setSelected(record);
    setRequestId(crypto.randomUUID());
    setError('');
    setFields({});
    setSaved('');
    setConflict(false);
    setDraft(
      Object.fromEntries(
        ['title', ...definition.fields.map((f) => f.id)].map((id) => [
          id,
          record
            ? String(record[id] ?? '')
            : (definition.fields.find((f) => f.id === id)?.options?.[0]?.value ?? ''),
        ]),
      ),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || pending) return;
    setPending(true);
    setError('');
    setFields({});
    setSaved('');
    setConflict(false);
    const body = {
      ...draft,
      ...Object.fromEntries(
        definition.fields.filter((f) => f.type === 'date').map((f) => [f.id, draft[f.id] || null]),
      ),
      ...(selected ? { revision: selected.revision } : { id: requestId }),
    };
    try {
      const record = await savePlanning(workspaceId, tool, body, selected?.id);
      client.setQueryData<PlanningRecord[]>(key, (old) => [
        record,
        ...(old ?? []).filter((r) => r.id !== record.id),
      ]);
      setDraft(null);
      setSelected(null);
      setSaved(english ? 'Saved to this Workspace.' : 'در همین فضای کار ذخیره شد.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : english
            ? 'Saving failed. Your draft is retained.'
            : 'ذخیره نشد؛ نوشته‌ات حفظ شده.',
      );
      if (err instanceof ApiError) {
        setFields(err.fields);
        setConflict(err.status === 409);
      }
    } finally {
      setPending(false);
    }
  }
  if (!workspace)
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p>
          {english ? 'Choose an accessible Workspace.' : 'یکی از فضاهای در دسترست رو انتخاب کن.'}
        </p>
      </Notice>
    );
  if (query.isPending)
    return <Skeleton label={english ? 'Loading records' : 'در حال دریافت اطلاعات'} />;
  if (query.isError)
    return (
      <Notice title={english ? 'Could not load records' : 'اطلاعات دریافت نشد'}>
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>{english ? 'Retry' : 'تلاش دوباره'}</Button>
      </Notice>
    );
  const rows = query.data.filter((r) =>
    String(r.title).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="strategy-page planning-page" aria-labelledby="planning-heading">
      <header className="strategy-heading">
        <div>
          <h1 id="planning-heading" tabIndex={-1}>
            {definition.title[language]}
          </h1>
          <p>{definition.description[language]}</p>
        </div>
        {editable && !draft && (
          <Button variant="primary" onClick={() => open(null)}>
            {english ? 'Add record' : 'افزودن مورد'}
          </Button>
        )}
      </header>
      {definition.note && <p className="planning-note">{definition.note[language]}</p>}
      {!editable && (
        <p role="status">
          {english ? 'You have view-only access.' : 'دسترسی تو فقط برای مشاهده است.'}
        </p>
      )}
      {saved && (
        <p role="status" className="planning-success">
          {saved}
        </p>
      )}
      {error && (
        <div role="alert" className="planning-error">
          <p>{error}</p>
          {Object.entries(fields).map(([name, messages]) => (
            <p key={name}>
              {definition.fields.find((f) => f.id === name)?.label[language] ??
                (name === 'title' ? (english ? 'Title' : 'عنوان') : '')}
              : {messages.join(' ')}
            </p>
          ))}
          {conflict && (
            <Button onClick={() => void query.refetch()}>
              {english ? 'Refresh saved records (keep draft)' : 'تازه‌کردن فهرست؛ با حفظ نوشته'}
            </Button>
          )}
        </div>
      )}
      {draft && (
        <form
          className="strategy-panel planning-editor"
          onSubmit={(event) => void submit(event)}
          aria-label={english ? 'Record editor' : 'ویرایش مورد'}
        >
          <h2>
            {selected
              ? english
                ? 'Edit record'
                : 'ویرایش مورد'
              : english
                ? 'New record'
                : 'مورد جدید'}
          </h2>
          <fieldset disabled={pending} className="planning-fields">
            <Input
              label={english ? 'Title' : 'عنوان'}
              value={draft.title ?? ''}
              maxLength={160}
              required
              onChange={(e) => {
                setDraft({ ...draft, title: e.currentTarget.value });
                if (!selected) setRequestId(crypto.randomUUID());
              }}
            />
            {definition.fields.map((f) => {
              const label = f.label[language];
              const onChange = (value: string) => {
                setDraft({ ...draft, [f.id]: value });
                if (!selected) setRequestId(crypto.randomUUID());
              };
              return (
                <label
                  key={f.id}
                  className={
                    f.type === 'textarea' ? 'planning-field planning-field--wide' : 'planning-field'
                  }
                >
                  <span>{label}</span>
                  {f.options ? (
                    <select
                      value={draft[f.id] ?? ''}
                      onChange={(e) => onChange(e.currentTarget.value)}
                    >
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label[language]}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      value={draft[f.id] ?? ''}
                      rows={3}
                      maxLength={f.maximum}
                      required={f.required}
                      onChange={(e) => onChange(e.currentTarget.value)}
                    />
                  ) : (
                    <input
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={draft[f.id] ?? ''}
                      maxLength={f.maximum}
                      required={f.required}
                      onChange={(e) => onChange(e.currentTarget.value)}
                    />
                  )}
                </label>
              );
            })}
          </fieldset>
          <div className="planning-actions">
            <Button type="submit" variant="primary" pending={pending}>
              {english ? 'Save' : 'ذخیره'}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    english ? 'Discard the unsaved draft?' : 'نوشتهٔ ذخیره‌نشده رو کنار بذاریم؟',
                  )
                ) {
                  setDraft(null);
                  setSelected(null);
                  setError('');
                }
              }}
            >
              {english ? 'Cancel' : 'انصراف'}
            </Button>
          </div>
        </form>
      )}
      <section
        className="planning-records"
        aria-label={english ? 'Saved records' : 'موارد ذخیره‌شده'}
      >
        <header className="planning-list-heading">
          <h2>
            {english ? 'Saved records' : 'موارد ذخیره‌شده'}{' '}
            <small>({number(query.data.length)})</small>
          </h2>
          {query.data.length > 3 && (
            <Input
              label={english ? 'Search titles' : 'جست‌وجو در عنوان‌ها'}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
          )}
        </header>
        {rows.length === 0 ? (
          <p>
            {query.data.length
              ? english
                ? 'No matching records.'
                : 'موردی با این عنوان پیدا نشد.'
              : english
                ? 'No records yet. Add the first one above.'
                : 'هنوز موردی ثبت نشده. از دکمهٔ بالا شروع کن.'}
          </p>
        ) : (
          <div className="planning-record-grid">
            {rows.slice(0, visibleCount).map((record) => (
              <article className="strategy-panel planning-record" key={record.id}>
                <header>
                  <h3>{record.title}</h3>
                  {editable && (
                    <Button disabled={pending} onClick={() => open(record)}>
                      {english ? 'Edit' : 'ویرایش'}
                    </Button>
                  )}
                </header>
                <details>
                  <summary>{english ? 'Details and sources' : 'جزئیات و منابع'}</summary>
                  <dl>
                    {definition.fields.map((f) => (
                      <div key={f.id}>
                        <dt>{f.label[language]}</dt>
                        <dd>
                          {f.options?.find((o) => o.value === record[f.id])?.label[language] ??
                            (f.type === 'date' && record[f.id]
                              ? new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
                                  dateStyle: 'medium',
                                  timeZone: 'UTC',
                                }).format(new Date(`${record[f.id]}T00:00:00Z`))
                              : record[f.id] || (english ? 'Not recorded' : 'ثبت نشده'))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
                <small>
                  {english ? 'Revision' : 'نسخه'} {number(record.revision)}
                </small>
              </article>
            ))}
          </div>
        )}
        {rows.length > visibleCount && (
          <Button onClick={() => setVisibleCount((count) => count + 8)}>
            {english ? 'Show more' : 'نمایش موارد بیشتر'}
          </Button>
        )}
      </section>
      <Link
        className="text-link"
        to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}
      >
        {english ? 'Project overview' : 'نمای کلی پروژه'}
      </Link>
    </section>
  );
}
