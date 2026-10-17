import { useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { Empty } from './ExperienceUI';
import { Store } from './store';
import type { Space } from './model';
import { hasLocalSession, loadSpaces, localExperienceEnabled, SPACES_KEY } from './local';
import { ExperienceShell } from './ExperienceShell';
import { Welcome, WorkspaceHome, WelcomeTour } from './WorkspaceHome';
import { Discovery } from './Discovery';
import { WorkspacePage } from './WorkspacePages';
import { PersonalSettings, Plans } from './ExperienceSettings';
export default function ProductExperience() {
  const [initial] = useState(() => {
    try {
      return { spaces: loadSpaces(), error: '' };
    } catch (error) {
      return {
        spaces: [] as Space[],
        error: error instanceof Error ? error.message : 'ذخیرهٔ مرورگر در دسترس نیست.',
      };
    }
  });
  const [spaces, setSpaces] = useState(initial.spaces);
  const [error, setError] = useState(initial.error);
  const save = (next: Space[]) => {
    try {
      if (initial.error) throw new Error(initial.error);
      localStorage.setItem(SPACES_KEY, JSON.stringify(next));
      setSpaces(next);
      setError('');
      return true;
    } catch {
      setError('ذخیره انجام نشد. اطلاعات قبلی حفظ شده است؛ فضای ذخیرهٔ مرورگر را بررسی کنید.');
      return false;
    }
  };
  if (!localExperienceEnabled()) return <Navigate to="/account/login" replace />;
  if (!hasLocalSession())
    return <Navigate to="/account/login?next=%2Fpreview%2Fworkspaces" replace />;
  return (
    <Store.Provider value={{ spaces, save, error, clearError: () => setError('') }}>
      <div className="experience" dir="rtl">
        <Routes>
          <Route path="welcome" element={<Welcome />} />
          <Route path="tour" element={<WelcomeTour />} />
          <Route path="new" element={<Discovery />} />
          <Route path="w/:spaceId/discovery" element={<Discovery />} />
          <Route element={<ExperienceShell />}>
            <Route index element={<Navigate to="workspaces" replace />} />
            <Route path="workspaces" element={<WorkspaceHome />} />
            <Route path="account" element={<PersonalSettings />} />
            <Route path="plans" element={<Plans />} />
            <Route path="w/:spaceId/:section" element={<WorkspacePage />} />
            <Route path="w/:spaceId/tool/:toolId" element={<WorkspacePage />} />
            <Route path="w/:spaceId/document/:documentId" element={<WorkspacePage />} />
            <Route path="w/:spaceId/research/:recordId" element={<WorkspacePage />} />
            <Route
              path="*"
              element={
                <Empty
                  title="این صفحه پیدا نشد"
                  text="می‌توانید از فهرست فضاهای کاری ادامه بدهید."
                  action={
                    <Link className="ex-button" to="/preview/workspaces">
                      فضاهای کاری من
                    </Link>
                  }
                />
              }
            />
          </Route>
        </Routes>
      </div>
    </Store.Provider>
  );
}
