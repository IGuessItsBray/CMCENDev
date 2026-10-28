const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('article saves send only intentional timestamp corrections and allow date-only sources', () => {
  const values = new Map();
  const form = { dataset: {}, classList: { contains: () => true } };
  const context = {
    window: { NewsletterFormat: require('../public/newsletter-format') },
    FormData: class { get(key) { return values.get(key) ?? null; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/content-workspace-editors.js'), 'utf8'), context);
  const editors = context.window.ContentWorkspaceEditors.create({
    contentWorkspaceDetail: { querySelectorAll: () => [form] },
  });
  const exact = '2022-08-12T02:26:14.123Z';
  const item = { _id: 'article', status: 'draft',
    publicationDate: { precision: 'time', originalPublishedAt: exact },
    content: { layout: 'standard', newsletter: { archived: true, date: '2022-08-12' } } };
  for (const value of [exact, '', undefined]) {
    values.set('originalPublishedAt', value);
    assert.equal(Object.hasOwn(editors.getNewsArticleSaveRequest(item).body, 'originalPublishedAt'), false);
  }
  const correction = '2022-08-13T03:40:00.000Z';
  values.set('originalPublishedAt', correction);
  assert.equal(editors.getNewsArticleSaveRequest(item).body.originalPublishedAt, correction);
  item.publicationDate = { precision: 'date', originalPublishedAt: '2022-08-12T12:00:00.000Z' };
  values.set('originalPublishedAt', '');
  const body = editors.getNewsArticleSaveRequest(item).body;
  assert.equal(Object.hasOwn(body, 'originalPublishedAt'), false);
  assert.equal(body.newsletter.date, '2022-08-12');
});
