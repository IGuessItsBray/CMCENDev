const assert = require('node:assert/strict');
const test = require('node:test');
const pageRoutes = require('../routes/pages');

test('excludes protected workspace and member-only files from the public HTML sitemap', () => {
  for (const fileName of [
    'content-workspace.html',
    'review-submissions.html',
    'contact.html',
    'submit-event.html',
    'submit-last-post.html',
    'submit-retirement.html',
  ]) {
    assert.equal(pageRoutes.isPublicSitemapFile(fileName), false, fileName);
  }

  assert.equal(pageRoutes.isPublicSitemapFile('about-family.html'), true);
});
