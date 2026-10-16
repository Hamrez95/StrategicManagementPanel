export type BusinessKind = 'startup' | 'business' | 'organization';
export type Goal = 'customers' | 'growth' | 'strategy' | 'execution';
export type Stage = 'idea' | 'building' | 'operating' | 'unknown';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type Draft = {
  name: string;
  kind: BusinessKind;
  stage: Stage;
  goal: Goal;
  answer: string;
  color: string;
};
export type Action = { id: string; title: string; status: TaskStatus };
export type Note = { id: string; title: string; body: string };
export type Space = Draft & {
  id: string;
  setupComplete?: boolean;
  sample: boolean;
  actions: Action[];
  notes: Note[];
  toolNotes: Record<string, string>;
};
export const freshDraft: Draft = {
  name: '',
  kind: 'startup',
  stage: 'unknown',
  goal: 'customers',
  answer: '',
  color: 'blue',
};
export const kindLabels: Record<BusinessKind, string> = {
  startup: 'استارتاپ',
  business: 'کسب‌وکار فعال',
  organization: 'سازمان',
};
export const stageLabels: Record<Stage, string> = {
  idea: 'در مرحلهٔ ایده',
  building: 'در حال ساخت و آزمون',
  operating: 'دارای محصول و مشتری',
  unknown: 'هنوز مشخص نیست',
};
export const goalLabels: Record<Goal, string> = {
  customers: 'شناخت مشتری',
  growth: 'رشد کسب‌وکار',
  strategy: 'تدوین استراتژی',
  execution: 'اجرای برنامه‌ها',
};
export const followUps: Record<Goal, { title: string; hint: string; options: string[] }> = {
  customers: {
    title: 'دربارهٔ مشتری‌ها چه می‌دانید؟',
    hint: 'از همان‌جایی شروع می‌کنیم که هستید.',
    options: [
      'هنوز با مشتری گفت‌وگو نکرده‌ام',
      'چند گفت‌وگو یا بازخورد دارم',
      'مشتری و اطلاعات فروش دارم',
      'بعداً مشخص می‌کنم',
    ],
  },
  growth: {
    title: 'الان کدام موضوع برایتان مهم‌تر است؟',
    hint: 'اولین میان‌برها را متناسب با این نیاز می‌چینیم.',
    options: ['جذب مشتری جدید', 'حفظ مشتری فعلی', 'بررسی درآمد و هزینه', 'هنوز مطمئن نیستم'],
  },
  strategy: {
    title: 'استراتژی را برای چه محدوده‌ای می‌نویسید؟',
    hint: 'هر فضای کار فقط به یک کسب‌وکار تعلق دارد.',
    options: [
      'کل این کسب‌وکار',
      'یک محصول در همین کسب‌وکار',
      'یک واحد از همین سازمان',
      'بعداً مشخص می‌کنم',
    ],
  },
  execution: {
    title: 'برنامهٔ اجرایی‌تان کجاست؟',
    hint: 'لازم نیست برای شروع همه‌چیز آماده باشد.',
    options: [
      'هنوز برنامه‌ای ننوشته‌ام',
      'هدف‌ها را نوشته‌ام',
      'برنامه دارم و پیگیری می‌خواهم',
      'بعداً مشخص می‌کنم',
    ],
  },
};
export const tools = [
  {
    id: 'customer',
    title: 'شناخت مشتری',
    description: 'مشتری، مسئله و شواهدی که دارید.',
    group: 'شناخت',
    icon: 'people',
  },
  {
    id: 'market',
    title: 'بازار و رقبا',
    description: 'محیط بیرونی و جایگاه کسب‌وکار.',
    group: 'شناخت',
    icon: 'compass',
  },
  {
    id: 'swot',
    title: 'تحلیل SWOT',
    description: 'قوت‌ها، ضعف‌ها، فرصت‌ها و تهدیدها.',
    group: 'استراتژی',
    icon: 'grid',
  },
  {
    id: 'matrices',
    title: 'ماتریس‌های EFE و IFE',
    description: 'ارزیابی عوامل داخلی و خارجی.',
    group: 'استراتژی',
    icon: 'chart',
  },
  {
    id: 'decisions',
    title: 'دفتر تصمیم‌ها',
    description: 'گزینه‌ها، دلیل انتخاب و قدم بعدی.',
    group: 'استراتژی',
    icon: 'flag',
  },
  {
    id: 'finance',
    title: 'اقتصاد کسب‌وکار',
    description: 'درآمد، هزینه و فرض‌های مالی.',
    group: 'رشد',
    icon: 'chart',
  },
  {
    id: 'retention',
    title: 'حفظ مشتری',
    description: 'شواهد بازگشت و تجربهٔ مشتریان.',
    group: 'رشد',
    icon: 'people',
  },
  {
    id: 'risks',
    title: 'ریسک‌ها',
    description: 'عدم‌قطعیت‌ها و برنامهٔ پاسخ.',
    group: 'اجرا',
    icon: 'shield',
  },
] as const;
export function recommendedTools(draft: Pick<Draft, 'goal'>): string[] {
  return {
    customers: ['customer', 'market', 'decisions'],
    growth: ['finance', 'retention', 'market'],
    strategy: ['swot', 'matrices', 'decisions'],
    execution: ['decisions', 'risks', 'swot'],
  }[draft.goal];
}
export function changeGoal(draft: Draft, goal: Goal): Draft {
  return { ...draft, goal, answer: goal === draft.goal ? draft.answer : '' };
}
export function createSpace(draft: Draft, id: string): Space {
  const name = draft.name.trim();
  if (!name || name.length > 80) throw new Error('نام فضای کار باید بین ۱ تا ۸۰ نویسه باشد.');
  return { ...draft, name, id, sample: false, actions: [], notes: [], toolNotes: {} };
}
export function updateSpace(spaces: Space[], id: string, update: (space: Space) => Space): Space[] {
  return spaces.map((space) => (space.id === id ? update(space) : space));
}
export function sampleSpaces(): Space[] {
  return [
    {
      ...createSpace(
        {
          ...freshDraft,
          name: 'ایدهٔ تازه',
          stage: 'idea',
          answer: followUps.customers.options[0],
          color: 'purple',
        },
        'sample-idea',
      ),
      sample: true,
      notes: [
        {
          id: 'n1',
          title: 'فرضیهٔ مسئله',
          body: 'این یک نمونهٔ ساختگی است. پیش از نتیجه‌گیری باید با مشتری گفت‌وگو کنیم.',
        },
      ],
      actions: [{ id: 'a1', title: 'برنامه‌ریزی اولین گفت‌وگو با مشتری', status: 'todo' }],
    },
    {
      ...createSpace(
        {
          ...freshDraft,
          name: 'کسب‌وکار در حال رشد',
          kind: 'business',
          stage: 'operating',
          goal: 'growth',
          answer: 'حفظ مشتری فعلی',
          color: 'green',
        },
        'sample-growth',
      ),
      sample: true,
      actions: [
        { id: 'a2', title: 'جمع‌آوری بازخورد مشتریان فعلی', status: 'doing' },
        { id: 'a3', title: 'ثبت فرضیهٔ مسئله', status: 'done' },
      ],
      notes: [
        {
          id: 'n2',
          title: 'بازخورد نمونه',
          body: 'اطلاعات این فضا صرفاً نمایشی است و از کسب‌وکار واقعی نیامده است.',
        },
      ],
    },
  ];
}
export function isSpace(value: unknown): value is Space {
  if (!value || typeof value !== 'object') return false;
  const s = value as Space;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    s.name.length <= 80 &&
    Object.hasOwn(kindLabels, s.kind) &&
    Object.hasOwn(stageLabels, s.stage) &&
    Object.hasOwn(goalLabels, s.goal) &&
    typeof s.answer === 'string' &&
    ['blue', 'purple', 'green', 'orange'].includes(s.color) &&
    typeof s.sample === 'boolean' &&
    (s.setupComplete === undefined || typeof s.setupComplete === 'boolean') &&
    Array.isArray(s.actions) &&
    s.actions.every(
      (a) =>
        !!a &&
        typeof a === 'object' &&
        typeof a.id === 'string' &&
        typeof a.title === 'string' &&
        ['todo', 'doing', 'done'].includes(a.status),
    ) &&
    Array.isArray(s.notes) &&
    s.notes.every(
      (n) =>
        !!n &&
        typeof n === 'object' &&
        typeof n.id === 'string' &&
        typeof n.title === 'string' &&
        typeof n.body === 'string',
    ) &&
    !!s.toolNotes &&
    typeof s.toolNotes === 'object' &&
    Object.values(s.toolNotes).every((n) => typeof n === 'string')
  );
}
