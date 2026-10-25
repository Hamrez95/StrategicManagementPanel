import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { UIProvider } from '@stratino/ui';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { readDevicePreferences, type DevicePreferences } from './features/account/api';
import './styles/app.css';
import './styles/management.css';
import './styles/motion.css';
import { PointerHighlights } from './features/chrome/PointerHighlights';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } },
});

function Application() {
  const [preferences, setPreferences] = useState<DevicePreferences>(readDevicePreferences);
  useEffect(() => {
    const onPreferences = (event: Event) => {
      const detail = (event as CustomEvent<DevicePreferences>).detail;
      if (detail) setPreferences(detail);
    };
    window.addEventListener('stratino:preferences', onPreferences);
    return () => window.removeEventListener('stratino:preferences', onPreferences);
  }, []);
  const reducedMotion = preferences.motion === 'reduced';
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
          <UIProvider
            dir={preferences.language === 'en' ? 'ltr' : 'rtl'}
            motion={reducedMotion ? 'reduced' : 'auto'}
          >
            <PointerHighlights disabled={reducedMotion} />
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </UIProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
