export const workspaceToolGroups = [
  {
    id: 'understand',
    title: { fa: 'شناخت', en: 'Understand' },
    tools: [
      { id: 'journey', legacyHash: 'journey', title: { fa: 'مسیر استراتژی', en: 'Strategy journey' } },
      { id: 'company', legacyHash: 'company', title: { fa: 'شناخت شرکت', en: 'Company profile' } },
      { id: 'environment', legacyHash: 'environment', title: { fa: 'محیط و بازار', en: 'Environment and market' } },
    ],
  },
  {
    id: 'analyze',
    title: { fa: 'تحلیل', en: 'Analyze' },
    tools: [
      { id: 'industry', legacyHash: 'industry', title: { fa: 'صنعت و رقبا', en: 'Industry and competitors' } },
      { id: 'internal', legacyHash: 'internal', title: { fa: 'منابع و قابلیت‌ها', en: 'Resources and capabilities' } },
      { id: 'matrices', legacyHash: 'matrices', title: { fa: 'آزمایشگاه ماتریس‌ها', en: 'Matrix studio' } },
      { id: 'swot', legacyHash: 'swot', title: { fa: 'گزینه‌های رشد', en: 'Growth options' } },
      { id: 'finance', legacyHash: 'finance', title: { fa: 'اقتصاد کسب‌وکار', en: 'Business economics' } },
      { id: 'scenarios', legacyHash: 'scenarios', title: { fa: 'سناریو و آینده', en: 'Scenarios and futures' } },
    ],
  },
  {
    id: 'decide',
    title: { fa: 'تصمیم', en: 'Decide' },
    tools: [
      { id: 'qspm', legacyHash: 'qspm', title: { fa: 'اتاق تصمیم', en: 'Decision room' } },
      { id: 'journal', legacyHash: 'journal', title: { fa: 'تصمیم‌ها و فرضیه‌ها', en: 'Decisions and hypotheses' } },
    ],
  },
  {
    id: 'execute',
    title: { fa: 'اجرا', en: 'Execute' },
    tools: [
      { id: 'execution', legacyHash: 'execution', title: { fa: 'برنامه اجرا', en: 'Execution plan' } },
      { id: 'scorecard', legacyHash: 'scorecard', title: { fa: 'اهداف و عملکرد', en: 'Goals and performance' } },
      { id: 'risks', legacyHash: 'risks', title: { fa: 'ریسک‌ها', en: 'Risks' } },
    ],
  },
  {
    id: 'evidence',
    title: { fa: 'مدارک', en: 'Evidence' },
    tools: [
      { id: 'reports', legacyHash: 'reports', title: { fa: 'گزارش مدیریتی', en: 'Management reports' } },
      { id: 'documents', legacyHash: 'documents', title: { fa: 'کتابخانه مستندات', en: 'Document library' } },
      { id: 'learn', legacyHash: 'learn', title: { fa: 'کتابخانه یادگیری', en: 'Learning library' } },
    ],
  },
] as const;

export type WorkspaceToolId = (typeof workspaceToolGroups)[number]['tools'][number]['id'];
export type WorkspaceTool = (typeof workspaceToolGroups)[number]['tools'][number];

export const workspaceTools = workspaceToolGroups.flatMap((group) => group.tools);

export function getWorkspaceTool(toolId: string | undefined) {
  return workspaceTools.find((tool) => tool.id === toolId);
}

export function workspaceToolPath(workspaceId: string, toolId: string) {
  return `/app/workspaces/${encodeURIComponent(workspaceId)}/tools/${encodeURIComponent(toolId)}`;
}
