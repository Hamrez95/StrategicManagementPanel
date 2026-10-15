import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiDocumentAttachment } from '../../api/contracts';
import { Button, EmptyState } from '@stratino/ui';
import {
  deleteDocumentAttachment,
  documentAttachmentDownloadUrl,
  readDocumentAttachments,
  reserveDocumentAttachment,
  retryDocumentAttachmentScan,
  uploadDocumentAttachment,
} from './api';

type UploadState = 'queued' | 'uploading' | 'scanning' | 'done' | 'failed' | 'canceled';
type UploadItem = {
  id: string;
  requestId: string;
  file: File;
  state: UploadState;
  progress: number;
  attachmentId?: string;
  error?: string;
};

type Props = {
  workspaceId: string;
  document: ApiDocumentAttachment['document_id'];
  canWrite: boolean;
  english: boolean;
};

const fileSize = (bytes: number, locale: string) => {
  if (bytes === 0) return `0 ${locale.startsWith('fa') ? 'بایت' : 'bytes'}`;
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat(locale).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
};

const attachmentQueryKey = (workspaceId: string, recordId: string) =>
  ['workspace', workspaceId, 'document', recordId, 'attachments'] as const;

export default function DocumentAttachmentsPanel({
  workspaceId,
  document,
  canWrite,
  english,
}: Props) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [confirmRemoveId, setConfirmRemoveId] = useState('');
  const [actionError, setActionError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const queueRef = useRef<UploadItem[]>([]);
  const running = useRef(false);
  const nextId = useRef(0);

  const attachmentsQuery = useQuery({
    queryKey: attachmentQueryKey(workspaceId, document),
    queryFn: ({ signal }) => readDocumentAttachments(workspaceId, document, signal),
  });
  const attachments = attachmentsQuery.data?.items ?? [];

  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
      queueRef.current = queueRef.current.map((item) =>
        item.state === 'queued' ? { ...item, state: 'canceled' } : item,
      );
    },
    [document],
  );

  function updateItem(id: string, changes: Partial<UploadItem>) {
    queueRef.current = queueRef.current.map((item) =>
      item.id === id ? { ...item, ...changes } : item,
    );
    setQueue(queueRef.current);
  }

  async function processItem(item: UploadItem) {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    let attachmentId = item.attachmentId;
    let requestId = item.requestId;
    try {
      let reservation = await reserveDocumentAttachment(
        workspaceId,
        document,
        item.file,
        requestId,
        controller.signal,
      );
      attachmentId = reservation.id;
      if (reservation.status === 'ready') {
        updateItem(item.id, { state: 'done', progress: 100, attachmentId });
        await queryClient.invalidateQueries({
          queryKey: attachmentQueryKey(workspaceId, document),
        });
        return;
      }
      if (reservation.status === 'quarantined') {
        const scanned = await retryDocumentAttachmentScan(workspaceId, document, attachmentId);
        updateItem(item.id, {
          state: scanned.status === 'ready' ? 'done' : 'scanning',
          progress: 100,
          attachmentId,
        });
        await queryClient.invalidateQueries({
          queryKey: attachmentQueryKey(workspaceId, document),
        });
        return;
      }
      if (['uploading', 'cancel_requested', 'rejected'].includes(reservation.status)) {
        await deleteDocumentAttachment(workspaceId, document, attachmentId);
        requestId = crypto.randomUUID();
        updateItem(item.id, { requestId, attachmentId: undefined });
        reservation = await reserveDocumentAttachment(
          workspaceId,
          document,
          item.file,
          requestId,
          controller.signal,
        );
        attachmentId = reservation.id;
      }
      updateItem(item.id, { state: 'uploading', progress: 0, attachmentId, error: undefined });
      const result = await uploadDocumentAttachment(
        workspaceId,
        document,
        attachmentId,
        item.file,
        {
          signal: controller.signal,
          onProgress: (loaded, total) =>
            updateItem(item.id, { progress: Math.min(99, Math.round((loaded / total) * 100)) }),
        },
      );
      updateItem(item.id, {
        state: result.status === 'quarantined' ? 'scanning' : 'done',
        progress: 100,
        attachmentId,
      });
      await queryClient.invalidateQueries({ queryKey: attachmentQueryKey(workspaceId, document) });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        try {
          const reservation = await reserveDocumentAttachment(
            workspaceId,
            document,
            item.file,
            requestId,
          );
          attachmentId = reservation.id;
        } catch {
          // The reservation may expire cleanly if the connection is unavailable.
        }
        if (attachmentId)
          await deleteDocumentAttachment(workspaceId, document, attachmentId).catch(
            () => undefined,
          );
        updateItem(item.id, { state: 'canceled', attachmentId });
      } else {
        updateItem(item.id, {
          state: 'failed',
          attachmentId,
          error:
            error instanceof Error
              ? error.message
              : english
                ? 'Upload failed.'
                : 'بارگذاری انجام نشد.',
        });
      }
      await queryClient.invalidateQueries({ queryKey: attachmentQueryKey(workspaceId, document) });
    } finally {
      controllers.current.delete(item.id);
    }
  }

  async function runQueue() {
    if (running.current) return;
    running.current = true;
    try {
      while (true) {
        const next = queueRef.current.find((item) => item.state === 'queued');
        if (!next) break;
        updateItem(next.id, { state: 'uploading', error: undefined });
        await processItem(next);
      }
    } finally {
      running.current = false;
    }
  }

  function enqueue(files: FileList | File[]) {
    if (!canWrite) return;
    const incoming = Array.from(files).map((file) => ({
      id: `${Date.now()}-${nextId.current++}`,
      requestId: crypto.randomUUID(),
      file,
      state: 'queued' as const,
      progress: 0,
    }));
    queueRef.current = [...queueRef.current, ...incoming];
    setQueue(queueRef.current);
    void runQueue();
  }

  function retry(item: UploadItem) {
    updateItem(item.id, { state: 'queued', progress: 0, error: undefined });
    void runQueue();
  }

  function cancel(item: UploadItem) {
    if (item.state === 'uploading') {
      controllers.current.get(item.id)?.abort();
    } else {
      if (item.attachmentId)
        void deleteDocumentAttachment(workspaceId, document, item.attachmentId);
      updateItem(item.id, { state: 'canceled' });
    }
  }

  async function removeAttachment(item: ApiDocumentAttachment) {
    try {
      await deleteDocumentAttachment(workspaceId, document, item.id);
      setConfirmRemoveId('');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: attachmentQueryKey(workspaceId, document) });
    } catch (error) {
      setConfirmRemoveId('');
      setActionError(
        error instanceof Error
          ? error.message
          : english
            ? 'File could not be removed.'
            : 'حذف فایل انجام نشد.',
      );
    }
  }

  async function scanAgain(item: ApiDocumentAttachment) {
    try {
      await retryDocumentAttachmentScan(workspaceId, document, item.id);
      await queryClient.invalidateQueries({ queryKey: attachmentQueryKey(workspaceId, document) });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : english
            ? 'Security scan is still unavailable.'
            : 'اسکن امنیتی هنوز در دسترس نیست.',
      );
    }
  }

  const locale = english ? 'en-US' : 'fa-IR';
  const copy = english
    ? {
        title: 'Files attached to this document',
        intro:
          'Files stay private until the security scan passes. PDF, Office, text, CSV, PNG, JPG and WebP are accepted.',
        choose: 'Choose files',
        drop: 'Or drop files here',
        empty: 'No files have been attached yet.',
        loading: 'Loading attached files…',
        loadError: 'Attached files could not be loaded.',
        retryLoad: 'Try again',
        download: 'Download',
        scan: 'Retry security scan',
        delete: 'Remove file',
        confirm: 'Remove this file and its stored versions?',
        confirmYes: 'Remove permanently',
        confirmNo: 'Keep file',
        ready: 'Scanned and available',
        quarantined: 'Waiting for security scan',
        reserved: 'Upload reserved',
        uploading: 'Uploading',
        cancel_requested: 'Canceling upload',
        scanning: 'Waiting for security scan',
        rejected: 'Rejected by security checks',
        queued: 'Waiting to upload',
        done: 'Uploaded and scanned',
        failed: 'Upload failed',
        canceled: 'Canceled',
        cancel: 'Cancel',
        retryUpload: 'Retry upload',
        noRecord: 'Save this document to the Workspace before attaching files.',
        readonly: 'You can download files, but only Workspace editors can add or remove them.',
        removeError: 'The file could not be removed.',
      }
    : {
        title: 'فایل‌های پیوست این مدرک',
        intro:
          'فایل‌ها تا پایان موفق بررسی امنیتی خصوصی می‌مانند. PDF، Office، متن، CSV، PNG، JPG و WebP پذیرفته می‌شود.',
        choose: 'انتخاب فایل‌ها',
        drop: 'یا فایل‌ها را اینجا رها کنید',
        empty: 'هنوز فایلی به این مدرک پیوست نشده است.',
        loading: 'در حال بارگیری فایل‌های پیوست…',
        loadError: 'بارگیری فایل‌های پیوست انجام نشد.',
        retryLoad: 'تلاش دوباره',
        download: 'دریافت فایل',
        scan: 'تلاش دوباره برای اسکن',
        delete: 'حذف فایل',
        confirm: 'این فایل و نسخه‌های ذخیره‌شده آن حذف شود؟',
        confirmYes: 'حذف نهایی',
        confirmNo: 'نگه‌داشتن فایل',
        ready: 'اسکن شده و آماده دریافت',
        quarantined: 'در انتظار بررسی امنیتی',
        reserved: 'رزرو بارگذاری',
        uploading: 'در حال بارگذاری',
        cancel_requested: 'در حال لغو بارگذاری',
        scanning: 'در انتظار بررسی امنیتی',
        rejected: 'بررسی امنیتی فایل را نپذیرفت',
        queued: 'در صف بارگذاری',
        done: 'بارگذاری و اسکن انجام شد',
        failed: 'بارگذاری ناموفق بود',
        canceled: 'لغو شد',
        cancel: 'لغو',
        retryUpload: 'تلاش دوباره برای بارگذاری',
        noRecord: 'برای پیوست فایل، ابتدا این مدرک را در فضای کار ثبت کنید.',
        readonly:
          'دریافت فایل‌ها برای شما فعال است؛ افزودن یا حذف فایل فقط برای ویرایشگرهای فضا ممکن است.',
        removeError: 'حذف فایل انجام نشد.',
      };

  const statusLabel = (status: ApiDocumentAttachment['status']) =>
    ({
      ready: copy.ready,
      quarantined: copy.quarantined,
      reserved: copy.reserved,
      uploading: copy.uploading,
      cancel_requested: copy.cancel_requested,
      rejected: copy.rejected,
    })[status];

  return (
    <section className="document-attachments" aria-labelledby="document-attachments-title">
      <header className="document-attachments__heading">
        <div>
          <p className="documents-eyebrow">{english ? 'PRIVATE FILES' : 'فایل‌های خصوصی'}</p>
          <h3 id="document-attachments-title">{copy.title}</h3>
          <p>
            {copy.intro}{' '}
            {english
              ? `Maximum ${fileSize(attachmentsQuery.data?.limits.max_file_bytes ?? 20 * 1024 * 1024, locale)} per file.`
              : `سقف هر فایل ${fileSize(attachmentsQuery.data?.limits.max_file_bytes ?? 20 * 1024 * 1024, locale)} است.`}
          </p>
        </div>
      </header>
      {actionError && (
        <p className="document-attachments__error" role="alert">
          {actionError}
        </p>
      )}

      {canWrite ? (
        <div
          className={`document-attachments__drop${dragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            enqueue(event.dataTransfer.files);
          }}
        >
          <input
            ref={fileInput}
            className="document-attachments__input"
            type="file"
            tabIndex={-1}
            multiple
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp"
            aria-label={copy.choose}
            onChange={(event) => {
              if (event.currentTarget.files) enqueue(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          <p>{copy.drop}</p>
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
            {copy.choose}
          </Button>
        </div>
      ) : (
        <p className="document-attachments__readonly">{copy.readonly}</p>
      )}

      {queue.length > 0 && (
        <ul
          className="document-attachments__queue"
          aria-label={english ? 'Upload queue' : 'صف بارگذاری'}
        >
          {queue.map((item) => (
            <li className="document-attachment" key={item.id}>
              <div className="document-attachment__main">
                <strong>{item.file.name}</strong>
                <span>
                  {fileSize(item.file.size, locale)} · {copy[item.state]}
                </span>
                {item.error && <p role="alert">{item.error}</p>}
                {item.state === 'uploading' && (
                  <progress
                    max={100}
                    value={item.progress}
                    aria-label={`${copy.uploading}: ${item.file.name}`}
                  />
                )}
              </div>
              {item.state === 'uploading' || item.state === 'queued' ? (
                <Button type="button" variant="secondary" onClick={() => cancel(item)}>
                  {copy.cancel}
                </Button>
              ) : item.state === 'failed' || item.state === 'canceled' ? (
                <Button type="button" variant="secondary" onClick={() => retry(item)}>
                  {copy.retryUpload}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {attachmentsQuery.isPending ? (
        <p className="document-attachments__state" role="status">
          {copy.loading}
        </p>
      ) : attachmentsQuery.isError ? (
        <div className="document-attachments__state" role="alert">
          <p>
            {attachmentsQuery.error instanceof Error
              ? attachmentsQuery.error.message
              : copy.loadError}
          </p>
          <Button type="button" variant="secondary" onClick={() => void attachmentsQuery.refetch()}>
            {copy.retryLoad}
          </Button>
        </div>
      ) : attachments.length === 0 ? (
        <EmptyState
          title={copy.empty}
          description={
            english
              ? 'Choose one or more files to attach.'
              : 'برای پیوست، یک یا چند فایل انتخاب کنید.'
          }
        />
      ) : (
        <ul className="document-attachments__list">
          {attachments.map((item) => (
            <li className="document-attachment" key={item.id}>
              <div className="document-attachment__main">
                <strong>{item.name}</strong>
                <span>
                  {fileSize(item.size_bytes, locale)} ·{' '}
                  {english
                    ? `Version ${item.version}`
                    : `نسخه ${new Intl.NumberFormat(locale).format(item.version)}`}{' '}
                  · {statusLabel(item.status)}
                </span>
                {item.sha256 && <code dir="ltr">SHA-256 · {item.sha256}</code>}
                {confirmRemoveId === item.id && <p role="status">{copy.confirm}</p>}
              </div>
              <div className="document-attachment__actions">
                {item.status === 'ready' && (
                  <a
                    className="ui-button ui-button--secondary"
                    href={documentAttachmentDownloadUrl(workspaceId, document, item.id)}
                  >
                    {copy.download}
                  </a>
                )}
                {item.status === 'quarantined' && canWrite && (
                  <Button type="button" variant="secondary" onClick={() => void scanAgain(item)}>
                    {copy.scan}
                  </Button>
                )}
                {canWrite &&
                  (confirmRemoveId === item.id ? (
                    <>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => void removeAttachment(item)}
                      >
                        {copy.confirmYes}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setConfirmRemoveId('')}
                      >
                        {copy.confirmNo}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setConfirmRemoveId(item.id)}
                    >
                      {copy.delete}
                    </Button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
