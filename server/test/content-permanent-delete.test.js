const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const admin = require('../routes/admin');
const news = require('../routes/news');
const Event = require('../models/Event');
const EventRsvp = require('../models/EventRsvp');
const AuditLog = require('../models/AuditLog');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('event purge removes RSVPs, deletes the record and audits; unrelated editors are denied', async (t) => {
  const deleted = [];
  const event = {
    _id: '507f1f77bcf86cd799439011',
    createdBy: 'owner',
    status: 'pending',
    deleteOne: async () => deleted.push('event'),
  };
  t.mock.method(Event, 'findById', async () => event);
  t.mock.method(EventRsvp, 'deleteMany', async (filter) => {
    assert.equal(filter.event, event._id);
    deleted.push('rsvps');
  });
  t.mock.method(AuditLog, 'create', async (entry) => {
    assert.equal(entry.action, 'content.deleted');
    deleted.push('audit');
  });
  const handler = admin.stack
    .find(
      (layer) =>
        layer.route?.methods.delete && layer.route.path === '/events/:eventId',
    )
    .route.stack.at(-1).handle;
  const req = {
    params: { eventId: event._id },
    user: { _id: 'other', role: 'editor' },
  };
  const denied = response();
  await handler(req, denied);
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(deleted, []);
  req.user.role = 'administrator';
  const allowed = response();
  await handler(req, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(deleted, ['rsvps', 'event', 'audit']);
});

test('news purge requires the permanent-delete permission', () => {
  const guard = news.stack.find(
    (layer) =>
      layer.route?.methods.delete && layer.route.path === '/:articleId',
  ).route.stack[1].handle;
  for (const role of ['member', 'editor', 'administrator']) {
    let passed = false;
    const res = response();
    guard({ user: { role } }, res, () => {
      passed = true;
    });
    assert.equal(passed, role === 'administrator');
    if (!passed) assert.equal(res.statusCode, 403);
  }
});

function workspace({ permitted = true, confirmed = true, fail = false } = {}) {
  const calls = [];
  const element = () => ({
    children: [],
    append(child) {
      this.children.push(child);
    },
    get childElementCount() {
      return this.children.length;
    },
    addEventListener(name, handler) {
      this[name] = handler;
    },
  });
  const context = {
    window: {},
    document: { createElement: element },
    CMCENModal: {
      confirm: async (_message, options) => {
        if (!confirmed) return false;
        try {
          await options.onConfirm?.();
          return true;
        } catch (error) {
          // Model dismissing the modal after it displays the request error.
          calls.push(error.message);
          return false;
        }
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/content-workspace-actions.js'),
      'utf8',
    ),
    context,
  );
  const state = {
    user: { permissions: { canDeleteContent: permitted } },
    editorDrafts: new Map([['en', 'draft']]),
    selectedId: '123',
  };
  const actions = context.window.ContentWorkspaceActions.create({
    contentWorkspaceState: state,
    contentWorkspaceRoutes: { event: '/api/admin/events' },
    canManageContentWorkspaceNews: () => false,
    canReviewContentWorkspace: () => false,
    getText: (_key, fallback) => fallback,
    setWorkspaceTranslatedText: (node, key) => {
      node.key = key;
    },
    contentWorkspaceApiJson: async (url, options) => {
      calls.push([url, options.method]);
      if (fail) throw new Error('failed');
    },
    getEditorDraftKey: (_item, language) => language,
    showWorkspaceSuccess: () => calls.push('success'),
    loadContentWorkspace: async () => calls.push('reload'),
    setWorkspaceMessage: (message) => calls.push(message),
  });
  const section = actions.createContentWorkspaceBottomActions({
    type: 'event',
    _id: '123',
    status: 'pending',
  });
  const button = section?.children[0]?.children[0]?.children[0];
  return { button, state, calls };
}

test('workspace hides purge without permission and cancellation preserves drafts', async () => {
  assert.equal(workspace({ permitted: false }).button, undefined);
  const { button, calls, state } = workspace({ confirmed: false });
  button.click();
  await new Promise(setImmediate);
  assert.deepEqual(calls, []);
  assert.equal(state.editorDrafts.size, 1);
  assert.equal(state.isActing, 0);
});

test('workspace clears deleted selection and drafts only after successful deletion', async () => {
  for (const fail of [false, true]) {
    const { button, calls, state } = workspace({ fail });
    button.click();
    button.click();
    await new Promise(setImmediate);
    assert.deepEqual(calls[0], ['/api/admin/events/123', 'DELETE']);
    assert.equal(calls.filter(Array.isArray).length, 1);
    assert.equal(state.editorDrafts.size, fail ? 1 : 0);
    assert.equal(state.selectedId, fail ? '123' : '');
    assert.equal(state.isActing, 0);
    assert.equal(button.disabled, false);
    assert.equal(calls.includes('reload'), !fail);
  }
});
