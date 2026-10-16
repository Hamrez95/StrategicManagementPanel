import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useUIAppearance } from '@stratino/ui';
import './management-preview.css';

type PreviewSection = 'overview' | 'assessment' | 'journey' | 'tools' | 'onboarding';
type ScenarioId = 'idea' | 'traction';
type BusinessKind = 'startup' | 'business' | 'organization';
type DemoWorkspace = { id: number; name: string; kind: BusinessKind; goal: string; stage: string };

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
  { id: 'onboarding', label: 'شروع و فضاها', en: 'Start & workspaces' },
];

const kindLabels: Record<BusinessKind, { fa: string; en: string }> = {
  startup: { fa: 'استارتاپ / کسب‌وکار نوپا', en: 'Startup / new venture' },
  business: { fa: 'کسب‌وکار فعال', en: 'Operating business' },
  organization: { fa: 'سازمان یا شرکت بزرگ', en: 'Organization / enterprise' },
};

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
  const [businessKind, setBusinessKind] = useState<BusinessKind>('startup');
  const [businessGoal, setBusinessGoal] = useState('شناخت مسئله و مشتری');
  const [businessStage, setBusinessStage] = useState('');
  const [businessName, setBusinessName] = useState('کسب‌وکار اول');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [demoPlan, setDemoPlan] = useState<'free' | 'paid'>('free');
  const [workspaces, setWorkspaces] = useState<DemoWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<number | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<number | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const activeDemoWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspace);
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
            <strong>
              {activeDemoWorkspace?.name ?? (english ? 'Northstar Studio' : 'استودیو شمال‌نما')}
            </strong>
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
          <label className="management-preview__scenario">
            <span>{english ? 'Demo plan' : 'پلن نمایشی'}</span>
            <select
              value={demoPlan}
              onChange={(event) => setDemoPlan(event.currentTarget.value as 'free' | 'paid')}
            >
              <option value="free">
                {english ? 'Free · 1 owned Workspace' : 'رایگان · یک فضای کارِ مالک'}
              </option>
              <option value="paid">
                {english ? 'Paid · expanded access' : 'اشتراکی · دسترسی گسترده‌تر'}
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

          {section === 'onboarding' && (
            <section
              className="management-preview__detail"
              aria-labelledby="preview-onboarding-title"
            >
              <p className="management-preview__eyebrow">
                {english
                  ? 'FIRST-RUN AND MULTI-BUSINESS PREVIEW'
                  : 'پیش‌نمایش شروع و مدیریت چند کسب‌وکار'}
              </p>
              <h2 id="preview-onboarding-title">
                {english
                  ? 'Create a workspace around one business.'
                  : 'هر فضای کار را برای یک کسب‌وکار بسازید.'}
              </h2>
              <p>
                {english
                  ? 'Try the first-run questions, then create a separate business and reopen its guided setup.'
                  : 'پرسش‌های شروع را امتحان کنید؛ سپس یک کسب‌وکار جدا بسازید و راهنمای شناخت همان فضا را دوباره باز کنید.'}
              </p>

              <div className="management-preview__workspace-bar">
                <label>
                  <span>{english ? 'Current business' : 'کسب‌وکار انتخاب‌شده'}</span>
                  <select
                    aria-label={english ? 'Switch workspace' : 'تعویض فضای کار'}
                    value={activeWorkspace ?? ''}
                    onChange={(event) =>
                      setActiveWorkspace(
                        event.currentTarget.value ? Number(event.currentTarget.value) : null,
                      )
                    }
                  >
                    <option value="">
                      {english ? 'No demo workspace yet' : 'هنوز فضای نمایشی نساخته‌اید'}
                    </option>
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="ui-button ui-button--secondary"
                  onClick={() => {
                    if (demoPlan === 'free' && workspaces.length >= 1) setShowUpgrade(true);
                    else {
                      setShowUpgrade(false);
                      setActiveWorkspace(null);
                      setOnboardingStep(0);
                      setBusinessName('کسب‌وکار جدید');
                      setSection('onboarding');
                    }
                  }}
                >
                  {english ? '+ New business' : '+ کسب‌وکار جدید'}
                </button>
              </div>

              {!activeDemoWorkspace && !showUpgrade && (
                <div className="management-preview__form-card">
                  <div className="management-preview__step-count">
                    {english
                      ? `STEP ${onboardingStep + 1} OF 3`
                      : `گام ${['اول', 'دوم', 'سوم'][onboardingStep]} از ۳`}
                  </div>
                  {onboardingStep === 0 && (
                    <>
                      <h3>
                        {english ? 'What are you setting up?' : 'برای چه نوع فعالیتی فضا می‌سازید؟'}
                      </h3>
                      <div className="management-preview__choice-grid">
                        {(['startup', 'business', 'organization'] as const).map((kind) => (
                          <button
                            key={kind}
                            className={businessKind === kind ? 'is-chosen' : ''}
                            aria-pressed={businessKind === kind}
                            onClick={() => setBusinessKind(kind)}
                          >
                            {english ? kindLabels[kind].en : kindLabels[kind].fa}
                          </button>
                        ))}
                      </div>
                      <label className="management-preview__field">
                        {english ? 'Business or workspace name' : 'نام کسب‌وکار یا فضای کار'}
                        <input
                          value={businessName}
                          onChange={(event) => setBusinessName(event.currentTarget.value)}
                        />
                      </label>
                    </>
                  )}
                  {onboardingStep === 1 && (
                    <>
                      <h3>
                        {english
                          ? 'What do you want to make progress on?'
                          : 'در حال حاضر برای چه می‌خواهید پیشرفت کنید؟'}
                      </h3>
                      <label className="management-preview__field">
                        {english ? 'Main objective' : 'هدف اصلی'}
                        <select
                          value={businessGoal}
                          onChange={(event) => setBusinessGoal(event.currentTarget.value)}
                        >
                          <option>شناخت مسئله و مشتری</option>
                          <option>طراحی یا آزمون مدل کسب‌وکار</option>
                          <option>رشد فروش و بازار</option>
                          <option>بهبود عملکرد کسب‌وکار</option>
                          <option>هم‌راستاسازی راهبرد و اجرا</option>
                        </select>
                      </label>
                      <p className="management-preview__field-hint">
                        {english
                          ? 'Follow-up questions should depend on this objective and existing workspace data.'
                          : 'سؤال‌های بعدی باید بر اساس همین هدف و اطلاعات موجود همین فضای کار انتخاب شوند.'}
                      </p>
                    </>
                  )}
                  {onboardingStep === 2 && (
                    <>
                      <h3>
                        {english
                          ? 'Where are you in the lifecycle?'
                          : 'کسب‌وکار در چه مرحله‌ای است؟'}
                      </h3>
                      <label className="management-preview__field">
                        {english ? 'Your current view (optional)' : 'برداشت فعلی شما (اختیاری)'}
                        <select
                          value={businessStage}
                          onChange={(event) => setBusinessStage(event.currentTarget.value)}
                        >
                          <option value="">
                            {english ? 'Not sure / skip for now' : 'مطمئن نیستم / فعلاً رد می‌کنم'}
                          </option>
                          <option value="idea">ایده و کشف مسئله</option>
                          <option value="validation">اعتبارسنجی و آزمون</option>
                          <option value="early">شروع فروش و مشتریان اولیه</option>
                          <option value="growth">رشد و توسعه</option>
                          <option value="established">کسب‌وکار تثبیت‌شده</option>
                          <option value="change">تحول یا بازطراحی</option>
                        </select>
                      </label>
                      <p className="management-preview__field-hint">
                        {english
                          ? 'This is self-reported context, not a score. Team size or revenue alone will not assign a stage.'
                          : 'این فقط خوداظهاری است، نه امتیاز؛ اندازهٔ تیم یا درآمد به‌تنهایی مرحله را تعیین نمی‌کند.'}
                      </p>
                    </>
                  )}
                  <div className="management-preview__form-actions">
                    {onboardingStep > 0 && (
                      <button
                        className="ui-button ui-button--secondary"
                        onClick={() => setOnboardingStep(onboardingStep - 1)}
                      >
                        {english ? 'Back' : 'قبلی'}
                      </button>
                    )}
                    {onboardingStep < 2 ? (
                      <button
                        className="ui-button ui-button--primary"
                        onClick={() => setOnboardingStep(onboardingStep + 1)}
                      >
                        {english ? 'Continue' : 'ادامه'}
                      </button>
                    ) : (
                      <button
                        className="ui-button ui-button--primary"
                        disabled={!businessName.trim()}
                        onClick={() => {
                          const workspace = {
                            id: editingWorkspaceId ?? Date.now(),
                            name: businessName.trim(),
                            kind: businessKind,
                            goal: businessGoal,
                            stage: businessStage,
                          };
                          setWorkspaces((currentWorkspaces) =>
                            editingWorkspaceId
                              ? currentWorkspaces.map((item) =>
                                  item.id === editingWorkspaceId ? workspace : item,
                                )
                              : [...currentWorkspaces, workspace],
                          );
                          setActiveWorkspace(workspace.id);
                          setEditingWorkspaceId(null);
                          setShowUpgrade(false);
                        }}
                      >
                        {english
                          ? editingWorkspaceId
                            ? 'Save discovery context'
                            : 'Create workspace'
                          : editingWorkspaceId
                            ? 'ذخیرهٔ شناخت کسب‌وکار'
                            : 'ساخت فضای کار'}
                      </button>
                    )}
                  </div>
                  {businessKind === 'organization' && (
                    <p className="management-preview__field-hint">
                      {english
                        ? 'Organization-specific follow-ups and business-unit boundaries need an approved scope. This demo does not invent them.'
                        : 'سؤال‌های اختصاصی سازمان و مرز واحدهای کسب‌وکار باید جداگانه تأیید شوند؛ این نمونه آن‌ها را حدس نمی‌زند.'}
                    </p>
                  )}
                </div>
              )}

              {activeDemoWorkspace && !showUpgrade && (
                <div className="management-preview__workspace-dashboard">
                  <div>
                    <span className="management-preview__sample-tag">
                      {english ? 'EMPTY BUSINESS WORKSPACE' : 'فضای کار مستقل و تازه'}
                    </span>
                    <h3>{activeDemoWorkspace.name}</h3>
                    <p>
                      {english
                        ? kindLabels[activeDemoWorkspace.kind].en
                        : kindLabels[activeDemoWorkspace.kind].fa}{' '}
                      · {activeDemoWorkspace.goal}
                    </p>
                    <p>
                      {activeDemoWorkspace.stage
                        ? english
                          ? 'Self-reported lifecycle stage'
                          : 'مرحلهٔ خوداظهاری ثبت شده'
                        : english
                          ? 'Lifecycle stage remains unknown until you choose to report it.'
                          : 'مرحله نامشخص می‌ماند تا اگر خواستید خودتان آن را گزارش کنید.'}
                    </p>
                  </div>
                  <button
                    className="ui-button ui-button--primary"
                    onClick={() => {
                      setEditingWorkspaceId(activeDemoWorkspace.id);
                      setBusinessKind(activeDemoWorkspace.kind);
                      setBusinessGoal(activeDemoWorkspace.goal);
                      setBusinessStage(activeDemoWorkspace.stage);
                      setBusinessName(activeDemoWorkspace.name);
                      setActiveWorkspace(null);
                      setOnboardingStep(0);
                      setSection('onboarding');
                    }}
                  >
                    {english ? 'Start business discovery' : 'شروع راهنمای شناخت این کسب‌وکار'}
                  </button>
                  <div className="management-preview__locked-grid">
                    <article>
                      <span aria-hidden="true">⌑</span>
                      <h4>{english ? 'SWOT and strategy matrices' : 'ماتریس‌های SWOT و راهبرد'}</h4>
                      <p>
                        {english
                          ? 'Included in expanded plan preview'
                          : 'در پلن گسترده‌تر فعال می‌شود'}
                      </p>
                      <button onClick={() => setShowUpgrade(true)}>
                        {english ? 'View access options' : 'مشاهدهٔ دسترسی‌ها'}
                      </button>
                    </article>
                    <article>
                      <span aria-hidden="true">▦</span>
                      <h4>{english ? 'Decision comparison' : 'مقایسهٔ گزینه‌های تصمیم'}</h4>
                      <p>
                        {english
                          ? 'Compare alternatives with saved evidence'
                          : 'گزینه‌ها را با شواهد ثبت‌شده مقایسه کنید'}
                      </p>
                      <button onClick={() => setShowUpgrade(true)}>
                        {english ? 'View access options' : 'مشاهدهٔ دسترسی‌ها'}
                      </button>
                    </article>
                  </div>
                  <p className="management-preview__boundary">
                    {english
                      ? 'This is a local prototype. Workspace creation, account verification and access limits are not connected to the server.'
                      : 'این فقط نمونهٔ محلی است؛ ساخت فضای کار، تأیید حساب و محدودیت دسترسی به سرور وصل نیست.'}
                  </p>
                </div>
              )}

              {showUpgrade && (
                <div className="management-preview__upgrade" role="status">
                  <h3>
                    {english
                      ? 'Your free preview includes one owned workspace.'
                      : 'در این پیش‌نمایش، پلن رایگان یک فضای کارِ تحت مالکیت دارد.'}
                  </h3>
                  <p>
                    {english
                      ? 'Invited workspaces should remain available without consuming the owner quota. Paid capacity and exact feature access need configurable server entitlements.'
                      : 'فضاهای کاری که با دعوت به آن‌ها پیوسته‌اید نباید از سهمیهٔ مالکیت کم کنند. ظرفیت پلن و دسترسی دقیق قابلیت‌ها باید از entitlement قابل‌تنظیم سرور بیاید.'}
                  </p>
                  <div className="management-preview__form-actions">
                    <button
                      className="ui-button ui-button--secondary"
                      onClick={() => setShowUpgrade(false)}
                    >
                      {english ? 'Back to workspace' : 'بازگشت'}
                    </button>
                    <button
                      className="ui-button ui-button--primary"
                      onClick={() => {
                        setDemoPlan('paid');
                        setShowUpgrade(false);
                        setActiveWorkspace(null);
                        setOnboardingStep(0);
                      }}
                    >
                      {english ? 'Preview expanded plan' : 'دیدن پلن گسترده‌تر'}
                    </button>
                  </div>
                  <p className="management-preview__boundary">
                    {english
                      ? 'No price or unlimited quota is promised here. Payment, grace, downgrade and preservation belong to the billing implementation.'
                      : 'اینجا قیمت یا سهمیهٔ نامحدود وعده داده نمی‌شود؛ پرداخت، مهلت، تنزل پلن و حفظ داده باید در پیاده‌سازی اشتراک تعیین شوند.'}
                  </p>
                </div>
              )}
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
