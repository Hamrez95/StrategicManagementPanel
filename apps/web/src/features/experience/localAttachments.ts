export type LocalAttachment = {
  id: string;
  scope: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  file: File;
};
const STORE = 'attachments';
const MAX_SIZE = 20 * 1024 * 1024;
export const ACCEPTED_FILES = '.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stratino-design-attachments-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('scope', 'scope');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('ذخیرهٔ فایل در این مرورگر در دسترس نیست.'));
    request.onblocked = () =>
      reject(new Error('یک تب دیگر مانع بازشدن ذخیرهٔ فایل است؛ آن را ببند و دوباره تلاش کن.'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () =>
        reject(new Error('ذخیرهٔ فایل انجام نشد؛ فضای مرورگر یا مجوز ذخیره‌سازی را بررسی کن.'));
      tx.onabort = () => reject(new Error('عملیات فایل متوقف شد؛ دوباره تلاش کن.'));
    });
  } finally {
    db.close();
  }
}
export async function listAttachments(
  workspaceId: string,
  documentId: string,
): Promise<LocalAttachment[]> {
  const files = await transaction<LocalAttachment[]>('readonly', (store) =>
    store.index('scope').getAll(JSON.stringify([workspaceId, documentId])),
  );
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function addAttachment(
  workspaceId: string,
  documentId: string,
  file: File,
): Promise<void> {
  const extension = `.${file.name.split('.').at(-1)?.toLowerCase()}`;
  if (!ACCEPTED_FILES.split(',').includes(extension))
    throw new Error(
      'این نوع فایل پشتیبانی نمی‌شود. PDF، فایل Office جدید، متن، CSV یا تصویر انتخاب کن.',
    );
  if (file.size > MAX_SIZE || file.size === 0)
    throw new Error('فایل باید غیرخالی و حداکثر ۲۰ مگابایت باشد.');
  const stored = await listAttachments(workspaceId, documentId);
  if (stored.length >= 10)
    throw new Error('در نسخهٔ محلی حداکثر ۱۰ فایل برای هر مستند نگه می‌داریم.');
  await transaction('readwrite', (store) =>
    store.add({
      id: crypto.randomUUID(),
      scope: JSON.stringify([workspaceId, documentId]),
      name: file.name,
      size: file.size,
      type: file.type,
      createdAt: new Date().toISOString(),
      file,
    } satisfies LocalAttachment),
  );
}
export async function removeAttachment(
  workspaceId: string,
  documentId: string,
  id: string,
): Promise<void> {
  const owned = (await listAttachments(workspaceId, documentId)).find((f) => f.id === id);
  if (!owned) throw new Error('فایل در این فضای کار پیدا نشد.');
  await transaction('readwrite', (store) => store.delete(id));
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
