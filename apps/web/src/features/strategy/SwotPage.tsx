import { useState, type FormEvent } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, EmptyState, Input, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';
import type {
  ApiStrategyCategory,
  ApiStrategyFactor,
  ApiStrategyFactorType,
  ApiStrategyOption,
} from '../../api/contracts';
import {
  createStrategyFactor,
  createStrategyOption,
  deleteStrategyFactor,
  deleteStrategyOption,
  readStrategyBoard,
  updateStrategyFactor,
  updateStrategyOption,
  type StrategyFactorCreate,
  type StrategyOptionCreate,
} from './api';

const FACTOR_GROUPS: { type: ApiStrategyFactorType; fa: string; en: string }[] = [
  { type: 'strength', fa: 'قوت', en: 'Strength' },
  { type: 'weakness', fa: 'ضعف', en: 'Weakness' },
  { type: 'opportunity', fa: 'فرصت', en: 'Opportunity' },
  { type: 'threat', fa: 'تهدید', en: 'Threat' },
];
const OPTION_GROUPS: { type: ApiStrategyCategory; fa: string; en: string; pairing: string }[] = [
  { type: 'SO', fa: 'قوت × فرصت', en: 'Strength × opportunity', pairing: 'strength + opportunity' },
  { type: 'WO', fa: 'ضعف × فرصت', en: 'Weakness × opportunity', pairing: 'weakness + opportunity' },
  { type: 'ST', fa: 'قوت × تهدید', en: 'Strength × threat', pairing: 'strength + threat' },
  { type: 'WT', fa: 'ضعف × تهدید', en: 'Weakness × threat', pairing: 'weakness + threat' },
];

type FactorDraft = StrategyFactorCreate;
type OptionDraft = StrategyOptionCreate;

