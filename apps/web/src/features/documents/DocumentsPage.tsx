import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { ApiError } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type {
  ApiDocumentBoard,
  ApiDocumentStatus,
  ApiDocumentTemplate,
  ApiDocumentWrite,
} from '../../api/contracts';
import type { Session } from '../../session';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';
import { createDocumentRecord, readDocumentBoard, updateDocumentRecord } from './api';

const statusLabels: Record<ApiDocumentStatus, { fa: string; en: string }> = {
  draft: { fa: 'پیش‌نویس', en: 'Draft' },
  review: { fa: 'در بازبینی', en: 'In review' },
  ready: { fa: 'آماده', en: 'Ready' },
};

function initialDraft(
  template: ApiDocumentTemplate,
  board: ApiDocumentBoard,
  userId: string,
): ApiDocumentWrite {
  const record = template.record;
  const memberId = board.members.some((member) => member.id === userId)
    ? userId
    : (board.members[0]?.id ?? '');
  return {
    template_id: template.id,
    stage: record?.stage ?? template.stages[0] ?? board.stages[0]?.id ?? '',
    industry: record?.industry ?? template.industries[0] ?? board.industries[0]?.id ?? '',
    owner_id: record?.owner_id ?? memberId,
    reviewer_id: record?.reviewer_id ?? null,
    status: record?.status ?? 'draft',
    content: record?.content ?? '',
  };
}

