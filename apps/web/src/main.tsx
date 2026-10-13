import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
