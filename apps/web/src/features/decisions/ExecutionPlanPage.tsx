import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Input, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { ApiError } from '../../api/client';
import {
  type ApiExecutionAction,
  type ApiExecutionActionStatus,
  type ApiExecutionActionWrite,
  type ApiExecutionBoard,
  type ApiExecutionDecision,
  type ApiExecutionSourceKind,
  type ApiExecutionDecisionStatus,
  type ApiExecutionDecisionWrite,
  type ApiExecutionGoal,
  type ApiExecutionGoalStatus,
  type ApiExecutionGoalWrite,
  createExecutionAction,
  createExecutionDecision,
  createExecutionGoal,
  readExecutionBoard,
  updateExecutionAction,
  updateExecutionDecision,
  updateExecutionGoal,
} from './api';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';

const ACTION_LANES: { status: ApiExecutionActionStatus; fa: string; en: string }[] = [
  { status: 'planned', fa: 'برنامه‌ریزی‌شده', en: 'Planned' },
  { status: 'in_progress', fa: 'در حال انجام', en: 'In progress' },
  { status: 'blocked', fa: 'متوقف', en: 'Blocked' },
  { status: 'done', fa: 'انجام‌شده', en: 'Done' },
];
const DECISION_STATUSES: { status: ApiExecutionDecisionStatus; fa: string; en: string }[] = [
  { status: 'proposed', fa: 'پیشنهادی', en: 'Proposed' },
  { status: 'approved', fa: 'پذیرفته‌شده', en: 'Approved' },
  { status: 'rejected', fa: 'ردشده', en: 'Rejected' },
  { status: 'superseded', fa: 'جایگزین‌شده', en: 'Superseded' },
];
const EVENT_FIELDS: Record<string, { fa: string; en: string }> = {
  title: { fa: 'عنوان', en: 'title' },
  rationale: { fa: 'دلیل', en: 'reason' },
  assumptions: { fa: 'فرض‌ها', en: 'assumptions' },
  review_trigger: { fa: 'محرک بازبینی', en: 'review trigger' },
  status: { fa: 'وضعیت', en: 'status' },
  source: { fa: 'منبع', en: 'source' },
  description: { fa: 'شرح', en: 'description' },
  due_on: { fa: 'موعد', en: 'due date' },
  owner_id: { fa: 'مسئول', en: 'owner' },
  goal_id: { fa: 'هدف', en: 'goal' },
  decision_id: { fa: 'تصمیم', en: 'decision' },
};

type DecisionDraft = Omit<ApiExecutionDecisionWrite, 'source_kind' | 'source_id'> & {
  source_kind: ApiExecutionSourceKind | '';
  source_id: string | null;
};
type GoalDraft = ApiExecutionGoalWrite;
type ActionDraft = ApiExecutionActionWrite;

const emptyDecision: DecisionDraft = {
  title: '',
  rationale: '',
  assumptions: '',
  review_trigger: '',
  status: 'proposed',
  source_kind: '',
  source_id: null,
};
const emptyGoal: GoalDraft = { title: '', description: '', due_on: null, status: 'active' };

