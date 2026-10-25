import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@stratino/ui';
import { requestApi } from '../api/client';
import { AuthFrame } from '../features/auth/AuthPages';
import { GoogleSignIn } from '../features/auth/GoogleSignIn';

export default function OperatorLogin() {
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestApi('/api/v1/operator/login/', { method: 'POST', body: { email, password } });
      queries.clear();
      navigate('/internal', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return (
    <AuthFrame
      title="ورود به مدیریت استراتینو"
      description="با حساب تأییدشدهٔ مدیریت وارد شو. دسترسی به اطلاعات، بعد از تأیید دومرحله‌ای باز می‌شه."
      step="account"
    >
      <GoogleSignIn />
      <form className="auth-form" onSubmit={submit}>
        <Input
          label="ایمیل مدیر"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="گذرواژه"
          type="password"
          required
          maxLength={1024}
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <Button type="submit" variant="primary" pending={busy} pendingLabel="داریم بررسی می‌کنیم…">
          ورود به مدیریت
        </Button>
        <Link to="/account/reset-password?next=%2Finternal">گذرواژه‌ات رو فراموش کردی؟</Link>
        <Link to="/">برگشت به سایت</Link>
      </form>
    </AuthFrame>
  );
}
