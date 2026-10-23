import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { applyAccountPreferences, readDevicePreferences } from '../account/api';

export function AcademyThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const transitioning = useRef(false);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === 'dark'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  async function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (transitioning.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2,
      y = rect.top + rect.height / 2;
    const change = () =>
      applyAccountPreferences({ ...readDevicePreferences(), theme: dark ? 'light' : 'dark' });
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      change();
      return;
    }
    transitioning.current = true;
    try {
      const transition = document.startViewTransition(change);
      await transition.ready;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const animation = document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 550,
          easing: 'cubic-bezier(.22,1,.36,1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
      await animation.finished;
      await transition.finished;
    } catch {
      change();
    } finally {
      transitioning.current = false;
    }
  }
  return (
    <button
      type="button"
      className="academy-theme-switch"
      role="switch"
      aria-checked={dark}
      aria-label="تم تیره"
      title={dark ? 'رفتن به تم روشن' : 'رفتن به تم تیره'}
      onClick={(event) => void toggle(event)}
    >
      <span className="theme-switch-scene" aria-hidden="true">
        <span className="theme-switch-stars">✦ · ✧</span>
        <span className="theme-switch-cloud" aria-hidden="true" />
        <span className="theme-switch-orb" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
    </button>
  );
}
