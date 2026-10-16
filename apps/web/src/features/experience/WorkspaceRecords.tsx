import { useState, type FormEvent } from 'react';
import { Dialog } from '@stratino/ui';
import { Empty, Icon, Mark, PageHeading } from './ExperienceUI';
import { useSpaces, number, uid } from './store';
import {
  goalLabels,
  kindLabels,
  stageLabels,
  tools,
  updateSpace,
  type Space,
  type TaskStatus,
} from './model';
import { toolFields } from './toolDefinitions';
export function Actions({ space }: { space: Space }) {
  const { spaces, save } = useSpaces();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (
      save(
        updateSpace(spaces, space.id, (s) => ({
          ...s,
          actions: [...s.actions, { id: uid(), title: title.trim(), status: 'todo' }],
        })),
      )
    ) {
      setTitle('');
      setMessage('اقدام در همین مرورگر ثبت شد.');
    }
  }
  function move(id: string, status: TaskStatus) {
    save(
      updateSpace(spaces, space.id, (s) => ({
        ...s,
        actions: s.actions.map((a) => (a.id === id ? { ...a, status } : a)),
      })),
    );
  }
  return (
    <>
      <PageHeading
        title="اقدامات"
        description="کارها را کوچک و روشن بنویس؛ هر قدم را تا انجام‌شدن دنبال کن."
      />
      <form className="ex-add-action" onSubmit={add}>
        <label className="ex-sr-only" htmlFor="action-title">
          عنوان اقدام جدید
        </label>
        <input
          id="action-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="قدم بعدی چیست؟"
          maxLength={160}
          required
        />
        <button className="ex-button" type="submit">
          <Icon name="plus" />
          ثبت اقدام
        </button>
      </form>
      <p className="ex-save-status" role="status">
        {message}
      </p>
      <div className="ex-kanban">
        {(['todo', 'doing', 'done'] as TaskStatus[]).map((status) => (
          <section
            key={status}
            className={`ex-kanban-column ex-kanban-column--${status}${dropTarget === status ? ' is-drop-target' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(status);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/x-stratino-action'));
                if (data.spaceId === space.id && space.actions.some((a) => a.id === data.id))
                  move(data.id, status);
              } catch {
                /* Ignore non-action drops; the select remains the keyboard/touch control. */
              }
            }}
          >
            <h2>
              <span>
                {status === 'todo'
                  ? 'برای انجام'
                  : status === 'doing'
                    ? 'در حال انجام'
                    : 'انجام‌شده'}
              </span>
              <small>{number(space.actions.filter((a) => a.status === status).length)}</small>
            </h2>
            {space.actions
              .filter((a) => a.status === status)
              .map((action) => (
                <article
                  className="ex-task"
                  key={action.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/x-stratino-action',
                      JSON.stringify({ spaceId: space.id, id: action.id }),
                    );
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDropTarget(null)}
                >
                  <p>{action.title}</p>
                  <label>
                    وضعیت
                    <select
                      value={action.status}
                      onChange={(e) => move(action.id, e.target.value as TaskStatus)}
                    >
                      <option value="todo">برای انجام</option>
                      <option value="doing">در حال انجام</option>
                      <option value="done">انجام‌شده</option>
                    </select>
                  </label>
                </article>
              ))}
            {!space.actions.some((a) => a.status === status) && (
              <p className="ex-column-empty">
                {status === 'todo'
                  ? 'یک اقدام تازه اضافه کن.'
                  : status === 'doing'
                    ? 'کاری را که شروع کردی به اینجا منتقل کن.'
                    : 'قدم‌های تمام‌شده اینجا قرار می‌گیرند.'}
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
export function Library({ space }: { space: Space }) {
  const { spaces, save } = useSpaces();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const notes = space.notes.filter((n) => `${n.title} ${n.body}`.includes(search));
  function add(e: FormEvent) {
    e.preventDefault();
    if (
      save(
        updateSpace(spaces, space.id, (s) => ({
          ...s,
          notes: [{ id: uid(), title: title.trim(), body: body.trim() }, ...s.notes],
        })),
      )
    ) {
      setTitle('');
      setBody('');
      setOpen(false);
    }
  }
  return (
    <>
      <PageHeading
        title="کتابخانه"
        description="یادداشت‌ها و شواهد این کسب‌وکار، در یک جای مشخص."
        action={
          <Dialog
            open={open}
            onOpenChange={setOpen}
            trigger={
              <button className="ex-button">
                <Icon name="plus" />
                یادداشت تازه
              </button>
            }
            title="ثبت یادداشت"
            description={`این یادداشت فقط در فضای «${space.name}» ذخیره می‌شود.`}
          >
            <form className="ex-dialog-form" onSubmit={add}>
              <label className="ex-field">
                عنوان
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="ex-field">
                متن و منبع
                <textarea
                  required
                  maxLength={10000}
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="چه چیزی مشاهده کردی؟ منبعش چیست؟"
                />
              </label>
              <button className="ex-button" type="submit">
                ذخیرهٔ یادداشت
              </button>
            </form>
          </Dialog>
        }
      />
      <label className="ex-search">
        <Icon name="search" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="جست‌وجوی یادداشت"
          placeholder="جست‌وجو در کتابخانه…"
        />
      </label>
      {notes.length ? (
        <div className="ex-notes">
          {notes.map((note) => (
            <article key={note.id}>
              <Icon name="file" />
              <div>
                <h2>{note.title}</h2>
                <p>{note.body}</p>
                <small>یادداشت · ذخیره در این مرورگر</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon="book"
          title={search ? 'یادداشتی پیدا نشد' : 'فضا برای چیزهایی که یاد می‌گیری'}
          text={
            search
              ? 'عبارت دیگری را امتحان کن.'
              : 'از یک گفت‌وگو، مشاهده یا سند شروع کن. عنوان و منبعش را هم بنویس.'
          }
        />
      )}
    </>
  );
}

export function Report({ space }: { space: Space }) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(space, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `stratino-${space.id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <PageHeading
        title="گزارش کسب‌وکار"
        description="خلاصهٔ اطلاعات همین فضا؛ برای مرور یا نگهداری یک نسخه."
        action={
          <div className="ex-heading-actions">
            <button className="ex-button ex-button--outline" onClick={download}>
              دریافت داده‌ها
            </button>
            <button className="ex-button" onClick={() => window.print()}>
              چاپ / ذخیره PDF
            </button>
          </div>
        }
      />
      <article className="ex-report">
        <Mark />
        <h2>{space.name}</h2>
        <dl className="ex-definition-list">
          <div>
            <dt>نوع کسب‌وکار</dt>
            <dd>{space.setupComplete === false ? 'هنوز مشخص نشده' : kindLabels[space.kind]}</dd>
          </div>
          <div>
            <dt>وضعیت خوداظهاری</dt>
            <dd>{stageLabels[space.stage]}</dd>
          </div>
          <div>
            <dt>هدف شروع</dt>
            <dd>{space.setupComplete === false ? 'هنوز انتخاب نشده' : goalLabels[space.goal]}</dd>
          </div>
        </dl>
        <h3>اقدامات</h3>
        {space.actions.length ? (
          <ul>
            {space.actions.map((a) => (
              <li key={a.id}>
                {a.title} —{' '}
                {a.status === 'done'
                  ? 'انجام‌شده'
                  : a.status === 'doing'
                    ? 'در حال انجام'
                    : 'برای انجام'}
              </li>
            ))}
          </ul>
        ) : (
          <p>اقدامی ثبت نشده است.</p>
        )}
        <h3>یادداشت‌ها و شواهد</h3>
        {space.notes.length ? (
          space.notes.map((n) => (
            <section key={n.id}>
              <h4>{n.title}</h4>
              <p>{n.body}</p>
            </section>
          ))
        ) : (
          <p>یادداشتی ثبت نشده است.</p>
        )}
        <h3>یادداشت تحلیل‌ها</h3>
        {Object.entries(space.toolNotes)
          .filter(([, value]) => value.trim())
          .map(([key, value]) => {
            const [toolId, fieldKey] = key.split(':');
            return (
              <section key={key}>
                <h4>
                  {tools.find((t) => t.id === toolId)?.title} ·{' '}
                  {toolFields[toolId]?.find((f) => f.key === fieldKey)?.label}
                </h4>
                <p>{value}</p>
              </section>
            );
          })}
        <p className="ex-subtle-note">
          نسخهٔ محلی؛ این گزارش ارزیابی یا توصیهٔ تأییدشده نیست.
          {space.sample ? ' تمام داده‌ها نمونه‌اند.' : ''}
        </p>
      </article>
    </>
  );
}