function TextArea({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="strategy-field">
      <span>{label}</span>
      <textarea
        value={value}
        rows={3}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function PriorityField({
  value,
  onChange,
  english,
}: {
  value: number;
  onChange: (value: number) => void;
  english: boolean;
}) {
  return (
    <label className="strategy-field">
      <span>{english ? 'Priority' : 'اولویت'}</span>
      <select value={value} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        {[1, 2, 3, 4, 5].map((priority) => (
          <option key={priority} value={priority}>
            {new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(priority)}
            {priority === 5
              ? english
                ? ' · highest'
                : ' · بالاترین'
              : priority === 1
                ? english
                  ? ' · lowest'
                  : ' · پایین‌ترین'
                : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function FactorEditor({
  initial,
  guardKey,
  english,
  pending,
  onSave,
  onCancel,
}: {
  initial: FactorDraft;
  guardKey: string;
  english: boolean;
  pending: boolean;
  onSave: (draft: FactorDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  useWorkspaceDirtyGuard(guardKey, JSON.stringify(draft) !== JSON.stringify(initial));
  function change<K extends keyof FactorDraft>(field: K, value: FactorDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  return (
    <form
      className="strategy-editor"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void onSave(draft).catch(() => undefined);
      }}
    >
      <div className="strategy-form-grid">
        <label className="strategy-field">
          <span>{english ? 'Factor group' : 'دسته عامل'}</span>
          <select
            value={draft.factor_type}
            onChange={(event) =>
              change('factor_type', event.currentTarget.value as ApiStrategyFactorType)
            }
          >
            {FACTOR_GROUPS.map((group) => (
              <option key={group.type} value={group.type}>
                {group[english ? 'en' : 'fa']}
              </option>
            ))}
          </select>
        </label>
        <Input
          label={english ? 'Specific factor' : 'عامل مشخص'}
          value={draft.title}
          maxLength={160}
          required
          onChange={(event) => change('title', event.currentTarget.value)}
        />
        <TextArea
          label={english ? 'Evidence and source' : 'شاهد و منبع'}
          value={draft.evidence}
          required
          onChange={(value) => change('evidence', value)}
        />
        <Input
          label={english ? 'Owner' : 'مسئول پیگیری'}
          value={draft.owner}
          maxLength={120}
          onChange={(event) => change('owner', event.currentTarget.value)}
        />
        <PriorityField
          value={draft.priority}
          english={english}
          onChange={(value) => change('priority', value)}
        />
      </div>
      <div className="strategy-form-actions">
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
        >
          {english ? 'Save factor' : 'ذخیره عامل'}
        </Button>
        {onCancel && <Button onClick={onCancel}>{english ? 'Cancel' : 'انصراف'}</Button>}
      </div>
    </form>
  );
}

function FactorCard({
  factor,
  english,
  editable,
  pending,
  onSave,
  onDelete,
}: {
  factor: ApiStrategyFactor;
  english: boolean;
  editable: boolean;
  pending: boolean;
  onSave: (draft: FactorDraft & { revision: number }) => Promise<void>;
  onDelete: (factor: ApiStrategyFactor, confirmDependencies: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [serverDependencies, setServerDependencies] = useState<string[]>([]);
  if (editing && editable)
    return (
      <article className="strategy-factor-card">
        <FactorEditor
          initial={{
            factor_type: factor.factor_type,
            title: factor.title,
            evidence: factor.evidence,
            owner: factor.owner,
            priority: factor.priority,
          }}
          guardKey={`strategy-factor-${factor.id}`}
          english={english}
          pending={pending}
          onSave={async (draft) => {
            await onSave({ ...draft, revision: factor.revision });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </article>
    );
  const priority = new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(factor.priority);
  return (
    <article className="strategy-factor-card">
      <div className="strategy-factor-card__top">
        <div>
          <span className="strategy-priority">
            {english ? `Priority ${priority}/5` : `اولویت ${priority} از ۵`}
          </span>
          <h3>{factor.title}</h3>
        </div>
        {editable && (
          <div className="strategy-card-actions">
            <Button variant="quiet" onClick={() => setEditing(true)}>
              {english ? 'Edit' : 'ویرایش'}
            </Button>
            <Dialog
              closeLabel={english ? 'Close' : 'بستن'}
              trigger={
                <Button
                  variant="quiet"
                  onClick={() => {
                    setDeleteError('');
                    setServerDependencies([]);
                    setDeleteOpen(true);
                  }}
                >
                  {english ? 'Delete' : 'حذف'}
                </Button>
              }
              title={english ? 'Delete this factor?' : 'این عامل حذف شود؟'}
              description={
                english
                  ? 'Related options remain saved and will be marked for review.'
                  : 'گزینه‌های مرتبط باقی می‌مانند و برای بازبینی علامت می‌خورند.'
              }
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
            >
              <div className="strategy-delete-dialog">
                {(serverDependencies.length
                  ? serverDependencies
                  : factor.linked_options.map((option) => option.title)
                ).length > 0 ? (
                  <>
                    <p>
                      {english
                        ? 'This factor is linked to:'
                        : 'این عامل به گزینه‌های زیر پیوند دارد:'}
                    </p>
                    <ul>
                      {(serverDependencies.length
                        ? serverDependencies
                        : factor.linked_options.map((option) => option.title)
                      ).map((title) => (
                        <li key={title}>{title}</li>
                      ))}
                    </ul>
                    <p>
                      {english
                        ? 'Deleting it removes those links and marks each option as needing review.'
                        : 'حذف عامل پیوندها را برمی‌دارد و هر گزینه را نیازمند بازبینی می‌کند.'}
                    </p>
                  </>
                ) : (
                  <p>
                    {english
                      ? 'This factor has no linked options.'
                      : 'هنوز گزینه‌ای به این عامل پیوند ندارد.'}
                  </p>
                )}
                {deleteError && (
                  <p role="alert" className="strategy-error">
                    {deleteError}
                  </p>
                )}
                <Button
                  variant="danger"
                  pending={pending}
                  pendingLabel={english ? 'Deleting…' : 'در حال حذف…'}
                  onClick={() =>
                    void onDelete(
                      factor,
                      factor.linked_options.length > 0 || serverDependencies.length > 0,
                    )
                      .then(() => setDeleteOpen(false))
                      .catch((error: unknown) => {
                        const dependencies =
                          error && typeof error === 'object' && 'fields' in error
                            ? ((error as { fields?: Record<string, string[]> }).fields
                                ?.dependencies ?? [])
                            : [];
                        setServerDependencies(dependencies);
                        setDeleteError(
                          error instanceof Error
                            ? error.message
                            : english
                              ? 'The factor could not be deleted.'
                              : 'حذف عامل انجام نشد.',
                        );
                      })
                  }
                >
                  {english ? 'Confirm factor deletion' : 'تأیید حذف عامل'}
                </Button>
              </div>
            </Dialog>
          </div>
        )}
      </div>
      <p className="strategy-factor-card__evidence">{factor.evidence}</p>
      <div className="strategy-factor-card__meta">
        <span>
          {english ? 'Owner' : 'مسئول'}: {factor.owner || (english ? 'Unassigned' : 'تعیین نشده')}
        </span>
        <span>
          {factor.linked_options.length
            ? english
              ? `${factor.linked_options.length} linked options`
              : `${new Intl.NumberFormat('fa-IR').format(factor.linked_options.length)} گزینه پیوندخورده`
            : english
              ? 'No linked options'
              : 'بدون گزینه پیوندخورده'}
        </span>
      </div>
    </article>
  );
}

function OptionEditor({
  initial,
  initialCategory = 'SO',
  guardKey,
  factors,
  english,
  pending,
  onSave,
  onCancel,
}: {
  initial?: ApiStrategyOption;
  initialCategory?: ApiStrategyCategory;
  guardKey: string;
  factors: ApiStrategyFactor[];
  english: boolean;
  pending: boolean;
  onSave: (draft: OptionDraft, initial?: ApiStrategyOption) => Promise<void>;
  onCancel?: () => void;
}) {
  const [category, setCategory] = useState<ApiStrategyCategory>(
    initial?.category ?? initialCategory,
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [action, setAction] = useState(initial?.action ?? '');
  const [rationale, setRationale] = useState(initial?.rationale ?? '');
  const [hypothesis, setHypothesis] = useState(initial?.hypothesis ?? '');
  const [cost, setCost] = useState(initial?.cost ?? '');
  const [selectedFactorIds, setSelectedFactorIds] = useState<string[]>(() =>
    (initial?.factor_refs ?? [])
      .filter((ref) =>
        factors.some(
          (factor) =>
            factor.id === ref.id && expectedFactors(category).includes(factor.factor_type),
        ),
      )
      .map((ref) => ref.id),
  );
  const draftSnapshot = JSON.stringify({
    category,
    title,
    action,
    rationale,
    hypothesis,
    cost,
    factor_ids: selectedFactorIds,
  });
  const initialSnapshot = JSON.stringify({
    category: initial?.category ?? initialCategory,
    title: initial?.title ?? '',
    action: initial?.action ?? '',
    rationale: initial?.rationale ?? '',
    hypothesis: initial?.hypothesis ?? '',
    cost: initial?.cost ?? '',
    factor_ids: (initial?.factor_refs ?? []).map((ref) => ref.id),
  });
  useWorkspaceDirtyGuard(guardKey, draftSnapshot !== initialSnapshot);
  const requiredTypes = expectedFactors(category);
  const chosenTypes = new Set(
    factors
      .filter((factor) => selectedFactorIds.includes(factor.id))
      .map((factor) => factor.factor_type),
  );
  const pairingComplete = requiredTypes.every((type) => chosenTypes.has(type));
  function toggleFactor(id: string) {
    setSelectedFactorIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pairingComplete) return;
    void onSave(
      { category, title, action, rationale, hypothesis, cost, factor_ids: selectedFactorIds },
      initial,
    ).catch(() => undefined);
  }
  return (
    <form className="strategy-editor" onSubmit={submit}>
      <div className="strategy-form-grid">
        <label className="strategy-field">
          <span>{english ? 'TOWS pairing' : 'ترکیب TOWS'}</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.currentTarget.value as ApiStrategyCategory);
              setSelectedFactorIds([]);
            }}
          >
            {OPTION_GROUPS.map((group) => (
              <option key={group.type} value={group.type}>
                {group[english ? 'en' : 'fa']}
              </option>
            ))}
          </select>
        </label>
        <Input
          label={english ? 'Option name' : 'نام گزینه راهبردی'}
          value={title}
          required
          maxLength={160}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <TextArea
          label={english ? 'Bounded action' : 'اقدام مشخص و محدود'}
          value={action}
          required
          onChange={setAction}
        />
        <TextArea
          label={english ? 'Why these factors fit' : 'منطق پیوند عامل‌ها'}
          value={rationale}
          required
          onChange={setRationale}
        />
        <TextArea
          label={english ? 'Testable assumption' : 'فرضیه قابل‌آزمون'}
          value={hypothesis}
          required
          onChange={setHypothesis}
        />
        <Input
          label={english ? 'Cost or constraint' : 'هزینه یا محدودیت'}
          value={cost}
          maxLength={300}
          onChange={(event) => setCost(event.currentTarget.value)}
        />
      </div>
      <fieldset className="strategy-factor-picker">
        <legend>
          {english ? 'Link factors from both sides' : 'عامل‌های مرتبط از هر دو بُعد را وصل کنید'}
        </legend>
        {requiredTypes.map((type) => (
          <div className="strategy-factor-picker__group" key={type}>
            <h4>{FACTOR_GROUPS.find((item) => item.type === type)?.[english ? 'en' : 'fa']}</h4>
            {factors.filter((factor) => factor.factor_type === type).length === 0 ? (
              <p>{english ? 'No factors in this group yet.' : 'هنوز عاملی در این دسته ندارید.'}</p>
            ) : (
              factors
                .filter((factor) => factor.factor_type === type)
                .map((factor) => (
                  <label key={factor.id}>
                    <input
                      type="checkbox"
                      checked={selectedFactorIds.includes(factor.id)}
                      onChange={() => toggleFactor(factor.id)}
                    />
                    <span>{factor.title}</span>
                  </label>
                ))
            )}
          </div>
        ))}
        {!pairingComplete && (
          <p role="status">
            {english
              ? 'Select at least one factor from each group.'
              : 'از هر دسته دست‌کم یک عامل انتخاب کنید.'}
          </p>
        )}
      </fieldset>
      <div className="strategy-form-actions">
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
          disabled={!pairingComplete}
        >
          {english ? 'Save strategy option' : 'ذخیره گزینه راهبردی'}
        </Button>
        {onCancel && <Button onClick={onCancel}>{english ? 'Cancel' : 'انصراف'}</Button>}
      </div>
    </form>
  );
}

function expectedFactors(category: ApiStrategyCategory): ApiStrategyFactorType[] {
  if (category === 'SO') return ['strength', 'opportunity'];
  if (category === 'WO') return ['weakness', 'opportunity'];
  if (category === 'ST') return ['strength', 'threat'];
  return ['weakness', 'threat'];
}

function OptionCard({
  option,
  factors,
  english,
  editable,
  pending,
  onSave,
  onDelete,
}: {
  option: ApiStrategyOption;
  factors: ApiStrategyFactor[];
  english: boolean;
  editable: boolean;
  pending: boolean;
  onSave: (draft: OptionDraft, initial: ApiStrategyOption) => Promise<void>;
  onDelete: (option: ApiStrategyOption) => Promise<void>;
}) {
  const [editing, setEditing] = useState(option.needs_review);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  if (editable && (editing || option.needs_review))
    return (
      <article className={`strategy-option-card${option.needs_review ? ' is-review' : ''}`}>
        {option.needs_review && (
          <p className="strategy-review-note" role="status">
            {english
              ? 'A linked factor changed or was removed. Review the links and rationale before using this option.'
              : 'یکی از عامل‌های پیوندخورده تغییر کرده یا حذف شده است؛ پیش از استفاده، پیوندها و منطق گزینه را بازبینی کنید.'}
          </p>
        )}
        <OptionEditor
          key={option.id}
          initial={option}
          guardKey={`strategy-option-${option.id}`}
          factors={factors}
          english={english}
          pending={pending}
          onSave={async (draft, current) => {
            await onSave(draft, current ?? option);
            setEditing(false);
          }}
          onCancel={option.needs_review ? undefined : () => setEditing(false)}
        />
      </article>
    );
  return (
    <article className={`strategy-option-card${option.needs_review ? ' is-review' : ''}`}>
      {option.needs_review && (
        <p className="strategy-review-note" role="status">
          {english
            ? 'A linked factor changed or was removed. An editor must review the links and rationale before using this option.'
            : 'یکی از عامل‌های پیوندخورده تغییر کرده یا حذف شده است؛ ویرایشگر باید پیش از استفاده، پیوندها و منطق گزینه را بازبینی کند.'}
        </p>
      )}
      <div className="strategy-option-card__heading">
        <span className={`strategy-category strategy-category--${option.category.toLowerCase()}`}>
          {option.category}
        </span>
        <h3>{option.title}</h3>
        {editable && (
          <div className="strategy-card-actions">
            <Button variant="quiet" onClick={() => setEditing(true)}>
              {english ? 'Edit' : 'ویرایش'}
            </Button>
            <Dialog
              closeLabel={english ? 'Close' : 'بستن'}
              trigger={
                <Button
                  variant="quiet"
                  onClick={() => {
                    setDeleteError('');
                    setDeleteOpen(true);
                  }}
                >
                  {english ? 'Delete' : 'حذف'}
                </Button>
              }
              title={english ? 'Delete this option?' : 'این گزینه حذف شود؟'}
              description={
                english
                  ? 'The linked factors will remain in the SWOT analysis.'
                  : 'عامل‌های پیوندخورده در تحلیل SWOT باقی می‌مانند.'
              }
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
            >
              <div className="strategy-delete-dialog">
                <p>
                  {english
                    ? 'This removes only the strategy option.'
                    : 'فقط همین گزینه راهبردی حذف می‌شود.'}
                </p>
                {deleteError && (
                  <p className="strategy-error" role="alert">
                    {deleteError}
                  </p>
                )}
                <Button
                  variant="danger"
                  pending={pending}
                  onClick={() =>
                    void onDelete(option)
                      .then(() => setDeleteOpen(false))
                      .catch((error: unknown) =>
                        setDeleteError(
                          error instanceof Error
                            ? error.message
                            : english
                              ? 'The option could not be deleted.'
                              : 'حذف گزینه انجام نشد.',
                        ),
                      )
                  }
                >
                  {english ? 'Confirm deletion' : 'تأیید حذف'}
                </Button>
              </div>
            </Dialog>
          </div>
        )}
      </div>
      <p className="strategy-option-card__action">{option.action}</p>
      <dl className="strategy-option-facts">
        <div>
          <dt>{english ? 'Reasoning' : 'منطق'}</dt>
          <dd>{option.rationale}</dd>
        </div>
        <div>
          <dt>{english ? 'Testable assumption' : 'فرضیه قابل‌آزمون'}</dt>
          <dd>{option.hypothesis}</dd>
        </div>
        {option.cost && (
          <div>
            <dt>{english ? 'Cost or constraint' : 'هزینه یا محدودیت'}</dt>
            <dd>{option.cost}</dd>
          </div>
        )}
      </dl>
      <div className="strategy-option-links">
        <strong>{english ? 'Source factors' : 'عامل‌های منبع'}</strong>
        {option.factor_refs.length ? (
          option.factor_refs.map((factor) => <span key={factor.id}>{factor.title}</span>)
        ) : (
          <span className="strategy-review-note">
            {english ? 'No active links' : 'پیوند فعالی ندارد'}
          </span>
        )}
      </div>
    </article>
  );
}

export default function SwotPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const english = useUIAppearance().dir === 'ltr';
  const queryClient = useQueryClient();
  const boardQuery = useQuery({
    queryKey: queryKeys.workspace.strategyBoard(workspaceId),
    queryFn: ({ signal }) => readStrategyBoard(workspaceId, signal),
    enabled: Boolean(workspace),
  });
  const [newFactorType, setNewFactorType] = useState<ApiStrategyFactorType | null>(null);
  const [creatingOption, setCreatingOption] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState('');
  const [success, setSuccess] = useState('');
  const editable = workspace?.role !== 'viewer';
  const factors = boardQuery.data?.factors ?? [];
  const options = boardQuery.data?.options ?? [];
  const hasCompatiblePairing = OPTION_GROUPS.some((group) => {
    const required = expectedFactors(group.type);
    return required.every((type) => factors.some((factor) => factor.factor_type === type));
  });
  const initialOptionCategory =
    OPTION_GROUPS.find((group) => {
      const required = expectedFactors(group.type);
      return required.every((type) => factors.some((factor) => factor.factor_type === type));
    })?.type ?? 'SO';

  async function runAction(key: string, action: () => Promise<unknown>, message: string) {
    setPendingKeys((current) => new Set(current).add(key));
    setFeedback('');
    setSuccess('');
    try {
      await action();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workspace.strategyBoard(workspaceId),
      });
      setSuccess(message);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : english
            ? 'The strategy change could not be saved.'
            : 'ذخیره تغییرات تحلیل انجام نشد.',
      );
      throw error;
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
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
      <div className="strategy-page">
        <Skeleton
          label={english ? 'Loading SWOT and TOWS' : 'در حال بارگذاری SWOT و TOWS'}
          lines={5}
        />
      </div>
    );
  if (boardQuery.isError)
    return (
      <div className="strategy-page">
        <Notice title={english ? 'Analysis could not be loaded' : 'بارگذاری تحلیل انجام نشد'}>
          <p role="alert">{boardQuery.error.message}</p>
          <Button onClick={() => void boardQuery.refetch()}>
            {english ? 'Try again' : 'تلاش دوباره'}
          </Button>
        </Notice>
      </div>
    );

  async function saveNewFactor(draft: FactorDraft) {
    await runAction(
      'new-factor',
      () => createStrategyFactor(workspaceId, draft),
      english ? 'Factor added.' : 'عامل ثبت شد.',
    );
    setNewFactorType(null);
  }
  async function saveFactor(factorId: string, draft: FactorDraft & { revision: number }) {
    await runAction(
      `factor-${factorId}`,
      () => updateStrategyFactor(workspaceId, factorId, draft),
      english
        ? 'Factor updated; changes to its evidence, meaning or priority flag linked options for review.'
        : 'عامل به‌روز شد؛ تغییر شاهد، معنا یا اولویت، گزینه‌های وابسته را برای بازبینی علامت می‌زند.',
    );
  }
  async function removeFactor(factor: ApiStrategyFactor, confirmDependencies: boolean) {
    await runAction(
      `factor-${factor.id}`,
      () => deleteStrategyFactor(workspaceId, factor.id, confirmDependencies),
      english
        ? 'Factor deleted and affected options retained for review.'
        : 'عامل حذف شد و گزینه‌های وابسته برای بازبینی باقی ماندند.',
    );
  }
  async function saveOption(draft: OptionDraft, initial?: ApiStrategyOption) {
    if (!initial) {
      await runAction(
        'new-option',
        () => createStrategyOption(workspaceId, draft),
        english ? 'Strategy option added.' : 'گزینه راهبردی ثبت شد.',
      );
      setCreatingOption(false);
      return;
    }
    await runAction(
      `option-${initial.id}`,
      () => updateStrategyOption(workspaceId, initial.id, { ...draft, revision: initial.revision }),
      english ? 'Strategy option updated.' : 'گزینه راهبردی به‌روز شد.',
    );
  }
  async function removeOption(option: ApiStrategyOption) {
    await runAction(
      `option-${option.id}`,
      () => deleteStrategyOption(workspaceId, option.id),
      english ? 'Strategy option deleted.' : 'گزینه راهبردی حذف شد.',
    );
  }

  return (
    <div className="strategy-page">
      <header className="strategy-heading">
        <div>
          <p className="auth-kicker">{english ? 'ANALYZE → DECIDE' : 'تحلیل ← تصمیم'}</p>
          <h1 tabIndex={-1}>{english ? 'SWOT and TOWS' : 'تحلیل SWOT و گزینه‌های TOWS'}</h1>
          <p>
            {english
              ? `Build an evidence-based view for ${workspace.name}, then turn factor pairings into options you can test.`
              : `برای فضای «${workspace.name}» تحلیل مبتنی بر شاهد بسازید و از پیوند عامل‌ها، گزینه‌های آزمون‌پذیر درآورید.`}
          </p>
        </div>
      </header>
      {(feedback || success) && (
        <p
          className={`strategy-feedback${feedback ? ' is-error' : ' is-success'}`}
          role={feedback ? 'alert' : 'status'}
        >
          {feedback || success}
        </p>
      )}
      {!editable && (
        <p className="strategy-review-note">
          {english
            ? 'You have read-only access to this Workspace.'
            : 'دسترسی شما به این فضا فقط خواندنی است.'}
        </p>
      )}

      <section className="strategy-panel" aria-labelledby="swot-title" id="swot-factors">
        <div className="strategy-panel__heading">
          <div>
            <span className="company-profile-section__eyebrow">
              {english ? '01 · EVIDENCE' : '۰۱ · شواهد'}
            </span>
            <h2 id="swot-title">{english ? 'SWOT factors' : 'عامل‌های SWOT'}</h2>
            <p>
              {english
                ? 'Use a specific statement with its evidence, owner and relative priority.'
                : 'عامل را مشخص و همراه شاهد، مسئول و اولویت نسبی ثبت کنید.'}
            </p>
          </div>
        </div>
        {factors.length === 0 && (
          <EmptyState
            title={english ? 'No factors added yet' : 'هنوز عاملی ثبت نشده است'}
            description={
              english
                ? 'Start with one evidenced strength, weakness, opportunity or threat.'
                : 'با یک قوت، ضعف، فرصت یا تهدید همراه شاهد شروع کنید.'
            }
          />
        )}
        <div className="strategy-swot-grid">
          {FACTOR_GROUPS.map((group) => (
            <section
              className={`strategy-factor-group strategy-factor-group--${group.type}`}
              key={group.type}
              aria-labelledby={`factor-group-${group.type}`}
            >
              <header>
                <div>
                  <span>{group.type.slice(0, 1).toUpperCase()}</span>
                  <h3 id={`factor-group-${group.type}`}>{group[english ? 'en' : 'fa']}</h3>
                </div>
                {editable && (
                  <Button
                    variant="secondary"
                    disabled={Boolean(newFactorType)}
                    onClick={() => setNewFactorType(group.type)}
                  >
                    {english ? 'Add factor' : 'افزودن عامل'}
                  </Button>
                )}
              </header>
              {newFactorType === group.type && (
                <FactorEditor
                  key={group.type}
                  guardKey={`strategy-new-factor-${workspaceId}-${group.type}`}
                  initial={{
                    factor_type: group.type,
                    title: '',
                    evidence: '',
                    owner: '',
                    priority: 3,
                  }}
                  english={english}
                  pending={pendingKeys.has('new-factor')}
                  onSave={saveNewFactor}
                  onCancel={() => setNewFactorType(null)}
                />
              )}
              {factors.filter((factor) => factor.factor_type === group.type).length === 0 &&
                newFactorType !== group.type && (
                  <p className="strategy-empty-group">
                    {english ? 'No factors in this group.' : 'عاملی در این دسته ثبت نشده است.'}
                  </p>
                )}
              <div className="strategy-factor-list">
                {factors
                  .filter((factor) => factor.factor_type === group.type)
                  .map((factor) => (
                    <FactorCard
                      key={factor.id}
                      factor={factor}
                      english={english}
                      editable={editable}
                      pending={pendingKeys.has(`factor-${factor.id}`)}
                      onSave={(draft) => saveFactor(factor.id, draft)}
                      onDelete={removeFactor}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="strategy-panel" aria-labelledby="tows-title" id="tows-options">
        <div className="strategy-panel__heading strategy-panel__heading--row">
          <div>
            <span className="company-profile-section__eyebrow">
              {english ? '02 · STRATEGY OPTIONS' : '۰۲ · گزینه‌های راهبردی'}
            </span>
            <h2 id="tows-title">{english ? 'TOWS factor matching' : 'تطبیق عامل‌ها در TOWS'}</h2>
            <p>
              {english
                ? 'Pair factors from both relevant groups. Write the action, reasoning and test yourself.'
                : 'از دو دسته مرتبط عامل انتخاب کنید و اقدام، منطق و آزمون را خودتان بنویسید.'}
            </p>
          </div>
          {editable && (
            <Button
              variant="primary"
              disabled={!hasCompatiblePairing || creatingOption}
              onClick={() => setCreatingOption(true)}
            >
              {english ? 'Add strategy option' : 'افزودن گزینه راهبردی'}
            </Button>
          )}
        </div>
        {creatingOption && (
          <div className="strategy-option-editor">
            <OptionEditor
              guardKey={`strategy-new-option-${workspaceId}`}
              initialCategory={initialOptionCategory}
              factors={factors}
              english={english}
              pending={pendingKeys.has('new-option')}
              onSave={saveOption}
              onCancel={() => setCreatingOption(false)}
            />
          </div>
        )}
        {options.length === 0 && !creatingOption && (
          <EmptyState
            title={english ? 'No strategy options yet' : 'هنوز گزینه‌ای در TOWS ندارید'}
            description={
              english
                ? 'After adding factors from two matching groups, create a bounded action and a testable assumption.'
                : 'پس از ثبت عامل در دو دسته مرتبط، یک اقدام محدود و فرضیه آزمون‌پذیر بسازید.'
            }
            action={
              editable ? (
                <Button
                  variant="secondary"
                  disabled={!hasCompatiblePairing}
                  onClick={() => setCreatingOption(true)}
                >
                  {english ? 'Create first option' : 'ساخت اولین گزینه'}
                </Button>
              ) : undefined
            }
          />
        )}
        <div className="strategy-option-groups">
          {OPTION_GROUPS.map((group) => {
            const groupOptions = options.filter((option) => option.category === group.type);
            return (
              <section
                className="strategy-option-group"
                key={group.type}
                aria-labelledby={`tows-${group.type}`}
              >
                <header>
                  <span
                    className={`strategy-category strategy-category--${group.type.toLowerCase()}`}
                  >
                    {group.type}
                  </span>
                  <div>
                    <h3 id={`tows-${group.type}`}>{group[english ? 'en' : 'fa']}</h3>
                    <p>
                      {english ? `Link ${group.pairing} factors` : `پیوند عامل‌های ${group.type}`}
                    </p>
                  </div>
                  <span className="strategy-option-count">
                    {new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(groupOptions.length)}
                  </span>
                </header>
                {groupOptions.length === 0 ? (
                  <p className="strategy-empty-group">
                    {english ? 'No options in this pairing.' : 'در این ترکیب گزینه‌ای نیست.'}
                  </p>
                ) : (
                  groupOptions.map((option) => (
                    <OptionCard
                      key={option.id}
                      option={option}
                      factors={factors}
                      english={english}
                      editable={editable}
                      pending={pendingKeys.has(`option-${option.id}`)}
                      onSave={(draft, revision) => saveOption(draft, revision)}
                      onDelete={removeOption}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
