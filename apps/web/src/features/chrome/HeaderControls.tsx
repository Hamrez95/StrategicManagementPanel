import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import { applyAccountPreferences, readDevicePreferences } from '../account/api';
import './headerControls.css';

// Serialize page snapshots so theme and direction changes cannot interrupt each other.
let changing = false;
async function changeAppearance(kind: 'theme' | 'language', x: number, y: number) {
  if (changing) return;
  const preferences = readDevicePreferences();
  const english = preferences.language === 'en';
  const dark = document.documentElement.dataset.theme === 'dark';
  const next = {
    ...preferences,
    ...(kind === 'theme'
      ? { theme: dark ? ('light' as const) : ('dark' as const) }
      : { language: english ? ('fa' as const) : ('en' as const) }),
  };
  let applied = false;
  const apply = () => {
    if (applied) return;
    applied = true;
    flushSync(() => applyAccountPreferences(next));
  };
  if (
    !document.startViewTransition ||
    preferences.motion === 'reduced' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply();
    return;
  }
  changing = true;
  document.documentElement.dataset.appearanceTransition = kind;
  try {
    const transition = document.startViewTransition(apply);
    await transition.ready;
    if (kind === 'theme') {
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      await document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 550,
          easing: 'cubic-bezier(.22,1,.36,1)',
          pseudoElement: '::view-transition-new(root)',
        },
      ).finished;
    } else {
      const distance = english ? -24 : 24;
      await Promise.all([
        document.documentElement.animate(
          { opacity: [1, 0], transform: ['translateX(0)', `translateX(${-distance}px)`] },
          { duration: 180, fill: 'forwards', pseudoElement: '::view-transition-old(root)' },
        ).finished,
        document.documentElement.animate(
          { opacity: [0, 1], transform: [`translateX(${distance}px)`, 'translateX(0)'] },
          {
            duration: 380,
            easing: 'cubic-bezier(.22,1,.36,1)',
            pseudoElement: '::view-transition-new(root)',
          },
        ).finished,
      ]);
    }
    await transition.finished;
  } catch {
    apply();
  } finally {
    delete document.documentElement.dataset.appearanceTransition;
    changing = false;
  }
}

export function ThemeSwitch() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const [english, setEnglish] = useState(document.documentElement.lang === 'en');
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.dataset.theme === 'dark');
      setEnglish(document.documentElement.lang === 'en');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'lang'],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <button
      type="button"
      className="header-theme-switch"
      role="switch"
      aria-checked={dark}
      aria-label={english ? 'Dark theme' : 'تم تیره'}
      title={
        english
          ? dark
            ? 'Switch to light theme'
            : 'Switch to dark theme'
          : dark
            ? 'رفتن به تم روشن'
            : 'رفتن به تم تیره'
      }
      onClick={(event) => {
        const r = event.currentTarget.getBoundingClientRect();
        void changeAppearance('theme', r.left + r.width / 2, r.top + r.height / 2);
      }}
    >
      <span className="header-theme-scene" aria-hidden="true">
        <span className="header-theme-stars">✦ · ✧</span>
        <span className="header-theme-cloud" />
        <span className="header-theme-orb">
          <i />
          <i />
          <i />
        </span>
      </span>
    </button>
  );
}

export function LanguageSwitch({ english }: { english: boolean }) {
  return (
    <button
      type="button"
      className="header-language-switch"
      aria-label={english ? 'Switch language to Persian' : 'تغییر زبان به انگلیسی'}
      title={english ? 'فارسی' : 'English'}
      onClick={() => void changeAppearance('language', 0, 0)}
    >
      <svg
        className="header-language-globe"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
      </svg>
      <span key={String(english)} lang={english ? 'fa' : 'en'}>
        {english ? 'FA' : 'EN'}
      </span>
    </button>
  );
}

export function AccountEntry({ label }: { label: string }) {
  return (
    <Link className="header-account-entry" aria-label={label} to="/account/login">
      <span className="header-account-emblem" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65">
          <circle cx="12" cy="8" r="3.3" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </svg>
        <i />
      </span>
      <span>{label}</span>
    </Link>
  );
}
