import { useOutletContext, useParams } from 'react-router';
import { Notice } from '@stratino/ui';
import type { Session } from '../session';
export default function Workspace() {
  const { workspaceId } = useParams();
  const session = useOutletContext<Session>();
  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  if (!workspace)
    return (
      <Notice title="فضای کار در دسترس نیست">
        <p>این پروژه در فهرست پروژه‌های مجاز حساب شما نیست.</p>
      </Notice>
    );
  return (
    <Notice title={workspace.name}>
      <p>
        هویت و مسیر پروژه تأیید شد. ابزارهای سروری این فضا در تسک‌های بعد منتقل می‌شوند؛ نسخه نمونه
        همچنان مستقل است.
      </p>
    </Notice>
  );
}
