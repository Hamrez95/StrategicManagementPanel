import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Brand } from '@stratino/ui';
import { Icon } from '../features/experience/ExperienceUI';
import { applyAccountPreferences, readDevicePreferences } from '../features/account/api';
import type { DevicePreferences } from '../features/account/api';
import { homeCopy, homeSources } from './homeCopy';
import './home.css';

const art = {
  panel: new URL('../assets/home/strategy-orbit.webp', import.meta.url).href,
  academy: new URL('../assets/home/academy-orbit.webp', import.meta.url).href,
};
function preloadDestination(destination: 'panel' | 'academy') {
  return destination === 'academy'
    ? import.meta.env.VITE_ACADEMY_PREVIEW === 'false'
      ? Promise.resolve()
      : import('../features/academy/Academy')
    : import('../features/workspaces/WorkspaceManagementPage');
}
export default function Site({ academyEnabled = true }: { academyEnabled?: boolean }) {
  const navigate = useNavigate(),
    root = useRef<HTMLDivElement>(null),
    entering = useRef(false);
  const [preferences, setPreferences] = useState(readDevicePreferences);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const english = preferences.language === 'en',
    copy = homeCopy[english ? 'en' : 'fa'];
  useEffect(() => {
    const update = (event: Event) =>
      setPreferences((event as CustomEvent<DevicePreferences>).detail);
    window.addEventListener('stratino:preferences', update);
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === 'dark'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      window.removeEventListener('stratino:preferences', update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const page = root.current;
    if (!page || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (item.isIntersecting) item.target.classList.add('home-visible');
          if (item.target.classList.contains('home-orbit-hero'))
            page.dataset.orbitsActive = String(item.isIntersecting);
        }
      },
      { threshold: 0.12 },
    );
    page.querySelectorAll('.home-reveal,.home-orbit-hero').forEach((el) => observer.observe(el));
    page.dataset.revealReady = 'true';
    return () => observer.disconnect();
  }, []);
  function tilt(event: PointerEvent<HTMLAnchorElement>) {
    if (
      event.pointerType !== 'mouse' ||
      preferences.motion === 'reduced' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const r = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      '--orbit-x',
      `${((event.clientX - r.left) / r.width - 0.5) * 10}deg`,
    );
    event.currentTarget.style.setProperty(
      '--orbit-y',
      `${-((event.clientY - r.top) / r.height - 0.5) * 8}deg`,
    );
  }
  async function enter(event: MouseEvent<HTMLAnchorElement>, destination: 'panel' | 'academy') {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (
      !document.startViewTransition ||
      preferences.motion === 'reduced' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    event.preventDefault();
    if (entering.current) return;
    entering.current = true;
    const url = destination === 'academy' ? '/academy' : '/app/workspaces',
      r = event.currentTarget.getBoundingClientRect();
    const x = event.detail ? event.clientX : r.left + r.width / 2,
      y = event.detail ? event.clientY : r.top + r.height / 2;
    document.documentElement.dataset.homePortal = destination;
    try {
      await preloadDestination(destination);
      const outgoing = root.current;
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            // BrowserRouter may commit asynchronously. Capture the new page only after it replaces home.
            const observer = new MutationObserver(() => {
              if (!outgoing?.isConnected) finish();
            });
            const finish = () => {
              observer.disconnect();
              clearTimeout(timeout);
              resolve();
            };
            const timeout = window.setTimeout(finish, 1800);
            observer.observe(document.getElementById('content') ?? document.body, {
              childList: true,
              subtree: true,
            });
            navigate(url);
            if (!outgoing?.isConnected) finish();
          }),
      );
      await transition.ready;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      await document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 780,
          easing: 'cubic-bezier(.65,0,.18,1)',
          pseudoElement: '::view-transition-new(root)',
        },
      ).finished;
      await transition.finished;
    } catch {
      navigate(url);
    } finally {
      delete document.documentElement.dataset.homePortal;
      entering.current = false;
    }
  }
  return (
    <div
      ref={root}
      className="home-universe"
      dir={english ? 'ltr' : 'rtl'}
      lang={english ? 'en' : 'fa'}
    >
      <header className="home-header">
        <Link to="/" className="home-brand" aria-label={copy.home}>
          <Brand english={english} />
        </Link>
        <nav className="home-nav" aria-label={copy.navigation}>
          {academyEnabled && <a href="#academy-story">{copy.academyNav}</a>}
          <a href="#management-story">{copy.panel.title}</a>
          {academyEnabled && <a href="#learning-sources">{copy.sources}</a>}
        </nav>
        <div className="home-header-actions">
          <button
            className="home-icon-button"
            type="button"
            aria-label={dark ? copy.light : copy.dark}
            onClick={() =>
              applyAccountPreferences({ ...preferences, theme: dark ? 'light' : 'dark' })
            }
          >
            <Icon name={dark ? 'sun' : 'spark'} size={19} />
          </button>
          <button
            type="button"
            className="home-language"
            aria-label={copy.language}
            onClick={() =>
              applyAccountPreferences({ ...preferences, language: english ? 'fa' : 'en' })
            }
          >
            {english ? 'فا' : 'EN'}
          </button>
          <Link className="home-login" to="/account/login">
            {copy.login}
            <Icon name="arrow" size={17} />
          </Link>
        </div>
      </header>
      <section className="home-orbit-hero" aria-labelledby="home-title">
        <div className="home-starfield" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ '--star-i': i } as CSSProperties} />
          ))}
        </div>
        <div className="home-intro">
          <p className="home-intro-note">
            <span />
            {copy.tagline}
          </p>
          <h1 id="home-title" tabIndex={-1}>
            {copy.title}
          </h1>
          <p className="home-intro-description">
            {academyEnabled ? copy.description : copy.panelDescription}
          </p>
        </div>
        <div className={`home-worlds${academyEnabled ? '' : ' home-worlds--single'}`}>
          {(['panel', ...(academyEnabled ? ['academy'] : [])] as ('panel' | 'academy')[]).map(
            (world) => (
              <Link
                key={world}
                to={world === 'academy' ? '/academy' : '/app/workspaces'}
                className={`home-world home-world--${world}`}
                onClick={(e) => void enter(e, world)}
                onPointerEnter={() => {
                  void preloadDestination(world).catch(() => {});
                }}
                onFocus={() => {
                  void preloadDestination(world).catch(() => {});
                }}
                onPointerMove={tilt}
                onPointerLeave={(e) => {
                  e.currentTarget.style.setProperty('--orbit-x', '0deg');
                  e.currentTarget.style.setProperty('--orbit-y', '0deg');
                }}
              >
                <div className="home-orbital-scene" aria-hidden="true">
                  <div className="home-orbit-glow" />
                  <div className="home-orbit-ring home-orbit-ring--outer">
                    <i />
                  </div>
                  <div className="home-orbit-ring home-orbit-ring--inner">
                    <i />
                  </div>
                  <span className="home-orbit-spark home-orbit-spark--one">✦</span>
                  <span className="home-orbit-spark home-orbit-spark--two">✧</span>
                  <div className="home-art-tilt">
                    <img
                      src={art[world]}
                      alt=""
                      width="1254"
                      height="1254"
                      fetchPriority={world === 'panel' ? 'high' : 'auto'}
                      decoding="async"
                    />
                  </div>
                  <span className="home-orbit-caption">
                    <Icon name={world === 'panel' ? 'compass' : 'book'} size={15} />
                    {world === 'panel' ? copy.panelCaption : 'MBA · DBA'}
                  </span>
                </div>
                <div className="home-world-copy">
                  <p className="home-world-eyebrow">{copy[world].eyebrow}</p>
                  <h2>{copy[world].title}</h2>
                  <p className="home-world-description">{copy[world].description}</p>
                  <span className="home-world-action">
                    {copy[world].action}
                    <span className="home-arrow">
                      <Icon name="arrow" size={20} />
                    </span>
                  </span>
                </div>
              </Link>
            ),
          )}
          {academyEnabled && (
            <div className="home-world-divider" aria-hidden="true">
              <span>✦</span>
            </div>
          )}
        </div>
        <a className="home-explore" href={academyEnabled ? '#academy-story' : '#management-story'}>
          <span>{copy.explore}</span>
          <span aria-hidden="true">↓</span>
        </a>
      </section>
      {academyEnabled && (
        <>
          <section
            id="academy-story"
            className="home-academy-story home-section home-reveal"
            aria-labelledby="academy-story-title"
          >
            <div className="home-section-heading">
              <p className="home-kicker">{copy.academyNav}</p>
              <h2 id="academy-story-title">{copy.learningTitle}</h2>
              <p>{copy.learningDescription}</p>
            </div>
            <div className="home-curriculum-facts">
              {copy.facts.map(([value, label]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="home-levels">
              {copy.levels.map((level, i) => (
                <article key={level.title}>
                  <span className="home-level-icon">
                    <Icon name={['book', 'compass', 'chart'][i]} size={24} />
                  </span>
                  <p className="home-level-step">
                    {new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(i + 1)}
                  </p>
                  <h3>{level.title}</h3>
                  <p>{level.description}</p>
                </article>
              ))}
            </div>
            <div className="home-learning-scope">
              <Icon name="book" size={22} />
              <p>{copy.scope}</p>
            </div>
            <Link to="/academy/catalog" className="home-text-link">
              {copy.viewCourses}
              <Icon name="arrow" />
            </Link>
          </section>
          <section
            id="learning-sources"
            className="home-source-section home-reveal"
            aria-labelledby="source-title"
          >
            <div className="home-source-inner">
              <div className="home-source-symbol" aria-hidden="true">
                <Icon name="book" size={42} />
                <span>✦</span>
              </div>
              <div>
                <p className="home-kicker">{copy.sourceKicker}</p>
                <h2 id="source-title">{copy.sourceTitle}</h2>
                <p>{copy.sourceDescription}</p>
                <div className="home-source-links">
                  {homeSources.map((source) => (
                    <a href={source.url} key={source.name} target="_blank" rel="noreferrer">
                      <span dir="ltr">{source.name}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
                <small>{copy.sourceLimit}</small>
              </div>
            </div>
          </section>
          <section
            className="home-section home-audience home-reveal"
            aria-labelledby="audience-title"
          >
            <div className="home-section-heading">
              <p className="home-kicker">{copy.audienceKicker}</p>
              <h2 id="audience-title">{copy.audienceTitle}</h2>
            </div>
            <div className="home-audience-grid">
              {copy.audiences.map((audience, i) => (
                <article key={audience.title}>
                  <Icon name={['people', 'flag', 'book'][i]} size={26} />
                  <h3>{audience.title}</h3>
                  <p>{audience.description}</p>
                </article>
              ))}
            </div>
          </section>
          <section
            className="home-section home-learning-flow home-reveal"
            aria-labelledby="flow-title"
          >
            <div className="home-section-heading">
              <h2 id="flow-title">{copy.flowTitle}</h2>
              <p>{copy.flowDescription}</p>
            </div>
            <ol>
              {copy.flow.map((step, i) => (
                <li key={step.title}>
                  <span className="home-flow-node">
                    <Icon name={['book', 'compass', 'check', 'chart'][i]} size={25} />
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </li>
              ))}
            </ol>
            <Link className="home-primary-link" to="/academy">
              {copy.tryAcademy}
              <Icon name="arrow" />
            </Link>
          </section>
        </>
      )}
      <section
        id="management-story"
        className="home-management home-reveal"
        aria-labelledby="management-title"
      >
        <div className="home-management-inner">
          <div className="home-management-copy">
            <p className="home-kicker">{copy.panel.title}</p>
            <h2 id="management-title">{copy.managementTitle}</h2>
            <p>{copy.managementDescription}</p>
            <ul>
              {copy.managementPoints.map((point) => (
                <li key={point}>
                  <Icon name="check" size={18} />
                  {point}
                </li>
              ))}
            </ul>
            <Link className="home-primary-link" to="/app/workspaces">
              {copy.panel.action}
              <Icon name="arrow" />
            </Link>
          </div>
          <div className="home-decision-map" aria-label={copy.decisionMapLabel}>
            {copy.decisionMap.map((step, i) => (
              <div key={step}>
                <span>
                  <Icon name={['search', 'compass', 'flag', 'check'][i]} size={23} />
                </span>
                <p>{step}</p>
                {i < 3 && <i aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>
      {academyEnabled && (
        <section className="home-section home-faq home-reveal" aria-labelledby="faq-title">
          <h2 id="faq-title">{copy.faqTitle}</h2>
          {copy.faqs.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
          <Link className="home-text-link" to="/academy/guide">
            {copy.guide}
            <Icon name="arrow" />
          </Link>
        </section>
      )}
      <footer className="home-footer">
        <Link to="/" className="home-brand">
          <Brand english={english} />
        </Link>
        <p>{copy.tagline}</p>
        <div>
          <Link to="/account/login">{copy.login}</Link>
          {academyEnabled && <Link to="/academy/catalog">{copy.viewCourses}</Link>}
        </div>
        <span>© {english ? 'Stratino' : 'استراتینو'}</span>
      </footer>
    </div>
  );
}
