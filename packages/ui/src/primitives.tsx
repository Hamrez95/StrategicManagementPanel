import { createContext, useContext, useId, useRef, useState } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as ToastPrimitive from '@radix-ui/react-toast';

type Direction = 'rtl' | 'ltr';
type Motion = 'auto' | 'reduced';
const Appearance = createContext<{ dir: Direction; motion: Motion }>({
  dir: 'rtl',
  motion: 'auto',
});
const Notifications = createContext<((message: string) => void) | null>(null);

export function UIProvider({
  children,
  dir = 'rtl',
  motion = 'auto',
  notificationLabel = 'اعلان',
  closeLabel = 'بستن اعلان',
}: {
  children: ReactNode;
  dir?: Direction;
  motion?: Motion;
  notificationLabel?: string;
  closeLabel?: string;
}) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const serial = useRef(0);
  const notify = (text: string) => {
    const id = ++serial.current;
    setMessages((items) => [...items.slice(-3), { id, text }]);
  };
  return (
    <Appearance.Provider value={{ dir, motion }}>
      <Notifications.Provider value={notify}>
        <ToastPrimitive.Provider
          label={notificationLabel}
          duration={6000}
          swipeDirection={dir === 'rtl' ? 'left' : 'right'}
        >
          <div className="ui-root" dir={dir} data-motion={motion}>
            {children}
          </div>
          {messages.map(({ id, text }) => (
            <ToastPrimitive.Root
              key={id}
              className="ui-toast"
              dir={dir}
              data-motion={motion}
              onOpenChange={(open) => {
                if (!open) setMessages((items) => items.filter((item) => item.id !== id));
              }}
            >
              <ToastPrimitive.Description>{text}</ToastPrimitive.Description>
              <ToastPrimitive.Close asChild>
                <Button variant="quiet" aria-label={closeLabel}>
                  ×
                </Button>
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          ))}
          <ToastPrimitive.Viewport
            className="ui-toast-viewport"
            label={notificationLabel + ' (F8)'}
          />
        </ToastPrimitive.Provider>
      </Notifications.Provider>
    </Appearance.Provider>
  );
}
export function useUIAppearance() {
  return useContext(Appearance);
}
export function useToast() {
  const notify = useContext(Notifications);
  if (!notify) throw new Error('useToast requires UIProvider');
  return notify;
}
export function Button({
  variant = 'secondary',
  pending = false,
  pendingLabel = 'در حال انجام…',
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ui-button--${variant} ${className}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <>
          <span className="ui-spinner" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const { dir } = useUIAppearance();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const password = props.type === 'password';
  const fieldId = id || generated;
  const described =
    [hint && `${fieldId}-hint`, error && `${fieldId}-error`, props['aria-describedby']]
      .filter(Boolean)
      .join(' ') || undefined;
  const control = (
    <input
      {...props}
      type={password && passwordVisible ? 'text' : props.type}
      id={fieldId}
      className={`ui-input ${className}`}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={described}
    />
  );
  const visibilityLabel = passwordVisible
    ? dir === 'ltr'
      ? 'Hide password'
      : 'پنهان کردن گذرواژه'
    : dir === 'ltr'
      ? 'Show password'
      : 'نمایش گذرواژه';
  return (
    <div className="ui-field">
      <label htmlFor={fieldId}>{label}</label>
      {password ? (
        <div className="ui-password-control">
          {control}
          <button
            type="button"
            className="ui-password-toggle"
            aria-label={visibilityLabel}
            title={visibilityLabel}
            aria-controls={fieldId}
            aria-pressed={passwordVisible}
            disabled={props.disabled}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
              focusable="false"
            >
              {passwordVisible ? (
                <>
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                  <path d="M9.9 5.2A10.7 10.7 0 0112 5c5.2 0 8.6 4.8 9.5 6.3a1.3 1.3 0 010 1.4 13 13 0 01-3.2 3.5M6.2 6.2A14 14 0 002.5 11.3a1.3 1.3 0 000 1.4C3.4 14.2 6.8 19 12 19a10.5 10.5 0 004-.8" />
                </>
              ) : (
                <>
                  <path d="M2.5 12s3.4-7 9.5-7 9.5 7 9.5 7-3.4 7-9.5 7-9.5-7-9.5-7z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        </div>
      ) : (
        control
      )}
      {hint && (
        <p id={`${fieldId}-hint`} className="ui-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="ui-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Table({
  caption,
  columns,
  rows,
  rowKey,
  scrollLabel,
}: {
  caption: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, ReactNode>[];
  rowKey: string;
  scrollLabel: string;
}) {
  return (
    <div className="ui-table-scroll" tabIndex={0} role="region" aria-label={scrollLabel}>
      <table className="ui-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[rowKey])}>
              {columns.map((c, i) =>
                i === 0 ? (
                  <th key={c.key} scope="row">
                    {row[c.key]}
                  </th>
                ) : (
                  <td key={c.key} className={c.numeric ? 'ui-numeric' : undefined}>
                    {row[c.key]}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Dialog({
  trigger,
  title,
  description,
  children,
  closeLabel = 'بستن',
  open,
  onOpenChange,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  closeLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const appearance = useContext(Appearance);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog-overlay" data-motion={appearance.motion} />
        <DialogPrimitive.Content
          className="ui-dialog"
          dir={appearance.dir}
          data-motion={appearance.motion}
        >
          <div className="ui-dialog-heading">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="quiet" aria-label={closeLabel}>
                ×
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="ui-dialog-description">
            {description}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Tabs({
  label,
  items,
  defaultValue,
}: {
  label: string;
  items: { value: string; label: string; content: ReactNode; disabled?: boolean }[];
  defaultValue?: string;
}) {
  const { dir } = useContext(Appearance);
  return (
    <TabsPrimitive.Root
      className="ui-tabs"
      dir={dir}
      defaultValue={defaultValue || items[0]?.value}
    >
      <TabsPrimitive.List className="ui-tab-list" aria-label={label}>
        {items.map((item) => (
          <TabsPrimitive.Trigger
            className="ui-tab"
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content className="ui-tab-panel" key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div className="ui-skeleton" role="status" aria-label={label}>
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: Math.max(1, Math.min(lines, 8)) }, (_, i) => (
        <span key={i} className="ui-skeleton-line" aria-hidden="true" />
      ))}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="ui-empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