function dateLabel(value: string | null, english: boolean) {
  if (!value) return english ? 'No date' : 'بدون تاریخ';
  return new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function readText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function TextArea({
  label,
  value,
  required = false,
  rows = 3,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="execution-field">
      <span>{label}</span>
      <textarea
        value={value}
        rows={rows}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function ActionCard({
  action,
  board,
  english,
  editable,
  pending,
  statusBlocked,
  statusDraft,
  onEditChange,
  onStatusChange,
  onStatusSave,
  onEdit,
}: {
  action: ApiExecutionAction;
  board: ApiExecutionBoard;
  english: boolean;
  editable: boolean;
  pending: boolean;
  statusBlocked: boolean;
  statusDraft: ApiExecutionActionStatus;
  onStatusChange: (status: ApiExecutionActionStatus) => void;
  onStatusSave: () => void;
  onEdit: (event: FormEvent<HTMLFormElement>) => void;
  onEditChange: () => void;
}) {
  return (
    <article className={`execution-action${action.overdue ? ' execution-action--overdue' : ''}`}>
      <h4 dir="auto">{action.title}</h4>
      {action.description && <p dir="auto">{action.description}</p>}
      <dl className="execution-action__meta">
        <div>
          <dt>{english ? 'Due' : 'موعد'}</dt>
          <dd>
            {dateLabel(action.due_on, english)}
            {action.overdue && (
              <strong className="execution-overdue">{english ? 'Overdue' : 'عقب‌افتاده'}</strong>
            )}
          </dd>
        </div>
        <div>
          <dt>{english ? 'Owner' : 'مسئول'}</dt>
          <dd dir="auto">{action.owner_name}</dd>
        </div>
        {action.goal_title && (
          <div>
            <dt>{english ? 'Goal' : 'هدف'}</dt>
            <dd dir="auto">{action.goal_title}</dd>
          </div>
        )}
      </dl>
      <p className="execution-action__decision">
        {english ? 'Decision' : 'تصمیم'}: <span dir="auto">{action.decision_title}</span>
      </p>
      {editable ? (
        <div className="execution-action__status-form">
          <label>
            <span>{english ? 'Change status' : 'تغییر وضعیت'}</span>
            <select
              value={statusDraft}
              disabled={statusBlocked}
              onChange={(event) =>
                onStatusChange(event.currentTarget.value as ApiExecutionActionStatus)
              }
            >
              {ACTION_LANES.map((lane) => (
                <option key={lane.status} value={lane.status}>
                  {lane[english ? 'en' : 'fa']}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={pending || statusBlocked || statusDraft === action.status}
            onClick={onStatusSave}
          >
            {english ? 'Save status' : 'ذخیره وضعیت'}
          </Button>
        </div>
      ) : (
        <p className="execution-readonly">{english ? 'Read only' : 'فقط مشاهده'}</p>
      )}
      {editable && (
        <details className="execution-edit">
          <summary>{english ? 'Edit action details' : 'ویرایش جزئیات اقدام'}</summary>
          <form className="execution-form" onSubmit={onEdit} onChange={onEditChange}>
            <Input
              label={english ? 'Action title' : 'عنوان اقدام'}
              name="title"
              defaultValue={action.title}
              maxLength={160}
              required
            />
            <label className="execution-field">
              <span>{english ? 'Description' : 'شرح'}</span>
              <textarea
                name="description"
                defaultValue={action.description}
                maxLength={1000}
                rows={2}
              />
            </label>
            <label className="execution-field">
              <span>{english ? 'Decision' : 'تصمیم'}</span>
              <select name="decision_id" defaultValue={action.decision_id}>
                {board.decisions.map((decision) => (
                  <option key={decision.id} value={decision.id}>
                    {decision.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="execution-field">
              <span>{english ? 'Goal' : 'هدف'}</span>
              <select name="goal_id" defaultValue={action.goal_id ?? ''}>
                <option value="">{english ? 'No linked goal' : 'بدون هدف پیوندخورده'}</option>
                {board.goals
                  .filter((goal) => goal.status === 'active')
                  .map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="execution-field">
              <span>{english ? 'Owner' : 'مسئول'}</span>
              <select name="owner_id" defaultValue={action.owner_id}>
                {!board.members.some((member) => member.id === action.owner_id) && (
                  <option value={action.owner_id}>
                    {action.owner_name} · {english ? 'former member' : 'عضو پیشین'}
                  </option>
                )}
                {board.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label={english ? 'Due date' : 'موعد'}
              name="due_on"
              type="date"
              defaultValue={action.due_on}
              required
            />
            <label className="execution-field">
              <span>{english ? 'Status' : 'وضعیت'}</span>
              <select name="status" defaultValue={statusDraft}>
                {ACTION_LANES.map((lane) => (
                  <option key={lane.status} value={lane.status}>
                    {lane[english ? 'en' : 'fa']}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="submit"
              variant="primary"
              pending={pending}
              pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
            >
              {english ? 'Save action' : 'ذخیره اقدام'}
            </Button>
          </form>
        </details>
      )}
    </article>
  );
}

export default function ExecutionPlanPage({
  focus = 'all',
  intro,
  title,
}: {
  focus?: 'all' | 'decisions' | 'goals';
  intro?: ReactNode;
  title?: string;
}) {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const editable = workspace?.role === 'owner' || workspace?.role === 'editor';
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState('');
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>(emptyDecision);
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(emptyGoal);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [actionDirty, setActionDirty] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, ApiExecutionActionStatus>>(
    {},
  );
  const [decisionStatuses, setDecisionStatuses] = useState<
    Record<string, ApiExecutionDecisionStatus>
  >({});
  const [goalStatuses, setGoalStatuses] = useState<Record<string, ApiExecutionGoalStatus>>({});
  const [dirtyRecords, setDirtyRecords] = useState<Set<string>>(() => new Set());
  const [showAllEvents, setShowAllEvents] = useState(false);

  const boardQuery = useQuery({
    queryKey: queryKeys.workspace.execution(workspaceId),
    queryFn: ({ signal }) => readExecutionBoard(workspaceId, signal),
    enabled: Boolean(workspace),
  });

  const dirty =
    Boolean(
      decisionDraft.title ||
      decisionDraft.rationale ||
      decisionDraft.assumptions ||
      decisionDraft.review_trigger ||
      decisionDraft.source_id,
    ) ||
    Boolean(goalDraft.title || goalDraft.description || goalDraft.due_on) ||
    Boolean(
      actionDraft &&
      (actionDirty || actionDraft.title || actionDraft.description || actionDraft.due_on),
    ) ||
    dirtyRecords.size > 0 ||
    Object.keys(actionStatuses).length > 0 ||
    Object.keys(decisionStatuses).length > 0 ||
    Object.keys(goalStatuses).length > 0;
  useWorkspaceDirtyGuard(`execution-plan-${workspaceId}`, dirty);

  useEffect(() => {
    setDecisionDraft(emptyDecision);
    setGoalDraft(emptyGoal);
    setActionDraft(null);
    setActionDirty(false);
    setActionStatuses({});
    setDecisionStatuses({});
    setGoalStatuses({});
    setDirtyRecords(new Set());
    setFeedback('');
    setSaved('');
  }, [workspaceId]);

  const board = boardQuery.data;
  const actionsByLane = useMemo(() => {
    if (!board) return new Map<ApiExecutionActionStatus, ApiExecutionAction[]>();
    const limit = board.horizon_end;
    return new Map(
      ACTION_LANES.map(({ status }) => [
        status,
        board.actions.filter(
          (action) => action.status === status && (action.overdue || action.due_on <= limit),
        ),
      ]),
    );
  }, [board]);
  const laterActions =
    board?.actions.filter((action) => !action.overdue && action.due_on > board.horizon_end) ?? [];
  const eventList = board?.events.slice(0, showAllEvents ? board.history_limit : 12) ?? [];
  const localeNumber = (value: number) =>
    new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(value);
  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.workspace.execution(workspaceId) });

  async function saveRequest(request: () => Promise<unknown>, successMessage: string) {
    setFeedback('');
    setSaved('');
    setPending(true);
    try {
      await request();
      await invalidate();
      setSaved(successMessage);
      return true;
    } catch (error) {
      setFeedback(
        error instanceof ApiError && error.code === 'revision_conflict'
          ? english
            ? 'Another editor changed this record. The latest version is being loaded.'
            : 'این مورد هم‌زمان تغییر کرده است؛ نسخه تازه بارگیری می‌شود.'
          : error instanceof Error
            ? error.message
            : english
              ? 'The change could not be saved.'
              : 'تغییر ذخیره نشد.',
      );
      if (error instanceof ApiError && error.code === 'revision_conflict') await invalidate();
      return false;
    } finally {
      setPending(false);
    }
  }

  function markDirty(id: string) {
    setDirtyRecords((current) => new Set(current).add(id));
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { source_id, source_kind } = decisionDraft;
    if (!source_id || !source_kind) return;
    const done = await saveRequest(
      () => createExecutionDecision(workspaceId, { ...decisionDraft, source_id, source_kind }),
      english ? 'Decision recorded.' : 'تصمیم ثبت شد.',
    );
    if (done) setDecisionDraft(emptyDecision);
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const done = await saveRequest(
      () => createExecutionGoal(workspaceId, goalDraft),
      english ? 'Goal saved.' : 'هدف ذخیره شد.',
    );
    if (done) setGoalDraft(emptyGoal);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionDraft) return;
    const done = await saveRequest(
      () => createExecutionAction(workspaceId, actionDraft),
      english ? 'Action added to the plan.' : 'اقدام به برنامه اضافه شد.',
    );
    if (done) {
      setActionDraft(null);
      setActionDirty(false);
    }
  }

  function openActionForm(decision: ApiExecutionDecision) {
    setActionDraft({
      decision_id: decision.id,
      goal_id: null,
      owner_id:
        board?.members.find((member) => member.id === session.user.id)?.id ??
        board?.members[0]?.id ??
        '',
      title: '',
      description: '',
      due_on: '',
      status: 'planned',
    });
    setActionDirty(false);
  }

  async function updateDecisionStatus(decision: ApiExecutionDecision) {
    const status = decisionStatuses[decision.id] ?? decision.status;
    const done = await saveRequest(
      () =>
        updateExecutionDecision(workspaceId, decision.id, { revision: decision.revision, status }),
      english ? 'Decision status saved.' : 'وضعیت تصمیم ذخیره شد.',
    );
    if (done)
      setDecisionStatuses((current) => {
        const next = { ...current };
        delete next[decision.id];
        return next;
      });
  }

  async function updateGoalStatus(goal: ApiExecutionGoal) {
    const status = goalStatuses[goal.id] ?? goal.status;
    const done = await saveRequest(
      () => updateExecutionGoal(workspaceId, goal.id, { revision: goal.revision, status }),
      english ? 'Goal status saved.' : 'وضعیت هدف ذخیره شد.',
    );
    if (done)
      setGoalStatuses((current) => {
        const next = { ...current };
        delete next[goal.id];
        return next;
      });
  }

  async function updateActionStatus(action: ApiExecutionAction) {
    const status = actionStatuses[action.id] ?? action.status;
    const done = await saveRequest(
      () => updateExecutionAction(workspaceId, action.id, { revision: action.revision, status }),
      english ? 'Action status saved.' : 'وضعیت اقدام ذخیره شد.',
    );
    if (done)
      setActionStatuses((current) => {
        const next = { ...current };
        delete next[action.id];
        return next;
      });
  }

  async function editDecision(event: FormEvent<HTMLFormElement>, decision: ApiExecutionDecision) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const sourceValue = readText(values, 'source');
    const [source_kind = '', source_id = ''] = sourceValue ? sourceValue.split(':') : [];
    if (!source_id || (source_kind !== 'analysis' && source_kind !== 'strategy_option')) return;
    const body: ApiExecutionDecisionWrite = {
      title: readText(values, 'title'),
      rationale: readText(values, 'rationale'),
      assumptions: readText(values, 'assumptions'),
      review_trigger: readText(values, 'review_trigger'),
      status: readText(values, 'status') as ApiExecutionDecisionStatus,
      source_kind,
      source_id,
    };
    const done = await saveRequest(
      () =>
        updateExecutionDecision(workspaceId, decision.id, { revision: decision.revision, ...body }),
      english ? 'Decision updated.' : 'تصمیم ویرایش شد.',
    );
    if (done)
      setDirtyRecords(
        (current) => new Set([...current].filter((id) => id !== `decision:${decision.id}`)),
      );
  }

  async function editGoal(event: FormEvent<HTMLFormElement>, goal: ApiExecutionGoal) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body: ApiExecutionGoalWrite = {
      title: readText(values, 'title'),
      description: readText(values, 'description'),
      due_on: readText(values, 'due_on') || null,
      status: readText(values, 'status') as ApiExecutionGoalStatus,
    };
    const done = await saveRequest(
      () => updateExecutionGoal(workspaceId, goal.id, { revision: goal.revision, ...body }),
      english ? 'Goal updated.' : 'هدف ویرایش شد.',
    );
    if (done)
      setDirtyRecords((current) => new Set([...current].filter((id) => id !== `goal:${goal.id}`)));
  }

  async function editAction(event: FormEvent<HTMLFormElement>, action: ApiExecutionAction) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body: ApiExecutionActionWrite = {
      decision_id: readText(values, 'decision_id'),
      goal_id: readText(values, 'goal_id') || null,
      owner_id: readText(values, 'owner_id'),
      title: readText(values, 'title'),
      description: readText(values, 'description'),
      due_on: readText(values, 'due_on'),
      status: readText(values, 'status') as ApiExecutionActionStatus,
    };
    const done = await saveRequest(
      () => updateExecutionAction(workspaceId, action.id, { revision: action.revision, ...body }),
      english ? 'Action details saved.' : 'جزئیات اقدام ذخیره شد.',
    );
    if (done)
      setDirtyRecords(
        (current) => new Set([...current].filter((id) => id !== `action:${action.id}`)),
      );
  }

  if (!workspace)
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">
          {english
            ? 'This Workspace is not in your access list.'
            : 'این فضا در فهرست دسترسی حساب شما نیست.'}
        </p>
        <Link className="text-link" to="/app/workspaces">
          {english ? 'Your Workspaces' : 'فضاهای من'}
        </Link>
      </Notice>
    );
  if (boardQuery.isPending)
    return (
      <section className="execution-page">
        <Skeleton
          label={english ? 'Loading execution plan' : 'در حال بارگیری برنامه اجرا'}
          lines={5}
        />
      </section>
    );
  if (boardQuery.isError)
    return (
      <section className="execution-page">
        <Notice title={english ? 'Execution plan could not be loaded' : 'برنامه اجرا بارگیری نشد'}>
          <p role="alert">{boardQuery.error.message}</p>
          <Button onClick={() => void boardQuery.refetch()}>
            {english ? 'Try again' : 'تلاش دوباره'}
          </Button>
        </Notice>
      </section>
    );
  if (!board) return null;

  const dateRange = `${dateLabel(board.today, english)} – ${dateLabel(board.horizon_end, english)}`;
  const canWrite = editable && board.role !== 'viewer';
  const statusText = (status: ApiExecutionDecisionStatus) =>
    DECISION_STATUSES.find((item) => item.status === status)?.[english ? 'en' : 'fa'] ?? status;
  const actionStatusText = (status: ApiExecutionActionStatus) =>
    ACTION_LANES.find((item) => item.status === status)?.[english ? 'en' : 'fa'] ?? status;

  return (
    <section className="execution-page" aria-labelledby="execution-title">
      <header className="execution-heading">
        <div>
          <h1 id="execution-title" tabIndex={-1}>
            {title ??
              (focus === 'decisions'
                ? english
                  ? 'Decisions and hypotheses'
                  : 'تصمیم‌ها و فرضیه‌ها'
                : focus === 'goals'
                  ? english
                    ? 'Goals and performance'
                    : 'اهداف و عملکرد'
                  : english
                    ? 'Decisions into action'
                    : 'از تصمیم تا اقدام')}
          </h1>
          <p>
            {english
              ? 'Keep the reason for a choice beside the work that follows it.'
              : 'دلیل هر انتخاب را کنار کاری نگه دارید که از آن نتیجه می‌شود.'}
          </p>
        </div>
        <div className="execution-horizon" aria-label={english ? 'Next 90 days' : '۹۰ روز پیش رو'}>
          <span>{english ? '90-day plan' : 'برنامه ۹۰ روزه'}</span>
          <strong dir="auto">{dateRange}</strong>
        </div>
      </header>

      {intro}
      {!canWrite && (
        <p className="execution-readonly-note" role="status">
          {english
            ? 'You have view-only access to this Workspace.'
            : 'دسترسی شما به این فضای کار فقط برای مشاهده است.'}
        </p>
      )}
      {feedback && (
        <div className="execution-feedback execution-feedback--error" role="alert">
          <p>{feedback}</p>
          {feedback.toLowerCase().includes('latest') || feedback.includes('نسخه تازه') ? (
            <Button onClick={() => void boardQuery.refetch()}>
              {english ? 'Load latest version' : 'بارگیری نسخه تازه'}
            </Button>
          ) : null}
        </div>
      )}
      {saved && (
        <p className="execution-feedback execution-feedback--success" role="status">
          {saved}
        </p>
      )}

      {focus === 'all' && (
        <section className="execution-board" aria-labelledby="execution-board-title">
          <div className="execution-section-heading">
            <div>
              <h2 id="execution-board-title">
                {english ? 'Actions for the next 90 days' : 'اقدام‌های ۹۰ روز پیش رو'}
              </h2>
              <p>
                {english
                  ? 'Deadlines and owners stay visible in every status.'
                  : 'موعد و مسئول در هر وضعیت آشکار می‌مانند.'}
              </p>
            </div>
            <span className="execution-board-range" dir="auto">
              {dateRange}
            </span>
          </div>
          <div className="execution-lanes">
            {ACTION_LANES.map((lane) => {
              const actions = actionsByLane.get(lane.status) ?? [];
              return (
                <section
                  className={`execution-lane execution-lane--${lane.status}`}
                  key={lane.status}
                  aria-labelledby={`execution-lane-${lane.status}`}
                >
                  <header>
                    <h3 id={`execution-lane-${lane.status}`}>{lane[english ? 'en' : 'fa']}</h3>
                    <span
                      aria-label={`${localeNumber(actions.length)} ${english ? 'actions' : 'اقدام'}`}
                    >
                      {localeNumber(actions.length)}
                    </span>
                  </header>
                  {actions.length ? (
                    actions.map((action) => (
                      <ActionCard
                        key={`${action.id}:${action.revision}`}
                        action={action}
                        board={board}
                        english={english}
                        editable={canWrite}
                        pending={pending}
                        statusBlocked={dirtyRecords.has(`action:${action.id}`)}
                        statusDraft={actionStatuses[action.id] ?? action.status}
                        onStatusChange={(status) =>
                          setActionStatuses((current) =>
                            status === action.status
                              ? Object.fromEntries(
                                  Object.entries(current).filter(([id]) => id !== action.id),
                                )
                              : { ...current, [action.id]: status },
                          )
                        }
                        onStatusSave={() => void updateActionStatus(action)}
                        onEdit={(event) => {
                          markDirty(`action:${action.id}`);
                          void editAction(event, action);
                        }}
                        onEditChange={() => markDirty(`action:${action.id}`)}
                      />
                    ))
                  ) : (
                    <p className="execution-lane__empty">
                      {english ? 'No actions here.' : 'اقدامی در این وضعیت نیست.'}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          {laterActions.length > 0 && (
            <details className="execution-later">
              <summary>
                {english
                  ? `${localeNumber(laterActions.length)} actions are due after this 90-day plan`
                  : `${localeNumber(laterActions.length)} اقدام پس از این بازه ۹۰ روزه موعد دارند`}
              </summary>
              <ul>
                {laterActions.map((action) => (
                  <li key={action.id}>
                    <strong dir="auto">{action.title}</strong>
                    <span>
                      {dateLabel(action.due_on, english)} · {actionStatusText(action.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section
        className={focus === 'all' ? 'execution-workspace-grid' : 'execution-workspace-focus'}
      >
        {focus !== 'goals' && (
          <section className="execution-decisions" aria-labelledby="execution-decisions-title">
            <div className="execution-section-heading">
              <div>
                <h2 id="execution-decisions-title">
                  {english ? 'Decision register' : 'دفتر تصمیم'}
                </h2>
                <p>
                  {english
                    ? 'Record why, based on what, and when to review.'
                    : 'دلیل، منبع و زمان بازبینی تصمیم را ثبت کنید.'}
                </p>
              </div>
            </div>
            {canWrite && (
              <form className="execution-form execution-form--create" onSubmit={submitDecision}>
                <h3>{english ? 'Record a decision' : 'ثبت تصمیم تازه'}</h3>
                <Input
                  label={english ? 'Decision' : 'تصمیم'}
                  value={decisionDraft.title}
                  maxLength={160}
                  required
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    setDecisionDraft((current) => ({ ...current, title }));
                  }}
                />
                <label className="execution-field">
                  <span>
                    {english ? 'Source analysis or strategy option' : 'تحلیل یا گزینه راهبردی'}
                  </span>
                  <select
                    value={
                      decisionDraft.source_kind && decisionDraft.source_id
                        ? `${decisionDraft.source_kind}:${decisionDraft.source_id}`
                        : ''
                    }
                    required
                    onChange={(event) => {
                      const [kind = '', id = ''] = event.currentTarget.value.split(':');
                      setDecisionDraft((current) => ({
                        ...current,
                        source_kind: kind as DecisionDraft['source_kind'],
                        source_id: id || null,
                      }));
                    }}
                  >
                    <option value="" disabled>
                      {english ? 'Choose a source' : 'یک منبع انتخاب کنید'}
                    </option>
                    {board.sources.map((source) => (
                      <option
                        key={`${source.kind}:${source.id}`}
                        value={`${source.kind}:${source.id}`}
                      >
                        {source.title} ·{' '}
                        {source.kind === 'analysis'
                          ? english
                            ? 'Analysis'
                            : 'تحلیل'
                          : english
                            ? 'Strategy option'
                            : 'گزینه راهبردی'}
                      </option>
                    ))}
                  </select>
                </label>
                <TextArea
                  label={english ? 'Reason for the decision' : 'دلیل تصمیم'}
                  value={decisionDraft.rationale}
                  required
                  onChange={(rationale) =>
                    setDecisionDraft((current) => ({ ...current, rationale }))
                  }
                />
                <TextArea
                  label={english ? 'Assumptions' : 'فرض‌هایی که باید درست باشند'}
                  value={decisionDraft.assumptions}
                  required
                  onChange={(assumptions) =>
                    setDecisionDraft((current) => ({ ...current, assumptions }))
                  }
                />
                <Input
                  label={english ? 'Review when' : 'چه زمانی تصمیم را بازبینی کنیم؟'}
                  value={decisionDraft.review_trigger}
                  maxLength={500}
                  required
                  onChange={(event) => {
                    const review_trigger = event.currentTarget.value;
                    setDecisionDraft((current) => ({ ...current, review_trigger }));
                  }}
                />
                <Button
                  type="submit"
                  variant="primary"
                  pending={pending}
                  pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
                >
                  {english ? 'Save decision' : 'ذخیره تصمیم'}
                </Button>
              </form>
            )}

            {board.decisions.length === 0 ? (
              <EmptyState
                title={english ? 'No decisions recorded' : 'هنوز تصمیمی ثبت نشده'}
                description={
                  english
                    ? 'Start with the choice you want the team to act on, then link a source and review trigger.'
                    : 'انتخابی را ثبت کنید که باید به اقدام برسد؛ سپس منبع و زمان بازبینی را مشخص کنید.'
                }
                action={
                  canWrite ? (
                    <Link
                      className="ui-button ui-button--secondary"
                      to={`/app/workspaces/${encodeURIComponent(workspaceId)}/tools/matrices`}
                    >
                      {english ? 'Review EFE and IFE' : 'بررسی ماتریس‌های EFE و IFE'}
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ol className="execution-decision-list">
                {board.decisions.map((decision) => (
                  <li className="execution-decision" key={`${decision.id}:${decision.revision}`}>
                    <header>
                      <div>
                        <h3 dir="auto">{decision.title}</h3>
                        <p>
                          {english ? 'Updated' : 'آخرین تغییر'}:{' '}
                          {dateLabel(decision.updated_at.slice(0, 10), english)}
                        </p>
                      </div>
                      <span
                        className={`execution-decision-status execution-decision-status--${decision.status}`}
                      >
                        {statusText(decision.status)}
                      </span>
                    </header>
                    {decision.source && (
                      <p className="execution-decision__source">
                        {english ? 'Source' : 'منبع'}:{' '}
                        {decision.source.kind === 'analysis' ? (
                          <Link
                            to={`/app/workspaces/${encodeURIComponent(workspaceId)}/tools/matrices`}
                          >
                            {decision.source.title}
                          </Link>
                        ) : (
                          <Link
                            to={`/app/workspaces/${encodeURIComponent(workspaceId)}/tools/swot`}
                          >
                            {decision.source.title}
                          </Link>
                        )}
                      </p>
                    )}
                    <dl className="execution-decision__facts">
                      <div>
                        <dt>{english ? 'Reason' : 'دلیل'}</dt>
                        <dd dir="auto">{decision.rationale}</dd>
                      </div>
                      <div>
                        <dt>{english ? 'Assumptions' : 'فرض‌ها'}</dt>
                        <dd dir="auto">{decision.assumptions}</dd>
                      </div>
                      <div>
                        <dt>{english ? 'Review when' : 'بازبینی در صورت'}</dt>
                        <dd dir="auto">{decision.review_trigger}</dd>
                      </div>
                    </dl>
                    {canWrite && (
                      <div className="execution-decision__actions">
                        <label>
                          <span>{english ? 'Decision status' : 'وضعیت تصمیم'}</span>
                          <select
                            value={decisionStatuses[decision.id] ?? decision.status}
                            disabled={dirtyRecords.has(`decision:${decision.id}`)}
                            onChange={(event) => {
                              const status = event.currentTarget
                                .value as ApiExecutionDecisionStatus;
                              setDecisionStatuses((current) => {
                                if (status === decision.status) {
                                  const next = { ...current };
                                  delete next[decision.id];
                                  return next;
                                }
                                return { ...current, [decision.id]: status };
                              });
                            }}
                          >
                            {DECISION_STATUSES.map((item) => (
                              <option key={item.status} value={item.status}>
                                {item[english ? 'en' : 'fa']}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          disabled={
                            pending ||
                            dirtyRecords.has(`decision:${decision.id}`) ||
                            !decisionStatuses[decision.id] ||
                            decisionStatuses[decision.id] === decision.status
                          }
                          onClick={() => void updateDecisionStatus(decision)}
                        >
                          {english ? 'Save status' : 'ذخیره وضعیت'}
                        </Button>
                        <Button variant="quiet" onClick={() => openActionForm(decision)}>
                          {english ? 'Add action' : 'افزودن اقدام'}
                        </Button>
                      </div>
                    )}
                    {canWrite && (
                      <details className="execution-edit">
                        <summary>
                          {english ? 'Edit decision details' : 'ویرایش جزئیات تصمیم'}
                        </summary>
                        <form
                          className="execution-form"
                          key={`${decision.id}:${decision.revision}:edit`}
                          onSubmit={(event) => {
                            markDirty(`decision:${decision.id}`);
                            void editDecision(event, decision);
                          }}
                          onChange={() => markDirty(`decision:${decision.id}`)}
                        >
                          <Input
                            label={english ? 'Decision' : 'تصمیم'}
                            name="title"
                            defaultValue={decision.title}
                            maxLength={160}
                            required
                          />
                          <label className="execution-field">
                            <span>{english ? 'Source' : 'منبع'}</span>
                            <select
                              name="source"
                              defaultValue={
                                decision.source
                                  ? `${decision.source.kind}:${decision.source.id}`
                                  : ''
                              }
                              required
                            >
                              <option value="" disabled>
                                {english ? 'Choose a source' : 'یک منبع انتخاب کنید'}
                              </option>
                              {board.sources.map((source) => (
                                <option
                                  key={`${source.kind}:${source.id}`}
                                  value={`${source.kind}:${source.id}`}
                                >
                                  {source.title}
                                </option>
                              ))}
                              {decision.source &&
                                !board.sources.some(
                                  (source) =>
                                    source.kind === decision.source?.kind &&
                                    source.id === decision.source.id,
                                ) && (
                                  <option value={`${decision.source.kind}:${decision.source.id}`}>
                                    {decision.source.title} ·{' '}
                                    {english ? 'source snapshot' : 'نسخه ثبت‌شده از منبع'}
                                  </option>
                                )}
                            </select>
                          </label>
                          <label className="execution-field">
                            <span>{english ? 'Reason' : 'دلیل'}</span>
                            <textarea
                              name="rationale"
                              defaultValue={decision.rationale}
                              maxLength={2000}
                              rows={3}
                              required
                            />
                          </label>
                          <label className="execution-field">
                            <span>{english ? 'Assumptions' : 'فرض‌ها'}</span>
                            <textarea
                              name="assumptions"
                              defaultValue={decision.assumptions}
                              maxLength={2000}
                              rows={3}
                              required
                            />
                          </label>
                          <Input
                            label={english ? 'Review when' : 'محرک بازبینی'}
                            name="review_trigger"
                            defaultValue={decision.review_trigger}
                            maxLength={500}
                            required
                          />
                          <label className="execution-field">
                            <span>{english ? 'Status' : 'وضعیت'}</span>
                            <select name="status" defaultValue={decision.status}>
                              {DECISION_STATUSES.map((item) => (
                                <option key={item.status} value={item.status}>
                                  {item[english ? 'en' : 'fa']}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button type="submit" variant="primary" pending={pending}>
                            {english ? 'Save decision' : 'ذخیره تصمیم'}
                          </Button>
                        </form>
                      </details>
                    )}
                    {actionDraft?.decision_id === decision.id && (
                      <form
                        className="execution-form execution-form--action"
                        onSubmit={submitAction}
                        onChange={() => setActionDirty(true)}
                      >
                        <h4>
                          {english
                            ? 'Add an action for this decision'
                            : 'اقدام این تصمیم را ثبت کنید'}
                        </h4>
                        <Input
                          label={english ? 'Action' : 'اقدام'}
                          value={actionDraft.title}
                          maxLength={160}
                          required
                          onChange={(event) => {
                            const title = event.currentTarget.value;
                            setActionDraft((current) =>
                              current ? { ...current, title } : current,
                            );
                          }}
                        />
                        <TextArea
                          label={english ? 'Description' : 'شرح'}
                          value={actionDraft.description}
                          onChange={(description) =>
                            setActionDraft((current) =>
                              current ? { ...current, description } : current,
                            )
                          }
                        />
                        <div className="execution-form__row">
                          <label className="execution-field">
                            <span>{english ? 'Owner' : 'مسئول'}</span>
                            <select
                              value={actionDraft.owner_id}
                              required
                              onChange={(event) => {
                                const owner_id = event.currentTarget.value;
                                setActionDraft((current) =>
                                  current ? { ...current, owner_id } : current,
                                );
                              }}
                            >
                              {board.members.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Input
                            label={english ? 'Due date' : 'موعد'}
                            type="date"
                            value={actionDraft.due_on}
                            required
                            onChange={(event) => {
                              const due_on = event.currentTarget.value;
                              setActionDraft((current) =>
                                current ? { ...current, due_on } : current,
                              );
                            }}
                          />
                        </div>
                        <label className="execution-field">
                          <span>{english ? 'Linked goal' : 'هدف پیوندخورده'}</span>
                          <select
                            value={actionDraft.goal_id ?? ''}
                            onChange={(event) => {
                              const goal_id = event.currentTarget.value || null;
                              setActionDraft((current) =>
                                current ? { ...current, goal_id } : current,
                              );
                            }}
                          >
                            <option value="">
                              {english ? 'No linked goal' : 'بدون هدف پیوندخورده'}
                            </option>
                            {board.goals
                              .filter((goal) => goal.status === 'active')
                              .map((goal) => (
                                <option key={goal.id} value={goal.id}>
                                  {goal.title}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="execution-form__buttons">
                          <Button type="submit" variant="primary" pending={pending}>
                            {english ? 'Add action' : 'ثبت اقدام'}
                          </Button>
                          <Button
                            onClick={() => {
                              setActionDraft(null);
                              setActionDirty(false);
                            }}
                          >
                            {english ? 'Cancel' : 'انصراف'}
                          </Button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {focus !== 'decisions' && (
          <section className="execution-goals" aria-labelledby="execution-goals-title">
            <div className="execution-section-heading">
              <div>
                <h2 id="execution-goals-title">{english ? 'Goals' : 'هدف‌ها'}</h2>
                <p>
                  {english
                    ? 'Give actions a shared outcome.'
                    : 'اقدام‌ها را به نتیجه مشترک پیوند دهید.'}
                </p>
              </div>
            </div>
            {canWrite && (
              <form className="execution-form execution-form--goal" onSubmit={submitGoal}>
                <Input
                  label={english ? 'Goal' : 'هدف'}
                  value={goalDraft.title}
                  maxLength={160}
                  required
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    setGoalDraft((current) => ({ ...current, title }));
                  }}
                />
                <TextArea
                  label={english ? 'Description' : 'شرح'}
                  value={goalDraft.description}
                  onChange={(description) =>
                    setGoalDraft((current) => ({ ...current, description }))
                  }
                />
                <Input
                  label={english ? 'Target date' : 'تاریخ هدف'}
                  type="date"
                  value={goalDraft.due_on ?? ''}
                  onChange={(event) => {
                    const due_on = event.currentTarget.value || null;
                    setGoalDraft((current) => ({ ...current, due_on }));
                  }}
                />
                <Button type="submit" variant="secondary" pending={pending}>
                  {english ? 'Add goal' : 'افزودن هدف'}
                </Button>
              </form>
            )}
            {board.goals.length === 0 ? (
              <p className="execution-muted">
                {english
                  ? 'No goals yet. Add one, then link it to an action.'
                  : 'هنوز هدفی ثبت نشده؛ هدفی اضافه کنید و آن را به یک اقدام پیوند دهید.'}
              </p>
            ) : (
              <ul className="execution-goal-list">
                {board.goals.map((goal) => (
                  <li key={`${goal.id}:${goal.revision}`}>
                    <div>
                      <h3 dir="auto">{goal.title}</h3>
                      {goal.description && <p dir="auto">{goal.description}</p>}
                      <span>
                        {english ? 'Target' : 'موعد هدف'}: {dateLabel(goal.due_on, english)} ·{' '}
                        {localeNumber(goal.action_count)} {english ? 'actions' : 'اقدام'}
                      </span>
                    </div>
                    <label>
                      <span>{english ? 'Goal status' : 'وضعیت هدف'}</span>
                      <select
                        value={goalStatuses[goal.id] ?? goal.status}
                        disabled={!canWrite || dirtyRecords.has(`goal:${goal.id}`)}
                        onChange={(event) => {
                          const status = event.currentTarget.value as ApiExecutionGoalStatus;
                          setGoalStatuses((current) => {
                            if (status === goal.status) {
                              const next = { ...current };
                              delete next[goal.id];
                              return next;
                            }
                            return { ...current, [goal.id]: status };
                          });
                        }}
                      >
                        <option value="active">{english ? 'Active' : 'فعال'}</option>
                        <option value="complete">{english ? 'Complete' : 'تکمیل‌شده'}</option>
                      </select>
                    </label>
                    {canWrite && (
                      <Button
                        disabled={
                          pending ||
                          !goalStatuses[goal.id] ||
                          goalStatuses[goal.id] === goal.status ||
                          dirtyRecords.has(`goal:${goal.id}`)
                        }
                        onClick={() => void updateGoalStatus(goal)}
                      >
                        {english ? 'Save' : 'ذخیره'}
                      </Button>
                    )}
                    {canWrite && (
                      <details className="execution-edit">
                        <summary>{english ? 'Edit goal' : 'ویرایش هدف'}</summary>
                        <form
                          className="execution-form"
                          key={`${goal.id}:${goal.revision}:edit`}
                          onSubmit={(event) => {
                            markDirty(`goal:${goal.id}`);
                            void editGoal(event, goal);
                          }}
                          onChange={() => markDirty(`goal:${goal.id}`)}
                        >
                          <Input
                            label={english ? 'Goal' : 'هدف'}
                            name="title"
                            defaultValue={goal.title}
                            maxLength={160}
                            required
                          />
                          <label className="execution-field">
                            <span>{english ? 'Description' : 'شرح'}</span>
                            <textarea
                              name="description"
                              defaultValue={goal.description}
                              maxLength={1000}
                              rows={2}
                            />
                          </label>
                          <Input
                            label={english ? 'Target date' : 'تاریخ هدف'}
                            name="due_on"
                            type="date"
                            defaultValue={goal.due_on ?? ''}
                          />
                          <label className="execution-field">
                            <span>{english ? 'Status' : 'وضعیت'}</span>
                            <select name="status" defaultValue={goal.status}>
                              <option value="active">{english ? 'Active' : 'فعال'}</option>
                              <option value="complete">{english ? 'Complete' : 'تکمیل‌شده'}</option>
                            </select>
                          </label>
                          <Button type="submit" variant="primary" pending={pending}>
                            {english ? 'Save goal' : 'ذخیره هدف'}
                          </Button>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </section>

      <section className="execution-history" aria-labelledby="execution-history-title">
        <div className="execution-section-heading">
          <div>
            <h2 id="execution-history-title">{english ? 'Change history' : 'تاریخچه تغییرات'}</h2>
            <p>
              {english ? 'Who changed what, and when.' : 'چه کسی، چه چیزی را و چه زمانی تغییر داد.'}
            </p>
          </div>
          {board.events.length > 12 && (
            <Button variant="quiet" onClick={() => setShowAllEvents((current) => !current)}>
              {showAllEvents
                ? english
                  ? 'Show recent'
                  : 'نمایش تازه‌ها'
                : english
                  ? `Show all ${localeNumber(board.events.length)}`
                  : `نمایش همه ${localeNumber(board.events.length)}`}
            </Button>
          )}
        </div>
        {eventList.length ? (
          <ol className="execution-history-list">
            {eventList.map((event) => {
              const fields = Object.keys(event.changes).map(
                (field) => EVENT_FIELDS[field]?.[english ? 'en' : 'fa'] ?? field,
              );
              const verb =
                event.event_type === 'created'
                  ? english
                    ? 'created'
                    : 'ساخت'
                  : event.event_type === 'status_changed'
                    ? english
                      ? 'changed status of'
                      : 'وضعیت را تغییر داد'
                    : english
                      ? 'updated'
                      : 'ویرایش کرد';
              return (
                <li key={event.id}>
                  <time dateTime={event.created_at}>
                    {dateLabel(event.created_at.slice(0, 10), english)}
                  </time>
                  <p>
                    <strong dir="auto">{event.actor_name}</strong> {verb}{' '}
                    <b dir="auto">{event.entity_label}</b>
                    <span>
                      {fields.length
                        ? `${english ? 'Fields' : 'فیلدها'}: ${fields.join(english ? ', ' : '، ')}`
                        : ''}
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="execution-muted">
            {english
              ? 'New decisions, goals, and actions will appear here.'
              : 'تصمیم‌ها، هدف‌ها و اقدام‌های تازه در اینجا ثبت می‌شوند.'}
          </p>
        )}
      </section>
    </section>
  );
}
