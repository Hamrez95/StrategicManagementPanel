import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@stratino/ui';
import { requestApi } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { readSession } from '../../session';
import { postAuth } from './api';
import { destinationAfterLogin } from './authNavigation';
import './googleAuth.css';

type IdentityApi = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    callback: (response: { credential: string }) => void;
    auto_select: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: Record<string, string | number | (() => void)>,
  ) => void;
};
const identity = () =>
  (window as Window & { google?: { accounts?: { id?: IdentityApi } } }).google?.accounts?.id;
let sdkPromise: Promise<IdentityApi> | undefined;
type Challenge = { challenge_id: string; nonce: string };
// Serialize session creation across route changes and React's development remount.
let challengeQueue: Promise<unknown> = Promise.resolve();
function createChallenge() {
  const pending = challengeQueue.then(() =>
    postAuth<Challenge>('/api/v1/accounts/google/challenge/'),
  );
  challengeQueue = pending.catch(() => undefined);
  return pending;
}
function loadSdk() {
  if (identity()) return Promise.resolve(identity()!);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<IdentityApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=fa';
    script.async = true;
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error('گوگل پاسخ نداد؛ دوباره تلاش کن یا با ایمیل ادامه بده.'));
    }, 12000);
    script.onload = () => {
      window.clearTimeout(timer);
      const api = identity();
      if (api) resolve(api);
      else reject(new Error('ورود با گوگل بارگذاری نشد.'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error('ارتباط با گوگل برقرار نشد؛ با ایمیل هم می‌تونی ادامه بدی.'));
    };
    document.head.append(script);
  }).catch((error) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}
type GoogleResult = {
  status: 'authenticated' | 'link_required' | 'email_proof_required';
  email?: string;
};
export function GoogleSignIn() {
  const [state, setState] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<GoogleResult | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const button = useRef<HTMLDivElement>(null);
  const location = useLocation(),
    navigate = useNavigate(),
    queryClient = useQueryClient();
  const next = new URLSearchParams(location.search).get('next');
  async function finish() {
    queryClient.clear();
    const session = await queryClient.fetchQuery({
      queryKey: queryKeys.session,
      queryFn: () => readSession(),
    });
    if (!session) throw new Error('ورود کامل نشد؛ دوباره تلاش کن.');
    navigate(destinationAfterLogin(session, next), { replace: true });
  }
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let issuedAt = 0;
    let flowStartedAt = 0;
    const controller = new AbortController();
    setState('loading');
    setError('');
    setResult(null);
    async function setup() {
      try {
        const config = await requestApi<{ enabled: boolean; client_id: string }>(
          '/api/v1/accounts/google/config/',
          { signal: controller.signal },
        );
        if (!active) return;
        if (!config.enabled) {
          setState('disabled');
          return;
        }
        const api = await loadSdk();
        if (!active) return;
        const challenge = await createChallenge();
        if (!active || !button.current) return;
        issuedAt = Date.now();
        api.initialize({
          client_id: config.client_id,
          nonce: challenge.nonce,
          auto_select: false,
          callback: (response) => {
            if (!active) return;
            clearTimeout(refreshTimer);
            issuedAt = 0;
            setBusy(true);
            setError('');
            postAuth<GoogleResult>('/api/v1/accounts/google/login/', {
              credential: response.credential,
              challenge_id: challenge.challenge_id,
            })
              .then(async (data) => {
                if (!active) return;
                if (data.status === 'authenticated') await finishRef.current();
                else setResult(data);
              })
              .catch((err) => {
                if (active) {
                  setError((err as Error).message);
                  setState('error');
                }
              })
              .finally(() => {
                if (active) setBusy(false);
              });
          },
        });
        button.current.replaceChildren();
        api.renderButton(button.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: Math.min(360, Math.max(200, button.current.parentElement?.clientWidth ?? 320)),
          locale: 'fa',
          click_listener: () => {
            flowStartedAt = Date.now();
          },
        });
        setState('ready');
        // Refresh while idle, before the server's ten-minute expiry. Give an
        // open account chooser time to finish without replacing its nonce.
        function refreshWhenIdle() {
          if (!active) return;
          const chooserAge = Date.now() - flowStartedAt;
          if (flowStartedAt && chooserAge < 120_000) {
            refreshTimer = setTimeout(refreshWhenIdle, 120_000 - chooserAge);
            return;
          }
          setRetry((value) => value + 1);
        }
        refreshTimer = setTimeout(refreshWhenIdle, 7 * 60_000);
      } catch (err) {
        if (active) {
          setError((err as Error).message);
          setState('error');
        }
      }
    }
    function refreshAfterWake() {
      if (
        document.visibilityState === 'visible' &&
        issuedAt &&
        Date.now() - issuedAt >= 7 * 60_000 &&
        (!flowStartedAt || Date.now() - flowStartedAt >= 120_000)
      ) {
        setRetry((value) => value + 1);
      }
    }
    document.addEventListener('visibilitychange', refreshAfterWake);
    void setup();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', refreshAfterWake);
    };
  }, [retry]);
  return (
    <div className="auth-google-block" aria-busy={busy}>
      <div
        ref={button}
        className="auth-google-button"
        hidden={state !== 'ready' || result !== null || busy}
      />
      {state === 'loading' && (
        <button className="auth-google-placeholder" type="button" disabled>
          <img
            className="auth-google-logo"
            src="/brand/google-g.png"
            alt=""
            width="20"
            height="20"
          />
          داریم ورود با گوگل رو آماده می‌کنیم…
        </button>
      )}
      {state === 'disabled' && (
        <>
          <button className="auth-google-placeholder" type="button" disabled>
            <img
              className="auth-google-logo"
              src="/brand/google-g.png"
              alt=""
              width="20"
              height="20"
            />
            ادامه با گوگل
          </button>
          <p className="auth-google-hint">ورود با گوگل هنوز فعال نشده؛ فعلاً با ایمیل ادامه بده.</p>
        </>
      )}
      {busy && <p role="status">داریم حسابت رو آماده می‌کنیم…</p>}
      {result?.status === 'link_required' && (
        <form
          className="auth-google-link"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            postAuth('/api/v1/accounts/google/link/', { password })
              .then(() => finish())
              .catch((err) => setError((err as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          <p>با این ایمیل از قبل حساب داری. برای اتصال گوگل، گذرواژهٔ همون حساب رو وارد کن.</p>
          <bdi dir="ltr">{result.email}</bdi>
          <Input
            label="گذرواژهٔ حساب فعلی"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
          />
          <Button type="submit" pending={busy} className="auth-submit">
            اتصال گوگل و ادامه
          </Button>
          <Link to="/account/reset-password">گذرواژه‌ات رو فراموش کردی؟</Link>
        </form>
      )}
      {result?.status === 'email_proof_required' && (
        <p role="status">
          برای این حساب گوگل، اول مالکیت ایمیلت رو با{' '}
          <Link to={`/account/signup${location.search}`} state={{ email: result.email }}>
            ثبت‌نام ایمیلی
          </Link>{' '}
          تأیید کن؛ بعد می‌تونی گوگل رو به حسابت وصل کنی.
        </p>
      )}
      {error && (
        <p role="alert" className="auth-message auth-message--error">
          {error}
        </p>
      )}
      {state === 'error' && (
        <Button variant="quiet" type="button" onClick={() => setRetry((value) => value + 1)}>
          تلاش دوباره با گوگل
        </Button>
      )}
      <div className="auth-method-divider">
        <span>یا با ایمیل</span>
      </div>
    </div>
  );
}
