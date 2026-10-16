import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Empty, Icon, PageHeading } from './ExperienceUI';
import { Actions, Library, Report } from './WorkspaceRecords';
import { SpaceSettings } from './ExperienceSettings';
import { useSpaces, path } from './store';
import {
  followUps,
  goalLabels,
  kindLabels,
  recommendedTools,
  stageLabels,
  tools,
  updateSpace,
  type Space,
} from './model';
import { toolFields } from './toolDefinitions';
export function WorkspacePage() {
  const { spaceId, section, toolId } = useParams();
  const { spaces } = useSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space)
    return (
      <Empty
        title="این فضای کار پیدا نشد"
        text="اطلاعات سایر فضاهای شما در فهرست فضاها قابل دسترسی است."
        action={
          <Link className="ex-button" to="/preview/workspaces">
            بازگشت به فضاها
          </Link>
        }
      />
    );
  const pages: Record<string, ReactNode> = {
    overview: <Overview space={space} />,
    business: <Business space={space} />,
    strategy: <Strategy space={space} />,
    actions: <Actions space={space} />,
    library: <Library space={space} />,
    reports: <Report space={space} />,
    settings: <SpaceSettings space={space} />,
  };
  return (
    <div key={`${space.id}:${section ?? toolId}`}>
      {space.sample && (
        <p className="ex-sample-notice">این فضای نمونه است؛ اطلاعاتش ساختگی و قابل ویرایش است.</p>
      )}
      {toolId ? (
        <ToolPage space={space} toolId={toolId} />
      ) : (
        (pages[section ?? 'overview'] ?? (
          <Empty
            title="این بخش پیدا نشد"
            text="از نمای کلی فضای کار ادامه بدهید."
            action={
              <Link className="ex-button" to={path(space)}>
                نمای کلی
              </Link>
            }
          />
        ))
      )}
    </div>
  );
}
function Overview({ space }: { space: Space }) {
  const recommended = recommendedTools(space);
  const todo = space.actions.filter((a) => a.status !== 'done');
  return (
    <>
      <PageHeading
        title={`فضای کار ${space.name}`}
        description="یک قدم روشن، برای ادامهٔ مسیر."
        action={
          <Link className="ex-button ex-button--outline" to={path(space, 'discovery')}>
            <Icon name="spark" />
            راهنمای شروع
          </Link>
        }
      />
      <section className={`ex-next-step ex-next-step--${space.color}`}>
        <div>
          <span className="ex-next-label">از اینجا ادامه بده</span>
          <h2>
            {space.setupComplete === false
              ? 'فضای تو آماده است؛ از هرجا خواستی شروع کن.'
              : space.goal === 'customers'
                ? 'مشتری و مسئله‌اش را روشن کن.'
                : space.goal === 'growth'
                  ? 'شواهد رشدت را کنار هم بگذار.'
                  : space.goal === 'strategy'
                    ? 'تصویر کسب‌وکارت را کامل کن.'
                    : 'اولین اقدام را مشخص کن.'}
          </h2>
          <p>
            {space.goal === 'execution'
              ? 'یک کار مشخص، با یک نتیجهٔ قابل پیگیری. لازم نیست از یک برنامهٔ بزرگ شروع کنی.'
              : 'اطلاعاتی که داری کافی است. موارد نامشخص را باز بگذار و بعداً کامل کن.'}
          </p>
          <Link
            className="ex-button"
            to={path(
              space,
              space.setupComplete === false
                ? 'discovery'
                : space.goal === 'execution'
                  ? 'actions'
                  : `tool/${recommended[0]}`,
            )}
          >
            {space.setupComplete === false
              ? 'شناخت کسب‌وکار من'
              : space.goal === 'execution'
                ? 'رفتن به اقدامات'
                : 'شروع این قدم'}
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="ex-next-art" aria-hidden="true">
          <div>
            <Icon name={space.goal === 'execution' ? 'check' : 'compass'} size={38} />
          </div>
          <i />
          <i />
        </div>
      </section>
      <section className="ex-section">
        <div className="ex-section-heading">
          <h2>{space.setupComplete === false ? 'چند ابزار برای شروع' : 'متناسب با هدف تو'}</h2>
          <Link to={path(space, 'strategy')}>همهٔ تحلیل‌ها</Link>
        </div>
        <div className="ex-shortcuts">
          {recommended.map((id) => {
            const tool = tools.find((t) => t.id === id)!;
            return (
              <Link key={id} to={path(space, `tool/${id}`)} className="ex-shortcut">
                <span className="ex-tool-icon">
                  <Icon name={tool.icon} size={24} />
                </span>
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                <Icon name="arrow" size={18} />
              </Link>
            );
          })}
        </div>
      </section>
      <section className="ex-section">
        <div className="ex-section-heading">
          <h2>قدم‌های باز</h2>
          <Link to={path(space, 'actions')}>دیدن اقدامات</Link>
        </div>
        {todo.length ? (
          <div className="ex-action-list">
            {todo.slice(0, 3).map((action) => (
              <Link to={path(space, 'actions')} key={action.id}>
                <span className="ex-status-dot" />
                <strong>{action.title}</strong>
                <span>{action.status === 'doing' ? 'در حال انجام' : 'برای انجام'}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="ex-inline-empty">
            <Icon name="check" />
            <p>هنوز اقدامی ثبت نکرده‌ای. با یک کار کوچک شروع کن.</p>
            <Link to={path(space, 'actions')}>ثبت اولین اقدام</Link>
          </div>
        )}
      </section>
    </>
  );
}

function Business({ space }: { space: Space }) {
  return (
    <>
      <PageHeading
        title="شناخت کسب‌وکار"
        description="تصویر فعلی این کسب‌وکار؛ هر وقت لازم شد آن را تغییر بده."
        action={
          <Link className="ex-button ex-button--outline" to={path(space, 'discovery')}>
            ویرایش پاسخ‌ها
          </Link>
        }
      />
      <div className="ex-profile-panel">
        <div className="ex-review-name">
          <span className={`ex-space-avatar ex-color--${space.color}`}>{space.name[0]}</span>
          <div>
            <h2>{space.name}</h2>
            <p>
              {space.setupComplete === false
                ? 'نوع کسب‌وکار هنوز مشخص نشده'
                : kindLabels[space.kind]}
            </p>
          </div>
        </div>
        <dl className="ex-definition-list">
          <div>
            <dt>وضعیت به گفتهٔ شما</dt>
            <dd>{stageLabels[space.stage]}</dd>
          </div>
          <div>
            <dt>هدف شروع</dt>
            <dd>{space.setupComplete === false ? 'هنوز انتخاب نشده' : goalLabels[space.goal]}</dd>
          </div>
          <div>
            <dt>{followUps[space.goal].title}</dt>
            <dd>{space.answer || 'هنوز پاسخ داده نشده'}</dd>
          </div>
        </dl>
        <p className="ex-subtle-note">
          این اطلاعات توصیف شماست؛ ارزیابی یا تشخیص مرحلهٔ کسب‌وکار نیست.
        </p>
      </div>
      <section className="ex-section">
        <h2>شناخت را کامل‌تر کن</h2>
        <div className="ex-shortcuts">
          {tools
            .filter((t) => t.group === 'شناخت')
            .map((tool) => (
              <Link key={tool.id} className="ex-shortcut" to={path(space, `tool/${tool.id}`)}>
                <Icon name={tool.icon} size={25} />
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
function Strategy({ space }: { space: Space }) {
  const [category, setCategory] = useState('همه');
  const [search, setSearch] = useState('');
  const visible = tools.filter(
    (t) =>
      (category === 'همه' || t.group === category) &&
      `${t.title} ${t.description}`.includes(search),
  );
  return (
    <>
      <PageHeading
        title="تحلیل‌ها"
        description="ابزار مورد نیازت را انتخاب کن؛ هر تحلیل در صفحهٔ خودش باز می‌شود."
      />
      <div className="ex-toolbar">
        <label className="ex-search">
          <Icon name="search" />
          <input
            aria-label="جست‌وجوی ابزار"
            placeholder="نام یک ابزار…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="ex-filter-group" aria-label="دسته‌بندی تحلیل‌ها">
          {['همه', 'شناخت', 'استراتژی', 'رشد', 'اجرا'].map((group) => (
            <button
              key={group}
              aria-pressed={category === group}
              onClick={() => setCategory(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </div>
      <div className="ex-tools-grid">
        {visible.map((tool) => (
          <Link className="ex-tool-card" key={tool.id} to={path(space, `tool/${tool.id}`)}>
            <span className="ex-tool-icon">
              <Icon name={tool.icon} size={26} />
            </span>
            <small>{tool.group}</small>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <span className="ex-card-link">
              بازکردن تحلیل <Icon name="arrow" size={16} />
            </span>
          </Link>
        ))}
      </div>
      {!visible.length && (
        <Empty
          icon="search"
          title="ابزاری پیدا نشد"
          text="عبارت یا دسته‌بندی دیگری را امتحان کن."
        />
      )}
    </>
  );
}

function ToolPage({ space, toolId }: { space: Space; toolId: string }) {
  const { spaces, save } = useSpaces();
  const tool = tools.find((t) => t.id === toolId);
  const [status, setStatus] = useState('');
  const [values, setValues] = useState(space.toolNotes);
  if (!tool)
    return (
      <Empty
        title="ابزار پیدا نشد"
        text="از صفحهٔ تحلیل‌ها یک ابزار انتخاب کنید."
        action={
          <Link className="ex-button" to={path(space, 'strategy')}>
            تحلیل‌ها
          </Link>
        }
      />
    );
  function change(key: string, value: string) {
    setValues((current) => ({ ...current, [`${toolId}:${key}`]: value }));
    const okay = save(
      updateSpace(spaces, space.id, (s) => ({
        ...s,
        toolNotes: { ...s.toolNotes, [`${toolId}:${key}`]: value },
      })),
    );
    setStatus(okay ? 'در همین مرورگر ذخیره شد' : 'ذخیره نشد؛ اتصال به فضای ذخیره را بررسی کنید');
  }
  return (
    <>
      <Link className="ex-back-link" to={path(space, 'strategy')}>
        <Icon name="arrow" size={16} />
        همهٔ تحلیل‌ها
      </Link>
      <PageHeading title={tool.title} description={tool.description} />
      <div className="ex-tool-context">
        <span>{space.name}</span>
        <span role="status">{status || 'یادداشت‌های همین فضای کار'}</span>
      </div>
      <div className={toolId === 'swot' ? 'ex-swot-grid' : 'ex-focused-form'}>
        {toolFields[toolId]?.map((field) => (
          <label className="ex-tool-field" key={field.key}>
            <strong>{field.label}</strong>
            <span>{field.hint}</span>
            <textarea
              value={values[`${toolId}:${field.key}`] ?? ''}
              onChange={(e) => change(field.key, e.target.value)}
              placeholder="اینجا بنویس…"
              rows={5}
              maxLength={10000}
            />
          </label>
        ))}
      </div>
      {['matrices', 'finance', 'retention'].includes(toolId) && (
        <p className="ex-subtle-note">
          در این نسخه یادداشت‌ها ذخیره می‌شوند. محاسبه و نتیجهٔ تحلیلی پس از اتصال به سرویس معتبر
          فعال می‌شود.
        </p>
      )}
      <div className="ex-tool-footer">
        <Link className="ex-button ex-button--outline" to={path(space, 'library')}>
          رفتن به شواهد و یادداشت‌ها
        </Link>
        <Link className="ex-button" to={path(space, 'actions')}>
          ثبت اقدام بعدی <Icon name="arrow" />
        </Link>
      </div>
    </>
  );
}
