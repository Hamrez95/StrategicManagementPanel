/** Preview-only practice contracts. Official attempts/entitlements require ACA-008/009/011 server. */
export type AcademyQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; text: string }[];
  correctChoiceId: string;
  explanation: string;
};
export type AcademyLesson = {
  id: string;
  version: number;
  title: string;
  objective: string;
  prerequisites: string[];
  sourceRefs: string[];
  reviewStatus: 'draft' | 'reviewed';
  questions: AcademyQuestion[];
};
export type PracticeAttempt = {
  lessonId: string;
  version: number;
  answers: Record<string, string>;
};
export type PracticeState = { schemaVersion: 1; attempts: PracticeAttempt[] };
export const emptyPractice = (): PracticeState => ({ schemaVersion: 1, attempts: [] });
/** Product hypothesis, not a scientifically calibrated mastery threshold. */
export const PRACTICE_PASS_PERCENT = 80;

export function validateAcademyLessons(lessons: readonly AcademyLesson[]): void {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  if (byId.size !== lessons.length) throw new Error('Duplicate lesson ID');
  for (const lesson of lessons) {
    if (
      !lesson.id ||
      !Number.isInteger(lesson.version) ||
      lesson.version < 1 ||
      !lesson.questions.length ||
      !lesson.sourceRefs.length
    )
      throw new Error('Invalid lesson contract');
    if (new Set(lesson.questions.map((question) => question.id)).size !== lesson.questions.length)
      throw new Error('Duplicate question ID');
    for (const question of lesson.questions) {
      if (
        !question.id ||
        question.choices.length < 2 ||
        new Set(question.choices.map((choice) => choice.id)).size !== question.choices.length ||
        !question.choices.some((choice) => choice.id === question.correctChoiceId)
      )
        throw new Error('Invalid question contract');
    }
    if (
      new Set(lesson.prerequisites).size !== lesson.prerequisites.length ||
      lesson.prerequisites.some((id) => !byId.has(id))
    )
      throw new Error('Unknown or duplicate prerequisite');
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error('Cyclic prerequisite');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of byId.get(id)!.prerequisites) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const lesson of lessons) visit(lesson.id);
}

export function gradePractice(lesson: AcademyLesson, answers: Record<string, string>) {
  const valid =
    Object.keys(answers).length === lesson.questions.length &&
    lesson.questions.every(
      (question) =>
        Object.hasOwn(answers, question.id) &&
        question.choices.some((choice) => choice.id === answers[question.id]),
    );
  if (!valid) return { valid: false, correct: 0, percent: 0, passed: false };
  const correct = lesson.questions.filter(
    (question) => answers[question.id] === question.correctChoiceId,
  ).length;
  const percent = (correct / lesson.questions.length) * 100;
  return { valid: true, correct, percent, passed: percent >= PRACTICE_PASS_PERCENT };
}

export function completedPractice(
  lessons: readonly AcademyLesson[],
  state: PracticeState,
): Set<string> {
  // Recompute from answers and current content version; never trust a stored score/completed flag.
  const completed = new Set<string>();
  for (let pass = 0; pass < lessons.length; pass++) {
    for (const lesson of lessons) {
      if (
        lesson.prerequisites.every((id) => completed.has(id)) &&
        state.attempts.some(
          (attempt) =>
            attempt.lessonId === lesson.id &&
            attempt.version === lesson.version &&
            gradePractice(lesson, attempt.answers).passed,
        )
      )
        completed.add(lesson.id);
    }
  }
  return completed;
}

export function lessonAvailability(
  lessonId: string,
  lessons: readonly AcademyLesson[],
  state: PracticeState,
): 'available' | 'completed' | 'locked' | 'missing' {
  const lesson = lessons.find((item) => item.id === lessonId);
  if (!lesson) return 'missing';
  const completed = completedPractice(lessons, state);
  if (completed.has(lessonId)) return 'completed';
  return lesson.prerequisites.every((id) => completed.has(id)) ? 'available' : 'locked';
}

export function recordPractice(
  lesson: AcademyLesson,
  lessons: readonly AcademyLesson[],
  state: PracticeState,
  answers: Record<string, string>,
): PracticeState {
  if (
    ['locked', 'missing'].includes(lessonAvailability(lesson.id, lessons, state)) ||
    !gradePractice(lesson, answers).valid
  )
    throw new Error('Invalid or locked attempt');
  // Store only successful attempts; retry never removes earlier practice completion.
  if (!gradePractice(lesson, answers).passed) return state;
  return {
    schemaVersion: 1,
    attempts: [
      ...state.attempts.filter((attempt) => attempt.lessonId !== lesson.id),
      { lessonId: lesson.id, version: lesson.version, answers: { ...answers } },
    ],
  };
}

export function parsePractice(raw: string | null): { state: PracticeState; invalid: boolean } {
  if (raw === null) return { state: emptyPractice(), invalid: false };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error();
    const candidate = value as Record<string, unknown>;
    if (
      candidate.schemaVersion !== 1 ||
      !Array.isArray(candidate.attempts) ||
      candidate.attempts.length > 500
    )
      throw new Error();
    const attempts = candidate.attempts.map((item: unknown): PracticeAttempt => {
      if (!item || typeof item !== 'object') throw new Error();
      const attempt = item as Record<string, unknown>;
      if (
        typeof attempt.lessonId !== 'string' ||
        typeof attempt.version !== 'number' ||
        !Number.isInteger(attempt.version) ||
        !attempt.answers ||
        typeof attempt.answers !== 'object' ||
        Array.isArray(attempt.answers) ||
        Object.values(attempt.answers).some((answer) => typeof answer !== 'string')
      )
        throw new Error();
      return {
        lessonId: attempt.lessonId,
        version: attempt.version,
        answers: attempt.answers as Record<string, string>,
      };
    });
    return { state: { schemaVersion: 1, attempts }, invalid: false };
  } catch {
    return { state: emptyPractice(), invalid: true };
  }
}
