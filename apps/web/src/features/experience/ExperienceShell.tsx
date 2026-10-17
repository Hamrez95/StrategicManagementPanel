import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon, Mark } from './ExperienceUI';
import { useSpaces, path } from './store';
import { kindLabels } from './model';
import { logoutLocal, TEST_EMAIL } from './local';
function LocalNotice() {
  return <span className="ex-local-tag">نسخهٔ محلی</span>;
}
export function Header({ simple = false }: { simple?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="ex-header">
      <Mark to="/preview/workspaces" />
      <div className="ex-header-actions">
        <LocalNotice />
        {simple ? (
          <Link className="ex-button ex-button--quiet" to="/preview/workspaces">
            بستن <Icon name="close" />
          </Link>
        ) : (
          <>
            <Link className="ex-button ex-button--quiet ex-home-link" to="/preview/workspaces">
              <Icon name="grid" />
              فضاهای کاری
            </Link>
            <details className="ex-account-menu">
              <summary aria-label="منوی حساب حمیدرضا">
                <span className="ex-avatar">ح</span>
              </summary>
              <div>
                <strong>حمیدرضا پاکپور</strong>
                <small dir="ltr">{TEST_EMAIL}</small>
                <Link
                  to="/preview/account"
                  onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
                >
                  حساب و ظاهر برنامه
                </Link>
                <Link
                  to="/preview/plans"
                  onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
                >
                  دسترسی‌ها و اشتراک
                </Link>
                <button
                  onClick={() => {
                    logoutLocal();
                    navigate('/account/login');
                  }}
                >
                  خروج از حساب
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </header>
  );
}

export function ExperienceShell() {
  const location = useLocation();
  const match = location.pathname.match(/^\/preview\/w\/([^/]+)/);
  const { spaces, error } = useSpaces();
  const space = spaces.find((s) => s.id === decodeURIComponent(match?.[1] ?? ''));
  const [menu, setMenu] = useState(false);
  const nav = [
    { id: 'overview', name: 'نمای کلی', icon: 'home' },
    { id: 'business', name: 'شناخت کسب‌وکار', icon: 'compass' },
    { id: 'strategy', name: 'تحلیل‌ها', icon: 'chart' },
    { id: 'actions', name: 'اقدامات', icon: 'check' },
    { id: 'library', name: 'کتابخانه', icon: 'book' },
  ];
  return (
    <>
      <Header />
      <div className={`ex-layout${space ? ' ex-layout--workspace' : ''}`}>
        {space && (
          <>
            <button
              className="ex-mobile-nav ex-button ex-button--quiet"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" />
              بخش‌های {space.name}
            </button>
            <aside className={`ex-sidebar${menu ? ' is-open' : ''}`} id="workspace-navigation">
              <Link to="/preview/workspaces" className="ex-sidebar-back">
                <Icon name="arrow" size={16} />
                همهٔ فضاها
              </Link>
              <div className="ex-space-identity">
                <span className={`ex-space-avatar ex-color--${space.color}`}>{space.name[0]}</span>
                <div>
                  <strong>{space.name}</strong>
                  <small>
                    {space.setupComplete === false ? 'فضای تازه' : kindLabels[space.kind]}
                    {space.sample ? ' · نمونه' : ''}
                  </small>
                </div>
              </div>
              <nav aria-label="بخش‌های فضای کار">
                {nav.map((item) => (
                  <NavLink
                    key={item.id}
                    to={path(space, item.id)}
                    onClick={() => setMenu(false)}
                    className={({ isActive }) =>
                      isActive ||
                      (item.id === 'strategy' && location.pathname.includes('/tool/')) ||
                      (item.id === 'library' && location.pathname.includes('/document/'))
                        ? 'active'
                        : ''
                    }
                  >
                    <Icon name={item.icon} />
                    {item.name}
                  </NavLink>
                ))}
              </nav>
              <div className="ex-sidebar-bottom">
                <NavLink to={path(space, 'reports')} onClick={() => setMenu(false)}>
                  <Icon name="file" />
                  گزارش کسب‌وکار
                </NavLink>
                <NavLink to={path(space, 'settings')} onClick={() => setMenu(false)}>
                  <Icon name="settings" />
                  تنظیمات فضا
                </NavLink>
                <Link className="ex-guide-link" to={path(space, 'discovery')}>
                  <Icon name="spark" />
                  شناخت گام‌به‌گام
                </Link>
              </div>
            </aside>
          </>
        )}
        <div className="ex-content">
          {error && (
            <p className="ex-alert" role="alert">
              {error}
            </p>
          )}
          <Outlet />
        </div>
      </div>
    </>
  );
}
