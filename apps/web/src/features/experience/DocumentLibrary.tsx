import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import catalog from '../../../../../src/document-catalog.json';
import type { Space } from './model';
import { path } from './store';
import { Empty, Icon, PageHeading } from './ExperienceUI';
import { Library as Notes } from './WorkspaceRecords';
import { fa, GuideCard, Learn, ResultRows, useToolDraft } from './GuidedFlow';
import {
  ACCEPTED_FILES,
  addAttachment,
  downloadBlob,
  listAttachments,
  removeAttachment,
  type LocalAttachment,
} from './localAttachments';

export function DocumentLibrary({ space }: { space: Space }) {
  const [tab, setTab] = useState<'documents' | 'notes'>('documents');
  const [section, setSection] = useState('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const docs = catalog.documents.filter(
    (d) =>
      (section === 'all' || d.section === section) &&
      (status === 'all' ||
        (status === 'started') ===
          Object.keys(space.toolNotes).some(
            (k) => k.startsWith(`document:${d.id}:`) && !k.endsWith(':_step') && space.toolNotes[k],
          )) &&
      `${d.keywords} ${d.title.fa}`
        .toLocaleLowerCase('fa')
        .includes(search.trim().toLocaleLowerCase('fa')),
  );
  const pageCount = Math.max(1, Math.ceil(docs.length / 12));
  const selectedPage = Math.min(page, pageCount - 1);
  return (
    <>
      <div className="ex-filter-group gx-library-tabs" aria-label="بخش کتابخانه">
        <button aria-pressed={tab === 'documents'} onClick={() => setTab('documents')}>
          مستندات کسب‌وکار
        </button>
        <button aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>
          شواهد و یادداشت‌ها
        </button>
      </div>
      {tab === 'notes' ? (
        <Notes space={space} />
      ) : (
        <>
          <PageHeading
            title="مستندات کسب‌وکار"
            description="هر سند، یک موضوع روشن، راهنمای نوشتن و جای مشخص برای فایل‌هایش دارد."
          />
          <div className="gx-doc-toolbar">
            <label className="ex-search">
              <Icon name="search" />
              <input
                aria-label="جست‌وجوی مستند"
                value={search}
                placeholder="نام سند، موضوع یا مسئول…"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="ex-field">
              <span>دستهٔ مستند</span>
              <select
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">همهٔ دسته‌ها</option>
                {catalog.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title.fa}
                  </option>
                ))}
              </select>
            </label>
            <label className="ex-field">
              <span>وضعیت نگارش</span>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">همه</option>
                <option value="started">شروع‌شده</option>
                <option value="empty">هنوز شروع نشده</option>
              </select>
            </label>
          </div>
          <p className="gx-muted">
            {fa(docs.length)} مستند از کاتالوگ {fa(catalog.documents.length)}‌تایی موجود · فهرست
            پیشنهادی است؛ کاربرد هر سند به شرایط کسب‌وکار بستگی دارد.
          </p>
          <div className="gx-doc-grid">
            {docs.slice(selectedPage * 12, selectedPage * 12 + 12).map((doc) => {
              const started = doc.structure.fa.some((_, i) =>
                space.toolNotes[`document:${doc.id}:section-${i}`]?.trim(),
              );
              return (
                <Link key={doc.id} className="gx-doc-card" to={path(space, `document/${doc.id}`)}>
                  <div>
                    <span className="ex-tool-icon">
                      <Icon name="file" size={24} />
                    </span>
                    <small>{started ? 'پیش‌نویس' : 'برای شروع'}</small>
                  </div>
                  <h2>{doc.title.fa}</h2>
                  <p>{doc.topic.fa}</p>
                  <footer>
                    <small>{doc.recommended_owner.fa}</small>
                    <span>
                      راهنما و فایل‌ها
                      <Icon name="arrow" size={16} />
                    </span>
                  </footer>
                </Link>
              );
            })}
          </div>
          {!docs.length && (
            <Empty
              icon="search"
              title="مستندی پیدا نشد"
              text="موضوع یا دسته‌بندی دیگری را امتحان کن."
            />
          )}
          {pageCount > 1 && (
            <nav className="gx-pagination" aria-label="صفحات مستندات">
              <button
                className="ex-button ex-button--outline"
                disabled={selectedPage === 0}
                onClick={() => setPage(selectedPage - 1)}
              >
                صفحهٔ قبل
              </button>
              <span>
                صفحهٔ {fa(selectedPage + 1)} از {fa(pageCount)}
              </span>
              <button
                className="ex-button ex-button--outline"
                disabled={selectedPage === pageCount - 1}
                onClick={() => setPage(selectedPage + 1)}
              >
                صفحهٔ بعد
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export function DocumentDetail({ space, documentId }: { space: Space; documentId: string }) {
  const doc = catalog.documents.find((d) => d.id === documentId);
  const { values, write, message } = useToolDraft(space, `document:${documentId}`);
  const [writing, setWriting] = useState(false);
  const total = (doc?.structure.fa.length ?? 0) + 1;
  const [step, setStep] = useState(Math.min(total - 1, Math.max(0, Number(values._step) || 0)));
  if (!doc)
    return (
      <Empty
        title="این مستند پیدا نشد"
        text="از فهرست مستندات یک مورد انتخاب کن."
        action={
          <Link className="ex-button" to={path(space, 'library')}>
            مستندات
          </Link>
        }
      />
    );
  const completed = doc.structure.fa.filter((_, i) => values[`section-${i}`]?.trim()).length;
  const move = (next: number) => {
    if (write({ _step: String(next) })) setStep(next);
  };
  function exportDraft() {
    if (!doc) return;
    const text = [
      `# ${doc.title.fa}`,
      `فضای کار: ${space.name}`,
      'وضعیت: پیش‌نویس؛ بررسی و تأیید نشده',
      `مسئول: ${values.owner || 'تعیین نشده'}`,
      `بازبین: ${values.reviewer || 'تعیین نشده'}`,
      ...doc.structure.fa.map(
        (title, i) => `## ${title}\n${values[`section-${i}`] || 'هنوز تکمیل نشده'}`,
      ),
    ].join('\n\n');
    downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${doc.id}-draft.md`);
  }
  return (
    <>
      <Link className="ex-back-link" to={path(space, 'library')}>
        <Icon name="arrow" size={16} />
        مستندات کسب‌وکار
      </Link>
      <PageHeading title={doc.title.fa} description={doc.topic.fa} />
      <p role="status" className="gx-save-state">
        {message || 'راهنمای کاتالوگ موجود؛ داده‌های هر فضای کار جداست.'}
      </p>
      {writing ? (
        <GuideCard
          title={
            step === 0 ? 'چه کسی این سند را می‌نویسد و بررسی می‌کند؟' : doc.structure.fa[step - 1]
          }
          description={
            step === 0
              ? 'پیشنهاد نقش‌ها را با افراد واقعی همین کسب‌وکار تطبیق بده.'
              : 'فقط همین قسمت از سند را بنویس. اطلاعات نامشخص را صریح مشخص کن.'
          }
          step={step}
          total={total}
          onBack={() => (step ? move(step - 1) : setWriting(false))}
          onPause={() => setWriting(false)}
          onNext={() => {
            if (step < total - 1) move(step + 1);
            else setWriting(false);
          }}
          nextLabel={step === total - 1 ? 'مرور پیش‌نویس' : 'ادامه'}
        >
          <Learn example={doc.example?.fa}>
            {doc.writing_guide.fa}
            {doc.example && <p>{doc.example.note.fa}</p>}
          </Learn>
          {step === 0 ? (
            <div className="gx-fields">
              <label className="ex-field">
                نام مسئول نگارش<small>نقش پیشنهادی: {doc.recommended_owner.fa}</small>
                <input
                  value={values.owner || ''}
                  maxLength={120}
                  onChange={(e) => write({ owner: e.target.value })}
                  placeholder="هنوز تعیین نشده"
                />
              </label>
              <label className="ex-field">
                نام بازبین<small>نقش پیشنهادی: {doc.recommended_reviewer.fa}</small>
                <input
                  value={values.reviewer || ''}
                  maxLength={120}
                  onChange={(e) => write({ reviewer: e.target.value })}
                  placeholder="این انتخاب تأیید رسمی ایجاد نمی‌کند."
                />
              </label>
            </div>
          ) : (
            <label className="ex-field">
              {doc.structure.fa[step - 1]}
              <textarea
                value={values[`section-${step - 1}`] || ''}
                maxLength={20000}
                rows={9}
                onChange={(e) => write({ [`section-${step - 1}`]: e.target.value })}
                placeholder="متن، شاهد و موارد نامشخص این بخش…"
              />
            </label>
          )}
        </GuideCard>
      ) : (
        <div className="gx-document-detail">
          <section className="gx-doc-intro">
            <div>
              <span className="ex-tool-icon">
                <Icon name="file" size={28} />
              </span>
              <h2>{completed ? 'پیش‌نویس را ادامه بده' : 'یک سند روشن، قدم‌به‌قدم'}</h2>
              <p>{doc.use.fa}</p>
              <small>
                {fa(completed)} از {fa(doc.structure.fa.length)} بخش دارای متن است؛ هنوز بررسی یا
                تأیید نشده.
              </small>
            </div>
            <button className="ex-button" onClick={() => setWriting(true)}>
              {completed ? 'ادامهٔ نگارش' : 'نگارش با راهنما'}
              <Icon name="arrow" />
            </button>
          </section>
          <ResultRows
            rows={[
              { label: 'نویسنده', value: values.owner || `پیشنهاد: ${doc.recommended_owner.fa}` },
              {
                label: 'بازبین',
                value: values.reviewer || `پیشنهاد: ${doc.recommended_reviewer.fa}`,
              },
              { label: 'مخاطب', value: doc.audience.fa },
              { label: 'زمان تهیه / بازبینی', value: doc.timing.fa },
            ]}
          />
          <details className="gx-doc-guide" open>
            <summary>روش نوشتن و محتوای موردنیاز</summary>
            <div>
              <p>{doc.writing_guide.fa}</p>
              <ol>
                {doc.structure.fa.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ol>
              {doc.catalog_state !== 'mvp' && (
                <small>
                  این مورد راهنمای اولیهٔ کاتالوگ است و باید با صنعت و شرایط شما تطبیق داده شود.
                </small>
              )}
              {doc.example && (
                <blockquote>
                  <strong>نمونهٔ آموزشی</strong>
                  <p>{doc.example.fa}</p>
                  <small>{doc.example.note.fa}</small>
                </blockquote>
              )}
              {doc.advisory_note && <p>{doc.advisory_note.fa}</p>}
              <p>
                <strong>ملاحظهٔ دسترسی:</strong> {doc.access.fa}
              </p>
            </div>
          </details>
          {completed > 0 && (
            <details className="gx-doc-guide">
              <summary>پیش‌نویس نوشته‌شده</summary>
              <div>
                {doc.structure.fa.map((title, i) => (
                  <section key={title}>
                    <h3>{title}</h3>
                    <p className="gx-prewrap">{values[`section-${i}`] || 'هنوز تکمیل نشده'}</p>
                    <button
                      className="ex-button ex-button--quiet"
                      onClick={() => {
                        move(i + 1);
                        setWriting(true);
                      }}
                    >
                      ویرایش این بخش
                    </button>
                  </section>
                ))}
                <button className="ex-button ex-button--outline" onClick={exportDraft}>
                  دریافت پیش‌نویس متنی
                </button>
              </div>
            </details>
          )}
          <AttachmentPanel key={`${space.id}:${doc.id}`} space={space} documentId={doc.id} />
        </div>
      )}
    </>
  );
}

function AttachmentPanel({ space, documentId }: { space: Space; documentId: string }) {
  const [files, setFiles] = useState<LocalAttachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removeId, setRemoveId] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    listAttachments(space.id, documentId)
      .then((data) => {
        if (active) setFiles(data);
      })
      .catch(() => {
        if (active) setError('فایل‌ها خوانده نشدند؛ دوباره تلاش کن.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [space.id, documentId]);
  async function add(e: FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await addAttachment(space.id, documentId, file);
      setFiles(await listAttachments(space.id, documentId));
      if (input.current) input.current.value = '';
      setMessage('فایل در همین مرورگر ذخیره شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فایل ذخیره نشد؛ دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await removeAttachment(space.id, documentId, id);
      setFiles(await listAttachments(space.id, documentId));
      setRemoveId('');
      setMessage('فایل از ذخیرهٔ محلی حذف شد.');
    } catch {
      setError('حذف انجام نشد؛ دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="gx-attachments">
      <h2>فایل‌های این مستند</h2>
      <p>
        فایل‌ها فقط در مرورگر همین دستگاه نگه‌داری می‌شوند. نسخهٔ اصلی را هم نزد خودت حفظ کن؛ هنوز
        به فضای فایل سرور متصل نیست.
      </p>
      <form onSubmit={add} className="gx-file-form">
        <label className="ex-field">
          افزودن فایل
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_FILES}
            disabled={busy || loading}
            required
          />
          <small>PDF، Office جدید، متن، CSV و تصویر؛ هر فایل تا ۲۰ مگابایت، حداکثر ۱۰ فایل.</small>
        </label>
        <button className="ex-button ex-button--outline" type="submit" disabled={busy || loading}>
          {busy ? 'در حال انجام…' : 'ذخیرهٔ فایل'}
        </button>
      </form>
      {loading && <p role="status">در حال خواندن فایل‌ها…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <div role="alert">
          <p className="gx-error">{error}</p>
          <button
            className="ex-button ex-button--quiet"
            onClick={() => {
              setError('');
              setLoading(true);
              listAttachments(space.id, documentId)
                .then(setFiles)
                .catch(() => setError('فایل‌ها خوانده نشدند.'))
                .finally(() => setLoading(false));
            }}
          >
            تلاش دوباره
          </button>
        </div>
      )}
      <ul className="gx-file-list">
        {files.map((file) => (
          <li key={file.id}>
            <Icon name="file" />
            <div>
              <strong>{file.name}</strong>
              <small>
                {fa(file.size / 1024)} کیلوبایت ·{' '}
                {new Date(file.createdAt).toLocaleDateString('fa-IR')}
              </small>
            </div>
            <button
              className="ex-button ex-button--quiet"
              onClick={() => downloadBlob(file.file, file.name)}
              aria-label={`دریافت ${file.name}`}
            >
              دریافت
            </button>
            {removeId === file.id ? (
              <>
                <button
                  disabled={busy}
                  className="ex-button ex-button--quiet"
                  onClick={() => void remove(file.id)}
                >
                  تأیید حذف
                </button>
                <button className="ex-button ex-button--quiet" onClick={() => setRemoveId('')}>
                  انصراف
                </button>
              </>
            ) : (
              <button
                disabled={busy}
                className="ex-button ex-button--quiet"
                onClick={() => setRemoveId(file.id)}
                aria-label={`حذف ${file.name}`}
              >
                حذف
              </button>
            )}
          </li>
        ))}
      </ul>
      {!loading && !files.length && !error && (
        <p className="gx-muted">هنوز فایلی برای این مستند اضافه نشده است.</p>
      )}
    </section>
  );
}
