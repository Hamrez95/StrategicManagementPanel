import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useUIAppearance } from '@stratino/ui';
import './management-preview.css';

type PreviewSection = 'overview' | 'assessment' | 'journey' | 'tools';
type ScenarioId = 'idea' | 'traction';

const scenarios: Record<
  ScenarioId,
  { name: string; subtitle: string; stage: string; profile: string }
> = {
  idea: {
    name: 'نمونهٔ الف · ایده، بدون درآمد',
    subtitle: 'بنیان‌گذار مستقل · شواهد مشتری هنوز در حال جمع‌آوری',
    stage: 'نامشخص',
    profile: 'فرضیهٔ مسئله ثبت شده؛ درآمدی گزارش نشده است.',
  },
  traction: {
    name: 'نمونهٔ ب · SaaS با مشتری پرداخت‌کننده',
    subtitle: '۱۰ عضو تیم · ۲۰ مشتری پرداخت‌کننده · دادهٔ نمایشی',
    stage: 'خوداظهاری، نیازمند بررسی',
    profile: 'پروفایل مشتری ایده‌آل از قبل ثبت شده است.',
  },
};

const sections: Array<{ id: PreviewSection; label: string; en: string }> = [
  { id: 'overview', label: 'نمای کلی', en: 'Overview' },
  { id: 'assessment', label: 'شناخت کسب‌وکار', en: 'Business context' },
  { id: 'journey', label: 'مسیر کار', en: 'Guided journey' },
  { id: 'tools', label: 'ابزارهای استراتژی', en: 'Strategy tools' },
];

function storedNote(scenario: ScenarioId) {
  try {
    return globalThis.localStorage?.getItem(`stratino-preview-note-${scenario}`) ?? '';
  } catch {
    return '';
  }
}

function storedScenario(): ScenarioId {
  try {
    return globalThis.localStorage?.getItem('stratino-preview-scenario') === 'traction'
      ? 'traction'
      : 'idea';
  } catch {
    return 'idea';
  }
}

