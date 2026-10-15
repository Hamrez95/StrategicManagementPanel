import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';
import { Button, Input } from '@stratino/ui';
import { AuthApiError, firstFieldError, postAuth, type AuthFields } from './api';

function AuthFrame({
  title,
  description,
  step,
  children,
}: {
  title: string;
  description: string;
  step: 'account' | 'confirm' | 'recover';
  children: ReactNode;
}) {
  const steps = [
    { id: 'account', title: 'حساب', number: '۱' },
    { id: 'confirm', title: 'تأیید ایمیل', number: '۲' },
    { id: 'recover', title: 'بازیابی', number: '۳' },
  ];
  return (
    <section className="auth-shell" aria-labelledby="auth-title">
      <aside className="auth-context" aria-label="مراحل امن‌سازی حساب">
        <span className="auth-context__eyebrow">حساب استراتینو</span>
        <h2>کارهای مهمتان را در فضای کار خود ادامه دهید.</h2>
        <p>
          با حساب تأییدشده، تصمیم‌ها و برنامه‌های هر پروژه در فضای اختصاصی شما نگهداری می‌شوند.
        </p>
        <ol className="auth-steps">
          {steps.map((item) => (
            <li key={item.id} aria-current={step === item.id ? 'step' : undefined}>
              <span aria-hidden="true">{item.number}</span>
              {item.title}
            </li>
          ))}
        </ol>
        <Link to="/demo" className="auth-context__link">
          پیش از ورود، نسخه نمونه را ببینید
        </Link>
      </aside>
      <div className="auth-panel">
        <div className="auth-panel__heading">
          <p className="auth-kicker">فضای امن کار شما</p>
          <h1 id="auth-title" tabIndex={-1}>
            {title}
          </h1>
          <p>{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password-field">
      <Input
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        autoComplete={autoComplete}
        dir="ltr"
        autoCapitalize="none"
        spellCheck={false}
        required
        className="auth-password-input"
      />
      <Button
        variant="quiet"
        className="auth-password-toggle"
        aria-label={visible ? 'پنهان کردن گذرواژه' : 'نمایش گذرواژه'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? 'پنهان' : 'نمایش'}
      </Button>
    </div>
  );
}

function FormMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p className={`auth-message${error ? ' auth-message--error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

function useFormErrors() {
  const [fields, setFields] = useState<AuthFields>({});
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const clear = useCallback((field?: string) => {
    setMessage('');
    setFailed(false);
    if (field) setFields((current) => ({ ...current, [field]: [] }));
    else setFields({});
  }, []);
  const capture = useCallback((error: unknown, fallback: string) => {
    if (error instanceof AuthApiError) {
      setFields(error.fields);
      setMessage(error.message || fallback);
    } else {
      setFields({});
      setMessage(fallback);
    }
    setFailed(true);
  }, []);
  return { fields, message, failed, clear, capture, setFields, setMessage, setFailed };
}

function EmailField({
  email,
  setEmail,
  error,
}: {
  email: string;
  setEmail: (value: string) => void;
  error?: string;
}) {
  return (
    <Input
      label="نشانی ایمیل"
      type="email"
      value={email}
      onChange={(event) => setEmail(event.target.value)}
      error={error}
      autoComplete="email"
      inputMode="email"
      dir="ltr"
      autoCapitalize="none"
      spellCheck={false}
      required
      maxLength={254}
      className="auth-email-input"
    />
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const errors = useFormErrors();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.clear();
    setPending(true);
    try {
      await postAuth('/api/v1/accounts/login/', { email, password });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      const next = new URLSearchParams(location.search).get('next');
      const safeNext = next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/app/start';
      navigate(safeNext, { replace: true });
    } catch (error) {
      errors.capture(error, 'ورود انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame title="ورود به حساب" description="با ایمیل تأییدشده وارد فضای کار خود شوید." step="account">
      <form className="auth-form" onSubmit={submit} noValidate>
        <EmailField email={email} setEmail={(value) => { setEmail(value); errors.clear('email'); }} error={firstFieldError(errors.fields, 'email')} />
        <PasswordField label="گذرواژه" value={password} onChange={(value) => { setPassword(value); errors.clear('password'); }} error={firstFieldError(errors.fields, 'password')} autoComplete="current-password" />
        {errors.message && <FormMessage error={errors.failed}>{errors.message}</FormMessage>}
        <div className="auth-form__meta">
          <Link to="/account/reset-password">گذرواژه را فراموش کرده‌اید؟</Link>
        </div>
        <Button type="submit" variant="primary" pending={pending} pendingLabel="در حال ورود…" className="auth-submit">
          ورود به فضای کار
        </Button>
        <p className="auth-switch">
          حساب ندارید؟ <Link to="/account/signup">ثبت‌نام کنید</Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const errors = useFormErrors();
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.clear();
    if (password.length < 12) {
      errors.setFields({ password: ['گذرواژه باید دست‌کم ۱۲ نویسه باشد.'] });
      return;
    }
    if (password !== confirmation) {
      errors.setFields({ confirmation: ['دو گذرواژه یکسان نیستند.'] });
      return;
    }
    setPending(true);
    try {
      await postAuth('/api/v1/accounts/signup/', { email, password });
      navigate('/account/verify', { replace: true, state: { email, sent: true } });
    } catch (error) {
      errors.capture(error, 'ثبت‌نام انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame title="ساخت حساب" description="برای شروع فقط ایمیل و یک گذرواژه امن لازم است." step="account">
      <form className="auth-form" onSubmit={submit} noValidate>
        <EmailField email={email} setEmail={(value) => { setEmail(value); errors.clear('email'); }} error={firstFieldError(errors.fields, 'email')} />
        <PasswordField label="گذرواژه" value={password} onChange={(value) => { setPassword(value); errors.clear('password'); }} error={firstFieldError(errors.fields, 'password')} autoComplete="new-password" />
        <p className="auth-field-hint">دست‌کم ۱۲ نویسه انتخاب کنید؛ اطلاعات ورود در این مرورگر ذخیره نمی‌شود.</p>
        <PasswordField label="تکرار گذرواژه" value={confirmation} onChange={(value) => { setConfirmation(value); errors.clear('confirmation'); }} error={firstFieldError(errors.fields, 'confirmation')} autoComplete="new-password" />
        {errors.message && <FormMessage error={errors.failed}>{errors.message}</FormMessage>}
        <Button type="submit" variant="primary" pending={pending} pendingLabel="در حال ساخت حساب…" className="auth-submit">
          ساخت حساب و ارسال پیوند تأیید
        </Button>
        <p className="auth-switch">
          قبلاً ثبت‌نام کرده‌اید؟ <Link to="/account/login">وارد شوید</Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function VerifyEmailPage() {
  const location = useLocation();
  const locationState = location.state as { email?: string; sent?: boolean } | null;
  const [email, setEmail] = useState(locationState?.email ?? '');
  const [result, setResult] = useState<'idle' | 'checking' | 'sent' | 'verified' | 'invalid'>(
    locationState?.sent ? 'sent' : 'idle',
  );
  const [pending, setPending] = useState(false);
  const errors = useFormErrors();
  const captureError = errors.capture;
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    if (!token) return;
    handled.current = true;
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setResult('checking');
    void postAuth('/api/v1/accounts/verify-email/', { token })
      .then(() => setResult('verified'))
      .catch((error: unknown) => {
        setResult('invalid');
        captureError(error, 'پیوند تأیید باز نشد. نشانی را بررسی یا پیوند تازه‌ای درخواست کنید.');
      });
  }, [captureError, location.hash]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.clear();
    setPending(true);
    try {
      const response = await postAuth<{ message: string }>('/api/v1/accounts/resend-verification/', { email });
      errors.setMessage(response.message);
      errors.setFailed(false);
      setResult('sent');
    } catch (error) {
      errors.capture(error, 'ارسال پیوند انجام نشد. اتصال را بررسی و دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame title={result === 'verified' ? 'ایمیل تأیید شد' : 'تأیید نشانی ایمیل'} description="این مرحله کمک می‌کند دسترسی به حساب فقط در اختیار صاحب ایمیل باشد." step="confirm">
      {result === 'checking' && <FormMessage>در حال بررسی پیوند تأیید…</FormMessage>}
      {result === 'verified' ? (
        <div className="auth-form">
          <FormMessage>نشانی ایمیل تأیید شد. حالا می‌توانید وارد شوید.</FormMessage>
          <Link className="ui-button ui-button--primary auth-submit" to="/account/login">ورود به حساب</Link>
        </div>
      ) : (
        <>
          {result === 'sent' && !errors.message && <FormMessage>اگر این ایمیل به حساب تأییدنشده‌ای وصل باشد، پیوند تازه‌ای برای آن فرستادیم.</FormMessage>}
          {result === 'invalid' && errors.message && <FormMessage error>{errors.message}</FormMessage>}
          <form className="auth-form" onSubmit={resend} noValidate>
            <EmailField email={email} setEmail={(value) => { setEmail(value); errors.clear('email'); }} error={firstFieldError(errors.fields, 'email')} />
            {errors.message && result !== 'invalid' && <FormMessage error={errors.failed}>{errors.message}</FormMessage>}
            <Button type="submit" variant="primary" pending={pending} pendingLabel="در حال ارسال…" className="auth-submit">
              ارسال دوباره پیوند تأیید
            </Button>
            <p className="auth-switch"><Link to="/account/login">بازگشت به ورود</Link></p>
          </form>
        </>
      )}
    </AuthFrame>
  );
}

export function PasswordResetPage() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [uid, setUid] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mode, setMode] = useState<'request' | 'confirm' | 'sent' | 'done' | 'invalid'>('request');
  const [pending, setPending] = useState(false);
  const errors = useFormErrors();
  const setFailed = errors.setFailed;
  const setMessage = errors.setMessage;
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const nextToken = fragment.get('token') ?? '';
    const nextUid = fragment.get('uid') ?? '';
    if (!nextToken && !nextUid) return;
    handled.current = true;
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    if (!nextToken || !nextUid) {
      setMode('invalid');
      setMessage('پیوند بازیابی کامل نیست. یک پیوند تازه درخواست کنید.');
      setFailed(true);
      return;
    }
    setToken(nextToken);
    setUid(nextUid);
    setMode('confirm');
  }, [location.hash, setFailed, setMessage]);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.clear();
    setPending(true);
    try {
      const response = await postAuth<{ message: string }>('/api/v1/accounts/password-reset/request/', { email });
      errors.setMessage(response.message);
      errors.setFailed(false);
      setMode('sent');
    } catch (error) {
      errors.capture(error, 'درخواست بازیابی انجام نشد. اتصال را بررسی و دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    errors.clear();
    if (password.length < 12) {
      errors.setFields({ password: ['گذرواژه باید دست‌کم ۱۲ نویسه باشد.'] });
      return;
    }
    if (password !== confirmation) {
      errors.setFields({ confirmation: ['دو گذرواژه یکسان نیستند.'] });
      return;
    }
    setPending(true);
    try {
      const response = await postAuth<{ message: string }>('/api/v1/accounts/password-reset/confirm/', { uid, token, password });
      setToken('');
      setUid('');
      setPassword('');
      setConfirmation('');
      errors.setMessage(response.message);
      errors.setFailed(false);
      setMode('done');
    } catch (error) {
      errors.capture(error, 'بازیابی انجام نشد. پیوند را بررسی یا یک پیوند تازه درخواست کنید.');
      if (error instanceof AuthApiError && error.code === 'invalid_token') {
        setToken('');
        setUid('');
        setMode('invalid');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame title={mode === 'confirm' ? 'گذرواژه تازه' : mode === 'done' ? 'گذرواژه ذخیره شد' : 'بازیابی گذرواژه'} description="پیوند بازیابی یک‌بارمصرف است و پس از یک ساعت منقضی می‌شود." step="recover">
      {mode === 'sent' || mode === 'done' ? (
        <div className="auth-form">
          <FormMessage>{errors.message}</FormMessage>
          <Link className="ui-button ui-button--primary auth-submit" to="/account/login">رفتن به ورود</Link>
        </div>
      ) : mode === 'confirm' ? (
        <form className="auth-form" onSubmit={confirmReset} noValidate>
          <PasswordField label="گذرواژه تازه" value={password} onChange={(value) => { setPassword(value); errors.clear('password'); }} error={firstFieldError(errors.fields, 'password')} autoComplete="new-password" />
          <p className="auth-field-hint">دست‌کم ۱۲ نویسه انتخاب کنید. با ذخیره گذرواژه، نشست‌های قبلی باطل می‌شوند.</p>
          <PasswordField label="تکرار گذرواژه تازه" value={confirmation} onChange={(value) => { setConfirmation(value); errors.clear('confirmation'); }} error={firstFieldError(errors.fields, 'confirmation')} autoComplete="new-password" />
          {errors.message && <FormMessage error={errors.failed}>{errors.message}</FormMessage>}
          <Button type="submit" variant="primary" pending={pending} pendingLabel="در حال ذخیره…" className="auth-submit">ذخیره گذرواژه تازه</Button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={requestReset} noValidate>
          {mode === 'invalid' && errors.message && <FormMessage error>{errors.message}</FormMessage>}
          <EmailField email={email} setEmail={(value) => { setEmail(value); errors.clear('email'); }} error={firstFieldError(errors.fields, 'email')} />
          {mode !== 'invalid' && errors.message && <FormMessage error={errors.failed}>{errors.message}</FormMessage>}
          <Button type="submit" variant="primary" pending={pending} pendingLabel="در حال ارسال…" className="auth-submit">ارسال پیوند بازیابی</Button>
          <p className="auth-switch"><Link to="/account/login">بازگشت به ورود</Link></p>
        </form>
      )}
    </AuthFrame>
  );
}
