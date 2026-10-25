import { requestApi } from '../../api/client';

export type Access = {
  hasAccess: boolean;
  hasFullAccess: boolean;
  accessLevel?: 'full' | 'sample' | 'locked';
  allowed_card_ids?: string[];
  total_cards?: number;
};
export type LessonLink = {
  id: string;
  title: string;
  objective: string;
  free_sample: boolean;
  access?: Access;
};
export type Stage = {
  id: string;
  title: string;
  order: number;
  color_token: string;
  lessons: LessonLink[];
  review_id?: string;
  review_access?: Access;
};
export type Course = {
  id: string;
  title: string;
  version: string;
  revision: string;
  path_id: string;
  stages: Stage[];
  final_review_id?: string;
  recommended_prerequisites?: string;
  access?: Access;
  final_review_access?: Access;
};
export type Catalog = {
  version: string;
  paths: {
    id: string;
    title: string;
    course_ids: string[];
    recommended_order?: string[];
    access?: Access;
  }[];
  courses: Course[];
  counts: Record<string, number>;
  production_ready: boolean;
  release_followups: Record<string, unknown>;
};
export type Card = {
  id: string;
  title: string;
  text: string;
  type?: string;
  elements?: string[];
  table?: { columns: string[]; rows: (string | number)[][] };
  source_url?: string;
  alt?: string;
};
export type Question = {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  origin_question_id?: string;
  equivalence_group?: string;
  remediation_card_id?: string;
  remediation_lesson_id?: string;
  remediation_scope?: string;
};
export type Media = {
  asset_ref: string;
  mobile_asset_ref?: string;
  desktop_width_px?: number;
  caption?: string;
  alt_text?: string;
  long_description?: string;
  source_url?: string;
};
export type ReferenceVisual = {
  id: string;
  title: string;
  kind: 'publisher_original' | 'standard_redraw' | 'original_educational' | 'source_link';
  asset_ref?: string;
  download_ref?: string;
  alt_text?: string;
  caption: string;
  creator: string;
  source_url: string;
  license?: string;
  license_url?: string;
  changes?: string;
  locator: string;
  card_id: string;
};
export type Unit = {
  access?: Access;
  reference_visuals?: ReferenceVisual[];
  reference_visual_revision?: string;
  glossary?: { term: string; definition: string }[];
  scenario_unit?: string;
  id: string;
  title: string;
  kind: 'lesson' | 'stage_review' | 'final_review';
  course_id: string;
  course_title: string;
  stage_id?: string;
  revision: string;
  objective?: string;
  learning_cards: Card[];
  questions: Question[];
  reuses_existing_questions?: boolean;
  practice_activity?: { type: string; prompt: string; unit?: string; expected_output?: string };
  media_plan?: { display_on_card_id: string; assets: Media[] };
  source_links?: { id: string; title: string; url: string; scope?: string; access_note?: string }[];
  source_note?: string;
  content_notice?: string;
  reflection_prompt?: string;
  prerequisites_suggested?: string[];
  selected_source_refs?: {
    source_id: string;
    url?: string;
    locator?: string;
    gap?: string;
    supports_scope?: string;
  }[];
};
export type Result = {
  correct: boolean | null;
  explanation?: string;
  feedback?: string;
  solution?: string;
  rubric?: string[];
  correct_option_id?: string;
  self_review_required?: boolean;
  origin_question_id?: string;
  equivalence_group?: string;
  independent_assessment?: false;
};
export type ResponseRecord = {
  answer: string;
  result: Result;
  attempts: number;
  first_correct: boolean | null;
};
export type Progress = {
  unit_id: string;
  content_revision: string;
  note: string;
  position: number;
  viewed_cards: string[];
  responses: Record<string, ResponseRecord>;
  activity_response: Partial<ResponseRecord>;
  bookmarked: boolean;
  completed: boolean;
  revision: number;
};
export type LearningState = { user_id: string; units: Record<string, Progress> };
export async function loadContent<T>(id: string, signal?: AbortSignal): Promise<T> {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('این بخش پیدا نشد.');
  return requestApi<T>(
    id === 'catalog' ? '/api/v1/academy/catalog/' : `/api/v1/academy/content/${id}/`,
    { signal },
  );
}
export const learningState = () => requestApi<LearningState>('/api/v1/academy/state/');
export const saveProgress = (
  unit: Unit,
  revision: number,
  data: Partial<Pick<Progress, 'note' | 'position' | 'bookmarked'>> & { card_id?: string },
  expected_user_id: string,
) =>
  requestApi<Progress>(`/api/v1/academy/units/${unit.id}/`, {
    method: 'PATCH',
    body: { ...data, revision, content_revision: unit.revision, expected_user_id },
  });
export const submitAnswer = (
  unit: Unit,
  question_id: string,
  answer: string,
  expected_user_id: string,
) =>
  requestApi<{ result: Result; saved: boolean; progress?: Progress }>(
    `/api/v1/academy/units/${unit.id}/answer/`,
    {
      method: 'POST',
      body: { content_revision: unit.revision, question_id, answer, expected_user_id },
    },
  );
export const faNumber = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
