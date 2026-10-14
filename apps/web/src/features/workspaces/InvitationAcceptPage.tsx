import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Notice, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import { AuthApiError } from '../auth/api';
import { readSession } from '../../session';
import { acceptWorkspaceInvitation } from './api';

export default function InvitationAcceptPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const session = useQuery({ queryKey: queryKeys.session, queryFn: () => readSession() });
  const tokenRef = useRef<string | null>(null);
  const acceptStarted = useRef(false);
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (tokenRef.current === null) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      tokenRef.current = fragment.get('token') ?? '';
      setToken(tokenRef.current);
    }
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    if (!token || !session.data || acceptStarted.current) return;
    acceptStarted.current = true;
    setPending(true);
    setError('');
    void acceptWorkspaceInvitation(token)
      .then(async ({ workspace }) => {
        setMessage(english ? 'Invitation accepted. Your Workspace is ready.' : 'دعوت پذیرفته شد. فضای کار آماده است.');
        await queryClient.invalidateQueries({ queryKey: queryKeys.session });
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        navigate(`/app/workspaces/${encodeURIComponent(workspace.id)}`, { replace: true });
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof AuthApiError
            ? reason.message
            : english
              ? 'The invitation could not be accepted. Check your connection and try again.'
              : 'پذیرفتن دعوت انجام نشد. اتصال را بررسی و دوباره تلاش کنید.',
        );
        acceptStarted.current = false;
      })
      .finally(() => setPending(false));
  }, [attempt, english, navigate, queryClient, session.data, token]);

  if (session.isPending) {
    return (
      <Notice title={english ? 'Checking your account' : 'در حال بررسی حساب'}>
        <p role="status">{english ? 'Checking your account before accepting the invitation.' : 'برای پذیرش دعوت، دسترسی حساب بررسی می‌شود.'}</p>
      </Notice>
    );
  }
  if (session.isError) {
    return (
      <Notice title={english ? 'Invitation could not be loaded' : 'دعوت بارگذاری نشد'}>
        <p role="alert">{english ? 'Could not connect to the account service.' : 'اتصال به سرویس حساب برقرار نشد.'}</p>
        <Button onClick={() => void session.refetch()}>{english ? 'Try again' : 'تلاش دوباره'}</Button>
      </Notice>
    );
  }
  if (!session.data) {
    return (
      <Notice title={english ? 'Sign in to accept this invitation' : 'برای پذیرش دعوت وارد حساب شوید'}>
        <p>{english ? 'Sign in with the email address that received the invitation, then reopen the invitation link from your email.' : 'با همان ایمیلی که دعوت به آن فرستاده شده وارد شوید، سپس پیوند ایمیل را دوباره باز کنید.'}</p>
        <Link className="text-link" to="/account/login?next=%2Fapp%2Fworkspaces">
          {english ? 'Sign in' : 'ورود به حساب'}
        </Link>
      </Notice>
    );
  }
  if (!token) {
    return (
      <Notice title={english ? 'Invitation link not found' : 'پیوند دعوت پیدا نشد'}>
        <p>{english ? 'Open the full invitation link from your email. If it has expired, ask the Workspace owner to send a new one.' : 'پیوند کامل دعوت را از ایمیل باز کنید. اگر منقضی شده است، از مالک فضا دعوت تازه بخواهید.'}</p>
        <Link className="text-link" to="/app/workspaces">{english ? 'Your Workspaces' : 'رفتن به فضاهای من'}</Link>
      </Notice>
    );
  }
  return (
    <Notice title={pending
      ? (english ? 'Accepting invitation' : 'در حال پذیرش دعوت')
      : error
        ? (english ? 'Invitation was not accepted' : 'پذیرش دعوت انجام نشد')
        : (english ? 'Ready to join' : 'آماده پیوستن')}>
      {pending && <p role="status">{english ? 'Adding your access to the Workspace.' : 'دسترسی به فضای کار در حال ثبت است.'}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {error && <>
        <Button onClick={() => { acceptStarted.current = false; setError(''); setAttempt((value) => value + 1); }}>{english ? 'Try again' : 'تلاش دوباره'}</Button>
        <p>{english ? 'If another account is signed in, switch accounts, then reopen the link from your email.' : 'اگر حساب دیگری وارد شده، حساب را عوض کنید و پیوند را دوباره از ایمیل باز کنید.'}</p>
        {session.data && <Link className="text-link" to="/app/workspaces">{english ? 'Go to Workspaces to sign out' : 'برای خروج از حساب به فضاهای من بروید'}</Link>}
      </>}
    </Notice>
  );
}
