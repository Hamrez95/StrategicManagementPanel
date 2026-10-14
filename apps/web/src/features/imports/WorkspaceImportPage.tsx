import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, EmptyState, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import {
  importLegacyBackup,
  listWorkspaceImports,
  previewLegacyBackup,
  readWorkspaceImport,
  undoWorkspaceImport,
  type ImportPreview,
  type WorkspaceImportBatch,
} from '../../api/imports';
import type { Session } from '../../session';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';

const MAX_FILE_BYTES = 1_000_000;

function countLabel(value: number, english: boolean) {
  return new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(value);
}

function localizedWarning(value: string, english: boolean) {
  if (!english) return value;
  if (value.includes('پیوست')) return 'File bytes were not transferred; upload those files again.';
  if (value.includes('آرشیو واردسازی')) return 'The mapped data is saved in this Workspace import archive.';
  return 'The old browser copy remains unchanged.';
}

function ImportBatchCard({
  batch,
  english,
  canUndo,
  onUndo,
  onDownload,
}: {
  batch: WorkspaceImportBatch;
  english: boolean;
  canUndo: boolean;
  onUndo: () => Promise<void>;
  onDownload: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoError, setUndoError] = useState('');
  const dateLocale = english ? 'en-US' : 'fa-IR';
  const undone = Boolean(batch.undone_at);
  return (
    <article className="workspace-import-card">
      <div className="workspace-import-card__heading">
        <div>
          <h3>{english ? `Imported backup · ${batch.source_schema}` : `پشتیبان واردشده · ${batch.source_schema}`}</h3>
          <p>{english ? `Saved ${new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(batch.created_at))}` : `ذخیره‌شده در ${new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(batch.created_at))}`}</p>
        </div>
        <span className={`workspace-import-status${undone ? ' is-undone' : ''}`}>
          {undone ? (english ? 'Undone' : 'بازگردانی‌شده') : (english ? 'Saved snapshot' : 'نسخه پشتیبان ذخیره شد')}
        </span>
      </div>
      <dl className="workspace-import-counts">
        <div><dt>{english ? 'Analysis records' : 'رکوردهای تحلیل'}</dt><dd>{countLabel(batch.record_counts.analysis_records, english)}</dd></div>
        <div><dt>{english ? 'Decisions' : 'تصمیم‌ها'}</dt><dd>{countLabel(batch.record_counts.decision_records, english)}</dd></div>
        <div><dt>{english ? 'Execution records' : 'رکوردهای اجرا'}</dt><dd>{countLabel(batch.record_counts.execution_records, english)}</dd></div>
        <div><dt>{english ? 'File metadata' : 'فراداده مدارک'}</dt><dd>{countLabel(batch.record_counts.file_metadata, english)}</dd></div>
      </dl>
      {batch.missing_attachment_bytes > 0 && (
        <p className="workspace-import-warning" role="note">{english
          ? `${countLabel(batch.missing_attachment_bytes, english)} file(s) need to be uploaded again; only their metadata was saved.`
          : `${countLabel(batch.missing_attachment_bytes, english)} پیوست بایت فایل نداشت و باید دوباره بارگذاری شود.`}</p>
      )}
      <div className="workspace-import-card__actions">
        <Button variant="secondary" onClick={() => void onDownload()}>{english ? 'Download JSON backup' : 'دریافت پشتیبان JSON'}</Button>
        {!undone && canUndo && (
          <Dialog
            closeLabel={english ? 'Close' : 'بستن'}
            trigger={<Button variant="quiet" onClick={() => setConfirmOpen(true)}>{english ? 'Undo import' : 'بازگردانی واردسازی'}</Button>}
            title={english ? 'Undo this import batch?' : 'واردسازی بازگردانی شود؟'}
            description={english ? 'The batch will leave the active Workspace archive. Its saved snapshot remains available for recovery.' : 'این batch از فهرست فعال کنار می‌رود و نسخه ذخیره‌شده برای بازیابی باقی می‌ماند.'}
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
          >
            <div className="workspace-confirm">
              <p>{english ? 'You can re-import the downloaded JSON later.' : 'بعداً می‌توانید فایل JSON را دوباره وارد کنید.'}</p>
              {undoError && <p className="workspace-import-error" role="alert">{undoError}</p>}
              <Button variant="danger" onClick={() => {
                setUndoError('');
                void onUndo().then(() => setConfirmOpen(false)).catch((reason: unknown) => {
                  setUndoError(reason instanceof Error ? reason.message : (english ? 'The batch could not be undone.' : 'بازگردانی batch انجام نشد.'));
                });
              }}>{english ? 'Undo batch' : 'بازگردانی batch'}</Button>
            </div>
          </Dialog>
        )}
      </div>
    </article>
  );
}

