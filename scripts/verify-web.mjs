import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import documentCatalog from '../src/document-catalog.json' with { type: 'json' };
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const url = process.env.STRATINO_WEB_URL || 'http://localhost:4173';
const results = [];
const errors = [];
await mkdir('test-results/web', { recursive: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/v1/session/', (route) =>
    route.fulfill({ status: 401, json: { detail: 'unauthenticated' } }),
  );
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: /مدار رشدت/ }).waitFor();
    for (const theme of ['light', 'dark']) {
      if ((await page.getAttribute('html', 'data-theme')) !== theme)
        await page.getByRole('switch', { name: 'تم تیره', exact: true }).click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/site-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    results.push({ width, themes: ['light', 'dark'], overflow: false });
  }
  const panelEntry = page.locator('.home-world--panel');
  assert.equal(await panelEntry.getAttribute('href'), '/app/workspaces');
  await panelEntry.click();
  await page.waitForURL(/account\/login/);
  await page.goto(url + '/demo');
  await page.frameLocator('iframe').locator('.brand strong').waitFor();
  assert.equal(await page.frameLocator('iframe').locator('.brand strong').innerText(), 'استراتینو');
  await page.goto(url + '/account/reset-password');
  await page.getByRole('heading', { name: 'بازیابی گذرواژه', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'بازیابی گذرواژه', exact: true }).waitFor();
  let session = {
    authenticated: true,
    user: { id: 'u1', name: 'مدیر نمونه', is_staff: false },
    workspaces: [{ id: 'w1', name: 'پروژه مجاز', role: 'owner' }],
  };
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.waitForURL(/account\/login/);
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) => route.fulfill({ json: session }));
  await page.route('**/api/v1/csrf/', (route) =>
    route.fulfill({
      json: {},
      headers: { 'Set-Cookie': 'csrftoken=workspace-test; Path=/; SameSite=Lax' },
    }),
  );
  const workspace = {
    id: 'w1',
    owner_id: 'u1',
    billing_account_id: 'billing-1',
    name: 'پروژه مجاز',
    revision: 1,
    archived_at: null,
  };
  let workspaceRows = [workspace];
  let createdWorkspaceCount = 0;
  let accountProfile = {
    email: 'owner@example.test',
    display_name: 'مدیر نمونه',
    role_title: '',
    pending_email: '',
  };
  let accountPreferences = {
    theme: 'light',
    language: 'fa',
    motion: 'auto',
    show_tutorial: true,
    device_sync_pending: false,
    updated_at: new Date().toISOString(),
  };
  const emptyProfile = (workspaceId) => ({
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
  });
  const projectProfiles = new Map([['w1', emptyProfile('w1')]]);
  const profileHistory = new Map([['w1', []]]);
  const emptyStrategy = (workspaceId) => ({ workspace_id: workspaceId, factors: [], options: [] });
  const strategyBoards = new Map([['w1', emptyStrategy('w1')]]);
  const analysisRecords = new Map();
  const executionBoardFor = (workspaceId) => {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 90);
    return {
      workspace_id: workspaceId,
      role: session.workspaces.find((item) => item.id === workspaceId)?.role ?? 'owner',
      today,
      horizon_end: horizon.toISOString().slice(0, 10),
      history_limit: 100,
      decisions: [],
      goals: [],
      actions: [],
      events: [],
      members: [{ id: session.user.id, name: session.user.name || 'مدیر نمونه', role: 'owner' }],
      sources: [],
    };
  };
  const executionBoards = new Map([['w1', executionBoardFor('w1')]]);
  const documentBoardFor = (workspaceId) => ({
    workspace_id: workspaceId,
    role: session.workspaces.find((item) => item.id === workspaceId)?.role ?? 'viewer',
    history_limit: 50,
    stages: documentCatalog.stages,
    industries: documentCatalog.industries,
    sections: documentCatalog.sections,
    priorities: documentCatalog.priorities,
    items: documentCatalog.documents.map((item) => ({ ...item, record: null })),
    members: [{ id: session.user.id, name: session.user.name || 'مدیر نمونه', role: 'owner' }],
    events: [],
  });
  const documentBoards = new Map([['w1', documentBoardFor('w1')]]);
  let documentSequence = 0;
  let attachmentSequence = 0;
  const documentAttachments = new Map();
  const attachmentReservations = new Map();
  let failNextAttachmentUpload = false;
  let holdNextAttachmentUpload = false;
  let signalAttachmentUploadStarted;
  let executionSequence = 0;
  const recordExecutionEvent = (board, entityType, record, eventType, changes) => {
    board.events.unshift({
      id: `execution-event-${++executionSequence}`,
      entity_type: entityType,
      entity_id: record.id,
      entity_label: record.title,
      event_type: eventType,
      changes,
      actor_name: session.user.name || 'مدیر نمونه',
      created_at: new Date().toISOString(),
    });
  };
  const matrixOutput = (kind, rows) => {
    const total_weight = rows.reduce((sum, row) => sum + (row.weight ?? 0), 0);
    const ready =
      rows.length > 0 &&
      rows.every(
        (row) =>
          Number.isFinite(row.weight) &&
          Number.isInteger(row.rating) &&
          row.rating >= 1 &&
          row.rating <= 4,
      ) &&
      Math.abs(total_weight - 100) < 0.001;
    const score = ready
      ? rows.reduce((sum, row) => sum + (row.weight / 100) * row.rating, 0)
      : null;
    const issues = [];
    if (!rows.length) issues.push({ code: 'rows_required', field: 'rows' });
    if (rows.some((row) => !row.title.trim()))
      issues.push({ code: 'title_required', field: 'rows.0.title' });
    if (rows.some((row) => !row.evidence.trim()))
      issues.push({ code: 'evidence_required', field: 'rows.0.evidence' });
    if (!ready && rows.length) issues.push({ code: 'weights_must_total_100', field: 'rows' });
    const can_finalize = ready && rows.every((row) => row.title.trim() && row.evidence.trim());
    return {
      kind,
      total_weight,
      score,
      rounded_score: score === null ? null : Math.round(score * 100) / 100,
      ready,
      can_finalize,
      issues,
      interpretation:
        score === null
          ? 'unavailable'
          : score < 2.5
            ? 'below_midpoint'
            : score > 2.5
              ? 'above_midpoint'
              : 'at_midpoint',
      midpoint: 2.5,
      limitations:
        kind === 'efe'
          ? [
              'efe_measures_response',
              'midpoint_is_not_success_threshold',
              'evidence_quality_is_external',
            ]
          : [
              'ife_rating_depends_on_factor_type',
              'midpoint_is_not_success_threshold',
              'evidence_quality_is_external',
            ],
    };
  };
  let strategySequence = 0;
  let loseProfilePatchResponse = false;
  let failProfileNextPatch = false;
  let failProfileNextRead = false;
  let expireProfileNextRead = false;
  const invitations = [];
  const importBatches = [];
  await page.route('**/api/v1/account/subscriptions/', (route) =>
    route.fulfill({ json: {
      user_id: session.user.id,
      academy: {
        plans: [], areas: [], subscriptions: [], orders: [], order_history_limit: 30,
        payment_enabled: false,
        access_summary: { full: false, general: false, area_ids: [], free_sample: true },
      },
      management: {
        billing_status: 'active', owned_workspaces: 1, archived_workspaces: 0,
        joined_workspaces: 0, plans_configured: false,
      },
    } }),
  );
  await page.route('**/api/v1/account/preferences/', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: accountPreferences });
    accountPreferences = {
      ...accountPreferences,
      ...route.request().postDataJSON(),
      updated_at: new Date().toISOString(),
    };
    return route.fulfill({ json: accountPreferences });
  });
  await page.route('**/api/v1/account/profile/', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: accountProfile });
    accountProfile = { ...accountProfile, ...route.request().postDataJSON() };
    if (session.user.id === 'u2')
      session = { ...session, user: { ...session.user, name: accountProfile.display_name } };
    return route.fulfill({ json: accountProfile });
  });
  await page.route('**/api/v1/workspaces/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/v1/workspaces/') {
      return route.fulfill({ json: { items: workspaceRows, next_cursor: null } });
    }
    if (request.method() === 'POST' && pathname === '/api/v1/workspaces/') {
      const body = request.postDataJSON();
      const created = {
        id: 'w2',
        owner_id: session.user.id,
        billing_account_id: 'billing-2',
        name: body.name,
        revision: 1,
        archived_at: null,
      };
      workspaceRows.push(created);
      projectProfiles.set('w2', emptyProfile('w2'));
      profileHistory.set('w2', []);
      strategyBoards.set('w2', emptyStrategy('w2'));
      executionBoards.set('w2', executionBoardFor('w2'));
      documentBoards.set('w2', documentBoardFor('w2'));
      session = {
        ...session,
        workspaces: [...session.workspaces, { id: 'w2', name: created.name, role: 'owner' }],
      };
      createdWorkspaceCount++;
      return route.fulfill({ status: 201, json: created });
    }
    const detailMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/$/);
    if (request.method() === 'GET' && detailMatch) {
      const record = workspaceRows.find((item) => item.id === detailMatch[1]);
      return record
        ? route.fulfill({ json: record })
        : route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
    }
    if (request.method() === 'PATCH' && pathname === '/api/v1/workspaces/w1/') {
      const body = request.postDataJSON();
      if (body.revision !== workspace.revision) {
        return route.fulfill({
          status: 409,
          json: {
            code: 'revision_conflict',
            message: 'این فضا هم‌زمان تغییر کرده است.',
            fields: { revision: ['نسخه فعلی تغییر کرده است.'] },
          },
        });
      }
      if (typeof body.name === 'string') workspace.name = body.name.trim();
      if (typeof body.archived === 'boolean')
        workspace.archived_at = body.archived ? new Date().toISOString() : null;
      workspace.revision++;
      return route.fulfill({ json: workspace });
    }
    if (pathname === '/api/v1/workspaces/w1/imports/preview/' && request.method() === 'POST') {
      const body = request.postDataJSON();
      assert.equal(body.schema_version, 1);
      return route.fulfill({
        json: {
          workspace_id: 'w1',
          workspace_name: workspace.name,
          schema_version: 1,
          recognized: true,
          record_counts: {
            analysis_records: 2,
            decision_records: 4,
            execution_records: 1,
            financial_periods: 1,
            file_metadata: 0,
          },
          record_count: 8,
          missing_attachment_bytes: 0,
          warnings: ['نسخه مرورگر قدیمی دست‌نخورده می‌ماند.'],
        },
      });
    }
    if (pathname === '/api/v1/workspaces/w1/imports/' && request.method() === 'GET') {
      return route.fulfill({
        json: { items: importBatches.map(({ data, source_backup, ...batch }) => batch) },
      });
    }
    if (pathname === '/api/v1/workspaces/w1/imports/' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const digest = JSON.stringify(body.data);
      const existing = importBatches.find(
        (batch) => batch.source_digest === digest && batch.undone_at === null,
      );
      if (existing) return route.fulfill({ json: { ...existing, duplicate: true } });
      const created = {
        id: 'batch-1',
        workspace_id: 'w1',
        created_by_id: session.user.id,
        source_schema: 'royesh-strategy-v1',
        mapping_version: 1,
        source_digest: digest,
        record_counts: {
          analysis_records: 2,
          decision_records: 4,
          execution_records: 1,
          financial_periods: 1,
          file_metadata: 0,
        },
        record_count: 8,
        missing_attachment_bytes: 0,
        created_at: new Date().toISOString(),
        undone_at: null,
        duplicate: false,
        data: { decisions: body.data.journal },
        source_backup: body.data,
      };
      importBatches.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    const importDetailMatch = pathname.match(/^\/api\/v1\/workspaces\/w1\/imports\/([^/]+)\/$/);
    if (importDetailMatch && request.method() === 'GET') {
      const batch = importBatches.find((item) => item.id === importDetailMatch[1]);
      return batch
        ? route.fulfill({ json: batch })
        : route.fulfill({ status: 404, json: { code: 'import_batch_not_found' } });
    }
    if (importDetailMatch && request.method() === 'DELETE') {
      const batch = importBatches.find((item) => item.id === importDetailMatch[1]);
      if (!batch) return route.fulfill({ status: 404, json: { code: 'import_batch_not_found' } });
      batch.undone_at = new Date().toISOString();
      return route.fulfill({ status: 204, body: '' });
    }
    const profileRevisionsMatch = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/profile\/revisions\/$/,
    );
    if (profileRevisionsMatch && request.method() === 'GET') {
      return route.fulfill({ json: { items: profileHistory.get(profileRevisionsMatch[1]) ?? [] } });
    }
    const profileMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/profile\/$/);
    if (profileMatch && request.method() === 'GET') {
      if (expireProfileNextRead) {
        expireProfileNextRead = false;
        return route.fulfill({
          status: 401,
          json: { code: 'not_authenticated', message: 'نشست پایان یافت.' },
        });
      }
      if (failProfileNextRead) {
        failProfileNextRead = false;
        return route.abort();
      }
      const profile = projectProfiles.get(profileMatch[1]);
      return profile
        ? route.fulfill({ json: profile })
        : route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
    }
    if (profileMatch && request.method() === 'PATCH') {
      if (failProfileNextPatch) {
        failProfileNextPatch = false;
        failProfileNextRead = true;
        return route.abort();
      }
      const profile = projectProfiles.get(profileMatch[1]);
      if (!profile) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== profile.revision)
        return route.fulfill({
          status: 409,
          json: {
            code: 'revision_conflict',
            message: 'اطلاعات پروژه هم‌زمان تغییر کرده است.',
            fields: { revision: ['نسخه فعلی تغییر کرده است.'] },
          },
        });
      for (const key of ['company_name', 'industry', 'stage', 'mission', 'problem_statement'])
        if (typeof body[key] === 'string') profile[key] = body[key].trim();
      for (const key of ['products', 'customer_segments', 'goals', 'icps'])
        if (Array.isArray(body[key])) profile[key] = structuredClone(body[key]);
      if (body.complete === true) profile.onboarding_completed_at = new Date().toISOString();
      profile.revision++;
      profileHistory.set(
        profileMatch[1],
        [
          {
            revision: profile.revision,
            snapshot: structuredClone(profile),
            changed_by_id: session.user.id,
            created_at: new Date().toISOString(),
          },
          ...(profileHistory.get(profileMatch[1]) ?? []),
        ].slice(0, 10),
      );
      if (loseProfilePatchResponse) {
        loseProfilePatchResponse = false;
        return route.fulfill({
          status: 503,
          json: { code: 'temporary_failure', message: 'پاسخ ذخیره دریافت نشد.' },
        });
      }
      return route.fulfill({ json: profile });
    }
    const documentCollection = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/documents\/$/);
    if (documentCollection && request.method() === 'GET') {
      const board = documentBoards.get(documentCollection[1]);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      board.role =
        session.workspaces.find((item) => item.id === documentCollection[1])?.role ?? 'viewer';
      const query = new URL(request.url()).searchParams;
      const stage = query.get('stage') || '';
      const industry = query.get('industry') || '';
      const items = board.items.filter((item) => {
        const stageMatches =
          !stage || (item.record ? item.record.stage === stage : item.stages.includes(stage));
        const industryMatches =
          !industry ||
          (item.record
            ? item.record.industry === industry
            : industry === 'general' ||
              item.industries.includes(industry) ||
              item.industries.includes('general'));
        return stageMatches && industryMatches;
      });
      return route.fulfill({ json: { ...structuredClone(board), items: structuredClone(items) } });
    }
    if (documentCollection && request.method() === 'POST') {
      const board = documentBoards.get(documentCollection[1]);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      const item = board.items.find((entry) => entry.id === body.template_id);
      if (!item || item.record)
        return route.fulfill({
          status: 400,
          json: { code: 'validation_error', message: 'راهنما از قبل ثبت شده است.' },
        });
      const owner = board.members.find((member) => member.id === body.owner_id);
      const reviewer = board.members.find((member) => member.id === body.reviewer_id);
      const now = new Date().toISOString();
      const record = {
        id: `document-${++documentSequence}`,
        template_id: item.id,
        stage: body.stage,
        industry: body.industry,
        owner_id: body.owner_id,
        owner_name: owner?.name ?? 'عضو پیشین',
        reviewer_id: body.reviewer_id,
        reviewer_name: reviewer?.name ?? null,
        status: body.status,
        content: body.content,
        content_version: 1,
        revision: 1,
        created_at: now,
        updated_at: now,
      };
      item.record = record;
      board.events.unshift({
        id: `document-event-${documentSequence}`,
        template_id: item.id,
        event_type: 'created',
        changes: {
          status: { from: null, to: record.status },
          content_version: { from: null, to: 1 },
        },
        actor_name: session.user.name || 'مدیر نمونه',
        created_at: now,
      });
      return route.fulfill({ status: 201, json: structuredClone(record) });
    }
    const attachmentCollection = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/documents\/([^/]+)\/attachments\/$/,
    );
    if (attachmentCollection) {
      const [, workspaceId, recordId] = attachmentCollection;
      const key = `${workspaceId}/${recordId}`;
      const rows = documentAttachments.get(key) ?? [];
      if (request.method() === 'GET')
        return route.fulfill({
          json: {
            document_id: recordId,
            limits: { max_file_bytes: 20 * 1024 * 1024, document_attachment_limit: 20 },
            items: structuredClone(rows),
          },
        });
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        const reservationKey = `${key}/${body.request_id}`;
        const existing = rows.find(
          (item) => item.id === attachmentReservations.get(reservationKey),
        );
        if (existing) return route.fulfill({ status: 200, json: structuredClone(existing) });
        const extension = body.name.split('.').at(-1).toLowerCase();
        const mediaTypes = {
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          txt: 'text/plain',
          csv: 'text/csv',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
        };
        const now = new Date().toISOString();
        const item = {
          id: `attachment-${++attachmentSequence}`,
          document_id: recordId,
          name: body.name,
          extension,
          media_type: mediaTypes[extension] ?? 'application/octet-stream',
          version: rows.length + 1,
          size_bytes: body.size_bytes,
          sha256: '',
          status: 'reserved',
          created_by: session.user.name || 'مدیر نمونه',
          created_at: now,
          updated_at: now,
        };
        rows.unshift(item);
        attachmentReservations.set(reservationKey, item.id);
        documentAttachments.set(key, rows);
        return route.fulfill({ status: 201, json: structuredClone(item) });
      }
    }
    const attachmentContent = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/documents\/([^/]+)\/attachments\/([^/]+)\/content\/$/,
    );
    if (attachmentContent && request.method() === 'PUT') {
      if (signalAttachmentUploadStarted) signalAttachmentUploadStarted();
      if (holdNextAttachmentUpload) await new Promise((resolve) => setTimeout(resolve, 900));
      if (failNextAttachmentUpload) {
        failNextAttachmentUpload = false;
        return route.fulfill({
          status: 503,
          json: { code: 'temporary_failure', message: 'سرویس موقتاً در دسترس نیست.' },
        });
      }
      const rows = documentAttachments.get(`${attachmentContent[1]}/${attachmentContent[2]}`) ?? [];
      const item = rows.find((entry) => entry.id === attachmentContent[3]);
      if (!item) return route.fulfill({ status: 404, json: { code: 'attachment_not_found' } });
      item.status = 'ready';
      item.sha256 = 'a'.repeat(64);
      item.updated_at = new Date().toISOString();
      holdNextAttachmentUpload = false;
      try {
        return await route.fulfill({ status: 201, json: structuredClone(item) });
      } catch {
        return;
      }
    }
    const attachmentScan = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/documents\/([^/]+)\/attachments\/([^/]+)\/scan\/$/,
    );
    if (attachmentScan && request.method() === 'POST') {
      const rows = documentAttachments.get(`${attachmentScan[1]}/${attachmentScan[2]}`) ?? [];
      const item = rows.find((entry) => entry.id === attachmentScan[3]);
      if (!item) return route.fulfill({ status: 404, json: { code: 'attachment_not_found' } });
      item.status = 'ready';
      item.sha256 = 'a'.repeat(64);
      return route.fulfill({ json: structuredClone(item) });
    }
    const attachmentDetail = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/documents\/([^/]+)\/attachments\/([^/]+)\/$/,
    );
    if (attachmentDetail && request.method() === 'DELETE') {
      const key = `${attachmentDetail[1]}/${attachmentDetail[2]}`;
      documentAttachments.set(
        key,
        (documentAttachments.get(key) ?? []).filter((item) => item.id !== attachmentDetail[3]),
      );
      return route.fulfill({ status: 204, body: '' });
    }
    const documentDetail = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/documents\/([^/]+)\/$/);
    if (documentDetail && request.method() === 'PATCH') {
      const [, workspaceId, recordId] = documentDetail;
      const board = documentBoards.get(workspaceId);
      const item = board?.items.find((entry) => entry.record?.id === recordId);
      if (!item?.record)
        return route.fulfill({ status: 404, json: { code: 'document_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== item.record.revision)
        return route.fulfill({
          status: 409,
          json: { code: 'revision_conflict', message: 'نسخه تازه را بارگیری کنید.' },
        });
      const before = item.record;
      const owner = board.members.find(
        (member) => member.id === (body.owner_id ?? before.owner_id),
      );
      const reviewerId = body.reviewer_id === undefined ? before.reviewer_id : body.reviewer_id;
      const reviewer = board.members.find((member) => member.id === reviewerId);
      const content = body.content ?? before.content;
      const record = {
        ...before,
        ...body,
        owner_name: owner?.name ?? before.owner_name,
        reviewer_id: reviewerId,
        reviewer_name: reviewer?.name ?? null,
        content,
        content_version: before.content_version + Number(content !== before.content),
        revision: before.revision + 1,
        updated_at: new Date().toISOString(),
      };
      const changes = {};
      for (const key of ['stage', 'industry', 'owner_id', 'reviewer_id', 'status']) {
        if (before[key] !== record[key]) changes[key] = { from: before[key], to: record[key] };
      }
      if (content !== before.content)
        changes.content = {
          from_version: before.content_version,
          to_version: record.content_version,
        };
      item.record = record;
      if (Object.keys(changes).length)
        board.events.unshift({
          id: `document-event-${++documentSequence}`,
          template_id: item.id,
          event_type:
            Object.keys(changes).length === 1 && changes.status ? 'status_changed' : 'updated',
          changes,
          actor_name: session.user.name || 'مدیر نمونه',
          created_at: record.updated_at,
        });
      return route.fulfill({ json: structuredClone(record) });
    }
    const executionCollection = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/execution\/$/);
    if (executionCollection && request.method() === 'GET') {
      const board = executionBoards.get(executionCollection[1]);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      board.role =
        session.workspaces.find((item) => item.id === executionCollection[1])?.role ?? 'viewer';
      board.sources = [
        ...[...analysisRecords.values()]
          .filter(
            (item) => item.workspace_id === executionCollection[1] && item.state === 'finalized',
          )
          .map((item) => ({ kind: 'analysis', id: item.id, title: item.kind.toUpperCase() })),
        ...(strategyBoards.get(executionCollection[1])?.options ?? [])
          .filter((item) => !item.needs_review)
          .map((item) => ({ kind: 'strategy_option', id: item.id, title: item.title })),
      ];
      return route.fulfill({ json: structuredClone(board) });
    }
    if (executionCollection && request.method() === 'POST') {
      const board = executionBoards.get(executionCollection[1]);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      const decision = board.decisions.find((item) => item.id === body.decision_id);
      if (!decision)
        return route.fulfill({
          status: 400,
          json: { code: 'validation_error', message: 'تصمیم پیدا نشد.' },
        });
      const goal = body.goal_id ? board.goals.find((item) => item.id === body.goal_id) : null;
      const owner = board.members.find((item) => item.id === body.owner_id);
      const now = new Date().toISOString();
      const action = {
        id: `execution-action-${++executionSequence}`,
        decision_id: decision.id,
        decision_title: decision.title,
        goal_id: goal?.id ?? null,
        goal_title: goal?.title ?? null,
        owner_id: owner?.id ?? body.owner_id,
        owner_name: owner?.name ?? 'مدیر نمونه',
        title: body.title,
        description: body.description,
        due_on: body.due_on,
        overdue: body.status !== 'done' && body.due_on < board.today,
        status: body.status,
        revision: 1,
        created_at: now,
        updated_at: now,
      };
      board.actions.unshift(action);
      decision.action_count = board.actions.filter(
        (item) => item.decision_id === decision.id,
      ).length;
      if (goal) goal.action_count = board.actions.filter((item) => item.goal_id === goal.id).length;
      recordExecutionEvent(board, 'action', action, 'created', action);
      return route.fulfill({ status: 201, json: structuredClone(action) });
    }
    const executionDetail = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/execution\/(actions|decisions|goals)\/([^/]+)\/$/,
    );
    if (executionDetail && request.method() === 'PATCH') {
      const [, workspaceId, entity, recordId] = executionDetail;
      const board = executionBoards.get(workspaceId);
      const collection =
        entity === 'actions'
          ? board?.actions
          : entity === 'decisions'
            ? board?.decisions
            : board?.goals;
      const item = collection?.find((record) => record.id === recordId);
      if (!item) return route.fulfill({ status: 404, json: { code: 'execution_item_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== item.revision)
        return route.fulfill({
          status: 409,
          json: { code: 'revision_conflict', message: 'نسخه تازه را بارگیری کنید.' },
        });
      const before = structuredClone(item);
      for (const [key, value] of Object.entries(body)) if (key !== 'revision') item[key] = value;
      if (entity === 'actions') {
        const decision = board.decisions.find((record) => record.id === item.decision_id);
        const goal = item.goal_id ? board.goals.find((record) => record.id === item.goal_id) : null;
        const owner = board.members.find((record) => record.id === item.owner_id);
        item.decision_title = decision?.title ?? item.decision_title;
        item.goal_title = goal?.title ?? null;
        item.owner_name = owner?.name ?? item.owner_name;
        item.overdue = item.status !== 'done' && item.due_on < board.today;
      }
      item.revision++;
      item.updated_at = new Date().toISOString();
      const changes = Object.fromEntries(
        Object.entries(item)
          // Audit actual editable changes, not revision/timestamp or derived display metadata.
          .filter(
            ([key, value]) =>
              key !== 'revision' && Object.hasOwn(body, key) && before[key] !== value,
          )
          .map(([key, value]) => [key, { from: before[key], to: value }]),
      );
      const eventType =
        entity === 'actions' && Object.keys(changes).length === 1 && changes.status
          ? 'status_changed'
          : 'updated';
      recordExecutionEvent(
        board,
        entity === 'actions' ? 'action' : entity === 'decisions' ? 'decision' : 'goal',
        item,
        eventType,
        changes,
      );
      return route.fulfill({ json: structuredClone(item) });
    }
    const executionCreate = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/execution\/(decisions|goals)\/$/,
    );
    if (executionCreate && request.method() === 'POST') {
      const [, workspaceId, entity] = executionCreate;
      const board = executionBoards.get(workspaceId);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      const now = new Date().toISOString();
      const record =
        entity === 'decisions'
          ? {
              id: `execution-decision-${++executionSequence}`,
              ...body,
              source: body.source_id
                ? (board.sources.find(
                    (source) => source.kind === body.source_kind && source.id === body.source_id,
                  ) ?? null)
                : null,
              revision: 1,
              action_count: 0,
              created_at: now,
              updated_at: now,
            }
          : {
              id: `execution-goal-${++executionSequence}`,
              ...body,
              revision: 1,
              action_count: 0,
              created_at: now,
              updated_at: now,
            };
      board[entity].unshift(record);
      recordExecutionEvent(
        board,
        entity === 'decisions' ? 'decision' : 'goal',
        record,
        'created',
        record,
      );
      return route.fulfill({ status: 201, json: structuredClone(record) });
    }
    const analysisCollection = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/analyses\/$/);
    if (analysisCollection && request.method() === 'GET') {
      const items = [...analysisRecords.values()].filter(
        (item) => item.workspace_id === analysisCollection[1],
      );
      return route.fulfill({ json: { items: structuredClone(items), next_cursor: null } });
    }
    if (analysisCollection && request.method() === 'POST') {
      const body = request.postDataJSON();
      const key = `${analysisCollection[1]}:${body.kind}`;
      if (analysisRecords.has(key))
        return route.fulfill({
          status: 409,
          json: { code: 'analysis_exists', message: 'این ماتریس قبلاً ساخته شده است.' },
        });
      const now = new Date().toISOString();
      const item = {
        id: `analysis-${analysisCollection[1]}-${body.kind}`,
        workspace_id: analysisCollection[1],
        revision: 1,
        created_at: now,
        updated_at: now,
        kind: body.kind,
        schema_version: 1,
        method_version: body.method_version,
        inputs: body.inputs,
        output: matrixOutput(body.kind, body.inputs.rows),
        state: body.state,
      };
      analysisRecords.set(key, item);
      return route.fulfill({ status: 201, json: structuredClone(item) });
    }
    const analysisDetail = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/analyses\/([^/]+)\/$/);
    if (analysisDetail && request.method() === 'PATCH') {
      const item = [...analysisRecords.values()].find(
        (record) => record.workspace_id === analysisDetail[1] && record.id === analysisDetail[2],
      );
      if (!item) return route.fulfill({ status: 404, json: { code: 'analysis_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== item.revision)
        return route.fulfill({
          status: 409,
          json: { code: 'revision_conflict', message: 'نسخه ماتریس تغییر کرده است.' },
        });
      Object.assign(item, {
        method_version: body.method_version,
        inputs: body.inputs,
        output: matrixOutput(body.kind, body.inputs.rows),
        state: body.state,
        revision: item.revision + 1,
        updated_at: new Date().toISOString(),
      });
      return route.fulfill({ json: structuredClone(item) });
    }
    if (analysisDetail && request.method() === 'DELETE') {
      const item = [...analysisRecords.entries()].find(
        ([, record]) =>
          record.workspace_id === analysisDetail[1] && record.id === analysisDetail[2],
      );
      if (!item) return route.fulfill({ status: 404, json: { code: 'analysis_not_found' } });
      analysisRecords.delete(item[0]);
      return route.fulfill({ json: { id: item[1].id, deleted: true } });
    }
    const strategyMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/strategy\/$/);
    if (strategyMatch && request.method() === 'GET') {
      const board = strategyBoards.get(strategyMatch[1]);
      return board
        ? route.fulfill({ json: structuredClone(board) })
        : route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
    }
    const factorCollection = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/strategy\/factors\/$/,
    );
    if (factorCollection && request.method() === 'POST') {
      const board = strategyBoards.get(factorCollection[1]);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      const factor = {
        id: `factor-${++strategySequence}`,
        ...body,
        revision: 1,
        updated_at: new Date().toISOString(),
        linked_options: [],
      };
      board.factors.push(factor);
      return route.fulfill({ status: 201, json: factor });
    }
    const factorDetail = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/strategy\/factors\/([^/]+)\/$/,
    );
    if (factorDetail && request.method() === 'PATCH') {
      const board = strategyBoards.get(factorDetail[1]);
      const factor = board?.factors.find((item) => item.id === factorDetail[2]);
      if (!factor) return route.fulfill({ status: 404, json: { code: 'factor_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== factor.revision)
        return route.fulfill({
          status: 409,
          json: {
            code: 'revision_conflict',
            message: 'نسخه عامل تغییر کرده است.',
            fields: { revision: ['نسخه فعلی تغییر کرده است.'] },
          },
        });
      const changedSemantic = ['factor_type', 'title', 'evidence', 'priority'].some(
        (field) => body[field] !== undefined && body[field] !== factor[field],
      );
      for (const field of ['factor_type', 'title', 'evidence', 'owner', 'priority'])
        if (body[field] !== undefined)
          factor[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
      factor.revision++;
      factor.updated_at = new Date().toISOString();
      if (changedSemantic)
        for (const option of board.options.filter((item) =>
          item.factor_refs.some((ref) => ref.id === factor.id),
        )) {
          option.needs_review = true;
          option.revision++;
        }
      factor.linked_options = board.options
        .filter((item) => item.factor_refs.some((ref) => ref.id === factor.id))
        .map((item) => ({ id: item.id, title: item.title, category: item.category }));
      return route.fulfill({ json: factor });
    }
    if (factorDetail && request.method() === 'DELETE') {
      const board = strategyBoards.get(factorDetail[1]);
      const factor = board?.factors.find((item) => item.id === factorDetail[2]);
      if (!factor) return route.fulfill({ status: 404, json: { code: 'factor_not_found' } });
      const dependencies = board.options.filter((item) =>
        item.factor_refs.some((ref) => ref.id === factor.id),
      );
      if (
        dependencies.length &&
        new URL(request.url()).searchParams.get('confirm_dependencies') !== 'true'
      )
        return route.fulfill({
          status: 409,
          json: {
            code: 'factor_dependencies',
            message: 'این عامل در گزینه راهبردی استفاده شده است.',
            fields: { dependencies: dependencies.map((item) => item.title) },
          },
        });
      for (const option of dependencies) {
        option.factor_refs = option.factor_refs.filter((ref) => ref.id !== factor.id);
        option.needs_review = true;
        option.revision++;
      }
      board.factors = board.factors.filter((item) => item.id !== factor.id);
      return route.fulfill({
        json: {
          id: factor.id,
          deleted: true,
          affected_options: dependencies.map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
          })),
        },
      });
    }
    const optionCollection = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/strategy\/options\/$/,
    );
    if (optionCollection && request.method() === 'POST') {
      const board = strategyBoards.get(optionCollection[1]);
      if (!board) return route.fulfill({ status: 404, json: { code: 'workspace_not_found' } });
      const body = request.postDataJSON();
      const factor_refs = body.factor_ids
        .map((id) => board.factors.find((factor) => factor.id === id))
        .filter(Boolean)
        .map(({ id, factor_type, title }) => ({ id, factor_type, title }));
      if (factor_refs.length !== body.factor_ids.length)
        return route.fulfill({
          status: 400,
          json: {
            code: 'validation_error',
            message: 'عامل معتبر نیست.',
            fields: { factor_ids: ['عامل معتبر نیست.'] },
          },
        });
      const { factor_ids, ...values } = body;
      const option = {
        id: `option-${++strategySequence}`,
        ...values,
        factor_refs,
        needs_review: false,
        revision: 1,
        updated_at: new Date().toISOString(),
      };
      board.options.push(option);
      for (const factor of board.factors)
        factor.linked_options = board.options
          .filter((item) => item.factor_refs.some((ref) => ref.id === factor.id))
          .map((item) => ({ id: item.id, title: item.title, category: item.category }));
      return route.fulfill({ status: 201, json: option });
    }
    const optionDetail = pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/strategy\/options\/([^/]+)\/$/,
    );
    if (optionDetail && request.method() === 'PATCH') {
      const board = strategyBoards.get(optionDetail[1]);
      const option = board?.options.find((item) => item.id === optionDetail[2]);
      if (!option) return route.fulfill({ status: 404, json: { code: 'option_not_found' } });
      const body = request.postDataJSON();
      if (body.revision !== option.revision)
        return route.fulfill({
          status: 409,
          json: {
            code: 'revision_conflict',
            message: 'نسخه گزینه تغییر کرده است.',
            fields: { revision: ['نسخه فعلی تغییر کرده است.'] },
          },
        });
      if (body.factor_ids)
        option.factor_refs = body.factor_ids
          .map((id) => board.factors.find((factor) => factor.id === id))
          .filter(Boolean)
          .map(({ id, factor_type, title }) => ({ id, factor_type, title }));
      for (const field of ['category', 'title', 'action', 'rationale', 'hypothesis', 'cost'])
        if (body[field] !== undefined) option[field] = body[field];
      option.needs_review = false;
      option.revision++;
      option.updated_at = new Date().toISOString();
      for (const factor of board.factors)
        factor.linked_options = board.options
          .filter((item) => item.factor_refs.some((ref) => ref.id === factor.id))
          .map((item) => ({ id: item.id, title: item.title, category: item.category }));
      return route.fulfill({ json: option });
    }
    if (optionDetail && request.method() === 'DELETE') {
      const board = strategyBoards.get(optionDetail[1]);
      const option = board?.options.find((item) => item.id === optionDetail[2]);
      if (!option) return route.fulfill({ status: 404, json: { code: 'option_not_found' } });
      board.options = board.options.filter((item) => item.id !== option.id);
      for (const factor of board.factors)
        factor.linked_options = board.options
          .filter((item) => item.factor_refs.some((ref) => ref.id === factor.id))
          .map((item) => ({ id: item.id, title: item.title, category: item.category }));
      return route.fulfill({ json: { id: option.id, deleted: true } });
    }
    const memberMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/members\/$/);
    if (request.method() === 'GET' && memberMatch) {
      const record = workspaceRows.find((item) => item.id === memberMatch[1]);
      return route.fulfill({
        json: {
          items: record
            ? [
                {
                  user_id: record.owner_id,
                  email: accountProfile.email,
                  name: accountProfile.display_name || 'مدیر نمونه',
                  role: 'owner',
                },
              ]
            : [],
        },
      });
    }
    const invitationMatch = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/invitations\/$/);
    if (request.method() === 'GET' && invitationMatch) {
      return route.fulfill({ json: { items: invitationMatch[1] === 'w1' ? invitations : [] } });
    }
    if (request.method() === 'POST' && pathname === '/api/v1/workspaces/w1/invitations/') {
      const body = request.postDataJSON();
      invitations.push({
        id: 'invite-1',
        email: body.email,
        role: body.role,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      return route.fulfill({
        status: 202,
        json: { message: 'اگر نشانی قابل افزودن باشد، دعوت به همان ایمیل فرستاده می‌شود.' },
      });
    }
    if (
      request.method() === 'DELETE' &&
      pathname === '/api/v1/workspaces/w1/invitations/invite-1/'
    ) {
      invitations.splice(0, invitations.length);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({
      status: 404,
      json: { code: 'workspace_not_found', message: 'فضای کار در دسترس نیست.' },
    });
  });
  await page.goto(url + '/app/workspaces/w1/settings');
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('heading', { name: 'اعضا و دعوت‌ها' }).waitFor();
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('link', { name: 'تنظیمات فضای کار' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('link', { name: 'تنظیمات فضای کار' }).click();
  await page.getByRole('heading', { name: 'اعضا و دعوت‌ها' }).waitFor();
  const profileIndustry = page.getByLabel('حوزه فعالیت (اختیاری)');
  await profileIndustry.fill('فناوری');
  await page.locator('.workspace-save-status').getByText('همه تغییرها ذخیره شد.').waitFor();
  assert.equal(projectProfiles.get('w1').industry, 'فناوری');

  await page.goto(url + '/app/workspaces/w1/tools/company');
  await page.getByRole('heading', { name: 'شرکت و مشتری ایده‌آل' }).waitFor();
  await page.getByText('هنوز ICP نساخته‌اید').waitFor();
  assert.equal(
    projectProfiles.get('w1').company_name,
    '',
    'a new profile must not contain a seeded company',
  );
  assert.deepEqual(
    projectProfiles.get('w1').icps,
    [],
    'a new profile must not contain a seeded ICP',
  );
  await page.getByRole('button', { name: 'راهنمای ICP' }).click();
  await page
    .getByRole('dialog')
    .getByText(/باوری را که هنوز بررسی نشده/)
    .waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'بستن' }).click();
  await page.getByRole('button', { name: 'تعریف اولین ICP' }).click();
  await page.getByLabel('نام شرکت یا پروژه').fill('راهکار مشتریان سازمانی');
  await page.getByLabel('نام ICP').fill('تیم‌های تولید متوسط');
  await page.getByLabel('صنعت').fill('تولید صنعتی');
  await page.getByLabel('نقش پرسونا').fill('مدیر عملیات');
  await page.getByLabel('مسئله برای حل').fill('هماهنگی سفارش‌ها میان واحدها دشوار است.');
  await page.getByRole('button', { name: 'افزودن شاهد' }).click();
  await page.getByLabel('آنچه مشاهده شد').fill('سه مدیر عملیات این تاخیر را گزارش کردند.');
  await page.getByLabel('منبع یا ارجاع').fill('مصاحبه‌های مشتری خرداد');
  await page.getByRole('button', { name: 'افزودن فرضیه' }).click();
  await page.getByLabel('فرضیه').fill('شرکت‌ها برای کاهش تاخیر بودجه اختصاص می‌دهند.');
  await page.getByLabel('آزمون بعدی').fill('بودجه را در مصاحبه بعدی بررسی کنیم.');
  await page.getByRole('button', { name: 'ذخیره پروفایل' }).click();
  await page.getByRole('status').filter({ hasText: 'اطلاعات این فضای کار ذخیره شد' }).waitFor();
  assert.equal(projectProfiles.get('w1').company_name, 'راهکار مشتریان سازمانی');
  assert.equal(
    projectProfiles.get('w1').icps[0].evidence[0].statement,
    'سه مدیر عملیات این تاخیر را گزارش کردند.',
  );
  assert.equal(
    projectProfiles.get('w1').icps[0].assumptions[0].statement,
    'شرکت‌ها برای کاهش تاخیر بودجه اختصاص می‌دهند.',
  );
  await page.getByRole('heading', { name: 'نسخه‌های ذخیره‌شده اخیر' }).waitFor();
  await page.getByRole('button', { name: 'بارگذاری در پیش‌نویس' }).first().waitFor();
  await page.getByLabel('جست‌وجوی ICP').fill('تیم‌های تولید');
  await page.getByRole('button', { name: /تیم‌های تولید متوسط/ }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `company profile overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/company-profile-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }

  await page.goto(url + '/app/workspaces/w1/tools/swot');
  await page.getByRole('heading', { name: 'تحلیل SWOT و گزینه‌های TOWS' }).waitFor();
  await page.getByText('هنوز عاملی ثبت نشده است').waitFor();
  const strengthGroup = page.locator('.strategy-factor-group--strength');
  await strengthGroup.getByRole('button', { name: 'افزودن عامل' }).click();
  await strengthGroup.getByLabel('عامل مشخص').fill('تحویل سریع برای مشتریان فعلی');
  const strategySwitchDialogPromise = page.waitForEvent('dialog');
  const strategyWorkspaceSelection = page
    .getByRole('combobox', { name: 'انتخاب فضای کار' })
    .selectOption('');
  const strategySwitchDialog = await strategySwitchDialogPromise;
  assert.match(strategySwitchDialog.message(), /پروژه مجاز/);
  await strategySwitchDialog.dismiss();
  await strategyWorkspaceSelection;
  assert.equal(
    await strengthGroup.getByLabel('عامل مشخص').inputValue(),
    'تحویل سریع برای مشتریان فعلی',
    'switch confirmation must preserve the open factor draft',
  );
  await strengthGroup
    .getByLabel('شاهد و منبع')
    .fill('داده شش پروژه اخیر، زمان تحویل زیر دو هفته را نشان می‌دهد.');
  await strengthGroup.getByLabel('مسئول پیگیری').fill('مدیر عملیات');
  await strengthGroup.getByRole('button', { name: 'ذخیره عامل' }).click();
  await page.getByRole('status').filter({ hasText: 'عامل ثبت شد' }).waitFor();
  const strengthId = strategyBoards
    .get('w1')
    .factors.find((item) => item.factor_type === 'strength').id;

  const opportunityGroup = page.locator('.strategy-factor-group--opportunity');
  await opportunityGroup.getByRole('button', { name: 'افزودن عامل' }).click();
  await opportunityGroup.getByLabel('عامل مشخص').fill('تقاضای تازه برای قراردادهای سازمانی');
  await opportunityGroup
    .getByLabel('شاهد و منبع')
    .fill('سه درخواست قیمت از سازمان‌ها در ماه گذشته دریافت شد.');
  await opportunityGroup.getByLabel('مسئول پیگیری').fill('مدیر فروش');
  await opportunityGroup.getByRole('button', { name: 'ذخیره عامل' }).click();
  await page.getByRole('status').filter({ hasText: 'عامل ثبت شد' }).waitFor();
  const opportunityId = strategyBoards
    .get('w1')
    .factors.find((item) => item.factor_type === 'opportunity').id;

  await page.getByRole('button', { name: 'افزودن گزینه راهبردی' }).click();
  await page.getByLabel('نام گزینه راهبردی').fill('پایلوت خدمت سازمانی');
  await page
    .getByLabel('اقدام مشخص و محدود')
    .fill('برای دو سازمان، پایلوت شش‌هفته‌ای با دامنه ثابت اجرا کنید.');
  await page
    .getByLabel('منطق پیوند عامل‌ها')
    .fill('سرعت تحویل تیم با تقاضای مشاهده‌شده هم‌خوان است.');
  await page
    .getByLabel('فرضیه قابل‌آزمون')
    .fill('اگر پایلوت در زمان وعده‌داده‌شده تحویل شود، دست‌کم یک سازمان قرارداد را تمدید می‌کند.');
  await page.getByLabel('هزینه یا محدودیت').fill('ظرفیت یک نفر از تیم برای شش هفته');
  await page.getByLabel('تحویل سریع برای مشتریان فعلی').check();
  await page.getByLabel('تقاضای تازه برای قراردادهای سازمانی').check();
  await page.getByRole('button', { name: 'ذخیره گزینه راهبردی' }).click();
  await page.getByRole('status').filter({ hasText: 'گزینه راهبردی ثبت شد' }).waitFor();
  let strategyOption = strategyBoards.get('w1').options[0];
  assert.equal(strategyOption.category, 'SO');
  assert.deepEqual(
    new Set(strategyOption.factor_refs.map((item) => item.id)),
    new Set([strengthId, opportunityId]),
  );
  assert.equal(strategyOption.needs_review, false);

  const strengthCard = strengthGroup.locator('.strategy-factor-card');
  await strengthCard.getByRole('button', { name: 'ویرایش' }).click();
  await strengthCard
    .getByLabel('شاهد و منبع')
    .fill('بازبینی داده شش پروژه، مزیت سرعت را تأیید کرد.');
  await strengthCard.getByRole('button', { name: 'ذخیره عامل' }).click();
  await page.getByRole('status').filter({ hasText: 'عامل به‌روز شد' }).waitFor();
  strategyOption = strategyBoards.get('w1').options[0];
  assert.equal(strategyOption.needs_review, true, 'semantic factor edits must flag linked options');
  await page
    .getByRole('status')
    .filter({ hasText: 'یکی از عامل‌های پیوندخورده تغییر کرده یا حذف شده است' })
    .waitFor();
  session = {
    ...session,
    workspaces: session.workspaces.map((item) =>
      item.id === 'w1' ? { ...item, role: 'viewer' } : item,
    ),
  };
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'ویرایشگر باید پیش از استفاده' }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'ذخیره گزینه راهبردی' }).count(),
    0,
    'viewers must not receive the review editor',
  );
  session = {
    ...session,
    workspaces: session.workspaces.map((item) =>
      item.id === 'w1' ? { ...item, role: 'owner' } : item,
    ),
  };
  await page.reload();
  await page
    .getByRole('status')
    .filter({ hasText: 'یکی از عامل‌های پیوندخورده تغییر کرده یا حذف شده است' })
    .waitFor();

  await strengthGroup.getByRole('button', { name: 'حذف' }).click();
  const factorDialog = page.getByRole('dialog');
  await factorDialog.getByText('پایلوت خدمت سازمانی').waitFor();
  await factorDialog.getByRole('button', { name: 'تأیید حذف عامل' }).click();
  await page.getByRole('status').filter({ hasText: 'عامل حذف شد و گزینه‌های وابسته' }).waitFor();
  strategyOption = strategyBoards.get('w1').options[0];
  assert.equal(
    strategyBoards.get('w1').options.length,
    1,
    'deleting a factor must retain its strategy option',
  );
  assert.equal(strategyOption.needs_review, true);
  assert.deepEqual(
    strategyOption.factor_refs.map((item) => item.id),
    [opportunityId],
  );

  await strengthGroup.getByRole('button', { name: 'افزودن عامل' }).click();
  await strengthGroup.getByLabel('عامل مشخص').fill('توان جایگزین تحویل تیم');
  await strengthGroup
    .getByLabel('شاهد و منبع')
    .fill('ظرفیت تحویل در برنامه تیم برای فصل جاری ثبت شده است.');
  await strengthGroup.getByLabel('مسئول پیگیری').fill('مدیر عملیات');
  await strengthGroup.getByRole('button', { name: 'ذخیره عامل' }).click();
  await page.getByRole('status').filter({ hasText: 'عامل ثبت شد' }).waitFor();
  const replacementStrength = strategyBoards
    .get('w1')
    .factors.find((item) => item.factor_type === 'strength');
  await page.getByLabel('توان جایگزین تحویل تیم').check();
  await page.getByRole('button', { name: 'ذخیره گزینه راهبردی' }).click();
  await page.getByRole('status').filter({ hasText: 'گزینه راهبردی به‌روز شد' }).waitFor();
  strategyOption = strategyBoards.get('w1').options[0];
  assert.equal(
    strategyOption.needs_review,
    false,
    'review is cleared only after the option is repaired',
  );
  assert.deepEqual(
    new Set(strategyOption.factor_refs.map((item) => item.id)),
    new Set([replacementStrength.id, opportunityId]),
  );

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `SWOT/TOWS overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/strategy-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await strengthGroup.getByRole('button', { name: 'افزودن عامل' }).focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent?.trim() === 'ویرایش'),
    true,
    'factor actions must be keyboard reachable in order',
  );
  assert.notEqual(
    await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
    'none',
    'keyboard focus must stay visible',
  );

  await page.goto(url + '/app/account');
  await page.getByLabel('زبان رابط').selectOption('en');
  await page.getByLabel('پوسته').selectOption('light');
  await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
  await page.getByRole('status').filter({ hasText: 'Your settings were saved and synced with this device.' }).waitFor();
  await page.goto(url + '/app/workspaces/w1/tools/swot');
  await page.getByRole('heading', { name: 'SWOT and TOWS' }).waitFor();
  assert.equal(await page.locator('.ui-root').getAttribute('dir'), 'ltr');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `LTR SWOT/TOWS overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/strategy-ltr-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  const strategyOptionCard = page
    .locator('.strategy-option-card')
    .filter({ hasText: 'پایلوت خدمت سازمانی' });
  await strategyOptionCard.getByRole('button', { name: 'Delete' }).click();
  const optionDialog = page.getByRole('dialog');
  await optionDialog.getByRole('button', { name: 'Confirm deletion' }).click();
  await page.getByRole('status').filter({ hasText: 'Strategy option deleted' }).waitFor();
  assert.equal(
    strategyBoards.get('w1').options.length,
    0,
    'an option can be deleted independently',
  );
  assert.equal(
    strategyBoards.get('w1').factors.length,
    2,
    'deleting an option must preserve its factors',
  );
  await page.goto(url + '/app/workspaces/w1/tools/matrices');
  await page.getByRole('heading', { name: 'Factor evaluation' }).waitFor();
  // Clear the empty manual-entry row before copying the real SWOT snapshot.
  await page.getByRole('button', { name: 'Remove factor 1', exact: true }).click();
  await page.getByRole('button', { name: /Copy SWOT factors/ }).click();
  await page.getByLabel('Weight percent for factor 1').fill('100');
  await page.getByLabel('Rating for factor 1').selectOption('4');
  await page.getByRole('button', { name: 'Finalize matrix' }).click();
  await page.getByRole('status').filter({ hasText: 'Matrix finalized and saved' }).waitFor();
  assert.equal(analysisRecords.get('w1:efe').output.rounded_score, 4);
  assert.equal(analysisRecords.get('w1:efe').state, 'finalized');
  await page.getByRole('button', { name: /IFE/ }).click();
  await page.getByRole('button', { name: 'Remove factor 1', exact: true }).click();
  await page.getByRole('button', { name: /Copy SWOT factors/ }).click();
  await page.getByLabel('Weight percent for factor 1').fill('100');
  await page.getByLabel('Rating for factor 1').selectOption('4');
  await page.getByRole('button', { name: 'Finalize matrix' }).click();
  await page.getByRole('status').filter({ hasText: 'Matrix finalized and saved' }).waitFor();
  assert.equal(analysisRecords.get('w1:ife').output.rounded_score, 4);
  await page.reload();
  await page.getByRole('heading', { name: 'Factor evaluation' }).waitFor();
  assert.equal(
    await page.locator('.evaluation-result__revision').count(),
    1,
    'matrix revisions must survive refresh',
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `EFE/IFE overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/matrices-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.getByRole('button', { name: /Copy SWOT factors/ }).focus();
  assert.notEqual(
    await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
    'none',
    'matrix controls must keep visible keyboard focus',
  );

  await page.goto(url + '/app/account');
  await page.getByLabel('Interface language').selectOption('fa');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('status').filter({ hasText: 'تنظیمات حسابت ذخیره' }).waitFor();
  await page.goto(url + '/app/workspaces/w1/tools/execution');
  await page.getByRole('heading', { name: 'از تصمیم تا اقدام' }).waitFor();
  await page
    .getByRole('textbox', { name: 'تصمیم', exact: true })
    .fill('پایلوت بازار برای مشتریان سازمانی');
  await page
    .getByLabel('تحلیل یا گزینه راهبردی')
    .selectOption(`analysis:${analysisRecords.get('w1:efe').id}`);
  await page.getByLabel('دلیل تصمیم').fill('سه درخواست قیمت از سازمان‌ها دریافت شده است.');
  await page
    .getByLabel('فرض‌هایی که باید درست باشند')
    .fill('تیم می‌تواند پایلوت را در شش هفته تحویل دهد.');
  await page
    .getByLabel('چه زمانی تصمیم را بازبینی کنیم؟')
    .fill('پس از دو پایلوت یا پایان ماه اول.');
  await page.getByRole('button', { name: 'ذخیره تصمیم' }).click();
  await page.getByRole('status').filter({ hasText: 'تصمیم ثبت شد' }).waitFor();
  const executionDecision = executionBoards.get('w1').decisions[0];
  assert.equal(
    executionDecision.source.kind,
    'analysis',
    'decisions must keep a link to a finalized analysis',
  );

  await page.getByLabel('هدف', { exact: true }).fill('تحویل پایلوت در زمان وعده‌داده‌شده');
  await page.getByLabel('شرح', { exact: true }).fill('با دو مشتری و یک معیار خروج روشن.');
  const dueDate = new Date(`${executionBoards.get('w1').today}T00:00:00Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);
  const goalDueOn = dueDate.toISOString().slice(0, 10);
  await page.getByLabel('تاریخ هدف').fill(goalDueOn);
  await page.getByRole('button', { name: 'افزودن هدف' }).click();
  await page.getByRole('status').filter({ hasText: 'هدف ذخیره شد' }).waitFor();
  const executionGoal = executionBoards.get('w1').goals[0];
  await page.getByRole('button', { name: 'افزودن اقدام' }).click();
  await page.getByLabel('اقدام', { exact: true }).fill('اجرای پایلوت بازار');
  await page.getByLabel('شرح', { exact: true }).last().fill('با دو مشتری منتخب و گزارش نتیجه.');
  await page.getByLabel('موعد').fill(goalDueOn);
  await page.getByLabel('هدف پیوندخورده').selectOption(executionGoal.id);
  await page.getByRole('button', { name: 'ثبت اقدام' }).click();
  await page.getByRole('status').filter({ hasText: 'اقدام به برنامه اضافه شد' }).waitFor();
  let executionAction = executionBoards.get('w1').actions[0];
  assert.equal(
    executionAction.decision_id,
    executionDecision.id,
    'actions must link back to their decision',
  );
  assert.equal(executionAction.goal_id, executionGoal.id, 'actions must keep their linked goal');
  await page.getByLabel('تغییر وضعیت').focus();
  assert.notEqual(
    await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
    'none',
    'status control must keep visible keyboard focus',
  );
  await page.getByLabel('تغییر وضعیت').press('ArrowDown');
  await page.getByLabel('تغییر وضعیت').press('ArrowUp');
  await page.getByLabel('تغییر وضعیت').selectOption('in_progress');
  await page
    .getByRole('region', { name: /اقدام‌های.*پیش رو/ })
    .getByRole('button', { name: 'ذخیره وضعیت' })
    .click();
  await page.getByRole('status').filter({ hasText: 'وضعیت اقدام ذخیره شد' }).waitFor();
  executionAction = executionBoards.get('w1').actions[0];
  assert.equal(executionAction.status, 'in_progress');
  assert.equal(executionBoards.get('w1').events[0].event_type, 'status_changed');
  await page.reload();
  await page.getByRole('heading', { name: 'از تصمیم تا اقدام' }).waitFor();
  await page.getByRole('heading', { name: 'اجرای پایلوت بازار', exact: true }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `execution plan overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/execution-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  session = {
    ...session,
    workspaces: session.workspaces.map((item) =>
      item.id === 'w1' ? { ...item, role: 'viewer' } : item,
    ),
  };
  await page.reload();
  await page.getByText('دسترسی شما به این فضای کار فقط برای مشاهده است.').waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'ذخیره تصمیم' }).count(),
    0,
    'viewers must not receive decision write controls',
  );
  session = {
    ...session,
    workspaces: session.workspaces.map((item) =>
      item.id === 'w1' ? { ...item, role: 'owner' } : item,
    ),
  };

  await page.goto(url + '/app/workspaces/w1/tools/documents');
  await page.getByRole('heading', { name: 'کتابخانه مدارک مدیریتی' }).waitFor();
  await page.getByLabel('مرحله کسب‌وکار').selectOption('growth');
  await page.locator('.documents-filterbar').getByLabel('صنعت').selectOption('technology');
  await page.locator('.documents-index__item').first().waitFor();
  assert.ok(
    (await page.locator('.documents-index__item').count()) > 0,
    'stage and industry filters must leave matching guides',
  );
  await page.getByLabel('مرحله کسب‌وکار').selectOption('');
  await page.locator('.documents-filterbar').getByLabel('صنعت').selectOption('');
  await page.getByRole('heading', { name: 'کتابخانه مدارک مدیریتی' }).waitFor();

  const advisoryTemplate = documentCatalog.documents.find((item) => item.advisory_note);
  assert.ok(advisoryTemplate, 'the catalog must distinguish professional-review guidance');
  await page
    .locator('.documents-index__item')
    .filter({ hasText: advisoryTemplate.title.fa })
    .click();
  await page.locator('.documents-advisory').waitFor();
  const executiveTemplate = documentCatalog.documents.find(
    (item) => item.id === 'executive-onepage',
  );
  assert.ok(executiveTemplate, 'the executive guide must remain in the catalog');
  await page
    .locator('.documents-index__item')
    .filter({ hasText: executiveTemplate.title.fa })
    .click();
  await page.getByLabel('پیش‌نویس سند').fill('پیش‌نویس اختصاصی برای مرور مدیر پروژه');
  await page.getByRole('combobox', { name: /^بازبین/ }).selectOption('u1');
  await page.getByLabel('وضعیت سند').selectOption('review');
  await page.getByRole('button', { name: 'ثبت در فضای کار' }).click();
  await page.getByRole('status').filter({ hasText: 'راهنمای سند در فضای کار ذخیره شد' }).waitFor();
  const documentBoard = documentBoards.get('w1');
  let executiveRecord = documentBoard.items.find((item) => item.id === 'executive-onepage').record;
  assert.equal(executiveRecord.status, 'review');
  assert.equal(executiveRecord.content_version, 1);
  failNextAttachmentUpload = true;
  await page.locator('.document-attachments__input').setInputFiles({
    name: 'صورتجلسه.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 minutes'),
  });
  await page.getByText('بارگذاری ناموفق بود').waitFor();
  await page.getByRole('button', { name: 'تلاش دوباره برای بارگذاری' }).click();
  await page.getByRole('link', { name: 'دریافت فایل' }).waitFor();
  for (const container of ['.document-attachments__queue', '.document-attachments__list']) {
    assert.equal(
      await page.locator(container).getByText('صورتجلسه.pdf', { exact: true }).count(),
      1,
      'uploaded file appears once in both queue and private list',
    );
  }
  assert.match(
    await page.locator('.document-attachments__list code').innerText(),
    /^SHA-256 · a{64}$/,
  );
  await page.locator('.document-attachments__input').setInputFiles([
    { name: 'پیوست-الف.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 a') },
    { name: 'پیوست-ب.csv', mimeType: 'text/csv', buffer: Buffer.from('name,value\nA,1') },
  ]);
  await page.getByText('پیوست-الف.pdf').last().waitFor();
  await page.getByText('پیوست-ب.csv').last().waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.document-attachments__list .document-attachment').length === 3,
  );
  const uploadDone = new Promise((resolve) => {
    signalAttachmentUploadStarted = resolve;
  });
  holdNextAttachmentUpload = true;
  await page.locator('.document-attachments__input').setInputFiles({
    name: 'یادداشت.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 notes'),
  });
  await uploadDone;
  await page.getByRole('button', { name: 'لغو' }).last().click();
  await page.getByText('لغو شد').waitFor();
  signalAttachmentUploadStarted = undefined;
  for (let remaining = 3; remaining > 0; remaining--) {
    await page.waitForFunction((count) =>
      document.querySelectorAll('.document-attachments__list .document-attachment').length === count,
      remaining,
    );
    await page.getByRole('button', { name: 'حذف فایل' }).first().click();
    await page.getByText('این فایل و نسخه‌های ذخیره‌شده آن حذف شود؟').first().waitFor();
    await page.getByRole('button', { name: 'حذف نهایی' }).click();
    await page.waitForFunction((count) =>
      document.querySelectorAll('.document-attachments__list .document-attachment').length === count,
      remaining - 1,
    );
  }
  await page.getByText('بازبین تعیین‌شده محتوا را بررسی کند و سپس آن را آماده کند.').waitFor();
  await page.getByLabel('پیش‌نویس سند').fill('نسخه دوم راهنمای مدیریتی پس از اصلاح');
  await page.getByLabel('وضعیت سند').selectOption('ready');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await page.getByRole('status').filter({ hasText: 'راهنمای سند در فضای کار ذخیره شد' }).waitFor();
  executiveRecord = documentBoard.items.find((item) => item.id === 'executive-onepage').record;
  assert.equal(executiveRecord.status, 'ready');
  assert.equal(executiveRecord.content_version, 2);
  assert.equal(
    JSON.stringify(documentBoard.events).includes('نسخه دوم راهنمای مدیریتی پس از اصلاح'),
    false,
    'document event history must keep content private',
  );
  await page.reload();
  await page.getByRole('heading', { name: 'کتابخانه مدارک مدیریتی' }).waitFor();
  assert.equal(
    await page.getByLabel('پیش‌نویس سند').inputValue(),
    'نسخه دوم راهنمای مدیریتی پس از اصلاح',
  );
  await page.getByLabel('پیش‌نویس سند').focus();
  assert.notEqual(
    await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
    'none',
    'document editor must keep visible keyboard focus',
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `document library overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/documents-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  session = {
    ...session,
    workspaces: session.workspaces.map((item) =>
      item.id === 'w1' ? { ...item, role: 'viewer' } : item,
    ),
  };
  await page.reload();
  await page.getByText('دسترسی شما به این فضای کار فقط خواندنی است.').waitFor();
  assert.equal(
    await page.getByLabel('پیش‌نویس سند').isDisabled(),
    true,
    'viewer document content must be read-only',
  );
  session = {
    ...session,
    workspaces: session.workspaces.map((item) =>
      item.id === 'w1' ? { ...item, role: 'owner' } : item,
    ),
  };

  await page.goto(url + '/app/account');
  await page.getByLabel('زبان رابط').selectOption('fa');
  await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
  await page.getByRole('status').filter({ hasText: 'تنظیمات حسابت ذخیره' }).waitFor();

  const legacyImportFixture = {
    version: 1,
    org: { name: 'شرکت نمونه' },
    completed: [false, false, false, false, false, false],
    external: [{}],
    internal: [{}],
    qScores: {},
    space: {},
    fin: {},
    investment: {},
    trend: { months: ['1405-01'], revenue: [0], target: [0] },
    objectives: [{}],
    initiatives: [],
    risks: [],
    journal: [{}],
    pestel: [],
    forces: [1, 2, 3, 4, 5],
    competitors: [],
    vrio: [],
    swot: [],
    options: [{}, {}, {}],
    products: [],
    scenario: {},
    bcgThreshold: 0,
    learning: true,
    mode: 'startup',
    period: 'quarter',
    notes: 'یادداشت قدیمی',
  };
  await page.evaluate(() =>
    localStorage.setItem('royesh-strategy-v1', 'preserve-this-browser-copy'),
  );
  const shellScreenshots = [];
  for (const theme of ['light', 'dark']) {
    await page.goto(url + '/app/account');
    await page.getByLabel('پوسته').selectOption(theme);
    await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
    await page.getByText('تنظیمات حسابت ذخیره و با این دستگاه همگام شد.').waitFor();
    await page.goto(url + '/app/workspaces/w1/imports');
    await page.getByRole('heading', { name: 'واردسازی پشتیبان', exact: true }).waitFor();
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `import overflow ${width}/${theme}`,
      );
      await page.screenshot({
        path: `test-results/web/import-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      shellScreenshots.push(`test-results/web/import-${width}-${theme}.png`);
    }
  }
  await page.getByLabel('فایل پشتیبان JSON', { exact: true }).setInputFiles({
    name: 'legacy-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyImportFixture)),
  });
  await page.getByRole('button', { name: 'پیش‌نمایش واردسازی' }).click();
  await page.getByRole('heading', { name: 'مقصد: پروژه مجاز' }).waitFor();
  await page.getByText('۸ رکورد برای این فضای کار شناسایی شد.').waitFor();
  await page.getByRole('button', { name: 'واردسازی در پروژه مجاز' }).click();
  await page.getByRole('status').filter({ hasText: 'داده فعال پروژه بدون تغییر ماند' }).waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('royesh-strategy-v1')),
    'preserve-this-browser-copy',
  );
  await page.getByRole('heading', { name: /پشتیبان واردشده/ }).waitFor();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'دریافت پشتیبان JSON' }).click();
  assert.match((await backupDownload).suggestedFilename(), /backup.*\.json$/);
  await page.getByRole('button', { name: 'بازگردانی واردسازی' }).click();
  const undoDialog = page.getByRole('dialog');
  await undoDialog.getByRole('button', { name: 'بازگردانی batch' }).click();
  await page.getByText('بازگردانی‌شده').waitFor();

  await page.goto(url + '/app/workspaces/w1/settings');
  await page.getByLabel('مرحله فعلی (اختیاری)').waitFor();
  const competingProfile = projectProfiles.get('w1');
  competingProfile.mission = 'ویرایش هم‌زمان از تب دیگر';
  competingProfile.revision++;
  await page.getByLabel('مرحله فعلی (اختیاری)').fill('رشد');
  await page.getByRole('group', { name: 'حل تعارض اطلاعات پروژه' }).waitFor();
  assert.equal(
    projectProfiles.get('w1').mission,
    'ویرایش هم‌زمان از تب دیگر',
    'stale edits must not overwrite another tab silently',
  );
  await page.getByRole('button', { name: 'استفاده از نسخه سرور' }).click();
  assert.equal(
    await page.getByLabel('هدف یا مسئله اصلی (اختیاری)').inputValue(),
    'ویرایش هم‌زمان از تب دیگر',
  );

  loseProfilePatchResponse = true;
  await page.getByLabel('مرحله فعلی (اختیاری)').fill('گسترش');
  await page.locator('.workspace-save-status').getByText('همه تغییرها ذخیره شد.').waitFor();
  assert.equal(
    projectProfiles.get('w1').stage,
    'گسترش',
    'a lost response must be reconciled before retrying',
  );

  failProfileNextPatch = true;
  await page.getByLabel('حوزه فعالیت (اختیاری)').fill('صنعت');
  await page.getByRole('alert').filter({ hasText: 'ارتباط با سرویس قطع شد' }).waitFor();
  assert.notEqual(
    await page.locator('.workspace-save-status').innerText(),
    'همه تغییرها ذخیره شد.',
  );
  await page.getByRole('button', { name: 'تلاش دوباره برای ذخیره' }).click();
  await page.locator('.workspace-save-status').getByText('همه تغییرها ذخیره شد.').waitFor();
  assert.equal(projectProfiles.get('w1').industry, 'صنعت');

  expireProfileNextRead = true;
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.waitForURL(/account\/login/);
  await page.goto(url + '/app/workspaces/w1/settings');
  await page.getByRole('heading', { name: 'اعضا و دعوت‌ها' }).waitFor();

  const nameInput = page.getByLabel('نام فضای کار');
  workspace.revision = 2;
  await nameInput.fill('تغییر هم‌زمان');
  await page.getByRole('button', { name: 'ذخیره نام' }).click();
  await page.getByRole('alert').filter({ hasText: 'هم‌زمان تغییر کرده است' }).waitFor();
  await page.getByRole('button', { name: 'بارگیری نسخه تازه' }).click();
  await page.waitForFunction(
    () => document.querySelector('.workspace-form--inline input')?.value === 'پروژه مجاز',
  );
  await nameInput.fill('نام ذخیره‌نشده');
  const cancelDialogPromise = page.waitForEvent('dialog');
  const cancelSelection = page.getByRole('combobox', { name: 'انتخاب فضای کار' }).selectOption('');
  const cancelDialog = await cancelDialogPromise;
  assert.match(cancelDialog.message(), /پروژه مجاز/);
  await cancelDialog.dismiss();
  await cancelSelection;
  assert.match(page.url(), /\/app\/workspaces\/w1\/settings$/);
  const switchDialogPromise = page.waitForEvent('dialog');
  const switchSelection = page.getByRole('combobox', { name: 'انتخاب فضای کار' }).selectOption('');
  const switchDialog = await switchDialogPromise;
  assert.match(switchDialog.message(), /پروژه مجاز/);
  await switchDialog.accept();
  await switchSelection;
  await page.getByRole('heading', { name: 'فضاهای من' }).waitFor();
  await page.getByRole('link', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('link', { name: 'پروژه مجاز' }).click();
  await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
  await page.getByRole('link', { name: 'تنظیمات فضای کار' }).click();
  await page.getByRole('heading', { name: 'اعضا و دعوت‌ها' }).waitFor();
  await page.getByLabel('دعوت با ایمیل').fill('member@example.test');
  await page.getByLabel('سطح دسترسی').selectOption('viewer');
  await page.getByRole('button', { name: 'فرستادن دعوت' }).click();
  await page.getByText('member@example.test').waitFor();
  await page.getByRole('button', { name: 'لغو دعوت' }).click();
  const invitationDialog = page.getByRole('dialog');
  await invitationDialog.getByRole('button', { name: 'لغو دعوت' }).click();
  await invitationDialog.waitFor({ state: 'hidden' });
  await page
    .locator('.workspace-invite-row__email')
    .filter({ hasText: 'member@example.test' })
    .waitFor({ state: 'detached' });

  for (const theme of ['light', 'dark']) {
    await page.goto(url + '/app/account');
    await page.getByRole('heading', { name: 'پروفایل و تنظیمات' }).waitFor();
    await page.getByLabel('پوسته').selectOption(theme);
    await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
    await page.getByText('تنظیمات حسابت ذخیره و با این دستگاه همگام شد.').waitFor();
    await page.goto(url + '/app/workspaces/w1/overview');
    await page.getByRole('heading', { name: 'پروژه مجاز' }).waitFor();
    for (const width of [360, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `shell overflow ${width}/${theme}`,
      );
      const path = `test-results/web/shell-${width}-${theme}.png`;
      await page.screenshot({ path, fullPage: true, animations: 'disabled' });
      shellScreenshots.push(path);
    }
  }
  await page.setViewportSize({ width: 360, height: 820 });
  const mobileMenuTrigger = page.getByRole('button', { name: 'بازکردن منوی فضای کار' });
  await mobileMenuTrigger.click();
  const mobileMenu = page.getByRole('dialog', { name: 'ناوبری فضای کار' });
  await mobileMenu.waitFor();
  assert.equal(await mobileMenu.getByRole('link', { name: 'نمای کلی پروژه' }).count(), 1);
  assert.equal(
    await mobileMenu.evaluate((node) => node.contains(document.activeElement)),
    true,
    'mobile menu must receive focus',
  );
  await page.keyboard.press('Escape');
  await mobileMenu.waitFor({ state: 'hidden' });
  assert.equal(
    await mobileMenuTrigger.evaluate((node) => node === document.activeElement),
    true,
    'mobile menu must restore focus',
  );

  await page.keyboard.press('/');
  const searchDialog = page.getByRole('dialog', { name: 'جستجو در فضای کار' });
  await searchDialog.getByLabel('جستجوی صفحه و ابزار').fill('تصمیم');
  await searchDialog.getByRole('link', { name: 'اتاق تصمیم' }).click();
  await page.getByRole('heading', { name: 'اتاق تصمیم' }).waitFor();
  assert.match(
    await page.locator('[aria-labelledby="comparison-title"]').innerText(),
    /این مقایسه کیفیه و امتیاز QSPM تولید نمی‌کنه/,
  );
  assert.equal(await page.locator('.workspace-tool__availability').count(), 0);
  await page.goBack();
  await page.waitForURL(/\/app\/workspaces\/w1\/overview$/);
  await page.goForward();
  await page.waitForURL(/\/app\/workspaces\/w1\/tools\/qspm$/);
  await page.goto(url + '/app/workspaces/w1/matrices/efe');
  await page.waitForURL(/\/app\/workspaces\/w1\/tools\/matrices\?path=efe$/);
  await page.getByRole('heading', { name: 'ارزیابی عوامل راهبردی' }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: /EFE.*ارزیابی عوامل بیرونی/ })
      .getAttribute('aria-pressed'),
    'true',
    'legacy EFE URLs must open the real authorized EFE editor',
  );
  await page.reload();
  await page.getByRole('heading', { name: 'ارزیابی عوامل راهبردی' }).waitFor();

  await page.locator('summary[aria-label="منوی حساب"]').click();
  await page.getByRole('link', { name: 'پلن و سهمیه' }).click();
  await page.waitForURL(/\/app\/account#subscription$/);
  await page.getByRole('heading', { name: 'اشتراک‌های من', exact: true }).waitFor();

  await page.goto(url + '/app/workspaces/other/overview');
  await page.getByRole('heading', { name: 'فضای کار در دسترس نیست' }).waitFor();
  await page.goto(url + '/internal');
  await page.getByRole('heading', { name: 'دسترسی نداری' }).waitFor();
  session = { ...session, user: { ...session.user, is_staff: true } };
  await page.route('**/api/v1/operator/status/', (route) =>
    route.fulfill({
      status: 403,
      json: { code: 'operator_permission_denied', message: 'مجوز مستقل مدیریت لازم است.' },
    }),
  );
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'مجوز مستقل مدیریت لازم است.' }).waitFor();
  assert.equal(
    await page.locator('.op-collection').count(),
    0,
    'staff status alone must not expose operator collections',
  );
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) =>
    route.fulfill({
      json: { authenticated: true, user: { id: 'u1', is_staff: 'true' }, workspaces: [] },
    }),
  );
  await page.goto(url + '/internal');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /معتبر نیست/);
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) => route.fulfill({
    status: 503, json: { message: 'سرویس حساب در دسترس نیست.' },
  }));
  await page.goto(url + '/app/workspaces/w1/overview');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /در دسترس نیست/);

  session = {
    authenticated: true,
    user: { id: 'u2', name: 'مدیر تازه', is_staff: false },
    workspaces: [],
  };
  workspaceRows = [];
  accountProfile = {
    email: 'new-owner@example.test',
    display_name: '',
    role_title: '',
    pending_email: '',
  };
  await page.unroute('**/api/v1/session/');
  await page.route('**/api/v1/session/', (route) => route.fulfill({ json: session }));
  await page.goto(url + '/app/start');
  await page.getByRole('heading', { name: 'کمی درباره شما' }).waitFor();
  await page.getByLabel('نام شما').fill('مدیر تازه');
  await page.getByLabel('نقش یا عنوان شغلی (اختیاری)').fill('بنیان‌گذار');
  await page.getByRole('button', { name: 'ادامه' }).click();
  await page.getByRole('heading', { name: 'برای پروژه نام بگذارید' }).waitFor();
  await page.getByLabel('نام کسب‌وکار یا پروژه').fill('پروژه‌ی تازه');
  await page.getByRole('button', { name: 'ساخت پروژه' }).click();
  await page.getByRole('heading', { name: 'برای شروع، جهت پروژه را مشخص کنید' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'برای شروع، جهت پروژه را مشخص کنید' }).waitFor();
  await page.getByRole('button', { name: 'بازگشت' }).click();
  await page.getByRole('heading', { name: 'برای پروژه نام بگذارید' }).waitFor();
  assert.equal(await page.getByLabel('نام کسب‌وکار یا پروژه').inputValue(), 'پروژه‌ی تازه');
  await page.getByRole('button', { name: 'بازگشت' }).click();
  await page.getByRole('heading', { name: 'کمی درباره شما' }).waitFor();
  assert.equal(await page.getByLabel('نام شما').inputValue(), 'مدیر تازه');
  await page.getByRole('button', { name: 'ادامه' }).click();
  await page.getByRole('heading', { name: 'برای پروژه نام بگذارید' }).waitFor();
  await page.getByRole('button', { name: 'ساخت پروژه' }).click();
  await page.getByRole('heading', { name: 'برای شروع، جهت پروژه را مشخص کنید' }).waitFor();
  await page.getByLabel('حوزه فعالیت (اختیاری)').fill('نرم‌افزار');
  await page.getByLabel('مرحله فعلی (اختیاری)').fill('آغاز');
  await page.getByLabel('هدف یا مسئله اصلی (اختیاری)').fill('رسیدن به نخستین مشتریان');
  for (const width of [360, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `onboarding overflow ${width}`,
    );
    await page.screenshot({
      path: `test-results/web/onboarding-project-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'ذخیره و ورود به فضا' }).click();
  await page.getByRole('heading', { name: 'پروژه‌ی تازه' }).waitFor();
  assert.equal(projectProfiles.get('w2').industry, 'نرم‌افزار');
  assert.equal(projectProfiles.get('w2').mission, 'رسیدن به نخستین مشتریان');
  assert.equal(createdWorkspaceCount, 1);
  await page.goto(url + '/app/workspaces/w2/tools/company');
  await page.getByRole('heading', { name: 'شرکت و مشتری ایده‌آل' }).waitFor();
  await page.getByRole('button', { name: 'تعریف اولین ICP' }).click();
  await page.getByLabel('نام ICP').fill('مشتری مستقل پروژه دوم');
  await page.getByRole('button', { name: 'ذخیره پروفایل' }).click();
  await page.getByRole('status').filter({ hasText: 'اطلاعات این فضای کار ذخیره شد' }).waitFor();
  assert.equal(projectProfiles.get('w2').icps[0].name, 'مشتری مستقل پروژه دوم');
  assert.equal(
    projectProfiles.get('w1').icps[0].name,
    'تیم‌های تولید متوسط',
    'Workspace ICPs must stay isolated',
  );
  await page.goto(url + '/app/workspaces/w2/tools/matrices');
  await page.getByRole('heading', { name: 'ارزیابی عوامل راهبردی' }).waitFor();
  assert.equal(
    await page.locator('.evaluation-result h2').innerText(),
    '— / ۴',
    'matrix data must stay isolated between Workspaces',
  );
  await page.goto(url + '/app/workspaces/w2/tools/execution');
  await page.getByRole('heading', { name: 'از تصمیم تا اقدام' }).waitFor();
  assert.equal(
    await page.getByText('هنوز تصمیمی ثبت نشده').count(),
    1,
    'execution records must stay isolated between Workspaces',
  );

  await page.goto(url + '/app/start');
  await page.waitForURL(/\/app\/workspaces\/w2\/overview$/);
  session = {
    authenticated: true,
    user: { id: 'u3', name: 'عضو دعوت‌شده', is_staff: false },
    workspaces: [{ id: 'w1', name: workspace.name, role: 'editor' }],
  };
  workspaceRows = [workspace];
  accountProfile = {
    email: 'member@example.test',
    display_name: '',
    role_title: '',
    pending_email: '',
  };
  await page.goto(url + '/app/start');
  await page.waitForURL(/\/app\/workspaces$/);
  await page.getByRole('link', { name: 'پروژه مجاز' }).waitFor();
  assert.equal(
    createdWorkspaceCount,
    1,
    'invited members must not be pushed into creating another Workspace',
  );

  const response = await page.request.get(url + '/api/v1/session/');
  assert.equal(response.status(), 404, 'API missing route must not return SPA HTML');
  await page.goto(url + '/missing-page');
  await page.getByRole('heading', { name: 'صفحه پیدا نشد' }).waitFor();
  await page.goto(url + '/#matrices/efe');
  await page.waitForURL(/prototype\/.*#matrices\/efe/);
  await page.locator('#main h1').waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/web/checks.json',
    JSON.stringify(
      {
        results,
        sessionBoundary: 'mocked contract only; not real authentication',
        malformedSessionRejected: true,
        operatorDenied: true,
        prototypePreserved: true,
        onboardingRefreshAndBack: true,
        inviteeNotForcedToCreateWorkspace: true,
        workspaceShellScreenshots: shellScreenshots,
        workspaceMobileMenuFocusRestored: true,
        routeSearchAndLegacyDeepLinks: true,
        workspaceProfileAutosaveConflictAndRecovery: true,
        workspaceSwotTowsFactorsOptionsAndDependencyReview: true,
        workspaceEfeIfeCalculationPersistenceAndInterpretation: true,
        workspaceExecutionDecisionActionHistoryRoleIsolation: true,
        workspaceDocumentsFiltersAssignmentsContentVersionsAndRoleIsolation: true,
        documentLibraryScreenshots: 8,
        responsiveScreenshots: 52,
        legacyImportPreviewCommitDownloadUndo: true,
        legacyBrowserStoragePreserved: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: responsive/theme/onboarding/shell/import/profile/SWOT/execution/documents RTL/LTR screenshots, workspace routes/search/legacy mapping, import preview/commit/download/undo, profile autosave/recovery, SWOT/TOWS factor links and dependency review, decision-to-action and document ownership/history/role isolation, keyboard focus, onboarding refresh/back, session boundaries, membership, prototype and API fallback',
  );
} catch (error) {
  const failedPage = browser.contexts()[0]?.pages()[0];
  if (failedPage) {
    await failedPage.screenshot({ path: 'test-results/web/failure.png', fullPage: true });
    console.error('Synthetic browser fixture failed:', failedPage.url(), {
      alerts: await failedPage.getByRole('alert').allTextContents(),
      statuses: await failedPage.getByRole('status').allTextContents(),
    });
  }
  throw error;
} finally {
  await browser.close();
}
