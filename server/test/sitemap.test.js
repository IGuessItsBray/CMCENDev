const assert = require('node:assert/strict');
const test = require('node:test');
const pageRoutes = require('../routes/pages');

test('excludes protected workspace files from the public HTML sitemap', () => {
  assert.equal(pageRoutes.isPublicSitemapFile('content-workspace.html'), false);
  assert.equal(pageRoutes.isPublicSitemapFile('review-submissions.html'), false);
  assert.equal(pageRoutes.isPublicSitemapFile('about-family.html'), true);
});
