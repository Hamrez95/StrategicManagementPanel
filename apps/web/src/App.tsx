import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Brand, Button, Notice } from '@stratino/ui';
import { readSession } from './session';
const Site = lazy(() => import('./pages/Site'));
const Account = lazy(() => import('./pages/Account'));
const Workspace = lazy(() => import('./pages/Workspace'));
const Operator = lazy(() => import('./pages/Operator'));
const ComponentLab = import.meta.env.DEV ? lazy(() => import('./pages/ComponentLab')) : null;

function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus();
    document.title =
      'استراتینو | ' + (pathname.startsWith('/app') ? 'فضای کار' : 'از تحلیل تا اقدام');
  }, [pathname]);
  return null;
}
function SessionBoundary({ operator = false }: { operator?: boolean }) {
  const { pathname } = useLocation();
  const query = useQuery({ queryKey: ['session'], queryFn: ({ signal }) => readSession(signal) });
  if (query.isPending)
    return (
      <Notice title="در حال بررسی حساب">
        <p role="status">دسترسی فضای کار در حال بررسی است.</p>
      </Notice>
    );
  if (query.isError)
    return (
      <Notice title="فضای کار در دسترس نیست">
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>تلاش دوباره</Button>
        <Link className="text-link" to="/demo">
          بازکردن نسخه نمونه
        </Link>
      </Notice>
    );
  if (!query.data)
    return <Navigate to={'/account/login?next=' + encodeURIComponent(pathname)} replace />;
  if (operator && !query.data.user.is_staff)
    return (
      <Notice title="دسترسی ندارید">
        <p>این بخش ویژه مدیریت سرویس است.</p>
        <Link to="/">بازگشت به صفحه اصلی</Link>
      </Notice>
    );
  return <Outlet context={query.data} />;
}
export function App() {
  const [dark, setDark] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem('royesh-preferences-v1') || '{}');
      return (
        p.theme === 'dark' ||
        (p.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  const toggleTheme = () => {
    setDark((value) => !value);
    try {
      const p = JSON.parse(localStorage.getItem('royesh-preferences-v1') || '{}');
      localStorage.setItem(
        'royesh-preferences-v1',
        JSON.stringify({ ...p, theme: dark ? 'light' : 'dark' }),
      );
    } catch {
      /* Session-only when storage is unavailable. */
    }
  };
  useEffect(() => {
    if (location.hash.startsWith('#') && location.pathname === '/')
      location.replace('/prototype/' + location.hash);
  }, []);
  return (
    <>
      <a className="skip-link" href="#content">
        رفتن به محتوای اصلی
      </a>
      <header className="site-header">
        <Link to="/" aria-label="استراتینو، صفحه اصلی">
          <Brand />
        </Link>
        <nav aria-label="ناوبری اصلی">
          <Link to="/demo">نمونه تعاملی</Link>
          <Link to="/account/login">حساب کاربری</Link>
          <Button aria-label="تغییر تم" onClick={toggleTheme}>
            {dark ? 'تم روشن' : 'تم تیره'}
          </Button>
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        <Suspense
          fallback={
            <p className="loading" role="status">
              در حال آماده‌سازی صفحه…
            </p>
          }
        >
          <Routes>
            {ComponentLab && <Route path="/__dev/ui" element={<ComponentLab />} />}
            <Route path="/" element={<Site />} />
            <Route
              path="/demo"
              element={
                <section className="demo-view">
                  <div className="demo-note">
                    <p>
                      نسخه نمونه؛ داده‌ها در همین مرورگر ذخیره می‌شوند. ورود و ذخیره سروری در حال
                      توسعه است.
                    </p>
                    <a href="/prototype/">بازکردن تمام‌صفحه</a>
                  </div>
                  <iframe title="نمونه تعاملی استراتینو" src="/prototype/" />
                </section>
              }
            />
            <Route path="/account/*" element={<Account />} />
            <Route element={<SessionBoundary />}>
              <Route path="/app/workspaces/:workspaceId/*" element={<Workspace />} />
              <Route
                path="/app/start"
                element={
                  <Notice title="شروع پروژه">
                    <p>ورود تأیید شده است؛ آن‌بوردینگ پروژه در مرحله بعد تکمیل می‌شود.</p>
                  </Notice>
                }
              />
            </Route>
            <Route element={<SessionBoundary operator />}>
              <Route path="/internal/*" element={<Operator />} />
            </Route>
            <Route
              path="*"
              element={
                <Notice title="صفحه پیدا نشد">
                  <p>این آدرس در استراتینو وجود ندارد.</p>
                  <Link to="/">بازگشت به صفحه اصلی</Link>
                </Notice>
              }
            />
          </Routes>
          <RouteFocus />
        </Suspense>
      </main>
      <footer className="site-footer">
        <Brand />
        <p>از تحلیل به تصمیم؛ از تصمیم به اقدام.</p>
        <span>نسخه در حال توسعه</span>
      </footer>
    </>
  );
}
