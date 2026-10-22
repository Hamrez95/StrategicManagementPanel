import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import './learningImage.css';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
type Point = { x: number; y: number };
type View = Point & { scale: number };
const initialView: View = { x: 0, y: 0, scale: 1 };

export function LearningImage({
  src,
  mobileSrc,
  alt,
}: {
  src: string;
  mobileSrc?: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(initialView);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ points: Point[]; view: View }>({ points: [], view: initialView });
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    element.showModal();
    const previous = document.body.style.overflow;
    const activePointers = pointers.current;
    const opener = trigger.current;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previous;
      activePointers.clear();
      opener?.focus();
    };
  }, [open]);
  function rebase() {
    gesture.current = { points: [...pointers.current.values()], view };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = [...pointers.current.values()];
    const start = gesture.current;
    if (current.length !== start.points.length || !current.length) return;
    const midpoint = (points: Point[]) => ({
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    });
    const a = midpoint(start.points),
      b = midpoint(current);
    const distance = (points: Point[]) =>
      Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const scale =
      current.length === 2
        ? clamp((start.view.scale * distance(current)) / Math.max(1, distance(start.points)), 1, 5)
        : start.view.scale;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = scale / start.view.scale;
    setView({
      scale,
      x:
        scale === 1
          ? 0
          : clamp(
              b.x - a.x + start.view.x * ratio + (a.x - rect.left - rect.width / 2) * (1 - ratio),
              (-rect.width * (scale - 1)) / 2,
              (rect.width * (scale - 1)) / 2,
            ),
      y:
        scale === 1
          ? 0
          : clamp(
              b.y - a.y + start.view.y * ratio + (a.y - rect.top - rect.height / 2) * (1 - ratio),
              (-rect.height * (scale - 1)) / 2,
              (rect.height * (scale - 1)) / 2,
            ),
    });
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    rebase();
  }
  return (
    <>
      <button
        ref={trigger}
        className="learning-image-preview"
        type="button"
        aria-label={`بزرگ‌نمایی: ${alt}`}
        onClick={() => {
          setView(initialView);
          setOpen(true);
        }}
      >
        <picture>
          {mobileSrc && <source media="(max-width: 600px)" srcSet={mobileSrc} />}
          <img src={src} alt={alt} loading="lazy" />
        </picture>
        <span>برای بزرگ‌نمایی، تصویر رو لمس کن</span>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="learning-image-dialog"
          aria-label="نمای بزرگ تصویر"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <div className="learning-image-toolbar">
            <button type="button" onClick={() => setOpen(false)} autoFocus>
              بستن
            </button>
            <button
              type="button"
              aria-label="کوچک‌نمایی"
              disabled={view.scale <= 1}
              onClick={() =>
                setView((v) => ({ ...initialView, scale: clamp(v.scale - 0.5, 1, 5) }))
              }
            >
              −
            </button>
            <button type="button" onClick={() => setView(initialView)}>
              اندازهٔ اولیه
            </button>
            <button
              type="button"
              aria-label="بزرگ‌نمایی"
              disabled={view.scale >= 5}
              onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale + 0.5, 1, 5) }))}
            >
              +
            </button>
          </div>
          <p>با دو انگشت زوم کن؛ برای جابه‌جایی، تصویر رو بکش.</p>
          <div
            className="learning-image-viewport"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              rebase();
            }}
            onPointerMove={move}
            onPointerUp={release}
            onPointerCancel={release}
            onDoubleClick={() =>
              setView(view.scale > 1 ? initialView : { ...initialView, scale: 2 })
            }
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            />
          </div>
        </dialog>
      )}
    </>
  );
}
