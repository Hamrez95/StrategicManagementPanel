import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, EmptyState, Input, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type {
  ApiProfileAssumption,
  ApiProfileCustomerSegment,
  ApiProfileEvidence,
  ApiProfileGoal,
  ApiProfileProduct,
  ApiWorkspaceICP,
  ApiWorkspaceProfile,
} from '../../api/contracts';
import type { Session } from '../../session';
import {
  listWorkspaceProfileRevisions,
  readWorkspaceProfile,
  saveWorkspaceProfileSafely,
  WorkspaceProfileConflictError,
  type ProjectProfileUpdate,
} from './api';
import { useWorkspaceDirtyGuard } from './switchContext';

type CollectionField = 'products' | 'customer_segments' | 'goals' | 'icps';

function entityId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function blankProfile(workspaceId: string): ApiWorkspaceProfile {
  return {
    workspace_id: workspaceId,
    company_name: '',
    industry: '',
    stage: '',
    mission: '',
    problem_statement: '',
    products: [],
    customer_segments: [],
    goals: [],
    icps: [],
    revision: 1,
    onboarding_completed_at: null,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="company-profile-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  maxLength,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <Input
      label={label}
      value={value}
      required={required}
      maxLength={maxLength}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="company-profile-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="company-profile-section__heading">
        <div>
          <p className="company-profile-section__eyebrow">{eyebrow}</p>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ListCard({
  title,
  index,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  index: number;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}) {
  return (
    <article className="company-profile-card">
      <div className="company-profile-card__heading">
        <h3>
          {title} {index > 0 ? `· ${index + 1}` : ''}
        </h3>
        <Button variant="quiet" onClick={onRemove}>
          {removeLabel}
        </Button>
      </div>
      {children}
    </article>
  );
}

function newProduct(): ApiProfileProduct {
  return { id: entityId(), name: '', description: '', problem_solved: '', target_customer: '' };
}
function newCustomer(): ApiProfileCustomerSegment {
  return { id: entityId(), name: '', description: '', needs: '', buying_roles: '' };
}
function newGoal(): ApiProfileGoal {
  return { id: entityId(), title: '', success_signal: '', timeframe: '' };
}
function newEvidence(): ApiProfileEvidence {
  return {
    id: entityId(),
    source_type: 'interview',
    reference: '',
    statement: '',
    date: '',
    confidence: 'medium',
  };
}
function newAssumption(): ApiProfileAssumption {
  return { id: entityId(), statement: '', confidence: 'medium', test: '', status: 'untested' };
}
function newICP(): ApiWorkspaceICP {
  return {
    id: entityId(),
    name: '',
    segment: { industry: '', organization_size: '', geography: '', buying_context: '' },
    persona: { role: '', decision_role: '', goals: '', pains: '' },
    problem: '',
    evidence: [],
    assumptions: [],
  };
}

export default function CompanyProfilePage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const location = useLocation();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: queryKeys.workspace.profile(workspaceId),
    queryFn: ({ signal }) => readWorkspaceProfile(workspaceId, signal),
    enabled: Boolean(workspace),
  });
  const revisionsQuery = useQuery({
    queryKey: queryKeys.workspace.profileRevisions(workspaceId),
    queryFn: ({ signal }) => listWorkspaceProfileRevisions(workspaceId, signal),
    enabled: Boolean(workspace),
  });
  const [draft, setDraft] = useState<ApiWorkspaceProfile>(() => blankProfile(workspaceId));
  const [loadedWorkspace, setLoadedWorkspace] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [latestConflict, setLatestConflict] = useState<ApiWorkspaceProfile | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [icpSearch, setIcpSearch] = useState('');
  const [selectedIcpId, setSelectedIcpId] = useState('');
  const canEdit = workspace?.role !== 'viewer';
  const isDirty = Boolean(
    loadedWorkspace === workspaceId &&
    profileQuery.data &&
    JSON.stringify(draft) !== JSON.stringify(profileQuery.data),
  );
  useWorkspaceDirtyGuard(`company-profile-${workspaceId}`, isDirty);

  useEffect(() => {
    if (!workspaceId || !profileQuery.data || loadedWorkspace === workspaceId) return;
    setDraft(clone(profileQuery.data));
    setLoadedWorkspace(workspaceId);
    setSelectedIcpId(profileQuery.data.icps[0]?.id ?? '');
    setSaveError('');
    setSavedMessage('');
  }, [loadedWorkspace, profileQuery.data, workspaceId]);

  useEffect(() => {
    if (location.hash === '#icps')
      document.getElementById('icps')?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [loadedWorkspace, location.hash]);

  const filteredIcps = useMemo(() => {
    const term = icpSearch.trim().toLocaleLowerCase(english ? 'en-US' : 'fa-IR');
    if (!term) return draft.icps;
    return draft.icps.filter((icp) =>
      `${icp.name} ${icp.segment.industry} ${icp.persona.role} ${icp.problem}`
        .toLocaleLowerCase(english ? 'en-US' : 'fa-IR')
        .includes(term),
    );
  }, [draft.icps, english, icpSearch]);
  const activeIcp = filteredIcps.find((icp) => icp.id === selectedIcpId) ?? filteredIcps[0];

  function updateField<
    K extends 'company_name' | 'industry' | 'stage' | 'mission' | 'problem_statement',
  >(field: K, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSavedMessage('');
  }

  function updateCollection<
    T extends ApiProfileProduct | ApiProfileCustomerSegment | ApiProfileGoal | ApiWorkspaceICP,
  >(field: CollectionField, id: string, update: (item: T) => T) {
    setDraft(
      (current) =>
        ({
          ...current,
          [field]: (current[field] as T[]).map((item) => (item.id === id ? update(item) : item)),
        }) as ApiWorkspaceProfile,
    );
    setSavedMessage('');
  }

  function addCollection(
    field: CollectionField,
    item: ApiProfileProduct | ApiProfileCustomerSegment | ApiProfileGoal | ApiWorkspaceICP,
  ) {
    setDraft((current) => {
      if (field === 'products')
        return { ...current, products: [...current.products, item as ApiProfileProduct] };
      if (field === 'customer_segments')
        return {
          ...current,
          customer_segments: [...current.customer_segments, item as ApiProfileCustomerSegment],
        };
      if (field === 'goals')
        return { ...current, goals: [...current.goals, item as ApiProfileGoal] };
      return { ...current, icps: [...current.icps, item as ApiWorkspaceICP] };
    });
    if (field === 'icps') {
      setIcpSearch('');
      setSelectedIcpId(item.id);
    }
    setSavedMessage('');
  }

  function removeCollection(field: CollectionField, id: string) {
    setDraft((current) => {
      if (field === 'products')
        return { ...current, products: current.products.filter((item) => item.id !== id) };
      if (field === 'customer_segments')
        return {
          ...current,
          customer_segments: current.customer_segments.filter((item) => item.id !== id),
        };
      if (field === 'goals')
        return { ...current, goals: current.goals.filter((item) => item.id !== id) };
      return { ...current, icps: current.icps.filter((item) => item.id !== id) };
    });
    if (field === 'icps' && selectedIcpId === id)
      setSelectedIcpId(draft.icps.find((item) => item.id !== id)?.id ?? '');
    setSavedMessage('');
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !isDirty) return;
    setSaving(true);
    setSaveError('');
    setSavedMessage('');
    setLatestConflict(null);
    const update: ProjectProfileUpdate = {
      revision: profileQuery.data?.revision ?? draft.revision,
      company_name: draft.company_name,
      industry: draft.industry,
      stage: draft.stage,
      mission: draft.mission,
      problem_statement: draft.problem_statement,
      products: draft.products,
      customer_segments: draft.customer_segments,
      goals: draft.goals,
      icps: draft.icps,
    };
    try {
      const saved = await saveWorkspaceProfileSafely(workspaceId, update);
      setDraft(clone(saved));
      queryClient.setQueryData(queryKeys.workspace.profile(workspaceId), saved);
      setSavedMessage(
        english ? 'Profile saved for this Workspace.' : 'اطلاعات این فضای کار ذخیره شد.',
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workspace.profileRevisions(workspaceId),
      });
    } catch (error) {
      if (error instanceof WorkspaceProfileConflictError) setLatestConflict(error.latest);
      setSaveError(
        error instanceof Error
          ? error.message
          : english
            ? 'The profile could not be saved.'
            : 'ذخیره اطلاعات انجام نشد.',
      );
    } finally {
      setSaving(false);
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

  if (profileQuery.isPending)
    return (
      <div className="company-profile-page">
        <Skeleton
          label={english ? 'Loading business profile' : 'در حال بارگذاری شناخت کسب‌وکار'}
          lines={5}
        />
      </div>
    );
  if (profileQuery.isError)
    return (
      <div className="company-profile-page">
        <Notice title={english ? 'Profile could not be loaded' : 'بارگذاری پروفایل انجام نشد'}>
          <p role="alert">{profileQuery.error.message}</p>
          <Button onClick={() => void profileQuery.refetch()}>
            {english ? 'Try again' : 'تلاش دوباره'}
          </Button>
        </Notice>
      </div>
    );

  return (
    <div className="company-profile-page">
      <header className="company-profile-heading">
        <div>
          <p className="auth-kicker">{english ? 'BUSINESS PROFILE' : 'شناخت کسب‌وکار'}</p>
          <h1 tabIndex={-1}>{english ? 'Company and ideal customer' : 'شرکت و مشتری ایده‌آل'}</h1>
          <p>
            {english
              ? `A separate, evidence-based profile for ${workspace.name}. Start with what you know; leave unknowns blank.`
              : `شناخت مبتنی بر شواهد برای فضای «${workspace.name}». از دانسته‌ها شروع کنید و موارد نامعلوم را خالی بگذارید.`}
          </p>
        </div>
        <Dialog
          closeLabel={english ? 'Close' : 'بستن'}
          trigger={
            <Button variant="secondary" onClick={() => setGuideOpen(true)}>
              {english ? 'ICP guide' : 'راهنمای ICP'}
            </Button>
          }
          title={
            english ? 'A useful ICP is specific and testable' : 'یک ICP مفید، مشخص و آزمون‌پذیر است'
          }
          description={
            english
              ? 'Separate the organization, the person involved, observed evidence and assumptions.'
              : 'ویژگی سازمان، نقش افراد، شواهد مشاهده‌شده و فرضیه‌ها را جدا ثبت کنید.'
          }
          open={guideOpen}
          onOpenChange={setGuideOpen}
        >
          <div className="company-profile-guide">
            <ol>
              <li>
                <strong>{english ? 'Segment' : 'بخش بازار'}</strong>
                <span>
                  {english
                    ? 'Describe industry, organization size, geography and buying context.'
                    : 'صنعت، اندازه سازمان، جغرافیا و زمینه خرید را مشخص کنید.'}
                </span>
              </li>
              <li>
                <strong>{english ? 'Persona' : 'پرسونا'}</strong>
                <span>
                  {english
                    ? 'Name the user or buyer, their decision role, goals and pains.'
                    : 'نقش کاربر یا خریدار، سهم او در تصمیم، هدف‌ها و دردسرهایش را بنویسید.'}
                </span>
              </li>
              <li>
                <strong>{english ? 'Evidence' : 'شاهد'}</strong>
                <span>
                  {english
                    ? 'Record something observed, with its source and date.'
                    : 'آنچه واقعاً مشاهده شده همراه منبع و تاریخ ثبت کنید.'}
                </span>
              </li>
              <li>
                <strong>{english ? 'Assumption' : 'فرضیه'}</strong>
                <span>
                  {english
                    ? 'Mark an unverified belief and the next test that could change your mind.'
                    : 'باوری را که هنوز بررسی نشده مشخص کنید و آزمون بعدی آن را بنویسید.'}
                </span>
              </li>
            </ol>
            <p>
              {english
                ? 'There is no universal score. Compare customer groups against your own strategy and evidence.'
                : 'امتیاز جهانی برای ICP وجود ندارد؛ گروه‌ها را با شواهد و راهبرد خودتان مقایسه کنید.'}
            </p>
          </div>
        </Dialog>
      </header>

      <form onSubmit={(event) => void saveProfile(event)}>
        <fieldset className="company-profile-form" disabled={saving || !canEdit}>
          <Section
            id="business"
            eyebrow={english ? '01 · BUSINESS' : '۰۱ · کسب‌وکار'}
            title={english ? 'Company and direction' : 'شرکت و جهت حرکت'}
            description={
              english
                ? 'Capture the current business context. Every field is optional.'
                : 'زمینه فعلی کسب‌وکار را بنویسید؛ همه فیلدها اختیاری هستند.'
            }
          >
            <div className="company-profile-grid">
              <TextInput
                label={english ? 'Company or project name' : 'نام شرکت یا پروژه'}
                value={draft.company_name}
                maxLength={120}
                onChange={(value) => updateField('company_name', value)}
              />
              <TextInput
                label={english ? 'Industry' : 'حوزه فعالیت'}
                value={draft.industry}
                maxLength={200}
                onChange={(value) => updateField('industry', value)}
              />
              <TextInput
                label={english ? 'Current stage' : 'مرحله فعلی'}
                value={draft.stage}
                maxLength={100}
                onChange={(value) => updateField('stage', value)}
              />
              <TextAreaField
                label={english ? 'Mission or strategic goal' : 'ماموریت یا هدف راهبردی'}
                value={draft.mission}
                onChange={(value) => updateField('mission', value)}
              />
              <TextAreaField
                label={english ? 'Core customer problem' : 'مسئله اصلی مشتری'}
                value={draft.problem_statement}
                onChange={(value) => updateField('problem_statement', value)}
              />
            </div>
          </Section>

          <Section
            id="products"
            eyebrow={english ? '02 · OFFER' : '۰۲ · محصول'}
            title={english ? 'Products and services' : 'محصول و خدمت'}
            description={
              english
                ? 'Describe what you offer and whom it helps.'
                : 'آنچه ارائه می‌کنید و افرادی که از آن بهره می‌برند توضیح دهید.'
            }
            action={
              <Button variant="secondary" onClick={() => addCollection('products', newProduct())}>
                {english ? 'Add product' : 'افزودن محصول'}
              </Button>
            }
          >
            {draft.products.length === 0 ? (
              <p className="company-profile-empty">
                {english
                  ? 'No products added yet. This section can stay empty.'
                  : 'هنوز محصولی ثبت نشده است؛ می‌توانید این بخش را خالی بگذارید.'}
              </p>
            ) : (
              <div className="company-profile-cards">
                {draft.products.map((product, index) => (
                  <ListCard
                    key={product.id}
                    title={product.name || (english ? 'New product' : 'محصول تازه')}
                    index={index}
                    removeLabel={english ? 'Remove' : 'حذف'}
                    onRemove={() => removeCollection('products', product.id)}
                  >
                    <div className="company-profile-grid">
                      <TextInput
                        required
                        label={english ? 'Name' : 'نام'}
                        value={product.name}
                        onChange={(value) =>
                          updateCollection<ApiProfileProduct>('products', product.id, (item) => ({
                            ...item,
                            name: value,
                          }))
                        }
                      />
                      <TextAreaField
                        label={english ? 'Description' : 'توضیح'}
                        value={product.description}
                        onChange={(value) =>
                          updateCollection<ApiProfileProduct>('products', product.id, (item) => ({
                            ...item,
                            description: value,
                          }))
                        }
                      />
                      <TextAreaField
                        label={english ? 'Problem solved' : 'مسئله‌ای که حل می‌کند'}
                        value={product.problem_solved}
                        onChange={(value) =>
                          updateCollection<ApiProfileProduct>('products', product.id, (item) => ({
                            ...item,
                            problem_solved: value,
                          }))
                        }
                      />
                      <TextAreaField
                        label={english ? 'Target customer' : 'مشتری هدف'}
                        value={product.target_customer}
                        onChange={(value) =>
                          updateCollection<ApiProfileProduct>('products', product.id, (item) => ({
                            ...item,
                            target_customer: value,
                          }))
                        }
                      />
                    </div>
                  </ListCard>
                ))}
              </div>
            )}
          </Section>

          <Section
            id="customers"
            eyebrow={english ? '03 · CUSTOMER GROUPS' : '۰۳ · گروه مشتری'}
            title={english ? 'Customer segments' : 'بخش‌های مشتری'}
            description={
              english
                ? 'Keep broad customer groups separate from the specific ICPs below.'
                : 'گروه‌های کلی مشتری را جدا از ICPهای مشخص در بخش بعد نگه دارید.'
            }
            action={
              <Button
                variant="secondary"
                onClick={() => addCollection('customer_segments', newCustomer())}
              >
                {english ? 'Add segment' : 'افزودن بخش'}
              </Button>
            }
          >
            {draft.customer_segments.length === 0 ? (
              <p className="company-profile-empty">
                {english ? 'No customer segments added yet.' : 'هنوز گروه مشتری ثبت نشده است.'}
              </p>
            ) : (
              <div className="company-profile-cards">
                {draft.customer_segments.map((customer, index) => (
                  <ListCard
                    key={customer.id}
                    title={customer.name || (english ? 'New segment' : 'بخش تازه')}
                    index={index}
                    removeLabel={english ? 'Remove' : 'حذف'}
                    onRemove={() => removeCollection('customer_segments', customer.id)}
                  >
                    <div className="company-profile-grid">
                      <TextInput
                        required
                        label={english ? 'Segment name' : 'نام بخش'}
                        value={customer.name}
                        onChange={(value) =>
                          updateCollection<ApiProfileCustomerSegment>(
                            'customer_segments',
                            customer.id,
                            (item) => ({ ...item, name: value }),
                          )
                        }
                      />
                      <TextAreaField
                        label={english ? 'Description' : 'توضیح'}
                        value={customer.description}
                        onChange={(value) =>
                          updateCollection<ApiProfileCustomerSegment>(
                            'customer_segments',
                            customer.id,
                            (item) => ({ ...item, description: value }),
                          )
                        }
                      />
                      <TextAreaField
                        label={english ? 'Needs' : 'نیازها'}
                        value={customer.needs}
                        onChange={(value) =>
                          updateCollection<ApiProfileCustomerSegment>(
                            'customer_segments',
                            customer.id,
                            (item) => ({ ...item, needs: value }),
                          )
                        }
                      />
                      <TextAreaField
                        label={english ? 'Buying roles' : 'نقش‌های خرید'}
                        value={customer.buying_roles}
                        onChange={(value) =>
                          updateCollection<ApiProfileCustomerSegment>(
                            'customer_segments',
                            customer.id,
                            (item) => ({ ...item, buying_roles: value }),
                          )
                        }
                      />
                    </div>
                  </ListCard>
                ))}
              </div>
            )}
          </Section>

          <Section
            id="goals"
            eyebrow={english ? '04 · GOALS' : '۰۴ · هدف‌ها'}
            title={english ? 'Business goals' : 'هدف‌های کسب‌وکار'}
            description={
              english
                ? 'Make progress observable without assuming a fixed target.'
                : 'نشانه پیشرفت را روشن کنید، بدون فرض‌کردن هدف عددی ثابت.'
            }
            action={
              <Button variant="secondary" onClick={() => addCollection('goals', newGoal())}>
                {english ? 'Add goal' : 'افزودن هدف'}
              </Button>
            }
          >
            {draft.goals.length === 0 ? (
              <p className="company-profile-empty">
                {english ? 'No goals added yet.' : 'هنوز هدفی ثبت نشده است.'}
              </p>
            ) : (
              <div className="company-profile-cards">
                {draft.goals.map((goal, index) => (
                  <ListCard
                    key={goal.id}
                    title={goal.title || (english ? 'New goal' : 'هدف تازه')}
                    index={index}
                    removeLabel={english ? 'Remove' : 'حذف'}
                    onRemove={() => removeCollection('goals', goal.id)}
                  >
                    <div className="company-profile-grid">
                      <TextInput
                        required
                        label={english ? 'Goal' : 'هدف'}
                        value={goal.title}
                        onChange={(value) =>
                          updateCollection<ApiProfileGoal>('goals', goal.id, (item) => ({
                            ...item,
                            title: value,
                          }))
                        }
                      />
                      <TextAreaField
                        label={english ? 'Signal of success' : 'نشانه موفقیت'}
                        value={goal.success_signal}
                        onChange={(value) =>
                          updateCollection<ApiProfileGoal>('goals', goal.id, (item) => ({
                            ...item,
                            success_signal: value,
                          }))
                        }
                      />
                      <TextInput
                        label={english ? 'Timeframe' : 'بازه زمانی'}
                        value={goal.timeframe}
                        onChange={(value) =>
                          updateCollection<ApiProfileGoal>('goals', goal.id, (item) => ({
                            ...item,
                            timeframe: value,
                          }))
                        }
                      />
                    </div>
                  </ListCard>
                ))}
              </div>
            )}
          </Section>

          <Section
            id="icps"
            eyebrow={english ? '05 · IDEAL CUSTOMER' : '۰۵ · مشتری ایده‌آل'}
            title={english ? 'Ideal customer profiles' : 'پروفایل مشتری ایده‌آل'}
            description={
              english
                ? 'Search and compare specific organizations and the people who buy or use your offer.'
                : 'سازمان‌های مشخص و افراد خریدار یا استفاده‌کننده را جست‌وجو و مقایسه کنید.'
            }
            action={
              <Button variant="primary" onClick={() => addCollection('icps', newICP())}>
                {english ? 'Add ICP' : 'افزودن ICP'}
              </Button>
            }
          >
            {draft.icps.length === 0 ? (
              <EmptyState
                title={english ? 'No ICPs yet' : 'هنوز ICP نساخته‌اید'}
                description={
                  english
                    ? 'Create a customer profile when you are ready. Nothing is prefilled.'
                    : 'هر زمان آماده بودید یک پروفایل مشتری بسازید؛ اطلاعات از پیش‌ساخته‌ای وجود ندارد.'
                }
                action={
                  <Button variant="primary" onClick={() => addCollection('icps', newICP())}>
                    {english ? 'Create first ICP' : 'تعریف اولین ICP'}
                  </Button>
                }
              />
            ) : (
              <div className="company-profile-icp-layout">
                <aside
                  className="company-profile-icp-index"
                  aria-label={english ? 'ICP index' : 'فهرست ICPها'}
                >
                  <Input
                    label={english ? 'Search ICPs' : 'جست‌وجوی ICP'}
                    value={icpSearch}
                    onChange={(event) => setIcpSearch(event.currentTarget.value)}
                  />
                  {filteredIcps.length === 0 ? (
                    <p className="company-profile-empty">
                      {english ? 'No matching ICP.' : 'ICP مطابقی پیدا نشد.'}
                    </p>
                  ) : (
                    <ul>
                      {filteredIcps.map((icp) => (
                        <li key={icp.id}>
                          <button
                            type="button"
                            className={icp.id === activeIcp?.id ? 'is-active' : ''}
                            onClick={() => setSelectedIcpId(icp.id)}
                          >
                            <strong>
                              {icp.name || (english ? 'Untitled ICP' : 'ICP بدون نام')}
                            </strong>
                            <small>
                              {[icp.segment.industry, icp.persona.role]
                                .filter(Boolean)
                                .join(' · ') ||
                                (english ? 'Details not added' : 'جزئیاتی ثبت نشده')}
                            </small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
                {activeIcp && (
                  <div className="company-profile-icp-editor">
                    <ListCard
                      title={activeIcp.name || (english ? 'New ICP' : 'ICP تازه')}
                      index={0}
                      removeLabel={english ? 'Remove ICP' : 'حذف ICP'}
                      onRemove={() => removeCollection('icps', activeIcp.id)}
                    >
                      <div className="company-profile-subsection">
                        <h4>{english ? 'Organization segment' : 'بخش سازمانی'}</h4>
                        <div className="company-profile-grid">
                          <TextInput
                            label={english ? 'Industry' : 'صنعت'}
                            value={activeIcp.segment.industry}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                segment: { ...item.segment, industry: value },
                              }))
                            }
                          />
                          <TextInput
                            label={english ? 'Organization size' : 'اندازه سازمان'}
                            value={activeIcp.segment.organization_size}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                segment: { ...item.segment, organization_size: value },
                              }))
                            }
                          />
                          <TextInput
                            label={english ? 'Geography' : 'جغرافیا'}
                            value={activeIcp.segment.geography}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                segment: { ...item.segment, geography: value },
                              }))
                            }
                          />
                          <TextAreaField
                            label={english ? 'Buying context' : 'زمینه خرید'}
                            value={activeIcp.segment.buying_context}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                segment: { ...item.segment, buying_context: value },
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="company-profile-subsection">
                        <h4>{english ? 'Person and role' : 'فرد و نقش'}</h4>
                        <div className="company-profile-grid">
                          <TextInput
                            required
                            label={english ? 'ICP name' : 'نام ICP'}
                            value={activeIcp.name}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                name: value,
                              }))
                            }
                          />
                          <TextInput
                            label={english ? 'Persona role' : 'نقش پرسونا'}
                            value={activeIcp.persona.role}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                persona: { ...item.persona, role: value },
                              }))
                            }
                          />
                          <TextInput
                            label={english ? 'Decision role' : 'نقش در تصمیم خرید'}
                            value={activeIcp.persona.decision_role}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                persona: { ...item.persona, decision_role: value },
                              }))
                            }
                          />
                          <TextAreaField
                            label={english ? 'Goals' : 'هدف‌های او'}
                            value={activeIcp.persona.goals}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                persona: { ...item.persona, goals: value },
                              }))
                            }
                          />
                          <TextAreaField
                            label={english ? 'Pains' : 'دردسرها'}
                            value={activeIcp.persona.pains}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                persona: { ...item.persona, pains: value },
                              }))
                            }
                          />
                          <TextAreaField
                            label={english ? 'Problem to solve' : 'مسئله برای حل'}
                            value={activeIcp.problem}
                            onChange={(value) =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                problem: value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="company-profile-subsection company-profile-proof">
                        <div className="company-profile-subsection__heading">
                          <div>
                            <h4>{english ? 'Observed evidence' : 'شواهد مشاهده‌شده'}</h4>
                            <p>
                              {english
                                ? 'Evidence records what happened and where it came from.'
                                : 'شاهد آنچه رخ داده و منبع آن را نگه می‌دارد.'}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                evidence: [...item.evidence, newEvidence()],
                              }))
                            }
                          >
                            {english ? 'Add evidence' : 'افزودن شاهد'}
                          </Button>
                        </div>
                        {activeIcp.evidence.length === 0 ? (
                          <p className="company-profile-empty">
                            {english ? 'No evidence recorded.' : 'هنوز شاهدی ثبت نشده است.'}
                          </p>
                        ) : (
                          activeIcp.evidence.map((evidence, index) => (
                            <div
                              className="company-profile-record company-profile-record--evidence"
                              key={evidence.id}
                            >
                              <div className="company-profile-grid">
                                <TextAreaField
                                  required
                                  label={english ? 'Observed statement' : 'آنچه مشاهده شد'}
                                  value={evidence.statement}
                                  onChange={(value) =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        evidence: item.evidence.map((entry) =>
                                          entry.id === evidence.id
                                            ? { ...entry, statement: value }
                                            : entry,
                                        ),
                                      }),
                                    )
                                  }
                                />
                                <TextInput
                                  label={english ? 'Source or reference' : 'منبع یا ارجاع'}
                                  value={evidence.reference}
                                  onChange={(value) =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        evidence: item.evidence.map((entry) =>
                                          entry.id === evidence.id
                                            ? { ...entry, reference: value }
                                            : entry,
                                        ),
                                      }),
                                    )
                                  }
                                />
                                <label className="company-profile-field">
                                  <span>{english ? 'Source type' : 'نوع منبع'}</span>
                                  <select
                                    value={evidence.source_type}
                                    onChange={(event) =>
                                      updateCollection<ApiWorkspaceICP>(
                                        'icps',
                                        activeIcp.id,
                                        (item) => ({
                                          ...item,
                                          evidence: item.evidence.map((entry) =>
                                            entry.id === evidence.id
                                              ? {
                                                  ...entry,
                                                  source_type: event.currentTarget
                                                    .value as ApiProfileEvidence['source_type'],
                                                }
                                              : entry,
                                          ),
                                        }),
                                      )
                                    }
                                  >
                                    {[
                                      ['interview', english ? 'Interview' : 'مصاحبه'],
                                      ['sales', english ? 'Sales' : 'فروش'],
                                      ['support', english ? 'Support' : 'پشتیبانی'],
                                      ['usage', english ? 'Product usage' : 'استفاده از محصول'],
                                      ['survey', english ? 'Survey' : 'نظرسنجی'],
                                      ['document', english ? 'Document' : 'سند'],
                                      [
                                        'secondary',
                                        english ? 'Secondary research' : 'پژوهش ثانویه',
                                      ],
                                      ['other', english ? 'Other' : 'سایر'],
                                    ].map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <TextInput
                                  label={english ? 'Date' : 'تاریخ'}
                                  value={evidence.date}
                                  onChange={(value) =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        evidence: item.evidence.map((entry) =>
                                          entry.id === evidence.id
                                            ? { ...entry, date: value }
                                            : entry,
                                        ),
                                      }),
                                    )
                                  }
                                />
                                <label className="company-profile-field">
                                  <span>{english ? 'Confidence' : 'اطمینان'}</span>
                                  <select
                                    value={evidence.confidence}
                                    onChange={(event) =>
                                      updateCollection<ApiWorkspaceICP>(
                                        'icps',
                                        activeIcp.id,
                                        (item) => ({
                                          ...item,
                                          evidence: item.evidence.map((entry) =>
                                            entry.id === evidence.id
                                              ? {
                                                  ...entry,
                                                  confidence: event.currentTarget
                                                    .value as ApiProfileEvidence['confidence'],
                                                }
                                              : entry,
                                          ),
                                        }),
                                      )
                                    }
                                  >
                                    {[
                                      ['low', english ? 'Low' : 'کم'],
                                      ['medium', english ? 'Medium' : 'متوسط'],
                                      ['high', english ? 'High' : 'زیاد'],
                                    ].map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <Button
                                  variant="quiet"
                                  onClick={() =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        evidence: item.evidence.filter(
                                          (entry) => entry.id !== evidence.id,
                                        ),
                                      }),
                                    )
                                  }
                                >
                                  {english
                                    ? `Remove evidence ${index + 1}`
                                    : `حذف شاهد ${index + 1}`}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="company-profile-subsection company-profile-assumptions">
                        <div className="company-profile-subsection__heading">
                          <div>
                            <h4>{english ? 'Assumptions to test' : 'فرضیه‌های نیازمند آزمون'}</h4>
                            <p>
                              {english
                                ? 'Assumptions are beliefs, not observed facts.'
                                : 'فرضیه باور است و به‌عنوان واقعیت مشاهده‌شده ثبت نمی‌شود.'}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              updateCollection<ApiWorkspaceICP>('icps', activeIcp.id, (item) => ({
                                ...item,
                                assumptions: [...item.assumptions, newAssumption()],
                              }))
                            }
                          >
                            {english ? 'Add assumption' : 'افزودن فرضیه'}
                          </Button>
                        </div>
                        {activeIcp.assumptions.length === 0 ? (
                          <p className="company-profile-empty">
                            {english ? 'No assumptions recorded.' : 'هنوز فرضیه‌ای ثبت نشده است.'}
                          </p>
                        ) : (
                          activeIcp.assumptions.map((assumption, index) => (
                            <div
                              className="company-profile-record company-profile-record--assumption"
                              key={assumption.id}
                            >
                              <div className="company-profile-grid">
                                <TextAreaField
                                  required
                                  label={english ? 'Assumption' : 'فرضیه'}
                                  value={assumption.statement}
                                  onChange={(value) =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        assumptions: item.assumptions.map((entry) =>
                                          entry.id === assumption.id
                                            ? { ...entry, statement: value }
                                            : entry,
                                        ),
                                      }),
                                    )
                                  }
                                />
                                <TextAreaField
                                  label={english ? 'Next test' : 'آزمون بعدی'}
                                  value={assumption.test}
                                  onChange={(value) =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        assumptions: item.assumptions.map((entry) =>
                                          entry.id === assumption.id
                                            ? { ...entry, test: value }
                                            : entry,
                                        ),
                                      }),
                                    )
                                  }
                                />
                                <label className="company-profile-field">
                                  <span>{english ? 'Confidence' : 'اطمینان'}</span>
                                  <select
                                    value={assumption.confidence}
                                    onChange={(event) =>
                                      updateCollection<ApiWorkspaceICP>(
                                        'icps',
                                        activeIcp.id,
                                        (item) => ({
                                          ...item,
                                          assumptions: item.assumptions.map((entry) =>
                                            entry.id === assumption.id
                                              ? {
                                                  ...entry,
                                                  confidence: event.currentTarget
                                                    .value as ApiProfileAssumption['confidence'],
                                                }
                                              : entry,
                                          ),
                                        }),
                                      )
                                    }
                                  >
                                    {[
                                      ['low', english ? 'Low' : 'کم'],
                                      ['medium', english ? 'Medium' : 'متوسط'],
                                      ['high', english ? 'High' : 'زیاد'],
                                    ].map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="company-profile-field">
                                  <span>{english ? 'Status' : 'وضعیت'}</span>
                                  <select
                                    value={assumption.status}
                                    onChange={(event) =>
                                      updateCollection<ApiWorkspaceICP>(
                                        'icps',
                                        activeIcp.id,
                                        (item) => ({
                                          ...item,
                                          assumptions: item.assumptions.map((entry) =>
                                            entry.id === assumption.id
                                              ? {
                                                  ...entry,
                                                  status: event.currentTarget
                                                    .value as ApiProfileAssumption['status'],
                                                }
                                              : entry,
                                          ),
                                        }),
                                      )
                                    }
                                  >
                                    {[
                                      ['untested', english ? 'Untested' : 'آزمون‌نشده'],
                                      ['supported', english ? 'Supported' : 'پشتیبانی‌شده'],
                                      ['rejected', english ? 'Rejected' : 'ردشده'],
                                    ].map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <Button
                                  variant="quiet"
                                  onClick={() =>
                                    updateCollection<ApiWorkspaceICP>(
                                      'icps',
                                      activeIcp.id,
                                      (item) => ({
                                        ...item,
                                        assumptions: item.assumptions.filter(
                                          (entry) => entry.id !== assumption.id,
                                        ),
                                      }),
                                    )
                                  }
                                >
                                  {english
                                    ? `Remove assumption ${index + 1}`
                                    : `حذف فرضیه ${index + 1}`}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ListCard>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section
            id="goals-next"
            eyebrow={english ? '06 · NEXT STEP' : '۰۶ · گام بعد'}
            title={english ? 'What should happen next?' : 'گام بعدی چیست؟'}
            description={
              english
                ? 'Keep the first step small and tied to a customer question.'
                : 'گام اول را کوچک و مرتبط با پرسشی درباره مشتری انتخاب کنید.'
            }
          >
            <div className="company-profile-next">
              <span aria-hidden="true">→</span>
              <p>
                {draft.icps.length === 0
                  ? english
                    ? 'Start by describing one customer group you want to understand.'
                    : 'با توصیف یک گروه مشتری که می‌خواهید بهتر بشناسید شروع کنید.'
                  : english
                    ? 'Review your assumptions and plan one conversation or observation to test the riskiest one.'
                    : 'فرضیه‌ها را مرور کنید و یک گفت‌وگو یا مشاهده برای آزمودن پرریسک‌ترین مورد برنامه‌ریزی کنید.'}
              </p>
              <a href="#icps">{english ? 'Go to ICPs' : 'رفتن به ICPها'}</a>
            </div>
          </Section>
        </fieldset>

        <div className="company-profile-savebar">
          <div aria-live="polite">
            {saveError && (
              <p className="company-profile-feedback company-profile-feedback--error" role="alert">
                {saveError}
              </p>
            )}
            {savedMessage && (
              <p
                className="company-profile-feedback company-profile-feedback--success"
                role="status"
              >
                {savedMessage}
              </p>
            )}
            {!saveError && !savedMessage && (
              <p>
                {isDirty
                  ? english
                    ? 'Unsaved changes'
                    : 'تغییرات ذخیره‌نشده'
                  : english
                    ? 'All changes saved'
                    : 'همه تغییرات ذخیره شده است'}
              </p>
            )}
          </div>
          {!canEdit && (
            <p className="company-profile-feedback">
              {english
                ? 'You have read-only access to this Workspace.'
                : 'دسترسی شما به این فضا فقط خواندنی است.'}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            pending={saving}
            pendingLabel={english ? 'Saving…' : 'در حال ذخیره…'}
            disabled={!isDirty || !canEdit}
          >
            {english ? 'Save profile' : 'ذخیره پروفایل'}
          </Button>
        </div>
        {latestConflict && (
          <section className="company-profile-conflict" aria-live="polite">
            <p>
              {english
                ? 'A newer version is saved on the server.'
                : 'نسخه تازه‌تری روی سرور ذخیره شده است.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(clone(latestConflict));
                queryClient.setQueryData(queryKeys.workspace.profile(workspaceId), latestConflict);
                setLatestConflict(null);
                setSaveError('');
              }}
            >
              {english ? 'Load latest version' : 'بارگذاری نسخه تازه'}
            </Button>
          </section>
        )}
      </form>

      <section className="company-profile-history" aria-labelledby="profile-history-title">
        <div>
          <p className="company-profile-section__eyebrow">
            {english ? 'CHANGE HISTORY' : 'تاریخچه تغییرات'}
          </p>
          <h2 id="profile-history-title">
            {english ? 'Recent saved versions' : 'نسخه‌های ذخیره‌شده اخیر'}
          </h2>
          <p>
            {english
              ? 'Load an earlier snapshot into the draft, review it, then save if you want to restore it.'
              : 'نسخه قبلی را ابتدا در پیش‌نویس بارگذاری و بررسی کنید؛ برای بازگردانی، خودتان آن را ذخیره کنید.'}
          </p>
        </div>
        {revisionsQuery.isPending && (
          <Skeleton
            label={english ? 'Loading saved versions' : 'در حال بارگذاری نسخه‌ها'}
            lines={2}
          />
        )}
        {revisionsQuery.isError && (
          <p className="company-profile-feedback company-profile-feedback--error" role="alert">
            {english
              ? 'Saved version history could not be loaded.'
              : 'تاریخچه نسخه‌ها بارگذاری نشد.'}{' '}
            <Button variant="quiet" onClick={() => void revisionsQuery.refetch()}>
              {english ? 'Try again' : 'تلاش دوباره'}
            </Button>
          </p>
        )}
        {revisionsQuery.data?.length === 0 && (
          <p className="company-profile-empty">
            {english
              ? 'Saved changes will appear here.'
              : 'پس از ذخیره تغییرات، نسخه‌ها اینجا نمایش داده می‌شوند.'}
          </p>
        )}
        {revisionsQuery.data && revisionsQuery.data.length > 0 && (
          <ol className="company-profile-history__list">
            {revisionsQuery.data.map((entry) => (
              <li key={entry.revision}>
                <div>
                  <strong>
                    {english
                      ? `Version ${entry.revision}`
                      : `نسخه ${new Intl.NumberFormat('fa-IR').format(entry.revision)}`}
                  </strong>
                  <time dateTime={entry.created_at}>
                    {new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(entry.created_at))}
                  </time>
                </div>
                <Button
                  variant="secondary"
                  disabled={!canEdit}
                  onClick={() => {
                    setDraft(clone(entry.snapshot));
                    setSelectedIcpId(entry.snapshot.icps[0]?.id ?? '');
                    setSavedMessage('');
                    setSaveError('');
                    window.scrollTo({ top: 0, behavior: 'auto' });
                  }}
                >
                  {english ? 'Load into draft' : 'بارگذاری در پیش‌نویس'}
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