export default function WorkspaceImportPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const queryClient = useQueryClient();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const canImport = workspace?.role === 'owner' || workspace?.role === 'editor';
  const [file, setFile] = useState<File | null>(null);
  const [sourceData, setSourceData] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, setPending] = useState<'preview' | 'import' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const importsQuery = useQuery({
    queryKey: queryKeys.workspace.imports(workspaceId),
    queryFn: ({ signal }) => listWorkspaceImports(workspaceId, signal),
    enabled: Boolean(workspace),
  });
  useWorkspaceDirtyGuard(`workspace-import-${workspaceId}`, Boolean(file || preview || pending));

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] ?? null;
    setFile(selected);
    setSourceData(null);
    setPreview(null);
    setError('');
    setNotice('');
  }

  async function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(english ? 'The JSON file is larger than 1 MB.' : 'اندازه فایل JSON بیشتر از یک مگابایت است.');
      return;
    }
    setPending('preview');
    setError('');
    setNotice('');
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await previewLegacyBackup(workspaceId, parsed);
      setSourceData(parsed);
      setPreview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (english ? 'The backup could not be checked.' : 'بررسی فایل پشتیبان انجام نشد.'));
      setSourceData(null);
      setPreview(null);
    } finally {
      setPending('');
    }
  }

  async function confirmImport() {
    if (!preview || sourceData === null || !canImport) return;
    setPending('import');
    setError('');
    setNotice('');
    try {
      const key = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const batch = await importLegacyBackup(workspaceId, sourceData, key);
      setPreview(null);
      setSourceData(null);
      setFile(null);
      setNotice(batch.duplicate
        ? (english ? 'This backup was already imported; the existing batch is shown below.' : 'این فایل قبلاً وارد شده؛ همان batch موجود نمایش داده شد.')
        : (english ? 'The backup was added to this Workspace archive. The old browser copy is unchanged.' : 'پشتیبان به آرشیو همین فضا افزوده شد و نسخه مرورگر قدیمی دست‌نخورده ماند.'));
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.imports(workspaceId) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (english ? 'The backup could not be imported.' : 'واردسازی فایل انجام نشد.'));
    } finally {
      setPending('');
    }
  }

  async function undoBatch(batchId: string) {
    setError('');
    await undoWorkspaceImport(workspaceId, batchId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.imports(workspaceId) });
  }

  async function downloadBatch(batchId: string) {
    try {
      const batch = await readWorkspaceImport(workspaceId, batchId);
      const backupJson = JSON.stringify(batch.source_backup, null, 2);
      if (typeof backupJson !== 'string') throw new Error(english ? 'The saved backup is empty.' : 'پشتیبان ذخیره‌شده خالی است.');
      const blob = new Blob([backupJson], { type: 'application/json;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.hidden = true;
      anchor.href = href;
      anchor.download = `stratino-${workspaceId}-backup-${batch.id}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (english ? 'The backup could not be downloaded.' : 'دریافت فایل پشتیبان انجام نشد.'));
    }
  }

  if (!workspace) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">{english ? 'This Workspace is not in your access list.' : 'این فضا در فهرست دسترسی حساب شما نیست.'}</p>
        <Link className="text-link" to="/app/workspaces">{english ? 'Your Workspaces' : 'فضاهای من'}</Link>
      </Notice>
    );
  }

  return (
    <section className="workspace-import-page" aria-labelledby="workspace-import-title">
      <header className="workspace-import-page__heading">
        <p className="auth-kicker">{english ? 'SAFE DATA TRANSFER' : 'انتقال امن داده'}</p>
        <h1 id="workspace-import-title" tabIndex={-1}>{english ? 'Old browser backup' : 'پشتیبان مرورگر قدیمی'}</h1>
        <p>{english
          ? `Preview the old JSON before adding it to “${workspace.name}”. Import creates a recoverable Workspace archive and never clears the original browser data.`
          : `پیش از افزودن فایل JSON قدیمی به «${workspace.name}» پیش‌نمایش بگیرید. نسخه‌ای بازیافت‌پذیر در آرشیو این فضا ساخته می‌شود و داده مرورگر قدیمی پاک نمی‌شود.`}</p>
      </header>

      {canImport && (
        <section className="workspace-import-panel" aria-labelledby="workspace-import-upload-title">
          <h2 id="workspace-import-upload-title">{english ? 'Choose a JSON backup' : 'انتخاب فایل پشتیبان JSON'}</h2>
          <p>{english ? 'Use a file exported from the old Stratino browser prototype. Maximum size: 1 MB.' : 'فایل خروجی نمونه قدیمی استراتینو را انتخاب کنید. حداکثر اندازه: یک مگابایت.'}</p>
          <form className="workspace-import-form" onSubmit={(event) => void previewFile(event)}>
            <label className="ui-field">
              <span>{english ? 'JSON file' : 'فایل JSON'}</span>
              <input className="ui-input" type="file" accept="application/json,.json" aria-label={english ? 'JSON backup file' : 'فایل پشتیبان JSON'} onChange={chooseFile} />
            </label>
            {file && <p className="workspace-import-file" dir="auto">{file.name} · {countLabel(file.size, english)} {english ? 'bytes' : 'بایت'}</p>}
            <Button type="submit" variant="secondary" pending={pending === 'preview'} disabled={!file}>{english ? 'Preview import' : 'پیش‌نمایش واردسازی'}</Button>
          </form>
          {preview && (
            <section className="workspace-import-preview" aria-labelledby="workspace-import-preview-title">
              <h3 id="workspace-import-preview-title">{english ? `Ready for ${preview.workspace_name}` : `مقصد: ${preview.workspace_name}`}</h3>
              <p>{english
                ? `${countLabel(preview.record_count, english)} records are recognized for this Workspace.`
                : `${countLabel(preview.record_count, english)} رکورد برای این فضای کار شناسایی شد.`}</p>
              <dl className="workspace-import-counts">
                <div><dt>{english ? 'Analysis records' : 'رکوردهای تحلیل'}</dt><dd>{countLabel(preview.record_counts.analysis_records, english)}</dd></div>
                <div><dt>{english ? 'Decisions' : 'تصمیم‌ها'}</dt><dd>{countLabel(preview.record_counts.decision_records, english)}</dd></div>
                <div><dt>{english ? 'Execution records' : 'رکوردهای اجرا'}</dt><dd>{countLabel(preview.record_counts.execution_records, english)}</dd></div>
                <div><dt>{english ? 'Financial periods' : 'دوره‌های مالی'}</dt><dd>{countLabel(preview.record_counts.financial_periods, english)}</dd></div>
                <div><dt>{english ? 'File metadata' : 'فراداده مدارک'}</dt><dd>{countLabel(preview.record_counts.file_metadata, english)}</dd></div>
              </dl>
              {preview.missing_attachment_bytes > 0 && <p className="workspace-import-warning" role="note">{english
                ? `${countLabel(preview.missing_attachment_bytes, english)} attachment(s) have no transferable file bytes and must be uploaded again.`
                : `${countLabel(preview.missing_attachment_bytes, english)} پیوست بایت قابل انتقال ندارد و باید دوباره بارگذاری شود.`}</p>}
              <ul className="workspace-import-warnings">{preview.warnings.map((warning) => <li key={warning}>{localizedWarning(warning, english)}</li>)}</ul>
              <div className="workspace-import-preview__actions">
                <Button variant="primary" pending={pending === 'import'} disabled={pending !== ''} onClick={() => void confirmImport()}>{english ? `Import into ${workspace.name}` : `واردسازی در ${workspace.name}`}</Button>
                <Button variant="quiet" disabled={pending !== ''} onClick={() => { setPreview(null); setSourceData(null); }}>{english ? 'Cancel preview' : 'لغو پیش‌نمایش'}</Button>
              </div>
            </section>
          )}
        </section>
      )}
      {!canImport && <Notice title={english ? 'View-only access' : 'دسترسی فقط برای مشاهده'}><p>{english ? 'Ask a Workspace owner or editor to import a backup.' : 'برای واردسازی پشتیبان از مالک یا ویرایشگر فضا کمک بگیرید.'}</p></Notice>}
      {error && <p className="workspace-import-error" role="alert">{error}</p>}
      {notice && <p className="workspace-import-success" role="status">{notice}</p>}

      <section className="workspace-import-history" aria-labelledby="workspace-import-history-title">
        <div className="workspace-import-history__heading">
          <div><h2 id="workspace-import-history-title">{english ? 'Workspace import archive' : 'آرشیو واردسازی فضا'}</h2><p>{english ? 'Saved backups can be downloaded again or removed from the active archive.' : 'می‌توانید فایل ذخیره‌شده را دوباره دریافت یا از آرشیو فعال بازگردانی کنید.'}</p></div>
          {importsQuery.isError && <Button variant="quiet" onClick={() => void importsQuery.refetch()}>{english ? 'Retry' : 'تلاش دوباره'}</Button>}
        </div>
        {importsQuery.isPending && <Skeleton label={english ? 'Loading import archive' : 'در حال بارگذاری آرشیو' } lines={2} />}
        {importsQuery.isError && <p className="workspace-import-error" role="alert">{importsQuery.error.message}</p>}
        {importsQuery.data?.length === 0 && <EmptyState title={english ? 'No backups imported yet' : 'هنوز پشتیبانی وارد نشده'} description={english ? 'A preview will show counts and missing file bytes before any archive is created.' : 'پیش از ساخت آرشیو، پیش‌نمایش تعداد رکوردها و پیوست‌ها را نشان می‌دهد.'} />}
        {importsQuery.data?.map((batch) => (
          <ImportBatchCard
            key={batch.id}
            batch={batch}
            english={english}
            canUndo={canImport && (workspace.role === 'owner' || batch.created_by_id === session.user.id)}
            onUndo={() => undoBatch(batch.id)}
            onDownload={() => downloadBatch(batch.id)}
          />
        ))}
      </section>
    </section>
  );
}
