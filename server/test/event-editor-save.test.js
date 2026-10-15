const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const CMCENEventTime = require('../public/event-time-zone');

function editor() {
  const window = { CMCENEventTime };
  class FormData {
    constructor(form) {
      this.values = form.values;
    }
    get(key) {
      return this.values[key] ?? null;
    }
  }
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/content-workspace-editors.js'),
      'utf8',
    ),
    { window, FormData, URL, console },
  );
  return window.ContentWorkspaceEditors.create({
    getText: (key, fallback) => fallback,
    contentWorkspaceState: { editorDrafts: new Map() },
    contentWorkspaceEditRoutes: { event: (id) => `/api/admin/events/${id}` },
  });
}
const item = {
  _id: 'tgit',
  type: 'event',
  content: {
    timezone: 'America/Toronto',
    allDay: false,
    startDate: '2025-10-23T20:00:00.000Z',
    endDate: '2025-10-23T23:00:00.000Z',
  },
};
const form = (overrides = {}) => ({
  querySelector: () => null,
  values: {
    startDate: '2025-10-23T16:00',
    endDate: '2025-10-23T19:00',
    timezone: 'America/Toronto',
    ...overrides,
  },
});

test('actual editor save preserves TGIT UTC instants using the selected event zone', async () => {
  const result = await editor().getContentWorkspaceRecordSaveRequest(
    item,
    form(),
  );
  assert.equal(result.path, '/api/admin/events/tgit');
  assert.equal(result.body.startDate, item.content.startDate);
  assert.equal(result.body.endDate, item.content.endDate);
  assert.equal(result.body.timezone, 'America/Toronto');
  assert.equal(result.body.rsvpEnabled, false);
});
test('editing the selected timezone interprets entered wall time in that selected zone', async () => {
  const result = await editor().getContentWorkspaceRecordSaveRequest(
    item,
    form({ timezone: 'America/Edmonton' }),
  );
  assert.equal(result.body.startDate, '2025-10-23T22:00:00.000Z');
  assert.equal(result.body.endDate, '2025-10-24T01:00:00.000Z');
});
test('actual save rejects DST gaps instead of issuing a shifted payload', async () => {
  await assert.rejects(
    editor().getContentWorkspaceRecordSaveRequest(
      item,
      form({ startDate: '2025-03-09T02:30' }),
    ),
    { code: 'event_time_gap' },
  );
});
test('all-day save preserves calendar dates and empty optional end dates', async () => {
  const result = await editor().getContentWorkspaceRecordSaveRequest(
    item,
    form({ allDay: 'true', startDate: '2025-10-21T00:00', endDate: '' }),
  );
  assert.equal(result.body.startDate, '2025-10-21T00:00:00.000Z');
  assert.equal(result.body.endDate, null);
});
