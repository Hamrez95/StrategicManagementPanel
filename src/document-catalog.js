import catalog from './document-catalog.json' with { type: 'json' };

export const documentSections = catalog.sections;
export const documents = catalog.documents.map((item) => ({
  ...item,
  owner: item.recommended_owner,
  reviewer: item.recommended_reviewer,
  guide: item.writing_guide,
}));
export const priorities = catalog.priorities;
export const priorityGuide = catalog.priorityGuide;
