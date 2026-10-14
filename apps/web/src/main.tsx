import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { UIProvider } from '@stratino/ui';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles/app.css';
let reducedMotion = false;
try {
  reducedMotion =
    JSON.parse(localStorage.getItem('royesh-preferences-v1') || '{}').motion === 'reduced';
} catch {
  /* Session defaults when storage is unavailable. */
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
          <UIProvider motion={reducedMotion ? 'reduced' : 'auto'}>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </UIProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
