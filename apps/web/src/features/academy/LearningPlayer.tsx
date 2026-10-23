import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@stratino/ui';
import { AcademyMascot } from './AcademyMascot';
import { CelebrationBurst } from './AcademyMotion';
import {
  ContentCard,
  ContentText,
  LearningMedia,
  Worksheet,
  StructuredWorksheet,
} from './ContentCard';
import { academyCopy as copy } from './academyMessages';
import { faNumber } from './connectedData';
import { LessonFeedback } from './LessonFeedback';
import { AcademyAccessGate } from './AcademyAccess';
import type { Course, Progress, Question, Result, Unit } from './connectedData';

export type LearningActions = {
  userId: string;
  progress: Record<string, Progress>;
  authenticated: boolean;
  save: (
    unit: Unit,
    data: Partial<Pick<Progress, 'note' | 'position' | 'bookmarked'>> & { card_id?: string },
  ) => Promise<void>;
  answer: (unit: Unit, id: string, value: string) => Promise<Result>;
};

function Assessment({
  unit,
  question,
  learning,
  onEditing,
}: {
  unit: Unit;
  question?: Question;
  learning: LearningActions;
  onEditing: (dirty: boolean) => void;
}) {
  const activity = !question ? unit.practice_activity : undefined;
  const id = question?.id ?? 'activity';
  const record = question
    ? learning.progress[unit.id]?.responses[id]
    : learning.progress[unit.id]?.activity_response;
  const [value, setValue] = useState(record?.answer ?? '');
  const [result, setResult] = useState<Result | undefined>(record?.result);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function check() {
    setBusy(true);
    setError('');
    try {
      setResult(await learning.answer(unit, id, value));
      onEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="learning-card learning-assessment" data-question-id={id}>
      {question?.origin_question_id && (
        <p className="learning-reuse">
          {copy.reused} · <bdi dir="ltr">{question.origin_question_id}</bdi>
        </p>
      )}
      <h2>
        <ContentText text={question?.prompt ?? activity?.prompt ?? ''} />
      </h2>
      {activity?.expected_output && (
        <p>
          <ContentText text={activity.expected_output} />
        </p>
      )}
      {question ? (
        <fieldset disabled={busy || Boolean(result)}>
          <legend className="sr-only">جوابت رو انتخاب کن</legend>
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`learning-option${result && result.correct_option_id === option.id ? ' learning-option--correct' : ''}`}
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={value === option.id}
                onChange={() => {
                  setValue(option.id);
                  onEditing(true);
                }}
              />
              <ContentText text={option.text} />
            </label>
          ))}
        </fieldset>
      ) : activity?.type === 'numeric' ? (
        <label>
          جوابت به {activity.unit ?? 'واحد خواسته‌شده'}
          <input
            className="learning-number"
            inputMode="decimal"
            dir="ltr"
            value={value}
            disabled={busy || Boolean(result)}
            onChange={(event) => {
              setValue(event.target.value);
              onEditing(true);
            }}
          />
        </label>
      ) : /BMC|بوم مدل کسب‌وکار/.test(activity?.prompt ?? '') ? (
        <StructuredWorksheet
          kind="bmc"
          initial={value}
          onChange={(next) => {
            setValue(next);
            setResult(undefined);
            onEditing(true);
          }}
        />
      ) : /EFE|IFE/.test(activity?.prompt ?? '') ? (
        <StructuredWorksheet
          kind="matrix"
          initial={value}
          onChange={(next) => {
            setValue(next);
            setResult(undefined);
            onEditing(true);
          }}
        />
      ) : (
        <Worksheet
          initial={value}
          onChange={(next) => {
            setValue(next);
            setResult(undefined);
            onEditing(true);
          }}
        />
      )}
      {!result && (
        <Button disabled={!value.trim() || busy} onClick={() => void check()}>
          {busy
            ? 'داریم بررسی می‌کنیم…'
            : activity && activity.type !== 'numeric'
              ? 'ثبت پاسخ و دیدن معیارها'
              : copy.check}
        </Button>
      )}
      {error && (
        <p role="alert" className="academy-warning">
          {error}
        </p>
      )}
      {result && (
        <div
          className={`learning-feedback${result.correct === true ? ' learning-feedback--correct' : ''}`}
          role="status"
          aria-live="polite"
        >
          {result.correct === true && <CelebrationBurst small />}
          <strong>
            {result.correct === null
              ? copy.openReview
              : result.correct
                ? copy.correct
                : copy.incorrect}
          </strong>
          {result.feedback && (
            <p>
              <ContentText text={result.feedback} />
            </p>
          )}
          {result.explanation && result.explanation !== result.feedback && (
            <p>
              <ContentText text={result.explanation} />
            </p>
          )}
          {result.solution && (
            <p>
              <ContentText text={result.solution} />
            </p>
          )}
          {result.rubric && (
            <ul>
              {result.rubric.map((line, index) => (
                <li key={index}>
                  <ContentText text={line} />
                </li>
              ))}
            </ul>
          )}
          {result.correct !== null && (
            <Button
              variant="quiet"
              onClick={() => {
                setResult(undefined);
                setValue('');
                onEditing(true);
              }}
            >
              {result.correct ? 'تمرین دوباره' : copy.retry}
            </Button>
          )}
          {question && (question.remediation_lesson_id || question.remediation_card_id) && (
            <Link
              className="text-link"
              to={`/academy/lesson/${question.remediation_lesson_id ?? unit.id}?card=${encodeURIComponent(question.remediation_card_id ?? '')}`}
            >
              آموزش مرتبط رو دوباره ببین
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export function LearningPlayer({
  unit,
  course,
  learning,
}: {
  unit: Unit;
  course: Course;
  learning: LearningActions;
}) {
  const [search] = useSearchParams();
  const cardTarget = unit.learning_cards.findIndex((card) => card.id === search.get('card'));
  const row = learning.progress[unit.id];
  const cards = unit.learning_cards.length;
  const activityStep = cards + unit.questions.length;
  const lastStep = activityStep + (unit.practice_activity ? 1 : 0);
  const questionTarget = unit.questions.findIndex(
    (question) => question.id === search.get('question'),
  );
  const requestedStep =
    cardTarget >= 0
      ? cardTarget
      : questionTarget >= 0
        ? cards + questionTarget
        : search.get('step') === 'activity' && unit.practice_activity
          ? activityStep
          : search.get('step') === 'summary'
            ? lastStep
            : -1;
  const [step, setStep] = useState(
    Math.min(lastStep, requestedStep >= 0 ? requestedStep : (row?.position ?? 0)),
  );
  const [note, setNote] = useState(row?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [activityDirty, setActivityDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [bookmarkMessage, setBookmarkMessage] = useState('');
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const card = unit.learning_cards[step];
  const question = unit.questions[step - cards];
  const response = question ? row?.responses[question.id] : row?.activity_response;
  const canContinue =
    !activityDirty &&
    Boolean(card || response?.result?.correct === true || response?.result?.correct === null);
  const lessons = course.stages.flatMap((stage) => stage.lessons);
  const next = lessons[lessons.findIndex((lesson) => lesson.id === unit.id) + 1];
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);
  useEffect(() => {
    if (requestedStep >= 0) setStep(requestedStep);
  }, [requestedStep]);
  useEffect(() => {
    if (!bookmarkMessage) return;
    const timer = window.setTimeout(() => setBookmarkMessage(''), 2000);
    return () => window.clearTimeout(timer);
  }, [bookmarkMessage]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (note !== (row?.note ?? '')) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [note, row?.note]);
  async function move(position: number) {
    setBusy(true);
    setError('');
    try {
      await learning.save(unit, {
        position,
        ...(card ? { card_id: card.id } : {}),
        ...(learning.authenticated ? { note } : {}),
      });
      setStep(position);
      setActivityDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveNote() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await learning.save(unit, { note });
      setMessage(copy.saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleBookmark() {
    setBusy(true);
    setError('');
    setBookmarkMessage('');
    try {
      await learning.save(unit, { bookmarked: !row?.bookmarked });
      setBookmarkMessage(
        row?.bookmarked ? 'از ذخیره‌ها برداشته شد.' : 'به درس‌های ذخیره‌شده اضافه شد.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="academy-lesson learning-player">
      <Link className="academy-back" to={`/academy?course=${course.id}`}>
        بازگشت به مسیر درس
      </Link>
      <div className="learning-player-heading">
        <div>
          <p className="academy-muted">{unit.course_title}</p>
          <h1 ref={heading} tabIndex={-1}>
            {unit.title}
          </h1>
        </div>
        <div className="learning-bookmark">
          {learning.authenticated ? (
            <Button
              variant="quiet"
              className="learning-bookmark-icon"
              aria-label={row?.bookmarked ? 'حذف از ذخیره‌ها' : 'ذخیره برای بعد'}
              title={row?.bookmarked ? 'حذف از ذخیره‌ها' : 'ذخیره برای بعد'}
              disabled={busy}
              aria-pressed={Boolean(row?.bookmarked)}
              onClick={() => void toggleBookmark()}
            >
              <svg
                viewBox="0 0 24 24"
                fill={row?.bookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M6 3h12v18l-6-4-6 4Z" />
              </svg>
            </Button>
          ) : (
            <Link
              className="learning-bookmark-icon"
              aria-label="برای ذخیرهٔ درس، وارد حسابت شو"
              title="برای ذخیرهٔ درس، وارد حسابت شو"
              to={`/account/login?next=${encodeURIComponent(`/academy/lesson/${unit.id}${card ? `?card=${card.id}` : ''}`)}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M6 3h12v18l-6-4-6 4Z" />
              </svg>
            </Link>
          )}
        </div>
      </div>
      {!unit.access?.hasFullAccess && (
        <p className="academy-access-label">
          نمونهٔ رایگان · {faNumber(cards)} از {faNumber(unit.access?.total_cards ?? cards)} کارت
          آموزشی
        </p>
      )}
      <progress
        aria-label={unit.access?.hasFullAccess ? 'پیشرفت این بخش' : 'پیشرفت نمونهٔ رایگان'}
        max={lastStep}
        value={step}
      />
      {bookmarkMessage && (
        <div className="academy-toast" role="status">
          {bookmarkMessage}
        </div>
      )}
      <p className="academy-muted">
        {step < cards
          ? `کارت ${faNumber(step + 1)} از ${faNumber(cards)}`
          : step < activityStep
            ? `پرسش ${faNumber(step - cards + 1)} از ${faNumber(unit.questions.length)}`
            : step < lastStep
              ? 'فعالیت این درس‌نامه'
              : 'جمع‌بندی تمرین'}
      </p>
      {unit.objective && step === 0 && (
        <p className="learning-objective">
          <ContentText text={unit.objective} />
        </p>
      )}
      {step === 0 && unit.prerequisites_suggested?.length ? (
        <details className="learning-sources">
          <summary>پیش‌نیاز پیشنهادی</summary>
          <ul>
            {unit.prerequisites_suggested.map((line, index) => (
              <li key={index}>
                <ContentText text={line} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {unit.kind !== 'lesson' && <p className="learning-notice">{copy.independentNotice}</p>}
      {unit.reuses_existing_questions && (
        <p className="learning-reuse">این مرور از سؤال‌های قبلی استفاده می‌کنه.</p>
      )}
      {card ? (
        <ContentCard key={card.id} card={card} unit={unit} />
      ) : !unit.access?.hasFullAccess ? (
        <AcademyAccessGate title={unit.title} sample courseId={unit.course_id} />
      ) : step < lastStep ? (
        <Assessment
          onEditing={setActivityDirty}
          key={question?.id ?? 'activity'}
          unit={unit}
          question={question}
          learning={learning}
        />
      ) : (
        <div className="learning-card learning-finish">
          <AcademyMascot mood="celebration" />
          {row?.completed && <CelebrationBurst />}
          <h2>{row?.completed ? 'این بخش رو تمرین کردی.' : 'به پایان این بخش رسیدی.'}</h2>
          <div className="learning-actions">
            <Button disabled={busy} onClick={() => void move(0)}>
              مرور دوبارهٔ آموزش
            </Button>
            {cards > 0 && (
              <Button disabled={busy} variant="quiet" onClick={() => void move(cards)}>
                مرور تمرین‌ها
              </Button>
            )}
          </div>
          <p>این نتیجه پیشرفت تمرینی تو رو نشون می‌ده؛ تأیید علمی یا گواهی تسلط نیست.</p>
          {unit.reflection_prompt && (
            <p>
              <ContentText text={unit.reflection_prompt} />
            </p>
          )}
          {next && (
            <Link className="ui-button ui-button--primary" to={`/academy/lesson/${next.id}`}>
              درس‌نامهٔ بعدی
            </Link>
          )}
          <Link className="text-link" to={`/academy?course=${course.id}`}>
            برگشتن به مسیر
          </Link>
        </div>
      )}
      {unit.media_plan?.assets?.length &&
      !unit.learning_cards.some((item) => item.id === unit.media_plan?.display_on_card_id)
        ? unit.media_plan.assets.map((asset) => (
            <LearningMedia key={asset.asset_ref} asset={asset} />
          ))
        : null}
      {step < lastStep && (
        <div className="learning-actions">
          <Button variant="quiet" disabled={!step || busy} onClick={() => void move(step - 1)}>
            {copy.previous}
          </Button>
          <Button disabled={busy || !canContinue} onClick={() => void move(step + 1)}>
            {busy ? 'داریم ذخیره می‌کنیم…' : copy.continue}
          </Button>
        </div>
      )}
      {error && (
        <p className="academy-warning" role="alert">
          {error}
        </p>
      )}
      <details className="learning-notes">
        <summary>{copy.note}</summary>
        <label>
          چیزی که می‌خوای یادت بمونه
          <textarea
            rows={5}
            maxLength={30000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setMessage('');
            }}
          />
        </label>
        <Button disabled={!learning.authenticated || busy} onClick={() => void saveNote()}>
          {copy.saveNote}
        </Button>
        <p role="status">{message}</p>
        {!learning.authenticated && <p>{copy.guest}</p>}
      </details>
      <details className="learning-sources">
        <summary>{copy.sources}</summary>
        {unit.scenario_unit && (
          <p>
            <ContentText text={unit.scenario_unit} />
          </p>
        )}
        {unit.source_note && (
          <p>
            <ContentText text={unit.source_note} />
          </p>
        )}
        {unit.content_notice && (
          <p>
            <ContentText text={unit.content_notice} />
          </p>
        )}
        <ul>
          {unit.source_links?.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                <bdi dir="auto">{source.title}</bdi>
              </a>
              {source.scope && (
                <p>
                  <ContentText text={source.scope} />
                </p>
              )}
              {source.access_note && (
                <p>
                  <ContentText text={source.access_note} />
                </p>
              )}
            </li>
          ))}
        </ul>
        <p>{copy.draft}</p>
        {unit.selected_source_refs?.map((source, index) => (
          <div key={index}>
            {source.supports_scope && (
              <p>
                <ContentText text={source.supports_scope} />
              </p>
            )}
            {source.locator && (
              <p>
                <ContentText text={source.locator} />
              </p>
            )}
            {source.gap && (
              <p>
                <ContentText text={source.gap} />
              </p>
            )}
          </div>
        ))}
      </details>
      {unit.glossary?.length ? (
        <details className="learning-sources">
          <summary>واژه‌نامهٔ این درس‌نامه</summary>
          <dl>
            {unit.glossary.map((entry, index) => (
              <div key={index}>
                <dt>
                  <ContentText text={entry.term} />
                </dt>
                <dd>
                  <ContentText text={entry.definition} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <LessonFeedback
        context={{
          unitId: unit.id,
          revision: unit.revision,
          userId: learning.authenticated ? learning.userId : '',
          kind: card ? 'card' : question ? 'question' : step < lastStep ? 'activity' : 'summary',
          targetId: card?.id ?? question?.id ?? (step < lastStep ? 'activity' : unit.id),
          title:
            card?.title ?? question?.prompt ?? (step < lastStep ? 'فعالیت درس' : 'جمع‌بندی درس'),
        }}
      />
    </section>
  );
}