export default function ManagementPreview() {
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const [section, setSection] = useState<PreviewSection>('overview');
  const [scenario, setScenario] = useState<ScenarioId>(storedScenario);
  const [note, setNote] = useState(() => storedNote(storedScenario()));
  const [saveStatus, setSaveStatus] = useState('');
  const current = scenarios[scenario];

  function changeScenario(next: ScenarioId) {
    setScenario(next);
    setNote(storedNote(next));
    setSaveStatus('');
    try {
      globalThis.localStorage?.setItem('stratino-preview-scenario', next);
    } catch {
      // The preview remains usable when browser storage is disabled.
    }
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      globalThis.localStorage?.setItem(`stratino-preview-note-${scenario}`, note);
      setSaveStatus(
        english ? 'Saved in this browser only.' : 'یادداشت فقط در همین مرورگر ذخیره شد.',
      );
    } catch {
      setSaveStatus(
        english
          ? 'Browser storage is unavailable; copy your note before leaving.'
          : 'ذخیرهٔ مرورگر در دسترس نیست؛ پیش از خروج یادداشت را کپی کنید.',
      );
    }
  }

  return (
    <div className="management-preview" dir={dir}>
      <aside
        className="management-preview__rail"
        aria-label={english ? 'Preview sections' : 'بخش‌های پیش‌نمایش'}
      >
        <div className="management-preview__identity">
          <span className="management-preview__symbol" aria-hidden="true">
            س
          </span>
          <span>
            <strong>{english ? 'Stratino' : 'استراتینو'}</strong>
            <small>{english ? 'Management workspace' : 'فضای مدیریت استراتژی'}</small>
          </span>
        </div>
        <p className="management-preview__rail-label">
          {english ? 'WORKSPACE PREVIEW' : 'پیش‌نمایش فضای کار'}
        </p>
        <nav>
          {sections.map((item) => (
            <button
              aria-current={section === item.id ? 'page' : undefined}
              className={section === item.id ? 'is-selected' : ''}
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              <span aria-hidden="true" className="management-preview__nav-mark">
                {section === item.id ? '◆' : '◇'}
              </span>
              {english ? item.en : item.label}
            </button>
          ))}
        </nav>
        <div className="management-preview__rail-bottom">
          <span className="management-preview__sample-tag">
            {english ? 'SAMPLE DATA' : 'دادهٔ نمونه'}
          </span>
          <p>
            {english
              ? 'These records are fictional and stay in this preview.'
              : 'این اطلاعات ساختگی‌اند و فقط برای نمایش این پیش‌نمایش هستند.'}
          </p>
          <Link to="/account/login" className="management-preview__real-link">
            {english ? 'Open real account' : 'ورود به حساب و دادهٔ واقعی'}{' '}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </aside>

      <section
        className="management-preview__main"
        aria-label={english ? 'Management workspace preview' : 'پیش‌نمایش فضای مدیریت'}
      >
        <header className="management-preview__topline">
          <div>
            <span>{english ? 'SAMPLE WORKSPACE' : 'فضای نمونه'}</span>
            <strong>{english ? 'Northstar Studio' : 'استودیو شمال‌نما'}</strong>
          </div>
          <label className="management-preview__scenario">
            <span>{english ? 'Preview case' : 'سناریوی نمایش'}</span>
            <select
              value={scenario}
              onChange={(event) => changeScenario(event.currentTarget.value as ScenarioId)}
            >
              <option value="idea">{english ? 'Idea, no revenue' : 'ایده، بدون درآمد'}</option>
              <option value="traction">
                {english ? 'SaaS, early traction' : 'SaaS، مشتری پرداخت‌کننده'}
              </option>
            </select>
          </label>
        </header>

        <div className="management-preview__content">
          <div className="management-preview__heading">
            <div>
              <p className="management-preview__eyebrow">
                {english ? 'DECISION DESK' : 'میز تصمیم'}
              </p>
              <h1 tabIndex={-1}>
                {english
                  ? 'A clear next step starts with context.'
                  : 'قدم بعدی از شناخت درست شروع می‌شود.'}
              </h1>
              <p>
                {english
                  ? scenario === 'idea'
                    ? 'Independent founder · customer evidence is still being collected'
                    : '10 team members · 20 paying customers · sample data'
                  : current.subtitle}
              </p>
            </div>
            <span className="management-preview__scope">
              {english ? 'Workspace · sample' : 'فضای کار · نمونه'}
            </span>
          </div>

          {section === 'overview' && (
            <>
              <section className="management-preview__next" aria-labelledby="preview-next-title">
                <div className="management-preview__next-copy">
                  <p>{english ? 'NEXT USEFUL MOVE' : 'گام مفید بعدی'}</p>
                  <h2 id="preview-next-title">
                    {scenario === 'idea'
                      ? english
                        ? 'Talk to a potential customer'
                        : 'با یک مشتری بالقوه گفت‌وگو کنید'
                      : english
                        ? 'Review whether the current segment repeats'
                        : 'تکرارپذیری در بخش مشتری فعلی را بررسی کنید'}
                  </h2>
                  <span>
                    {scenario === 'idea'
                      ? english
                        ? 'Stage stays unknown; no financial questions are needed.'
                        : 'مرحله نامشخص می‌ماند؛ پرسش مالی لازم نیست.'
                      : english
                        ? 'Reuse the saved profile; no duplicate ICP form.'
                        : 'پروفایل ذخیره‌شده استفاده می‌شود؛ فرم تکراری مشتری نداریم.'}
                  </span>
                </div>
                <button
                  className="management-preview__next-action"
                  onClick={() => setSection('journey')}
                >
                  {english ? 'Explore this step' : 'دیدن این گام'} <span aria-hidden="true">←</span>
                </button>
              </section>

              <div className="management-preview__ledger">
                <section
                  className="management-preview__situation"
                  aria-labelledby="preview-situation-title"
                >
                  <div className="management-preview__section-title">
                    <h2 id="preview-situation-title">
                      {english ? 'Business context' : 'وضعیت کسب‌وکار'}
                    </h2>
                    <button onClick={() => setSection('assessment')}>
                      {english ? 'Review' : 'بررسی'} <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  <p className="management-preview__scenario-name">
                    {english
                      ? scenario === 'idea'
                        ? 'Idea-stage project'
                        : 'Early customer traction'
                      : current.name}
                  </p>
                  <dl>
                    <div>
                      <dt>{english ? 'Lifecycle stage' : 'مرحلهٔ چرخهٔ عمر'}</dt>
                      <dd>
                        {english
                          ? scenario === 'idea'
                            ? 'Unknown'
                            : 'Self-reported · unverified'
                          : current.stage}
                      </dd>
                    </div>
                    <div>
                      <dt>{english ? 'Customer evidence' : 'شواهد مشتری'}</dt>
                      <dd>
                        {english
                          ? scenario === 'idea'
                            ? 'Being collected'
                            : 'ICP already saved'
                          : scenario === 'idea'
                            ? 'در حال جمع‌آوری'
                            : 'پروفایل مشتری ثبت شده'}
                      </dd>
                    </div>
                    <div>
                      <dt>{english ? 'Revenue data' : 'دادهٔ درآمد'}</dt>
                      <dd>
                        {english
                          ? scenario === 'idea'
                            ? 'Not reported'
                            : 'Not requested in this preview'
                          : scenario === 'idea'
                            ? 'گزارش نشده'
                            : 'در این گام درخواست نمی‌شود'}
                      </dd>
                    </div>
                  </dl>
                </section>
                <section
                  className="management-preview__attention"
                  aria-labelledby="preview-attention-title"
                >
                  <div className="management-preview__section-title">
                    <h2 id="preview-attention-title">
                      {english ? 'Open questions' : 'موضوع‌های نیازمند بررسی'}
                    </h2>
                    <span>{english ? '1 item' : '۱ مورد'}</span>
                  </div>
                  <div className="management-preview__attention-row">
                    <span className="management-preview__attention-pin" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <strong>
                        {scenario === 'idea'
                          ? english
                            ? 'Problem evidence'
                            : 'شواهد مسئله'
                          : english
                            ? 'Repeatability in the ICP'
                            : 'تکرارپذیری در مشتری هدف'}
                      </strong>
                      <p>
                        {scenario === 'idea'
                          ? english
                            ? 'What have potential customers actually done or said?'
                            : 'مشتری‌های بالقوه چه گفته‌اند یا چه کرده‌اند؟'
                          : english
                            ? 'What evidence supports a repeatable need?'
                            : 'چه شواهدی از تکرار یک نیاز پشتیبانی می‌کند؟'}
                      </p>
                    </div>
                    <button
                      onClick={() => setSection('journey')}
                      aria-label={english ? 'Open next step' : 'بازکردن گام بعدی'}
                    >
                      ↗
                    </button>
                  </div>
                </section>
              </div>

              <form className="management-preview__note" onSubmit={saveNote}>
                <label htmlFor="preview-note">
                  {english ? 'A note for this sample case' : 'یادداشت شما برای این سناریوی نمونه'}
                </label>
                <div>
                  <textarea
                    id="preview-note"
                    value={note}
                    onChange={(event) => {
                      setNote(event.currentTarget.value);
                      setSaveStatus('');
                    }}
                    placeholder={
                      english
                        ? 'Write an observation or question to revisit…'
                        : 'مشاهده یا پرسشی را برای مرور بعدی بنویسید…'
                    }
                    rows={2}
                  />
                  <button type="submit" className="ui-button ui-button--secondary">
                    {english ? 'Save locally' : 'ذخیره در مرورگر'}
                  </button>
                </div>
                <p aria-live="polite">
                  {saveStatus ||
                    (english
                      ? 'This note never leaves your browser.'
                      : 'یادداشت از مرورگر شما خارج نمی‌شود.')}
                </p>
              </form>
            </>
          )}

          {section === 'assessment' && (
            <section
              className="management-preview__detail"
              aria-labelledby="preview-assessment-title"
            >
              <p className="management-preview__eyebrow">
                {english ? 'ASSESSMENT · PREVIEW' : 'ارزیابی · پیش‌نمایش'}
              </p>
              <h2 id="preview-assessment-title">
                {english
                  ? 'What is already known, and what remains uncertain?'
                  : 'چه چیزی را می‌دانیم و چه چیزی هنوز نامشخص است؟'}
              </h2>
              <p>
                {english
                  ? 'The sample assessment preserves reported context and does not infer a lifecycle stage from team size.'
                  : 'ارزیابی نمونه، اطلاعات خوداظهاری را حفظ می‌کند و از تعداد اعضای تیم مرحلهٔ چرخهٔ عمر را نتیجه نمی‌گیرد.'}
              </p>
              <dl className="management-preview__assessment-list">
                <div>
                  <dt>{english ? 'Current stage' : 'مرحلهٔ فعلی'}</dt>
                  <dd>
                    <span>
                      {scenario === 'idea' ? (english ? 'Unknown' : 'نامشخص') : current.stage}
                    </span>
                    <small>
                      {english
                        ? 'No verified link to stage evidence is available in the current runtime.'
                        : 'در اجرای فعلی هنوز اتصال بازبینی‌شده‌ای به شواهد مرحله وجود ندارد.'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{english ? 'Existing customer profile' : 'پروفایل فعلی مشتری'}</dt>
                  <dd>
                    {scenario === 'idea'
                      ? english
                        ? 'Not recorded'
                        : 'ثبت نشده'
                      : english
                        ? 'Available for reuse'
                        : 'برای استفادهٔ دوباره موجود است'}
                  </dd>
                </div>
                <div>
                  <dt>{english ? 'Financial questions' : 'پرسش‌های مالی'}</dt>
                  <dd>
                    {scenario === 'idea'
                      ? english
                        ? 'Not applicable to this next step'
                        : 'برای این گام لازم نیست'
                      : english
                        ? 'Ask only if a decision requires them'
                        : 'فقط در صورت نیاز یک تصمیم پرسیده شوند'}
                  </dd>
                </div>
              </dl>
              <p className="management-preview__boundary">
                {english
                  ? 'Preview behavior only. The authenticated account currently exposes the saved Workspace profile; this assessment projection is not yet connected to a browser API.'
                  : 'این رفتار نمایشی است. حساب واقعی اکنون پروفایل ذخیره‌شدهٔ فضای کار را نشان می‌دهد؛ این خروجی ارزیابی هنوز به API مرورگر متصل نشده است.'}
              </p>
            </section>
          )}

          {section === 'journey' && (
            <section className="management-preview__detail" aria-labelledby="preview-journey-title">
              <p className="management-preview__eyebrow">
                {english ? 'GUIDED WORK · PREVIEW' : 'مسیر هدایت‌شده · پیش‌نمایش'}
              </p>
              <h2 id="preview-journey-title">
                {english
                  ? 'Move from a question to useful evidence.'
                  : 'از یک پرسش به شواهد مفید برسید.'}
              </h2>
              <p>
                {english
                  ? 'This sample journey demonstrates the designed flow. Progress is not sent to the server.'
                  : 'این مسیر، تجربهٔ طراحی‌شده را نمایش می‌دهد؛ پیشرفت به سرور فرستاده نمی‌شود.'}
              </p>
              <ol className="management-preview__journey">
                <li className="is-current">
                  <span>۱</span>
                  <div>
                    <strong>
                      {scenario === 'idea'
                        ? english
                          ? 'Describe the customer problem'
                          : 'مسئلهٔ مشتری را روشن کنید'
                        : english
                          ? 'Choose a customer segment'
                          : 'بخش مشتری را مشخص کنید'}{' '}
                      <small>{english ? 'Current preview step' : 'گام فعلی در پیش‌نمایش'}</small>
                    </strong>
                    <p>
                      {scenario === 'idea'
                        ? english
                          ? 'Start with what you observed. A hypothesis is not proof.'
                          : 'از مشاهدهٔ خود شروع کنید؛ فرضیه به‌تنهایی اثبات نیست.'
                        : english
                          ? 'The saved ICP is reused; you do not need to enter it again.'
                          : 'پروفایل ذخیره‌شده استفاده می‌شود و نیازی به ورود دوباره نیست.'}
                    </p>
                  </div>
                </li>
                <li>
                  <span>۲</span>
                  <div>
                    <strong>
                      {english ? 'Review evidence' : 'شواهد را مرور کنید'}
                      <small>{english ? 'Planned interaction' : 'تعامل طراحی‌شده'}</small>
                    </strong>
                    <p>
                      {english
                        ? 'Keep supporting and contrary observations visible.'
                        : 'مشاهدات موافق و مخالف را کنار هم نگه دارید.'}
                    </p>
                  </div>
                </li>
                <li>
                  <span>۳</span>
                  <div>
                    <strong>
                      {english ? 'Choose an action' : 'اقدام را انتخاب کنید'}
                      <small>{english ? 'Existing execution module' : 'ماژول اجرای موجود'}</small>
                    </strong>
                    <p>
                      {english
                        ? 'A manager decides whether to create and assign an action.'
                        : 'مدیر تصمیم می‌گیرد که اقدامی ثبت و واگذار شود.'}
                    </p>
                  </div>
                </li>
              </ol>
              <p className="management-preview__boundary">
                {english
                  ? 'The JourneyRun engine and server persistence are not implemented yet.'
                  : 'موتور JourneyRun و ذخیره‌سازی سروری هنوز پیاده‌سازی نشده‌اند.'}
              </p>
            </section>
          )}

          {section === 'tools' && (
            <section className="management-preview__detail" aria-labelledby="preview-tools-title">
              <p className="management-preview__eyebrow">
                {english ? 'AVAILABLE AFTER SIGN-IN' : 'پس از ورود به حساب'}
              </p>
              <h2 id="preview-tools-title">
                {english
                  ? 'Open the existing Workspace tools'
                  : 'ابزارهای موجود فضای کار را باز کنید'}
              </h2>
              <p>
                {english
                  ? 'These modules use your account and Workspace permissions. Sign in to see your own records.'
                  : 'این ابزارها از حساب و مجوز همان فضای کار استفاده می‌کنند؛ برای مشاهدهٔ اطلاعات خودتان وارد شوید.'}
              </p>
              <div className="management-preview__tool-list">
                {[
                  ['شناخت کسب‌وکار', 'پروفایل شرکت، محصول، مشتری و هدف', 'company'],
                  ['تحلیل SWOT', 'ثبت عوامل و گزینه‌های راهبردی', 'swot'],
                  ['ماتریس تصمیم', 'ارزیابی گزینه‌ها در ماتریس', 'matrices'],
                  ['برنامهٔ اجرا', 'تصمیم‌ها، هدف‌ها و اقدام‌ها', 'execution'],
                  ['مدارک و گزارش‌ها', 'مستندات و گزارش مدیریتی', 'documents'],
                ].map(([title, description], index) => (
                  <div key={title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>
                        {english
                          ? [
                              'Business profile',
                              'SWOT analysis',
                              'Decision matrix',
                              'Execution plan',
                              'Documents and reports',
                            ][index]
                          : title}
                      </strong>
                      <p>
                        {english
                          ? [
                              'Company, product, customer and goal profile',
                              'Record factors and strategic options',
                              'Compare options in a decision matrix',
                              'Decisions, goals and actions',
                              'Documents and management reports',
                            ][index]
                          : description}
                      </p>
                    </div>
                    <span aria-hidden="true">↗</span>
                  </div>
                ))}
              </div>
              <Link className="ui-button ui-button--primary" to="/account/login">
                {english ? 'Sign in to your account' : 'ورود به حساب واقعی'}
              </Link>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