function dateLabel(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function DocumentsPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const canWrite = workspace?.role === 'owner' || workspace?.role === 'editor';
  const queryClient = useQueryClient();
  const [stage, setStage] = useState('');
  const [industry, setIndustry] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ApiDocumentWrite | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const boardQuery = useQuery({
    queryKey: queryKeys.workspace.documents(workspaceId, stage, industry),
    queryFn: ({ signal }) => readDocumentBoard(workspaceId, { stage, industry }, signal),
    enabled: Boolean(workspace),
  });
  const board = boardQuery.data;
  const visibleItems = useMemo(() => {
    if (!board) return [];
    const needle = search.trim().toLocaleLowerCase(english ? 'en-US' : 'fa-IR');
    return board.items.filter(
      (item) =>
        !needle ||
        `${item.keywords} ${item.title.fa} ${item.title.en}`.toLocaleLowerCase().includes(needle),
    );
  }, [board, english, search]);
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  useWorkspaceDirtyGuard(`documents-${workspaceId}`, dirty);

  useEffect(() => {
    if (!selected || !board) {
      setSelectedId('');
      setDraft(null);
      setDirty(false);
      return;
    }
    if (selected.id !== selectedId) setSelectedId(selected.id);
    if (!dirty) setDraft(initialDraft(selected, board, session.user.id));
  }, [board, dirty, selected, selectedId, session.user.id]);

  function updateDraft<K extends keyof ApiDocumentWrite>(key: K, value: ApiDocumentWrite[K]) {
    if (!draft) return;
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setFeedback('');
    setSavedMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !selected || !board || !canWrite) return;
    setPending(true);
    setFeedback('');
    setSavedMessage('');
    try {
      if (selected.record) {
        await updateDocumentRecord(workspaceId, selected.record.id, {
          revision: selected.record.revision,
          stage: draft.stage,
          industry: draft.industry,
          owner_id: draft.owner_id,
          reviewer_id: draft.reviewer_id,
          status: draft.status,
          content: draft.content,
        });
      } else {
        await createDocumentRecord(workspaceId, draft);
      }
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'documents'] });
      setDirty(false);
      setSavedMessage(english ? 'Document assignment saved.' : 'راهنمای سند در فضای کار ذخیره شد.');
    } catch (error) {
      setFeedback(
        error instanceof ApiError && error.code === 'revision_conflict'
          ? english
            ? 'A newer version exists. The latest board is being loaded.'
            : 'نسخه تازه‌تری ثبت شده است؛ فهرست به‌روز می‌شود.'
          : error instanceof Error
            ? error instanceof ApiError && Object.values(error.fields).flat().length > 0
              ? `${error.message} ${Object.values(error.fields).flat().join(' · ')}`
              : error.message
            : english
              ? 'The document could not be saved.'
              : 'ذخیره سند انجام نشد.',
      );
      if (error instanceof ApiError && error.code === 'revision_conflict')
        await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'documents'] });
    } finally {
      setPending(false);
    }
  }

  function selectDocument(id: string) {
    if (dirty) {
      setFeedback(
        english
          ? 'Save or reset the current draft before choosing another guide.'
          : 'پیش از انتخاب راهنمای دیگر، تغییرات فعلی را ذخیره کنید.',
      );
      return;
    }
    setSelectedId(id);
    setFeedback('');
    setSavedMessage('');
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    if (dirty) {
      setFeedback(
        english
          ? 'Save the current assignment before changing filters.'
          : 'پیش از تغییر فیلتر، تغییرات فعلی را ذخیره کنید.',
      );
      return;
    }
    setter(value);
  }

  if (!workspace)
    return (
      <section className="documents-page">
        <Notice title={english ? 'Workspace is unavailable' : 'فضای کار در دسترس نیست'} />
      </section>
    );
  if (boardQuery.isPending)
    return (
      <section className="documents-page">
        <Skeleton
          label={english ? 'Loading document library' : 'در حال بارگذاری کتابخانه مدارک'}
          lines={5}
        />
      </section>
    );
  if (boardQuery.isError)
    return (
      <section className="documents-page">
        <Notice
          title={english ? 'Document library could not be loaded' : 'کتابخانه مدارک بارگذاری نشد'}
        >
          <p role="alert">{boardQuery.error.message}</p>
          <Button onClick={() => void boardQuery.refetch()}>
            {english ? 'Try again' : 'تلاش دوباره'}
          </Button>
        </Notice>
      </section>
    );
  if (!board) return null;

  const formatter = new Intl.NumberFormat(english ? 'en-US' : 'fa-IR');
  const statusCopy = selected?.record
    ? statusLabels[selected.record.status][english ? 'en' : 'fa']
    : english
      ? 'Not assigned'
      : 'ثبت‌نشده';
  const nextAction = !selected?.record
    ? english
      ? 'Assign an owner and save this guide as a draft.'
      : 'مسئول را تعیین کنید و راهنما را به‌صورت پیش‌نویس ثبت کنید.'
    : selected.record.status === 'draft'
      ? english
        ? 'Complete the draft and choose a reviewer when it is ready.'
        : 'پیش‌نویس را کامل کنید و برای بازبینی، بازبین را انتخاب کنید.'
      : selected.record.status === 'review'
        ? english
          ? 'The assigned reviewer should review the content before marking it ready.'
          : 'بازبین تعیین‌شده محتوا را بررسی کند و سپس آن را آماده کند.'
        : english
          ? 'Keep this version current; content edits return it to draft.'
          : 'محتوا را به‌روز نگه دارید؛ هر تغییر، وضعیت را به پیش‌نویس برمی‌گرداند.';
  const events = board.events.slice(0, 12);

  return (
    <section className="documents-page" aria-labelledby="documents-title">
      <header className="documents-heading">
        <div>
          <p className="documents-eyebrow">
            {english ? 'EVIDENCE AND OPERATIONS' : 'مدارک و اجرا'}
          </p>
          <h1 id="documents-title" tabIndex={-1}>
            {english ? 'Management document library' : 'کتابخانه مدارک مدیریتی'}
          </h1>
          <p>
            {english
              ? 'Choose a reusable guide, assign an owner, and track review status for this Workspace.'
              : 'راهنمای قابل‌استفاده را انتخاب کنید، مسئولش را مشخص کنید و وضعیت بازبینی را در همین فضای کار دنبال کنید.'}
          </p>
        </div>
        <div className="documents-summary" aria-live="polite">
          <strong>{formatter.format(visibleItems.length)}</strong>
          <span>{english ? 'guides in view' : 'راهنما در فهرست'}</span>
        </div>
      </header>

      <div className="documents-filterbar">
        <label className="documents-field documents-search">
          <span>{english ? 'Search guides' : 'جستجوی راهنما'}</span>
          <input
            type="search"
            value={search}
            disabled={dirty}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={
              english ? 'Title, purpose, or writing guidance' : 'عنوان، کاربرد یا راهنمای نگارش'
            }
          />
        </label>
        <label className="documents-field">
          <span>{english ? 'Business stage' : 'مرحله کسب‌وکار'}</span>
          <select
            value={stage}
            disabled={dirty}
            onChange={(event) => changeFilter(setStage, event.currentTarget.value)}
          >
            <option value="">{english ? 'All stages' : 'همه مراحل'}</option>
            {board.stages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title[english ? 'en' : 'fa']}
              </option>
            ))}
          </select>
        </label>
        <label className="documents-field">
          <span>{english ? 'Industry' : 'صنعت'}</span>
          <select
            value={industry}
            disabled={dirty}
            onChange={(event) => changeFilter(setIndustry, event.currentTarget.value)}
          >
            <option value="">{english ? 'All industries' : 'همه صنایع'}</option>
            {board.industries
              .filter((item) => item.id !== 'general')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title[english ? 'en' : 'fa']}
                </option>
              ))}
          </select>
        </label>
      </div>

      {feedback && (
        <Notice title={english ? 'Could not save changes' : 'ذخیره تغییرات انجام نشد'}>
          <p role="alert">{feedback}</p>
        </Notice>
      )}
      {savedMessage && (
        <p className="documents-saved" role="status">
          {savedMessage}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <EmptyState
          title={english ? 'No guides match these filters' : 'راهنمایی با این فیلترها پیدا نشد'}
          description={
            english
              ? 'Clear one filter or try a broader search.'
              : 'یکی از فیلترها را پاک کنید یا عبارت عمومی‌تری بجویید.'
          }
        />
      ) : (
        <div className="documents-workspace">
          <nav
            className="documents-index"
            aria-label={english ? 'Document guides' : 'فهرست راهنماها'}
          >
            <h2>{english ? 'Guide inventory' : 'فهرست راهنماها'}</h2>
            <ul>
              {visibleItems.map((item) => {
                const section = board.sections.find((entry) => entry.id === item.section);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`documents-index__item${selected?.id === item.id ? ' is-selected' : ''}`}
                      aria-current={selected?.id === item.id ? 'page' : undefined}
                      onClick={() => selectDocument(item.id)}
                    >
                      <span className="documents-index__top">
                        <strong>{item.title[english ? 'en' : 'fa']}</strong>
                        <span className="documents-priority">{item.priority}</span>
                      </span>
                      <span className="documents-index__meta">
                        {section?.title[english ? 'en' : 'fa']} ·{' '}
                        {item.catalog_state === 'mvp'
                          ? english
                            ? 'MVP guide'
                            : 'راهنمای MVP'
                          : english
                            ? 'Catalog only'
                            : 'فهرست کاتالوگ'}
                      </span>
                      <span className="documents-index__meta">
                        {item.record
                          ? english
                            ? 'Owner'
                            : 'مسئول'
                          : english
                            ? 'Suggested owner'
                            : 'مسئول پیشنهادی'}{' '}
                        · {item.record?.owner_name ?? item.recommended_owner[english ? 'en' : 'fa']}
                      </span>
                      <span className="documents-index__state">
                        {item.record
                          ? statusLabels[item.record.status][english ? 'en' : 'fa']
                          : english
                            ? 'Not assigned'
                            : 'ثبت‌نشده'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selected && draft && (
            <article className="documents-detail" aria-labelledby="selected-document-title">
              <div className="documents-detail__heading">
                <div>
                  <p className="documents-eyebrow">
                    {selected.priority} · {selected.kind[english ? 'en' : 'fa']}
                  </p>
                  <h2 id="selected-document-title">{selected.title[english ? 'en' : 'fa']}</h2>
                  <p>{selected.topic[english ? 'en' : 'fa']}</p>
                </div>
                <span
                  className={`documents-state documents-state--${selected.record?.status ?? 'unassigned'}`}
                >
                  {statusCopy}
                </span>
              </div>

              <p className="documents-next-action">
                <strong>{english ? 'Next action' : 'اقدام بعدی'}</strong>
                <span>{nextAction}</span>
              </p>

              <div className="documents-facts">
                <div>
                  <span>{english ? 'Suggested owner' : 'مسئول پیشنهادی'}</span>
                  <strong>{selected.recommended_owner[english ? 'en' : 'fa']}</strong>
                </div>
                <div>
                  <span>{english ? 'Audience' : 'مخاطب'}</span>
                  <strong>{selected.audience[english ? 'en' : 'fa']}</strong>
                </div>
                <div>
                  <span>{english ? 'Used for' : 'کاربرد'}</span>
                  <strong>{selected.use[english ? 'en' : 'fa']}</strong>
                </div>
                <div>
                  <span>{english ? 'Review timing' : 'زمان بازبینی'}</span>
                  <strong>{selected.timing[english ? 'en' : 'fa']}</strong>
                </div>
              </div>

              <section className="documents-guide" aria-labelledby="document-guide-title">
                <div className="documents-section-title">
                  <div>
                    <p className="documents-eyebrow">
                      {english ? 'HOW TO PREPARE' : 'راهنمای تهیه'}
                    </p>
                    <h3 id="document-guide-title">
                      {english ? 'Suggested structure' : 'ساختار پیشنهادی'}
                    </h3>
                  </div>
                  {selected.catalog_state === 'mvp' && (
                    <span className="documents-mvp-label">
                      {english ? 'MVP guide' : 'راهنمای کامل MVP'}
                    </span>
                  )}
                </div>
                <ol className="documents-outline">
                  {selected.structure[english ? 'en' : 'fa'].map((part, index) => (
                    <li key={`${part}-${index}`}>
                      <span>{formatter.format(index + 1)}</span>
                      {part}
                    </li>
                  ))}
                </ol>
                <h3>{english ? 'Writing guidance' : 'نکته‌های نگارش'}</h3>
                <p>{selected.writing_guide[english ? 'en' : 'fa']}</p>
                {selected.example && (
                  <aside className="documents-example">
                    <strong>{english ? 'Placeholder example' : 'نمونه جای‌نگهدار'}</strong>
                    <p>{selected.example[english ? 'en' : 'fa']}</p>
                    <small>{selected.example.note[english ? 'en' : 'fa']}</small>
                  </aside>
                )}
                {selected.catalog_state === 'catalog_only' && (
                  <p className="documents-catalog-note">
                    {english
                      ? 'This entry is an inventory guide. A complete, editable template is outside the current release.'
                      : 'این مورد در این نسخه راهنمای فهرست است؛ الگوی کامل و قابل‌ویرایش آن هنوز ارائه نشده است.'}
                  </p>
                )}
                {selected.advisory_note && (
                  <aside className="documents-advisory">
                    <strong>{english ? 'Professional review' : 'بازبینی تخصصی'}</strong>
                    <p>{selected.advisory_note[english ? 'en' : 'fa']}</p>
                  </aside>
                )}
              </section>

              <form
                className="documents-assignment"
                onSubmit={(event) => void save(event)}
                onChange={() => {
                  if (canWrite) {
                    setDirty(true);
                    setFeedback('');
                    setSavedMessage('');
                  }
                }}
              >
                <div className="documents-section-title">
                  <div>
                    <p className="documents-eyebrow">
                      {english ? 'WORKSPACE RECORD' : 'ثبت در فضای کار'}
                    </p>
                    <h3>
                      {selected.record
                        ? english
                          ? 'Assignment and review'
                          : 'مسئولیت و بازبینی'
                        : english
                          ? 'Assign this guide'
                          : 'ثبت این راهنما'}
                    </h3>
                  </div>
                  {selected.record && (
                    <span className="documents-version">
                      {english
                        ? `Content v${formatter.format(selected.record.content_version)} · revision ${formatter.format(selected.record.revision)}`
                        : `نسخه محتوا ${formatter.format(selected.record.content_version)} · بازبینی ${formatter.format(selected.record.revision)}`}
                    </span>
                  )}
                </div>
                <div className="documents-form-grid">
                  <label className="documents-field">
                    <span>{english ? 'Stage' : 'مرحله'}</span>
                    <select
                      value={draft.stage}
                      disabled={!canWrite}
                      onChange={(event) => updateDraft('stage', event.currentTarget.value)}
                    >
                      {selected.stages.map((id) => (
                        <option key={id} value={id}>
                          {board.stages.find((entry) => entry.id === id)?.title[
                            english ? 'en' : 'fa'
                          ] ?? id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="documents-field">
                    <span>{english ? 'Industry' : 'صنعت'}</span>
                    <select
                      value={draft.industry}
                      disabled={!canWrite}
                      onChange={(event) => updateDraft('industry', event.currentTarget.value)}
                    >
                      {selected.industries.map((id) => (
                        <option key={id} value={id}>
                          {board.industries.find((entry) => entry.id === id)?.title[
                            english ? 'en' : 'fa'
                          ] ?? id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="documents-field">
                    <span>{english ? 'Accountable owner' : 'مسئول اصلی'}</span>
                    <select
                      value={draft.owner_id}
                      disabled={!canWrite}
                      required
                      onChange={(event) => updateDraft('owner_id', event.currentTarget.value)}
                    >
                      {!board.members.some((member) => member.id === draft.owner_id) &&
                        selected.record && (
                          <option value={draft.owner_id}>
                            {selected.record.owner_name} · {english ? 'former member' : 'عضو پیشین'}
                          </option>
                        )}
                      {board.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="documents-field">
                    <span>{english ? 'Reviewer' : 'بازبین'}</span>
                    <select
                      value={draft.reviewer_id ?? ''}
                      disabled={!canWrite}
                      onChange={(event) =>
                        updateDraft('reviewer_id', event.currentTarget.value || null)
                      }
                    >
                      <option value="">
                        {english ? 'Choose before review' : 'پیش از بازبینی انتخاب کنید'}
                      </option>
                      {draft.reviewer_id &&
                        !board.members.some((member) => member.id === draft.reviewer_id) &&
                        selected.record?.reviewer_name && (
                          <option value={draft.reviewer_id}>
                            {selected.record.reviewer_name} ·{' '}
                            {english ? 'former member' : 'عضو پیشین'}
                          </option>
                        )}
                      {board.members
                        .filter((member) => member.role === 'owner' || member.role === 'editor')
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="documents-field">
                    <span>{english ? 'Document status' : 'وضعیت سند'}</span>
                    <select
                      value={draft.status}
                      disabled={!canWrite}
                      onChange={(event) =>
                        updateDraft('status', event.currentTarget.value as ApiDocumentStatus)
                      }
                    >
                      {Object.entries(statusLabels).map(([value, labels]) => (
                        <option key={value} value={value}>
                          {labels[english ? 'en' : 'fa']}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selected.catalog_state === 'mvp' && (
                  <label className="documents-field documents-content-field">
                    <span>{english ? 'Document draft' : 'پیش‌نویس سند'}</span>
                    <textarea
                      value={draft.content}
                      disabled={!canWrite}
                      maxLength={16000}
                      rows={7}
                      onChange={(event) => updateDraft('content', event.currentTarget.value)}
                      placeholder={
                        english
                          ? 'Write or paste business-specific content. Placeholder examples are not customer data.'
                          : 'محتوای متناسب با کسب‌وکار را بنویسید یا وارد کنید. نمونه‌ها داده مشتری نیستند.'
                      }
                    />
                    <small>
                      {english
                        ? `${formatter.format(draft.content.length)} / 16,000 characters`
                        : `${formatter.format(draft.content.length)} از ۱۶٬۰۰۰ نویسه`}
                    </small>
                  </label>
                )}
                {selected.record && (
                  <p className="documents-saved-at">
                    {english
                      ? `Last saved ${dateLabel(selected.record.updated_at, true)}`
                      : `آخرین ذخیره: ${dateLabel(selected.record.updated_at, false)}`}
                  </p>
                )}
                {!canWrite && (
                  <p className="documents-readonly">
                    {english
                      ? 'You have read-only access to this Workspace.'
                      : 'دسترسی شما به این فضای کار فقط خواندنی است.'}
                  </p>
                )}
                <div className="documents-savebar">
                  <p aria-live="polite">
                    {dirty
                      ? english
                        ? 'Unsaved changes'
                        : 'تغییر ذخیره‌نشده'
                      : savedMessage ||
                        (selected.record
                          ? statusLabels[selected.record.status][english ? 'en' : 'fa']
                          : english
                            ? 'Not yet assigned'
                            : 'هنوز در فضا ثبت نشده')}
                  </p>
                  <Button
                    type="submit"
                    variant="primary"
                    pending={pending}
                    pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
                    disabled={!canWrite || !dirty || !draft.owner_id}
                  >
                    {selected.record
                      ? english
                        ? 'Save changes'
                        : 'ذخیره تغییرات'
                      : english
                        ? 'Add to Workspace'
                        : 'ثبت در فضای کار'}
                  </Button>
                </div>
              </form>
            </article>
          )}
        </div>
      )}

      <section className="documents-history" aria-labelledby="documents-history-title">
        <div>
          <p className="documents-eyebrow">{english ? 'RECENT ACTIVITY' : 'تغییرات اخیر'}</p>
          <h2 id="documents-history-title">{english ? 'Document history' : 'تاریخچه مدارک'}</h2>
        </div>
        {events.length === 0 ? (
          <p>
            {english
              ? 'Saved assignments and status changes will appear here.'
              : 'ثبت راهنما و تغییر وضعیت بعداً در این بخش نمایش داده می‌شود.'}
          </p>
        ) : (
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>
                    {visibleItems.find((item) => item.id === event.template_id)?.title[
                      english ? 'en' : 'fa'
                    ] ?? event.template_id}
                  </strong>
                  <span>
                    {event.event_type === 'created'
                      ? english
                        ? 'Added'
                        : 'ثبت شد'
                      : event.event_type === 'status_changed'
                        ? english
                          ? 'Status changed'
                          : 'وضعیت تغییر کرد'
                        : english
                          ? 'Updated'
                          : 'به‌روزرسانی شد'}{' '}
                    · {event.actor_name}
                  </span>
                </div>
                <time dateTime={event.created_at}>{dateLabel(event.created_at, english)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
