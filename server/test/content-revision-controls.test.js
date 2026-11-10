const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const ContentDiff = require('../public/content-diff');
const read = (name) => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function history({ revisions, revertRevision, api } = {}) {
  const window = { ContentDiff }, document = { createElement: (tag) => new Element(tag), createTextNode: (text) => Object.assign(new Element('text'), { textContent: text }) };
  vm.runInNewContext(read('content-workspace-history.js'), { window, document });
  const item = { _id: 'record', type: 'newsArticle' }, container = new Element('div');
  let selected = item;
  const instance = window.ContentWorkspaceHistory.create({ getText: (_key, fallback) => fallback, setWorkspaceTranslatedText: (node, _key, fallback) => { node.textContent = fallback; }, contentWorkspaceApiJson: api || (async () => ({ revisions, version: 'version-token' })), getSelectedContentWorkspaceItem: () => selected, formatWorkspaceDate: () => 'today', revertRevision });
  return { ...instance, item, container, select: (value) => { selected = value; } };
}
const revision = { _id: 'revision', before: { content: 'red' }, after: { content: 'blue' }, canRevert: true };

test('history sends only the saved revision and server version; repeated clicks cannot duplicate a pending action', async () => {
  const pending = deferred(), calls = [];
  const view = history({ revisions: [revision], revertRevision: (...args) => { calls.push(args); return pending.promise; } });
  await view.loadRevisionHistory(view.item, view.container);
  const button = view.container.querySelector('button');
  const first = button.fire('click');
  await button.fire('click');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], 'version-token');
  assert.equal(calls[0][1]._id, 'revision');
  pending.resolve(false);
  await first;
  assert.equal(button.disabled, false);
});

test('unsupported history explains its limitation and failed reverts display feedback', async () => {
  const view = history({ revisions: [{ ...revision, canRevert: false, revertReason: 'No complete saved snapshot' }] });
  await view.loadRevisionHistory(view.item, view.container);
  assert.equal(view.container.querySelectorAll('button').length, 0);
  assert(view.container.querySelectorAll('span').some((node) => node.textContent === 'No complete saved snapshot'));
  const failure = history({ revisions: [revision], revertRevision: async () => { throw new Error('Content changed. Reload history.'); } });
  await failure.loadRevisionHistory(failure.item, failure.container);
  await failure.container.querySelector('button').fire('click');
  assert(failure.container.querySelectorAll('span').some((node) => node.textContent === 'Content changed. Reload history.'));
});

test('late revision loads do not render in a different selected record', async () => {
  const pending = deferred(), view = history({ api: () => pending.promise });
  const load = view.loadRevisionHistory(view.item, view.container);
  view.select({ _id: 'other' });
  pending.resolve({ revisions: [revision], version: 'token' });
  assert.equal(await load, false);
  assert.equal(view.container.querySelectorAll('button').length, 0);
});

function controls({ dirty = false, confirmed = true, failure, refreshed = true } = {}) {
  const script = read('content-workspace-controller.js');
  const start = script.indexOf('async revertRevision(item, revision, version)');
  const end = script.indexOf('\n      getText: (...args)', start);
  const item = { _id: 'record', type: 'newsArticle' }, state = {}, detail = {}, calls = [], success = [], messages = [];
  let selected = item;
  const fn = vm.runInNewContext(`({${script.slice(start, end)}}).revertRevision`, {
    disposed: false, contentWorkspaceState: state, contentWorkspaceDetail: detail,
    getSelectedContentWorkspaceItem: () => selected, hasUnsavedContentWorkspaceChanges: () => dirty,
    getText: (_key, fallback) => fallback,
    window: { CMCENModal: { confirm: async () => typeof confirmed === 'function' ? confirmed() : confirmed } },
    contentWorkspaceApiJson: async (url, options) => { calls.push({ url, options }); if (failure) throw new Error(failure); },
    discardContentWorkspaceDrafts: () => calls.push('discard'),
    loadContentWorkspace: async () => { calls.push('reload'); return refreshed; }, showWorkspaceSuccess: (text) => success.push(text), setWorkspaceMessage: (text) => messages.push(text),
  });
  return { run: () => fn(item, revision, 'opaque-version'), state, detail, calls, success, messages, select: (value) => { selected = value; } };
}

test('revert controls protect unsaved edits, cancellation, and navigation during confirmation', async () => {
  const dirty = controls({ dirty: true });
  await assert.rejects(dirty.run(), /unsaved/);
  assert.equal(dirty.calls.length, 0);
  const cancel = controls({ confirmed: false });
  assert.equal(await cancel.run(), false);
  assert.equal(cancel.calls.length, 0);
  assert.equal(cancel.detail.inert, false);
  const decision = deferred(), moved = controls({ confirmed: () => decision.promise });
  const result = moved.run();
  assert.equal(moved.detail.inert, true);
  moved.select({ _id: 'different' });
  decision.resolve(true);
  assert.equal(await result, false);
  assert.equal(moved.calls.length, 0);
  assert.equal(moved.state.isActing, 0);
});

test('successful revert refreshes saved content; server failures never claim success and always release controls', async () => {
  const success = controls();
  assert.equal(await success.run(), true);
  assert.equal(success.calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(JSON.stringify(success.calls[0].options.body)), { version: 'opaque-version' });
  assert.deepEqual(success.calls.slice(1), ['discard', 'reload']);
  assert.equal(success.success.length, 1);
  const failure = controls({ failure: 'Conflict' });
  await assert.rejects(failure.run(), /Conflict/);
  assert.equal(failure.success.length, 0);
  assert.deepEqual(failure.calls.slice(1), ['discard', 'reload']);
  assert.equal(failure.detail.inert, false);
  assert.equal(failure.state.isActing, 0);
});

test('a committed revert followed by failed refresh retains a clear recovery message', async () => {
  const view = controls({ refreshed: false });
  assert.equal(await view.run(), true);
  assert.equal(view.success.length, 0);
  assert.match(view.messages[0], /Change reverted.*could not be reloaded.*Refresh/);
  assert.equal(view.state.isActing, 0);
  assert.equal(view.detail.inert, false);
});
