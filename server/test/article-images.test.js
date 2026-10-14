const test = require('node:test');
const assert = require('node:assert/strict');
const { originalUrl, link } = require('../public/article-images');

test('full-size links prefer registered originals, then the largest safe rendition, never currentSrc', () => {
  const image = { url: 'https://cdn.example/large.webp', originalUrl: 'https://cdn.example/original.jpg', variants: {
    thumb: { url: 'https://cdn.example/thumb.webp', width: 400 },
    hero: { url: 'https://cdn.example/hero.webp', width: 2200 },
  } };
  assert.equal(originalUrl(image), image.originalUrl);
  for (const invalid of ['javascript:alert(1)', 'data:image/png,x', 'mailto:a@example.org', '//example.org/a.jpg', 'https://user:password@example.org/a.jpg', 'https://example.org/\\a.jpg', 'https://example.org/\na.jpg'])
    assert.equal(originalUrl({ ...image, originalUrl: invalid }), image.variants.hero.url);
  assert.equal(originalUrl({ url: '/assets/images/logo.png' }), '/assets/images/logo.png');
  assert.equal(originalUrl({ url: 'https://cdn.example/image.jpg', variants: { invalid: { url: 'https://cdn.example/other.jpg', width: 50001 }, unsafe: { url: 'javascript:bad', width: 900 }, missing: null } }), 'https://cdn.example/image.jpg');
  assert.equal(originalUrl({ url: 'javascript:bad' }), '');
});

test('image links retain displayed src/srcset, provide an accessible new-tab link and preserve existing links', () => {
  const created = [];
  const doc = { createElement(tag) { const el = { tag, attrs: {}, append(child) { this.child = child; }, setAttribute(key, value) { this.attrs[key] = value; } }; created.push(el); return el; } };
  const image = { ownerDocument: doc, alt: '', src: 'https://cdn.example/large.webp', srcset: 'https://cdn.example/thumb.webp 400w', currentSrc: 'https://cdn.example/thumb.webp', closest: () => null };
  const anchor = link(image, { url: image.src, originalUrl: 'https://cdn.example/original.jpg' });
  assert.equal(anchor.href, 'https://cdn.example/original.jpg');
  assert.equal(anchor.target, '_blank');
  assert.equal(anchor.rel, 'noopener noreferrer');
  assert.match(anchor.attrs['aria-label'], /new tab/);
  assert.equal(anchor.child, image);
  assert.equal(image.src, 'https://cdn.example/large.webp');
  assert.equal(image.srcset, 'https://cdn.example/thumb.webp 400w');
  image.closest = () => ({ href: '/intentional-destination' });
  assert.equal(link(image, { originalUrl: 'https://cdn.example/other.jpg' }), image);
  assert.equal(created.length, 1);
  image.closest = () => null;
  assert.match(link(image, { url: image.src }, 'fr').attrs['aria-label'], /nouvel onglet/);
});
