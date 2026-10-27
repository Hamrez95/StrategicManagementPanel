import { useId } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUIAppearance } from '@stratino/ui';
import { requestApi } from '../../api/client';
import './accountAvatar.css';
const businessLeaderSprite = new URL(
  '../../assets/account/business-leaders-v1.webp',
  import.meta.url,
).href;

export type AvatarSummary = {
  id: string;
  title: string;
  sprite_index: number;
  sprite_sheet?: string;
};
type AvatarCharacter = AvatarSummary & {
  character_name: string;
  leadership_note: string;
  source_url: string;
};
export function AccountAvatar({
  avatar,
  name = '',
  size = 44,
}: {
  avatar?: AvatarSummary | null;
  name?: string;
  size?: number;
}) {
  const index = avatar?.sprite_index;
  const valid = typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 20;
  return (
    <span
      className={`account-avatar${valid ? ' account-avatar--illustrated' : ''}${valid && avatar?.sprite_sheet === 'business-leaders-v1' ? ' account-avatar--business-leader' : ''}`}
      aria-hidden="true"
      style={
        {
          '--avatar-size': `${size}px`,
          ...(valid
            ? {
                backgroundPosition: `${(index % 5) * 25}% ${3.125 + Math.floor(index / 5) * 31.25}%`,
                ...(avatar?.sprite_sheet === 'business-leaders-v1'
                  ? { backgroundImage: `url("${businessLeaderSprite}")` }
                  : {}),
              }
            : {}),
        } as CSSProperties
      }
    >
      {!valid && (Array.from(name.trim())[0] || 'S')}
    </span>
  );
}

export function useAccountAvatars() {
  return useQuery({
    queryKey: ['account', 'avatar-catalog'],
    queryFn: ({ signal }) =>
      requestApi<{ avatars: AvatarCharacter[] }>('/api/v1/account/avatars/?v=3', { signal }),
    staleTime: 300000,
  });
}
export function AvatarPicker({
  value,
  onChange,
  disabled = false,
  error = '',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  const name = useId();
  const english = useUIAppearance().dir === 'ltr';
  const t = (fa: string, en: string) => (english ? en : fa);
  const query = useAccountAvatars();
  const selected = query.data?.avatars.find((avatar) => avatar.id === value);
  return (
    <fieldset
      className="avatar-picker"
      disabled={disabled}
      aria-describedby={error ? `${name}-error` : undefined}
    >
      <legend>
        {t('آواتارت رو انتخاب کن', 'Choose your avatar')} <span>{t('اختیاری', 'Optional')}</span>
      </legend>
      <p>
        {t(
          'از کدوم مدیر الهام می‌گیری؟ آواتار کارتونی‌اش رو انتخاب کن؛ هر وقت خواستی می‌تونی عوضش کنی.',
          'Which leader inspires you? Choose their cartoon avatar; you can change it whenever you like.',
        )}
      </p>
      {query.isPending && (
        <p role="status">{t('داریم آواتارها رو آماده می‌کنیم…', 'Loading avatars…')}</p>
      )}
      {query.isError && (
        <div role="alert">
          <p>{t('آواتارها بارگذاری نشدن.', 'Could not load avatars.')}</p>
          <button type="button" className="avatar-retry" onClick={() => void query.refetch()}>
            {t('تلاش دوباره', 'Try again')}
          </button>
        </div>
      )}
      {query.data && (
        <>
          <div className="avatar-picker-grid">
            {query.data.avatars.map((avatar) => (
              <label key={avatar.id} className="avatar-choice" title={avatar.character_name}>
                <input
                  type="radio"
                  name={name}
                  value={avatar.id}
                  checked={value === avatar.id}
                  onChange={() => onChange(avatar.id)}
                  aria-label={avatar.character_name}
                />
                <span className="avatar-choice-portrait">
                  <AccountAvatar avatar={avatar} size={56} />
                  <span className="avatar-choice-check" aria-hidden="true">
                    ✓
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="avatar-character-stage" aria-live="polite" aria-atomic="true">
            {selected && (
              <div className="avatar-character" key={selected.id}>
                <div className="avatar-character-orbit" aria-hidden="true">
                  <AccountAvatar avatar={selected} size={76} />
                  <span>✦</span>
                </div>
                <div>
                  <strong>{selected.character_name}</strong>
                  <span className="avatar-character-role">
                    {t('الهام برای مسیر مدیریت تو', 'Inspiration for your management journey')}
                  </span>
                  <p>{selected.leadership_note}</p>
                  {selected.source_url && (
                    <a
                      className="avatar-character-source"
                      href={selected.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('دربارهٔ', 'About')} {selected.character_name}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          <label className="avatar-use-initial">
            <input type="radio" name={name} checked={!value} onChange={() => onChange(null)} />
            {t('فعلاً حرف اول اسمم رو نشون بده', 'Use my initial for now')}
          </label>
        </>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="avatar-picker-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
