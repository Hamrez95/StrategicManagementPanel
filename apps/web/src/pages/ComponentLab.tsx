import { useState } from 'react';
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Skeleton,
  Table,
  Tabs,
  UIProvider,
  useToast,
} from '@stratino/ui';
import './component-lab.css';

const copy = {
  fa: {
    heading: 'اجزای فضای کاری استراتینو',
    intro: 'صفحه مخصوص توسعه؛ تمام نام‌ها و وضعیت‌ها نمونه‌اند و چیزی روی سرور ذخیره نمی‌شود.',
    language: 'English',
    motion: 'کاهش حرکت',
    project: 'نام پروژه',
    hint: 'نامی که پروژه را از بقیه جدا کند.',
    error: 'نام پروژه را وارد کنید.',
    edit: 'ویرایش پروژه نمونه',
    dialog: 'نام فضای کاری',
    description: 'تغییر فقط در پیش‌نمایش همین صفحه است. متن با بستن پنجره از بین نمی‌رود.',
    close: 'بستن',
    preview: 'اعمال در پیش‌نمایش',
    toast: 'پیش‌نمایش تغییر کرد؛ ذخیره سروری انجام نشده است.',
    notify: 'دیدن اعلان نمونه',
    notification: 'اعلان',
    disabled: 'کنترل غیرفعال',
    pending: 'در حال ذخیره…',
    danger: 'بایگانی پروژه',
    buttons: 'عملیات و بازخورد',
    form: 'ورودی و اعتبارسنجی',
    table: 'تصمیم‌های پروژه نمونه',
    scroll: 'جدول تصمیم‌ها؛ قابل پیمایش',
    title: 'تصمیم',
    owner: 'مسئول',
    weight: 'وزن',
    status: 'وضعیت',
    draft: 'پیش‌نویس',
    ready: 'آماده بازبینی',
    decision: 'تمرکز بر مشتری سازمانی',
    document: 'تکمیل مدارک ارائه',
    manager: 'مدیر پروژه',
    founder: 'بنیان‌گذار',
    tabs: 'وضعیت اطلاعات',
    data: 'تصمیم‌ها',
    empty: 'بدون داده',
    loading: 'در حال دریافت',
    emptyTitle: 'هنوز تصمیمی ثبت نشده',
    emptyText: 'پس از تحلیل، گزینه منتخب و دلیل انتخاب را به تصمیم تبدیل کنید.',
    action: 'پیش‌نمایش تصمیم اول',
    summary: 'بدنه خوانا، جدول مستقل و حرکت کوتاه هنگام تعامل.',
    disabledHint: 'در حالت غیرفعال، اقدام انجام نمی‌شود.',
  },
  en: {
    heading: 'Stratino workspace components',
    intro: 'Development only. All names and states are samples; nothing is saved to a server.',
    language: 'فارسی',
    motion: 'Reduce motion',
    project: 'Project name',
    hint: 'Choose a name that distinguishes this project.',
    error: 'Enter a project name.',
    edit: 'Edit sample project',
    dialog: 'Workspace name',
    description: 'Changes affect this page preview only. Closing retains your text.',
    close: 'Close',
    preview: 'Apply to preview',
    toast: 'Preview updated; nothing was saved to the server.',
    notify: 'Show sample notification',
    notification: 'Notification',
    disabled: 'Disabled control',
    pending: 'Saving…',
    danger: 'Archive project',
    buttons: 'Actions and feedback',
    form: 'Input and validation',
    table: 'Sample project decisions',
    scroll: 'Decisions table; scrollable',
    title: 'Decision',
    owner: 'Owner',
    weight: 'Weight',
    status: 'State',
    draft: 'Draft',
    ready: 'Ready for review',
    decision: 'Focus on business customers',
    document: 'Complete presentation documents',
    manager: 'Project manager',
    founder: 'Founder',
    tabs: 'Information state',
    data: 'Decisions',
    empty: 'No data',
    loading: 'Loading',
    emptyTitle: 'No decisions yet',
    emptyText: 'After analysis, turn your selected option and reasoning into a decision.',
    action: 'Preview first decision',
    summary: 'Readable body text, independent tables and short interaction motion.',
    disabledHint: 'Disabled actions cannot be submitted.',
  },
};
type Copy = typeof copy.fa;
function Samples({ c, english }: { c: Copy; english: boolean }) {
  const [name, setName] = useState(english ? 'Growth project' : 'پروژه رشد');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const notify = useToast();
  const format = new Intl.NumberFormat(english ? 'en-US' : 'fa-IR');
  const rows = [
    {
      id: 'd1',
      title: c.decision,
      owner: c.manager,
      weight: format.format(60) + (english ? '%' : '٪'),
      status: c.draft,
    },
    {
      id: 'd2',
      title: c.document,
      owner: c.founder,
      weight: format.format(40) + (english ? '%' : '٪'),
      status: c.ready,
    },
  ];
  return (
    <div className="lab-sections">
      <section>
        <h2>{c.buttons}</h2>
        <div className="lab-actions">
          <Dialog
            open={open}
            onOpenChange={setOpen}
            trigger={<Button variant="primary">{c.edit}</Button>}
            title={c.dialog}
            description={c.description}
            closeLabel={c.close}
          >
            <form
              className="lab-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) {
                  setError(c.error);
                  return;
                }
                setError('');
                setOpen(false);
                notify(c.toast);
              }}
            >
              <Input
                label={c.project}
                hint={c.hint}
                value={name}
                error={error}
                onChange={(event) => setName(event.target.value)}
                required={false}
              />
              <Button variant="primary" type="submit">
                {c.preview}
              </Button>
            </form>
          </Dialog>
          <Button onClick={() => notify(c.toast)}>{c.notify}</Button>
          <Button variant="danger" disabled title={c.disabledHint}>
            {c.danger}
          </Button>
          <Button disabled>{c.disabled}</Button>
          <Button pending pendingLabel={c.pending}>
            {c.preview}
          </Button>
        </div>
      </section>
      <section>
        <h2>{c.form}</h2>
        <div className="lab-fields">
          <Input
            label={c.project}
            value={name}
            hint={c.hint}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label={english ? 'Field with error' : 'ورودی دارای خطا'}
            defaultValue=""
            error={c.error}
          />
        </div>
      </section>
      <section>
        <Tabs
          label={c.tabs}
          items={[
            {
              value: 'data',
              label: c.data,
              content: (
                <Table
                  caption={c.table}
                  scrollLabel={c.scroll}
                  rowKey="id"
                  rows={rows}
                  columns={[
                    { key: 'title', label: c.title },
                    { key: 'owner', label: c.owner },
                    { key: 'weight', label: c.weight, numeric: true },
                    { key: 'status', label: c.status },
                  ]}
                />
              ),
            },
            {
              value: 'empty',
              label: c.empty,
              content: (
                <EmptyState
                  title={c.emptyTitle}
                  description={c.emptyText}
                  action={<Button onClick={() => setOpen(true)}>{c.action}</Button>}
                />
              ),
            },
            { value: 'loading', label: c.loading, content: <Skeleton label={c.loading} /> },
          ]}
        />
      </section>
    </div>
  );
}
export default function ComponentLab() {
  const [english, setEnglish] = useState(false);
  const [reduced, setReduced] = useState(false);
  const c = english ? copy.en : copy.fa;
  return (
    <UIProvider
      dir={english ? 'ltr' : 'rtl'}
      motion={reduced ? 'reduced' : 'auto'}
      notificationLabel={c.notification}
      closeLabel={c.close}
    >
      <div className="component-lab" lang={english ? 'en' : 'fa'}>
        <header className="lab-header">
          <div>
            <h1 tabIndex={-1}>{c.heading}</h1>
            <p>{c.intro}</p>
          </div>
          <div className="lab-controls">
            <Button onClick={() => setEnglish((v) => !v)}>{c.language}</Button>
            <label>
              <input
                type="checkbox"
                checked={reduced}
                onChange={(event) => setReduced(event.target.checked)}
              />
              {c.motion}
            </label>
          </div>
        </header>
        <Samples key={english ? 'en' : 'fa'} c={c} english={english} />
        <p className="lab-note">{c.summary}</p>
      </div>
    </UIProvider>
  );
}
